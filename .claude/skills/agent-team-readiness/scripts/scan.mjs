#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { DEFAULT_MAX_FILES } from "./lib/constants.mjs";
import { writeArtifacts } from "./lib/artifacts.mjs";
import { collectEvidence } from "./lib/evidence.mjs";
import { listRepositoryFiles } from "./lib/files.mjs";
import { assertOutputOutsideRepository, materializeRepository } from "./lib/repository.mjs";
import { buildReport } from "./lib/scoring.mjs";
import { isValidUtcTimestamp, validateReport } from "./lib/validate.mjs";

const ARTIFACT_PATHS = {
  evidence: "evidence.json",
  agents_draft: "AGENTS.draft.md",
  context_tree_seed_map: "context-tree-seed-map.md"
};

function usage() {
  return `Usage: atr-scan <local-path|https://github.com/owner/repo> --output <outside-target-dir> [options]

Options:
  --ref <git-ref>       Pin a remote scan to a branch, tag, or commit
  --max-files <number>  Maximum tracked files analyzed (default ${DEFAULT_MAX_FILES})
  --generated-at <iso>  Stable timestamp for fixtures/calibration
  -h, --help            Show this help

The scan is read-only: it never executes target-repository commands and refuses
to write output inside the scanned repository.`;
}

function parseArgs(argv) {
  const options = { input: null, output: null, ref: null, maxFiles: DEFAULT_MAX_FILES, generatedAt: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--output") options.output = argv[++index];
    else if (arg === "--ref") options.ref = argv[++index];
    else if (arg === "--max-files") options.maxFiles = Number(argv[++index]);
    else if (arg === "--generated-at") options.generatedAt = argv[++index];
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (options.input === null) options.input = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.input) throw new Error("Repository input is required");
  if (!options.output) throw new Error("--output is required so artifacts cannot land inside the scanned repository by accident");
  if (!Number.isInteger(options.maxFiles) || options.maxFiles < 1 || options.maxFiles > 250_000) {
    throw new Error("--max-files must be an integer between 1 and 250000");
  }
  if (options.generatedAt && !isValidUtcTimestamp(options.generatedAt)) {
    throw new Error("--generated-at must be a real ISO-8601 UTC date-time ending in Z");
  }
  return options;
}

export async function runScan({ input, output, ref = null, maxFiles = DEFAULT_MAX_FILES, generatedAt = null }) {
  const repository = await materializeRepository(input, ref);
  try {
    const outputPath = await assertOutputOutsideRepository(output, repository.root);
    await mkdir(outputPath, { recursive: true });
    const inventory = await listRepositoryFiles(repository.root, maxFiles);
    const evidence = await collectEvidence({
      root: repository.root,
      source: repository.source,
      name: repository.name,
      revision: repository.revision,
      worktreeState: repository.worktreeState,
      inventory
    });
    const report = buildReport(evidence, ARTIFACT_PATHS, generatedAt ?? new Date().toISOString());
    validateReport(report);
    await writeArtifacts(outputPath, evidence, report);
    return { output: outputPath, evidence, report };
  } finally {
    await repository.cleanup();
  }
}

export async function runCli(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = await runScan(options);
    process.stdout.write(`${JSON.stringify({
      schema_version: result.report.schema_version,
      repository: result.report.repository.name,
      revision: result.report.repository.revision,
      headline_score: result.report.headline_score,
      evidence_coverage: result.report.scope.evidence_coverage,
      output: result.output,
      artifacts: ["atr-1.json", "evidence.json", "AGENTS.draft.md", "context-tree-seed-map.md"]
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`atr-scan: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await runCli(process.argv.slice(2));
}
