import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeReportKey,
  escapeHtml,
  renderReport,
  renderReportFile,
  sanitizeSlug
} from "../.claude/skills/agent-team-readiness/scripts/render-report.mjs";
import { runScan } from "../.claude/skills/agent-team-readiness/scripts/scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = JSON.parse(await readFile(path.join(ROOT, "examples/first-tree/atr-1.json"), "utf8"));

function cloneSample() {
  return structuredClone(SAMPLE);
}

test("report key is deterministic, object-safe, and excludes sub-day time from its hash", () => {
  const report = cloneSample();
  const first = computeReportKey(report);
  const second = computeReportKey(structuredClone(report));
  assert.equal(first, second);
  assert.match(first, /^[a-z0-9][a-z0-9._-]+-20260716-[0-9a-f]{8}$/);

  report.generated_at = "2026-07-16T23:59:59.000Z";
  assert.equal(computeReportKey(report), first);
  report.generated_at = "2026-07-17T00:00:00.000Z";
  const nextDay = computeReportKey(report);
  assert.notEqual(nextDay, first);
  assert.equal(nextDay.slice(-8), first.slice(-8));

  assert.equal(sanitizeSlug(" Example Org / Repo ", 50), "example-org-repo");
  assert.throws(() => sanitizeSlug("……", 50), /empty slug/);
});

test("renderer escapes untrusted report strings and emits a self-contained accessible page", () => {
  const report = cloneSample();
  report.repository.name = "owner/<script>alert(1)</script>";
  report.summary = "Readiness <img src=x onerror=alert(1)> & review";
  report.dimensions[0].rationale = "Rationale </style><script>alert(2)</script>";
  report.dimensions[0].unknowns = ["Unknown <svg onload=alert(3)>"];
  const html = renderReport(report);

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; review/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /@media print/);
  assert.match(html, /Open machine-readable atr-1 JSON/);
  for (const dimension of report.dimensions) assert.match(html, new RegExp(escapeHtml(dimension.name)));
});

test("checked First Tree HTML sample is byte-reproducible", async () => {
  const checked = await readFile(path.join(ROOT, "examples", "first-tree", "report.html"), "utf8");
  assert.equal(renderReport(SAMPLE), checked);
});

test("renderer writes one deterministic HTML artifact and refuses an existing destination", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-render-"));
  try {
    const reportFile = path.join(sandbox, "atr-1.json");
    await writeFile(reportFile, `${JSON.stringify(SAMPLE)}\n`);
    const first = await renderReportFile(reportFile, sandbox);
    assert.equal(path.basename(first.outputFile), `${first.key}.html`);
    const html = await readFile(first.outputFile, "utf8");
    assert.match(html, new RegExp(first.key));
    await assert.rejects(renderReportFile(reportFile, sandbox), /EEXIST/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("withheld headline scores stay visibly withheld", () => {
  const report = cloneSample();
  report.repository.file_count = 10;
  report.repository.analyzed_file_count = 5;
  report.repository.skipped_file_count = 0;
  report.repository.inventory_truncated = true;
  report.scope.evidence_coverage = 50;
  report.headline_score = null;
  const html = renderReport(report);
  assert.match(html, /score withheld/);
  assert.doesNotMatch(html, /repo score \/ 100/);
});

test("scanner blockers render in their deterministic Top 3 order", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-render-blockers-"));
  try {
    const result = await runScan({
      input: path.join(ROOT, "fixtures", "no-instructions"),
      output: path.join(sandbox, "scan"),
      generatedAt: "2026-07-16T00:00:00.000Z"
    });
    assert.ok(result.report.top_3_fixes.length > 0);
    const html = renderReport(result.report);
    let priorIndex = -1;
    for (const fix of result.report.top_3_fixes) {
      const currentIndex = html.indexOf(escapeHtml(fix.title));
      assert.ok(currentIndex > priorIndex, fix.title);
      priorIndex = currentIndex;
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("publishing contract fails closed on GitHub visibility before rendering or upload", async () => {
  const contract = await readFile(
    path.join(
      ROOT,
      ".claude",
      "skills",
      "agent-team-readiness",
      "references",
      "publishing.md"
    ),
    "utf8"
  );
  const visibilityGate = contract.indexOf('gh repo view "$REPO_URL" --json visibility');
  const render = contract.indexOf('KEY="$(node scripts/render-report.mjs');
  const upload = contract.indexOf('aws s3 cp "$OUT/atr-1.json"');

  assert.ok(visibilityGate >= 0, "missing authoritative GitHub visibility lookup");
  assert.match(contract, /if \[ "\$VISIBILITY" != "PUBLIC" \]/);
  assert.match(contract, /lookup failure, or any visibility\s+other than `PUBLIC` stops/);
  assert.ok(visibilityGate < render, "visibility must be checked before rendering");
  assert.ok(visibilityGate < upload, "visibility must be checked before upload");
});
