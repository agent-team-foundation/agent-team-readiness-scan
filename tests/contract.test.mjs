import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeCalibrationInputDigest, computeImplementationDigest } from "../.claude/skills/agent-team-readiness/scripts/calibrate.mjs";
import { DIMENSIONS } from "../.claude/skills/agent-team-readiness/scripts/lib/constants.mjs";
import { validateReport } from "../.claude/skills/agent-team-readiness/scripts/lib/validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeValidReport() {
  const dimensions = DIMENSIONS.map((definition) => ({
    ...definition,
    score: 10,
    status: "strong",
    evidence_status: "observed",
    rationale: "evidence",
    strongest_evidence: [{ kind: "file", path: "README.md", line: 1, command: null, detail: "evidence" }],
    must_fix_blocker: null,
    minimum_improvement: "keep it current",
    unknowns: ["runtime behavior remains unknown"]
  }));
  return {
    schema_version: "atr-1",
    wedge: "agent-team-readiness",
    generated_at: "2026-07-16T00:00:00.000Z",
    repository: { source: ".", name: "fixture", revision: null, worktree_state: "not-git", file_count: 1, analyzed_file_count: 1, skipped_file_count: 0, inventory_truncated: false },
    scope: { claim: "repo-level readiness", observable_only: true, evidence_coverage: 100, limitations: ["repo only"] },
    headline_score: 100,
    dimensions,
    top_3_fixes: [],
    artifacts: { evidence: "evidence.json", agents_draft: "AGENTS.draft.md", context_tree_seed_map: "context-tree-seed-map.md" },
    summary: "fixture"
  };
}

test("dimension weights and keys are stable", () => {
  assert.deepEqual(DIMENSIONS.map(({ key, weight }) => ({ key, weight })), [
    { key: "instruction_convergence", weight: 18 },
    { key: "task_workspace_isolation", weight: 18 },
    { key: "ownership_boundaries", weight: 16 },
    { key: "shared_decision_context", weight: 16 },
    { key: "repeatable_verification", weight: 20 },
    { key: "handoff_definition", weight: 12 }
  ]);
  assert.equal(DIMENSIONS.reduce((sum, dimension) => sum + dimension.weight, 0), 100);
});

test("published JSON Schema is parseable and pins atr-1", async () => {
  const schema = JSON.parse(await readFile(path.join(ROOT, "schemas", "atr-1.schema.json"), "utf8"));
  assert.equal(schema.properties.schema_version.const, "atr-1");
  assert.equal(schema.properties.wedge.const, "agent-team-readiness");
  assert.equal(schema.properties.dimensions.minItems, 6);
  assert.equal(schema.properties.dimensions.maxItems, 6);
});

test("published schema and executable validator agree on evidence contracts", async () => {
  const schema = JSON.parse(await readFile(path.join(ROOT, "schemas", "atr-1.schema.json"), "utf8"));
  const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const valid = makeValidReport();
  assert.equal(validateSchema(valid), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateReport(valid), valid);

  const cases = [];
  const longCommand = makeValidReport();
  longCommand.dimensions[0].strongest_evidence[0] = {
    kind: "command",
    path: "AGENTS.md",
    line: 1,
    command: "x".repeat(241),
    detail: "bounded command"
  };
  cases.push(longCommand);

  const fileWithCommand = makeValidReport();
  fileWithCommand.dimensions[0].strongest_evidence[0].command = "npm test";
  cases.push(fileWithCommand);

  const emptyUnknowns = makeValidReport();
  emptyUnknowns.dimensions[0].unknowns = [];
  cases.push(emptyUnknowns);

  const wrongArtifact = makeValidReport();
  wrongArtifact.artifacts.evidence = "other.json";
  cases.push(wrongArtifact);

  const impossibleTimestamp = makeValidReport();
  impossibleTimestamp.generated_at = "2026-99-99T99:99:99Z";
  cases.push(impossibleTimestamp);

  const impossibleDay = makeValidReport();
  impossibleDay.generated_at = "2026-04-31T00:00:00Z";
  cases.push(impossibleDay);

  const impossibleLeapDay = makeValidReport();
  impossibleLeapDay.generated_at = "2025-02-29T00:00:00Z";
  cases.push(impossibleLeapDay);

  for (const report of cases) {
    assert.equal(validateSchema(report), false, "JSON Schema unexpectedly accepted an invalid contract case");
    assert.throws(() => validateReport(report), /atr-1 invalid/);
  }
});

test("validator rejects a report whose weight drifts", () => {
  const report = makeValidReport();
  report.dimensions[0].weight = 19;
  assert.throws(() => validateReport(report), /weight must be 18/);
});

