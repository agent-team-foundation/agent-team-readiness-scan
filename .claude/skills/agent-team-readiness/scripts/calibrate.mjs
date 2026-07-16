#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DIMENSIONS } from "./lib/constants.mjs";
import { runScan } from "./scan.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const CALIBRATION_IMPLEMENTATION_FILES = [
  ".claude/skills/agent-team-readiness/SKILL.md",
  ".claude/skills/agent-team-readiness/references/atr-1.md",
  ".claude/skills/agent-team-readiness/references/rubric.md",
  ".claude/skills/agent-team-readiness/scripts/calibrate.mjs",
  ".claude/skills/agent-team-readiness/scripts/scan.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/artifacts.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/constants.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/evidence.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/files.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/repository.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/scoring.mjs",
  ".claude/skills/agent-team-readiness/scripts/lib/validate.mjs",
  "schemas/atr-1.schema.json"
];

async function digestFiles(entries) {
  const hash = createHash("sha256");
  for (const [label, file] of entries) {
    hash.update(label);
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function computeImplementationDigest(root = REPOSITORY_ROOT) {
  return digestFiles(CALIBRATION_IMPLEMENTATION_FILES.map((file) => [file, path.join(root, file)]));
}

export async function computeCalibrationInputDigest(manifestFile, reviewFile = null) {
  const entries = [["manifest", manifestFile]];
  if (reviewFile) entries.push(["review", reviewFile]);
  return digestFiles(entries);
}

function usage() {
  return `Usage: calibrate.mjs --manifest <repos.json> --output <dir> [options]

Options:
  --review <human-review.json>  Compare every dimension with human bands
  --jobs <number>               Concurrent scans (default 3)
  --limit <number>              Run a bounded subset for smoke testing
  -h, --help                    Show this help`;
}

function parseArgs(argv) {
  const options = { manifest: null, review: null, output: null, jobs: 3, limit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--manifest") options.manifest = argv[++index];
    else if (arg === "--review") options.review = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--jobs") options.jobs = Number(argv[++index]);
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.manifest || !options.output) throw new Error("--manifest and --output are required");
  if (!Number.isInteger(options.jobs) || options.jobs < 1 || options.jobs > 8) throw new Error("--jobs must be 1-8");
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer");
  return options;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function validateManifest(manifest, limited) {
  if (manifest.schema_version !== "atr-calibration-1") throw new Error("Calibration manifest schema_version must be atr-calibration-1");
  if (!Array.isArray(manifest.repositories) || manifest.repositories.length < 12) {
    throw new Error("Calibration manifest must contain at least 12 repositories");
  }
  for (const repo of manifest.repositories) {
    if (!/^[a-z0-9-]+$/.test(repo.id ?? "")) throw new Error(`Invalid calibration id: ${repo.id}`);
    if (!/^https:\/\/github\.com\/.+\/.+$/.test(repo.url ?? "")) throw new Error(`Invalid calibration URL for ${repo.id}`);
    if (!/^[0-9a-f]{40}$/.test(repo.ref ?? "")) throw new Error(`Calibration ref must be a 40-character commit for ${repo.id}`);
  }
  if (!limited && !manifest.generated_at) throw new Error("Calibration manifest generated_at is required for stable artifacts");
}

function validateReview(review, repositories) {
  if (!review) return;
  if (review.schema_version !== "atr-human-review-1") throw new Error("Human review schema_version must be atr-human-review-1");
  const rows = new Map(review.repositories.map((row) => [row.id, row]));
  for (const repo of repositories) {
    const row = rows.get(repo.id);
    if (!row) throw new Error(`Human review missing repository ${repo.id}`);
    for (const dimension of DIMENSIONS) {
      const expected = row.dimensions?.[dimension.key];
      if (!expected || !["strong", "developing", "constrained"].includes(expected.band)) {
        throw new Error(`Human review missing valid ${repo.id}.${dimension.key}.band`);
      }
      if (typeof expected.evidence_note !== "string" || typeof expected.unknown_note !== "string") {
        throw new Error(`Human review missing notes for ${repo.id}.${dimension.key}`);
      }
    }
  }
}

async function mapConcurrent(items, jobs, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, () => runWorker()));
  return results;
}

function compare(report, humanRow) {
  return report.dimensions.map((dimension) => {
    const human = humanRow?.dimensions?.[dimension.key] ?? null;
    return {
      key: dimension.key,
      machine_score: dimension.score,
      machine_band: dimension.status,
      strongest_evidence: dimension.strongest_evidence,
      unknowns: dimension.unknowns,
      human_band: human?.band ?? null,
      human_evidence_note: human?.evidence_note ?? null,
      human_unknown_note: human?.unknown_note ?? null,
      agreement: human ? human.band === dimension.status : null,
      difference_note: !human
        ? "Human review not supplied"
        : human.band === dimension.status
          ? "Band agrees; evidence and unknown notes still require review"
          : `Machine ${dimension.status}; human ${human.band}. Review collector/rubric evidence before changing either.`
    };
  });
}

function renderMarkdown(result) {
  const lines = [
    "# Agent Team Readiness calibration",
    "",
    `Pinned repositories: ${result.repositories.length}`,
    `Dimension comparisons: ${result.summary.dimension_comparisons}`,
    `Band agreements: ${result.summary.band_agreements}`,
    `Band disagreements: ${result.summary.band_disagreements}`,
    `Implementation: ${result.implementation_digest}`,
    `Inputs: ${result.input_digest}`,
    "",
    "> Scores are repo-level heuristics. Every row preserves evidence and unknowns; the average is not a release gate.",
    ""
  ];
  for (const repo of result.repositories) {
    lines.push(`## ${repo.id}`, "");
    lines.push(`- Source: ${repo.url}@${repo.ref}`);
    lines.push(`- Headline: ${repo.headline_score ?? "withheld"}/100; coverage ${repo.evidence_coverage}%`);
    lines.push("");
    lines.push("| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |", "| --- | --- | --- | --- | --- | --- |");
    for (const dimension of repo.dimensions) {
      const evidence = dimension.strongest_evidence[0];
      const evidenceText = evidence.kind === "command"
        ? `${evidence.command} (${evidence.path ?? "detected"})`
        : `${evidence.path ?? "n/a"}: ${evidence.detail}`;
      const note = `${dimension.unknowns[0] ?? "none"} ${dimension.difference_note}`;
      lines.push(`| ${dimension.key} | ${dimension.machine_score}/10 ${dimension.machine_band} | ${dimension.human_band ?? "not reviewed"} | ${dimension.agreement === null ? "n/a" : dimension.agreement ? "yes" : "no"} | ${evidenceText.replaceAll("|", "\\|")} | ${note.replaceAll("|", "\\|")} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function runCalibration({ manifest: manifestFile, review: reviewFile, output, jobs = 3, limit = null }) {
  const manifest = await readJson(manifestFile);
  validateManifest(manifest, limit !== null);
  const selected = limit === null ? manifest.repositories : manifest.repositories.slice(0, limit);
  const review = reviewFile ? await readJson(reviewFile) : null;
  validateReview(review, selected);
  const reviews = new Map((review?.repositories ?? []).map((row) => [row.id, row]));
  const outputPath = path.resolve(output);
  await mkdir(outputPath, { recursive: true });

  const repositories = await mapConcurrent(selected, jobs, async (repo) => {
    const result = await runScan({
      input: repo.url,
      ref: repo.ref,
      output: path.join(outputPath, "repos", repo.id),
      generatedAt: manifest.generated_at
    });
    return {
      id: repo.id,
      url: repo.url,
      ref: repo.ref,
      profile: repo.profile,
      headline_score: result.report.headline_score,
      evidence_coverage: result.report.scope.evidence_coverage,
      dimensions: compare(result.report, reviews.get(repo.id))
    };
  });

  const comparisons = repositories.flatMap((repo) => repo.dimensions).filter((dimension) => dimension.agreement !== null);
  const result = {
    schema_version: "atr-calibration-results-1",
    generated_at: manifest.generated_at,
    implementation_digest: await computeImplementationDigest(),
    input_digest: await computeCalibrationInputDigest(manifestFile, reviewFile),
    repositories,
    summary: {
      repository_count: repositories.length,
      dimension_comparisons: comparisons.length,
      band_agreements: comparisons.filter((dimension) => dimension.agreement).length,
      band_disagreements: comparisons.filter((dimension) => !dimension.agreement).length
    }
  };
  await writeFile(path.join(outputPath, "calibration-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(path.join(outputPath, "calibration-results.md"), renderMarkdown(result));
  return result;
}

export async function runCli(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = await runCalibration(options);
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`atr-calibrate: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await runCli(process.argv.slice(2));
}
