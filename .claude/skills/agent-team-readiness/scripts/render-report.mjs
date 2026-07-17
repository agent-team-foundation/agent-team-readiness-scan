#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateReport } from "./lib/validate.mjs";

export const REPORT_BASE = "https://report.first-tree.ai";

// Strip controls and bidirectional overrides at the rendering sink. Repository
// names and evidence are untrusted even after the atr-1 shape is validated.
// eslint-disable-next-line no-control-regex
const CONTROL_AND_BIDI = /[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

function cleanText(value, maxLength = 1200) {
  const cleaned = String(value).replace(CONTROL_AND_BIDI, "");
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function escapeHtml(value, maxLength) {
  return cleanText(value, maxLength)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeSlug(value, maxLength) {
  const sanitized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength)
    .replace(/[-.]+$/g, "");
  if (!sanitized) throw new Error("report owner/repository cannot sanitize to an empty slug");
  return sanitized;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableReport(report) {
  const { generated_at: _generatedAt, ...stable } = report;
  return canonicalize(stable);
}

function repositoryParts(report) {
  const nameParts = report.repository.name.split("/").filter(Boolean);
  if (nameParts.length >= 2) {
    return { owner: nameParts.at(-2), repository: nameParts.at(-1) };
  }
  try {
    const url = new URL(report.repository.source);
    if (url.hostname.toLowerCase() === "github.com") {
      const urlParts = url.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
      if (urlParts.length >= 2) return { owner: urlParts.at(-2), repository: urlParts.at(-1) };
    }
  } catch {
    // Local paths are renderable but never eligible for the hosted publish flow.
  }
  return { owner: "local", repository: report.repository.name };
}

export function computeReportKey(report) {
  validateReport(report);
  const parts = repositoryParts(report);
  const owner = sanitizeSlug(parts.owner, 39);
  const repository = sanitizeSlug(parts.repository, 50);
  const date = report.generated_at.slice(0, 10).replaceAll("-", "");
  const hash = createHash("sha256")
    .update(JSON.stringify(stableReport(report)), "utf8")
    .digest("hex")
    .slice(0, 8);
  const composed = `${owner}-${repository}-${date}-${hash}`;
  return /^[a-z0-9]/.test(composed) ? composed : `r${composed}`;
}

function severityLabel(severity) {
  return severity ? `${severity[0].toUpperCase()}${severity.slice(1)}` : "None";
}

function evidenceLabel(evidence) {
  const location = evidence.path
    ? `${escapeHtml(evidence.path, 300)}${evidence.line ? `:${evidence.line}` : ""}`
    : "Repository scan";
  if (evidence.kind === "command") {
    return `<code>${escapeHtml(evidence.command, 240)}</code><span>${location} · ${escapeHtml(evidence.detail, 240)}</span>`;
  }
  return `<strong>${location}</strong><span>${escapeHtml(evidence.detail, 240)}</span>`;
}

function renderEvidenceList(entries) {
  return `<ul class="evidence-list">${entries.map((entry) => `<li>${evidenceLabel(entry)}</li>`).join("")}</ul>`;
}

function renderTopFix(fix, index) {
  return `
    <article class="fix-card severity-${escapeHtml(fix.severity, 16)}">
      <div class="fix-index" aria-hidden="true">0${index + 1}</div>
      <div class="fix-body">
        <div class="fix-meta">
          <span class="severity-chip">${escapeHtml(severityLabel(fix.severity), 16)}</span>
          <span>${escapeHtml(fix.dimension.replaceAll("_", " "), 80)}</span>
        </div>
        <h3>${escapeHtml(fix.title, 240)}</h3>
        <p>${escapeHtml(fix.why_it_matters, 800)}</p>
        <dl class="fix-actions">
          <div><dt>Minimum fix</dt><dd>${escapeHtml(fix.minimum_fix, 1000)}</dd></div>
          <div><dt>Verify first</dt><dd>${escapeHtml(fix.first_verification_step, 1000)}</dd></div>
        </dl>
      </div>
    </article>`;
}

function renderDimension(dimension, index) {
  const blocker = dimension.must_fix_blocker;
  const blockerMarkup = blocker
    ? `<div class="dimension-blocker severity-${escapeHtml(blocker.severity, 16)}">
        <span class="severity-chip">${escapeHtml(severityLabel(blocker.severity), 16)} blocker</span>
        <strong>${escapeHtml(blocker.title, 240)}</strong>
        <p>${escapeHtml(blocker.why_it_matters, 800)}</p>
      </div>`
    : `<div class="dimension-clear"><span aria-hidden="true">✓</span> No repository-observable blocker found</div>`;

  return `
    <article class="dimension-card status-${escapeHtml(dimension.status, 16)}">
      <header class="dimension-head">
        <div>
          <span class="eyebrow">Dimension ${index + 1} · ${dimension.weight}% weight</span>
          <h3>${escapeHtml(dimension.name, 120)}</h3>
        </div>
        <div class="dimension-score" aria-label="${dimension.score} out of 10, ${escapeHtml(dimension.status, 20)}">
          <strong>${dimension.score}</strong><span>/10</span>
        </div>
      </header>
      <div class="status-row">
        <span class="status-badge">${escapeHtml(dimension.status, 20)}</span>
        <span>${escapeHtml(dimension.evidence_status, 20)} evidence</span>
      </div>
      <p class="rationale">${escapeHtml(dimension.rationale, 1000)}</p>
      ${blockerMarkup}
      <div class="improvement">
        <span>Smallest useful improvement</span>
        <p>${escapeHtml(dimension.minimum_improvement, 1000)}</p>
      </div>
      <details open>
        <summary>Strongest evidence</summary>
        ${renderEvidenceList(dimension.strongest_evidence)}
      </details>
      <details>
        <summary>What remains unknown</summary>
        <ul class="plain-list">${dimension.unknowns.map((unknown) => `<li>${escapeHtml(unknown, 1000)}</li>`).join("")}</ul>
      </details>
    </article>`;
}

export function renderReport(report) {
  validateReport(report);
  const key = computeReportKey(report);
  const score = report.headline_score;
  const scoreText = score === null ? "—" : String(score);
  const scoreValue = score === null ? 0 : score;
  const revision = report.repository.revision ? report.repository.revision.slice(0, 12) : report.repository.worktree_state;
  const generatedDate = report.generated_at.slice(0, 10);
  const fixes = report.top_3_fixes.length
    ? report.top_3_fixes.map(renderTopFix).join("")
    : `<div class="empty-fixes"><strong>No must-fix blocker ranked in the Top 3.</strong><p>This is not certification. Runtime isolation, permissions, team behavior, and private integrations remain outside the repository-observable claim.</p></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(report.repository.name, 180)} · Agent Team Readiness</title>
  <style>
    :root {
      --canvas: #090d12;
      --surface: #11171e;
      --surface-raised: #171f28;
      --line: #2b3743;
      --text: #f4f7f9;
      --muted: #aab5c0;
      --soft: #d5dce2;
      --accent: #f3ba4b;
      --strong: #78d9a3;
      --developing: #ffd27a;
      --constrained: #ff9292;
      --focus: #9dd5ff;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--canvas);
      color: var(--text);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-underline-offset: 0.18em; }
    a:focus-visible, summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; border-radius: 4px; }
    .skip-link { position: fixed; left: 16px; top: -80px; z-index: 10; padding: 12px 16px; background: var(--text); color: var(--canvas); }
    .skip-link:focus { top: 16px; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
    .masthead { border-bottom: 1px solid var(--line); }
    .masthead-inner { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--soft); }
    .brand-mark { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid var(--accent); color: var(--accent); font-weight: 800; letter-spacing: -.04em; }
    .scope-pill { border: 1px solid var(--line); border-radius: 999px; padding: 7px 12px; color: var(--muted); font-size: 13px; white-space: nowrap; }
    main { padding: 64px 0 96px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 64px; align-items: center; padding-bottom: 64px; }
    .eyebrow { display: block; color: var(--accent); font-size: 12px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { max-width: 760px; margin: 16px 0 24px; font-size: clamp(38px, 6.4vw, 78px); line-height: .98; letter-spacing: -.055em; }
    h2 { margin-bottom: 12px; font-size: clamp(28px, 4vw, 44px); line-height: 1.08; letter-spacing: -.035em; }
    h3 { margin-bottom: 12px; font-size: 21px; line-height: 1.2; letter-spacing: -.018em; }
    .hero-summary { max-width: 760px; color: var(--soft); font-size: 18px; }
    .repo-meta { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-top: 32px; color: var(--muted); font-size: 14px; }
    .repo-meta strong { color: var(--text); font-weight: 650; }
    .score-ring {
      --score: 0;
      position: relative;
      display: grid;
      place-items: center;
      width: 210px;
      aspect-ratio: 1;
      border-radius: 50%;
      background: conic-gradient(var(--accent) calc(var(--score) * 1%), var(--line) 0);
      flex: 0 0 auto;
    }
    .score-ring::before { content: ""; position: absolute; inset: 12px; border-radius: inherit; background: var(--canvas); }
    .score-inner { position: relative; text-align: center; }
    .score-inner strong { display: block; font-size: 64px; line-height: .9; letter-spacing: -.06em; }
    .score-inner span { display: block; margin-top: 12px; color: var(--muted); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }
    .scope-note { margin: 0 0 56px; padding: 20px 24px; border: 1px solid #584b2e; border-left: 4px solid var(--accent); background: #17150f; color: var(--soft); }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin-bottom: 80px; background: var(--line); border: 1px solid var(--line); }
    .metric { min-height: 132px; padding: 24px; background: var(--surface); }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 20px; font-size: 30px; line-height: 1; letter-spacing: -.03em; }
    .section-heading { display: flex; justify-content: space-between; align-items: end; gap: 32px; margin-bottom: 32px; }
    .section-heading p { max-width: 560px; margin-bottom: 0; color: var(--muted); }
    .fixes-section { margin-bottom: 88px; }
    .fix-stack { display: grid; gap: 16px; }
    .fix-card { display: grid; grid-template-columns: 72px 1fr; border: 1px solid var(--line); background: var(--surface); }
    .fix-card.severity-critical { border-left: 4px solid var(--constrained); }
    .fix-card.severity-high { border-left: 4px solid var(--developing); }
    .fix-card.severity-medium { border-left: 4px solid var(--accent); }
    .fix-index { padding: 24px 16px; border-right: 1px solid var(--line); color: #71808d; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    .fix-body { padding: 24px 28px; }
    .fix-body > p { color: var(--soft); }
    .fix-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; color: var(--muted); font-size: 12px; text-transform: capitalize; }
    .severity-chip { display: inline-flex; border: 1px solid currentColor; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .severity-critical .severity-chip { color: var(--constrained); }
    .severity-high .severity-chip { color: var(--developing); }
    .severity-medium .severity-chip { color: var(--accent); }
    .fix-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0 0; }
    .fix-actions div { padding-top: 16px; border-top: 1px solid var(--line); }
    .fix-actions dt, .improvement > span { color: var(--muted); font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    .fix-actions dd { margin: 6px 0 0; color: var(--soft); }
    .empty-fixes { padding: 28px; border: 1px solid #315643; background: #0f1b16; }
    .empty-fixes strong { color: var(--strong); }
    .empty-fixes p { margin: 8px 0 0; color: var(--soft); }
    .dimension-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .dimension-card { display: flex; flex-direction: column; min-width: 0; padding: 28px; border: 1px solid var(--line); background: var(--surface); }
    .dimension-card.status-strong { border-top: 3px solid var(--strong); }
    .dimension-card.status-developing { border-top: 3px solid var(--developing); }
    .dimension-card.status-constrained { border-top: 3px solid var(--constrained); }
    .dimension-head { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
    .dimension-head .eyebrow { color: var(--muted); }
    .dimension-head h3 { margin-top: 8px; }
    .dimension-score { display: flex; align-items: baseline; white-space: nowrap; }
    .dimension-score strong { font-size: 34px; line-height: 1; letter-spacing: -.04em; }
    .dimension-score span { color: var(--muted); font-size: 13px; }
    .status-row { display: flex; align-items: center; gap: 10px; margin: 4px 0 20px; color: var(--muted); font-size: 12px; }
    .status-badge { border-radius: 999px; padding: 4px 9px; background: var(--surface-raised); color: var(--text); font-weight: 750; text-transform: capitalize; }
    .status-strong .status-badge { color: var(--strong); }
    .status-developing .status-badge { color: var(--developing); }
    .status-constrained .status-badge { color: var(--constrained); }
    .rationale { min-height: 76px; color: var(--soft); }
    .dimension-blocker, .dimension-clear { margin: 4px 0 20px; padding: 16px; background: var(--surface-raised); }
    .dimension-blocker { border-left: 3px solid currentColor; }
    .dimension-blocker strong { display: block; margin-top: 10px; color: var(--text); }
    .dimension-blocker p { margin: 6px 0 0; color: var(--soft); font-size: 14px; }
    .dimension-clear { border-left: 3px solid var(--strong); color: var(--strong); font-size: 14px; }
    .improvement { margin-bottom: 20px; padding-top: 18px; border-top: 1px solid var(--line); }
    .improvement p { margin: 7px 0 0; color: var(--soft); }
    details { border-top: 1px solid var(--line); }
    details + details { margin-top: 0; }
    summary { padding: 14px 0; cursor: pointer; color: var(--soft); font-weight: 650; }
    .evidence-list, .plain-list { display: grid; gap: 10px; margin: 0 0 18px; padding-left: 20px; }
    .evidence-list li { color: var(--soft); }
    .evidence-list li > * { display: block; }
    .evidence-list span { margin-top: 4px; color: var(--muted); font-size: 13px; }
    code { overflow-wrap: anywhere; color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
    .limitations { margin-top: 88px; padding: 32px; border: 1px solid var(--line); background: var(--surface); }
    .limitations h2 { font-size: 28px; }
    .limitations ul { margin-bottom: 0; color: var(--soft); }
    footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    footer div { display: flex; justify-content: space-between; gap: 20px; }
    @media (max-width: 800px) {
      .masthead-inner { min-height: 64px; }
      .scope-pill { display: none; }
      main { padding-top: 44px; }
      .hero { grid-template-columns: 1fr; gap: 32px; }
      .score-ring { width: 160px; }
      .score-inner strong { font-size: 48px; }
      .metric-grid, .dimension-grid { grid-template-columns: 1fr; }
      .section-heading { display: block; }
      .section-heading p { margin-top: 12px; }
      .fix-actions { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .shell { width: min(100% - 24px, 1180px); }
      main { padding-bottom: 64px; }
      .hero { padding-bottom: 44px; }
      .scope-note { padding: 16px; }
      .metric { min-height: 112px; }
      .fix-card { grid-template-columns: 1fr; }
      .fix-index { padding: 12px 20px; border-right: 0; border-bottom: 1px solid var(--line); }
      .fix-body, .dimension-card { padding: 20px; }
      .dimension-head { display: block; }
      .dimension-score { margin-top: 10px; }
      .rationale { min-height: 0; }
      .limitations { padding: 22px; }
      footer div { display: block; }
      footer a { display: inline-block; margin-top: 10px; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    @media print {
      :root { --canvas: #fff; --surface: #fff; --surface-raised: #f5f6f7; --line: #c8cdd2; --text: #111; --muted: #4d5963; --soft: #27313a; }
      body { background: #fff; color: #111; }
      .masthead, footer { break-inside: avoid; }
      .dimension-card, .fix-card, .limitations { break-inside: avoid; }
      .score-ring { background: transparent; border: 8px solid var(--accent); }
      .score-ring::before { background: #fff; }
      details { display: block; }
      details > * { display: block; }
      .skip-link { display: none; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#report">Skip to report</a>
  <header class="masthead">
    <div class="shell masthead-inner">
      <div class="brand"><span class="brand-mark">A/1</span><span>Agent Team Readiness</span></div>
      <span class="scope-pill">Repository-observable assessment</span>
    </div>
  </header>
  <main id="report" class="shell">
    <section class="hero" aria-labelledby="report-title">
      <div>
        <span class="eyebrow">atr-1 · Evidence-first scan</span>
        <h1 id="report-title">${escapeHtml(report.repository.name, 180)}</h1>
        <p class="hero-summary">${escapeHtml(report.summary, 1200)}</p>
        <div class="repo-meta">
          <span>Revision <strong>${escapeHtml(revision, 80)}</strong></span>
          <span>Generated <strong>${escapeHtml(generatedDate, 16)}</strong></span>
          <span>Worktree <strong>${escapeHtml(report.repository.worktree_state, 20)}</strong></span>
        </div>
      </div>
      <div class="score-ring" style="--score:${scoreValue}" role="img" aria-label="Headline score ${score === null ? "withheld" : `${score} out of 100`}">
        <div class="score-inner"><strong>${scoreText}</strong><span>${score === null ? "score withheld" : "repo score / 100"}</span></div>
      </div>
    </section>

    <p class="scope-note"><strong>Read this score narrowly.</strong> It measures repository-level support for parallel coding agents. It does not certify runtime isolation, permissions, owner availability, or actual team behavior.</p>

    <section class="metric-grid" aria-label="Scan coverage">
      <div class="metric"><span>Evidence coverage</span><strong>${report.scope.evidence_coverage}%</strong></div>
      <div class="metric"><span>Files analyzed</span><strong>${report.repository.analyzed_file_count.toLocaleString("en-US")}</strong></div>
      <div class="metric"><span>Top blockers</span><strong>${report.top_3_fixes.length}</strong></div>
    </section>

    <section class="fixes-section" aria-labelledby="fixes-title">
      <div class="section-heading">
        <div><span class="eyebrow">Prioritized work</span><h2 id="fixes-title">Top 3 readiness fixes</h2></div>
        <p>Ranked deterministically by blocker severity, dimension weight, and the gap to a strong repository contract.</p>
      </div>
      <div class="fix-stack">${fixes}</div>
    </section>

    <section aria-labelledby="dimensions-title">
      <div class="section-heading">
        <div><span class="eyebrow">Six fixed dimensions</span><h2 id="dimensions-title">Where the repository helps—or gets in the way</h2></div>
        <p>Each dimension keeps its strongest evidence, smallest useful improvement, and unknowns separate.</p>
      </div>
      <div class="dimension-grid">${report.dimensions.map(renderDimension).join("")}</div>
    </section>

    <section class="limitations" aria-labelledby="limits-title">
      <span class="eyebrow">Scope boundary</span>
      <h2 id="limits-title">What this scan cannot prove</h2>
      <ul>${report.scope.limitations.map((limitation) => `<li>${escapeHtml(limitation, 1000)}</li>`).join("")}</ul>
    </section>

    <footer>
      <div><span>Report key: ${escapeHtml(key, 140)}</span><a href="${REPORT_BASE}/${escapeHtml(key, 140)}.json" rel="noreferrer">Open machine-readable atr-1 JSON</a></div>
    </footer>
  </main>
</body>
</html>`;
}

function usage() {
  return "Usage: render-report.mjs <atr-1.json> [--out-dir <directory>]";
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  let reportFile = null;
  let outputDirectory = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out-dir") {
      outputDirectory = argv[++index];
      if (!outputDirectory) throw new Error("--out-dir requires a directory");
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (reportFile === null) {
      reportFile = argument;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }
  if (!reportFile) throw new Error("atr-1.json path is required");
  return { reportFile: path.resolve(reportFile), outputDirectory };
}

export async function renderReportFile(reportFile, outputDirectory = null) {
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  validateReport(report);
  const key = computeReportKey(report);
  const directory = path.resolve(outputDirectory ?? path.dirname(reportFile));
  await mkdir(directory, { recursive: true });
  const outputFile = path.join(directory, `${key}.html`);
  await writeFile(outputFile, renderReport(report), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { key, outputFile };
}

export async function runCli(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = await renderReportFile(options.reportFile, options.outputDirectory);
    process.stdout.write(`${result.key}\n`);
  } catch (error) {
    process.stderr.write(`atr-render: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await runCli(process.argv.slice(2));
}