test("validator pins timestamp, coverage, unknown, and artifact invariants", () => {
  assert.equal(validateReport(makeValidReport()).schema_version, "atr-1");

  const invalidTimestamp = makeValidReport();
  invalidTimestamp.generated_at = "2026-07-16";
  assert.throws(() => validateReport(invalidTimestamp), /UTC date-time ending in Z/);

  const impossibleTimestamp = makeValidReport();
  impossibleTimestamp.generated_at = "2026-99-99T99:99:99Z";
  assert.throws(() => validateReport(impossibleTimestamp), /UTC date-time ending in Z/);

  const impossibleDay = makeValidReport();
  impossibleDay.generated_at = "2026-04-31T00:00:00Z";
  assert.throws(() => validateReport(impossibleDay), /UTC date-time ending in Z/);

  const leapDay = makeValidReport();
  leapDay.generated_at = "2024-02-29T23:59:59.123456789Z";
  assert.equal(validateReport(leapDay), leapDay);

  const invalidCoverage = makeValidReport();
  invalidCoverage.scope.evidence_coverage = 99;
  assert.throws(() => validateReport(invalidCoverage), /evidence_coverage must be 100/);

  const missingUnknown = makeValidReport();
  missingUnknown.dimensions[0].unknowns = [];
  assert.throws(() => validateReport(missingUnknown), /unknowns must be a non-empty array/);

  const invalidArtifact = makeValidReport();
  invalidArtifact.artifacts.evidence = "other.json";
  assert.throws(() => validateReport(invalidArtifact), /must be evidence.json/);

  const missingTopFix = makeValidReport();
  missingTopFix.dimensions[0].score = 7;
  missingTopFix.dimensions[0].status = "developing";
  missingTopFix.headline_score = 95;
  missingTopFix.dimensions[0].must_fix_blocker = {
    id: "fixture-blocker",
    dimension: "instruction_convergence",
    severity: "high",
    title: "Fixture blocker",
    evidence: [{ kind: "file", path: "AGENTS.md", line: 1, command: null, detail: "fixture evidence" }],
    why_it_matters: "Fixture consequence",
    minimum_fix: "Fixture fix",
    first_verification_step: "Fixture verification"
  };
  assert.throws(() => validateReport(missingTopFix), /must contain 1 prioritized dimension blockers/);
  missingTopFix.top_3_fixes = [structuredClone(missingTopFix.dimensions[0].must_fix_blocker)];
  assert.equal(validateReport(missingTopFix), missingTopFix);
  missingTopFix.top_3_fixes[0].title = "Drifted title";
  assert.throws(() => validateReport(missingTopFix), /must exactly reuse/);
});

test("calibration set pins 12 varied public repositories with complete human review", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "calibration", "repos.json"), "utf8"));
  const review = JSON.parse(await readFile(path.join(ROOT, "calibration", "human-review.json"), "utf8"));
  assert.equal(manifest.repositories.length, 12);
  assert.equal(new Set(manifest.repositories.map((repo) => repo.profile.language)).size >= 5, true);
  for (const repo of manifest.repositories) assert.match(repo.ref, /^[0-9a-f]{40}$/);
  const reviewById = new Map(review.repositories.map((repo) => [repo.id, repo]));
  for (const repo of manifest.repositories) {
    const reviewed = reviewById.get(repo.id);
    assert.ok(reviewed, `missing human review for ${repo.id}`);
    assert.deepEqual(Object.keys(reviewed.dimensions), DIMENSIONS.map((dimension) => dimension.key));
  }
});

test("checked calibration baseline preserves all per-dimension comparisons", async () => {
  const baseline = JSON.parse(await readFile(path.join(ROOT, "calibration", "baseline.json"), "utf8"));
  assert.equal(baseline.implementation_digest, await computeImplementationDigest(ROOT));
  assert.equal(
    baseline.input_digest,
    await computeCalibrationInputDigest(path.join(ROOT, "calibration", "repos.json"), path.join(ROOT, "calibration", "human-review.json"))
  );
  assert.equal(baseline.summary.repository_count, 12);
  assert.equal(baseline.summary.dimension_comparisons, 72);
  // The gate is structural consistency plus a visible note per comparison —
  // not zero disagreements. An explained disagreement is a legitimate checked
  // state per references/calibration.md; its explanation lives in analysis.md.
  assert.equal(
    baseline.summary.band_agreements + baseline.summary.band_disagreements,
    baseline.summary.dimension_comparisons
  );
  const rows = baseline.repositories.flatMap((repo) => repo.dimensions);
  assert.equal(rows.filter((dimension) => dimension.agreement === true).length, baseline.summary.band_agreements);
  assert.equal(rows.filter((dimension) => dimension.agreement === false).length, baseline.summary.band_disagreements);
  for (const repo of baseline.repositories) {
    assert.equal(repo.dimensions.length, 6);
    for (const dimension of repo.dimensions) {
      assert.ok(dimension.strongest_evidence.length > 0);
      assert.ok(dimension.unknowns.length > 0);
      assert.ok(typeof dimension.difference_note === "string" && dimension.difference_note.length > 0);
      assert.ok(typeof dimension.human_band === "string" && dimension.human_band.length > 0);
    }
  }
});
