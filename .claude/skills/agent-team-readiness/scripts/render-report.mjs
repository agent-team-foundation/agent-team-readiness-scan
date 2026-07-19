#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateReport } from "./lib/validate.mjs";

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

function dimensionTone(dimension) {
  if (dimension.status === "constrained") return { label: "Constrained", className: "critical" };
  if (dimension.status === "developing") return { label: "Developing", className: "high" };
  return { label: "Strong", className: "stable" };
}

function renderDimensionRail(dimension) {
  const tone = dimensionTone(dimension);
  return `<div class="dimension-rail-item tone-${tone.className}">
    <span>${escapeHtml(dimension.name, 120)}</span>
    <strong>${dimension.score}<small>/10</small></strong>
    <i style="--dimension-score:${dimension.score}" aria-hidden="true"></i>
  </div>`;
}

function renderPriorityRow(fix, index) {
  return `<div class="priority-row severity-${escapeHtml(fix.severity, 16)}" role="row">
    <span class="priority-index" role="cell">${String(index + 1).padStart(2, "0")}</span>
    <strong role="cell">${escapeHtml(fix.title, 240)}</strong>
    <span role="cell">${escapeHtml(fix.dimension.replaceAll("_", " "), 80)}</span>
    <span role="cell"><b class="severity-chip">${escapeHtml(severityLabel(fix.severity), 16)}</b></span>
    <span role="cell">${escapeHtml(fix.why_it_matters, 360)}</span>
  </div>`;
}

function renderDimensionDetail(dimension, className = "dimension-detail") {
  return `<div class="${className}">
    <section><h4>Strongest evidence</h4>${renderEvidenceList(dimension.strongest_evidence)}</section>
    <section><h4>Smallest useful improvement</h4><p>${escapeHtml(dimension.minimum_improvement, 1000)}</p></section>
    <section><h4>What remains unknown</h4><ul class="plain-list">${dimension.unknowns.map((unknown) => `<li>${escapeHtml(unknown, 1000)}</li>`).join("")}</ul></section>
  </div>`;
}

function renderDimensionLedger(dimension, index) {
  const tone = dimensionTone(dimension);
  return `<article class="dimension-row tone-${tone.className}">
    <div class="dimension-row-main">
      <span class="dimension-number">${String(dimension.score).padStart(2, "0")}</span>
      <div class="dimension-copy">
        <h3>${escapeHtml(dimension.name, 120)}</h3>
        <p>${escapeHtml(dimension.rationale, 1000)}</p>
      </div>
      <div class="dimension-evidence">
        <span>Evidence</span>
        <strong>${dimension.strongest_evidence.length} source${dimension.strongest_evidence.length === 1 ? "" : "s"}</strong>
        <small>${escapeHtml(dimension.evidence_status, 20)} coverage</small>
      </div>
      <div class="dimension-priority">
        <span>Status</span>
        <b>${tone.label}</b>
      </div>
    </div>
    <details>
      <summary>Open evidence and next step</summary>
      ${renderDimensionDetail(dimension)}
    </details>
    ${renderDimensionDetail(dimension, "print-dimension-detail")}
  </article>`;
}

function renderFixChapter(fix, index) {
  const evidence = fix.evidence ?? [];
  return `<article class="fix-chapter severity-${escapeHtml(fix.severity, 16)}">
    <header>
      <span class="chapter-number">${String(index + 1).padStart(2, "0")}</span>
      <div><span class="chapter-meta">${escapeHtml(fix.dimension.replaceAll("_", " "), 80)}</span><h3>${escapeHtml(fix.title, 240)}</h3><p>${escapeHtml(fix.why_it_matters, 800)}</p></div>
      <b class="severity-chip">${escapeHtml(severityLabel(fix.severity), 16)}</b>
    </header>
    <div class="chapter-grid">
      <section><h4>Blocker evidence</h4>${evidence.length ? renderEvidenceList(evidence) : "<p>No blocker evidence was retained.</p>"}</section>
      <section><h4>Why it matters</h4><p>${escapeHtml(fix.why_it_matters, 1000)}</p></section>
      <section class="chapter-fix"><h4>Minimum fix</h4><p>${escapeHtml(fix.minimum_fix, 1000)}</p></section>
      <section><h4>Verify first</h4><p>${escapeHtml(fix.first_verification_step, 1000)}</p></section>
    </div>
  </article>`;
}

function validateMachineHref(machineHref) {
  if (machineHref === null) return null;
  if (!/^\.\/[A-Za-z0-9._~%+-]+\.json$/.test(machineHref)) {
    throw new Error("machine JSON href must be a same-directory JSON path");
  }
  return machineHref;
}

export function renderReport(report, { machineHref = null } = {}) {
  validateReport(report);
  const key = computeReportKey(report);
  const score = report.headline_score;
  const scoreText = score === null ? "—" : String(score);
  const revision = report.repository.revision ? report.repository.revision.slice(0, 12) : report.repository.worktree_state;
  const generatedDate = report.generated_at.slice(0, 10);
  const verdict = score === null ? "Repository-observable score withheld" : "Repository-observable readiness";
  const scoreTone = score === null
    ? "neutral"
    : report.dimensions.some((dimension) => dimension.status === "constrained")
      ? "danger"
      : report.dimensions.some((dimension) => dimension.status === "developing")
        ? "warning"
        : "stable";
  const machineUrl = validateMachineHref(machineHref);
  const machineAction = machineUrl
    ? `<a href="${machineUrl}" rel="noreferrer">Open machine-readable atr-1 JSON</a>`
    : `<a href="#limits-title">Review scan limitations</a>`;
  const priorityRows = report.top_3_fixes.length
    ? report.top_3_fixes.map(renderPriorityRow).join("")
    : `<div class="priority-empty" role="row"><span role="cell" aria-colspan="5">No repository-observable blocker ranked in the Top 3.</span></div>`;
  const fixChapters = report.top_3_fixes.length
    ? report.top_3_fixes.map((fix, index) => renderFixChapter(fix, index)).join("")
    : `<div class="clear-state"><strong>No must-fix chapter was generated from observed evidence.</strong><p>Review evidence coverage and remaining unknowns before treating this result as complete or as runtime certification.</p></div>`;
  const mustFixHeading = report.top_3_fixes.length
    ? `<div><span class="eyebrow">Must-fix chapters · Top ${report.top_3_fixes.length} blockers</span><h2 id="must-fix-title">Fix these in order</h2></div>
        <p>Each chapter connects blocker evidence to its impact, minimum fix, and first verification step.</p>`
    : `<div><span class="eyebrow">Observed evidence</span><h2 id="must-fix-title">No repository-observable blockers were ranked</h2></div>
        <p>Review evidence coverage and remaining unknowns before treating repository evidence as complete or as runtime certification.</p>`;
  const nextStep = report.top_3_fixes.length
    ? `<aside class="cta"><div><strong>Review the must-fix chapters</strong><p>Each chapter keeps blocker evidence, impact, minimum fix, and verification together.</p></div><a href="#must-fix">Review fixes</a></aside>`
    : `<aside class="cta"><div><strong>Keep the repository contract current</strong><p>Review evidence and unknowns whenever the repository's agent workflow changes.</p></div><a href="#dimensions-title">Review dimensions</a></aside>`;

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
      --canvas: #080907;
      --surface: #0d0f0c;
      --surface-raised: #11130f;
      --line: #292b27;
      --text: #f2f1eb;
      --muted: #989b92;
      --soft: #c9cbc3;
      --accent: #d9ff43;
      --warning: #ff9d31;
      --danger: #ff4d43;
      --stable: #b9d66b;
      --focus: #f2f1eb;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--canvas);
      color: var(--text);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-underline-offset: 0.18em; }
    a:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
    .skip-link { position: fixed; left: 16px; top: -80px; z-index: 10; padding: 12px 16px; background: var(--text); color: var(--canvas); }
    .skip-link:focus { top: 16px; }
    .shell { width: min(1240px, calc(100% - 48px)); margin: 0 auto; }
    .masthead { padding-top: 18px; }
    .masthead-inner { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 18px; border: 1px solid var(--line); }
    .brand { font: 700 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -.02em; }
    .brand span { color: var(--muted); font-weight: 500; }
    main { padding: 48px 0 96px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, .88fr); gap: 72px; align-items: start; padding: 10px 0 48px; }
    .eyebrow { display: block; color: var(--warning); font: 750 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { max-width: 720px; margin: 14px 0 28px; font: 650 clamp(28px, 4vw, 54px)/1.02 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -.055em; overflow-wrap: anywhere; }
    h2 { margin-bottom: 10px; font-size: clamp(25px, 3vw, 36px); line-height: 1.08; letter-spacing: -.035em; }
    h3 { margin-bottom: 8px; font-size: 19px; line-height: 1.2; letter-spacing: -.02em; }
    h4 { margin: 0 0 12px; color: var(--muted); font: 750 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .score-lockup { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
    .score-lockup strong { color: var(--muted); font-size: clamp(72px, 10vw, 120px); line-height: .82; letter-spacing: -.08em; }
    .score-lockup.tone-danger strong { color: var(--danger); }
    .score-lockup.tone-warning strong { color: var(--warning); }
    .score-lockup.tone-stable strong { color: var(--stable); }
    .score-lockup span { font-size: clamp(34px, 5vw, 58px); font-weight: 700; letter-spacing: -.05em; }
    .verdict { margin-bottom: 18px; font-size: clamp(30px, 4vw, 48px); line-height: 1; letter-spacing: -.045em; }
    .hero-summary { max-width: 680px; color: var(--soft); font-size: 17px; }
    .repo-meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 26px; color: var(--muted); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .repo-meta strong { color: var(--text); font-weight: 650; }
    .repo-panel { border: 1px solid var(--line); }
    .repo-card { padding: 20px; border-bottom: 1px solid var(--line); }
    .repo-card span, .dimension-rail-title { color: var(--muted); font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .repo-card strong { display: block; margin: 12px 0 5px; font: 650 17px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .repo-card small { color: var(--muted); }
    .dimension-rail { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 14px; padding: 20px; }
    .dimension-rail-title { grid-column: 1 / -1; color: var(--warning); }
    .dimension-rail-item span { display: block; min-height: 30px; color: var(--soft); font-size: 10px; line-height: 1.25; }
    .dimension-rail-item strong { display: block; margin-top: 8px; font: 700 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .dimension-rail-item small { color: var(--muted); font-size: 9px; }
    .dimension-rail-item i { display: block; height: 2px; margin-top: 8px; background: var(--line); }
    .dimension-rail-item i::after { content: ""; display: block; width: calc(var(--dimension-score) * 10%); height: 100%; background: var(--stable); }
    .dimension-rail-item.tone-critical i::after { background: var(--danger); }
    .dimension-rail-item.tone-high i::after { background: var(--warning); }
    .action-rail { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 0 56px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .action-rail a { padding: 16px; text-align: center; text-decoration: none; font-size: 14px; }
    .action-rail a + a { border-left: 1px solid var(--line); }
    .action-rail a.primary { color: var(--accent); }
    .narrative { max-width: 760px; margin: 0 0 64px; }
    .narrative p { color: var(--soft); }
    .narrative .scope-note { margin-top: 18px; color: var(--muted); font-size: 13px; }
    .section { margin-bottom: 76px; }
    .section-heading { display: flex; justify-content: space-between; align-items: end; gap: 32px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
    .section-heading p { max-width: 560px; margin-bottom: 0; color: var(--muted); }
    .priority-table { border-bottom: 1px solid var(--line); }
    .priority-head, .priority-row { display: grid; grid-template-columns: 56px 1.15fr 1fr 120px 1.35fr; gap: 18px; align-items: center; padding: 15px 0; border-top: 1px solid var(--line); }
    .priority-head { color: var(--muted); font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .priority-row { color: var(--soft); font-size: 13px; }
    .priority-row strong { color: var(--text); font-size: 15px; }
    .priority-row > *, .dimension-row-main > *, .fix-chapter > header > *, .chapter-grid > * { min-width: 0; overflow-wrap: anywhere; }
    .priority-index, .dimension-number, .chapter-number { color: var(--danger); font: 700 24px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .severity-chip { display: inline-flex; border: 1px solid currentColor; border-radius: 999px; padding: 4px 9px; font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .severity-critical .severity-chip { color: var(--danger); }
    .severity-high .severity-chip { color: var(--warning); }
    .severity-medium .severity-chip { color: var(--accent); }
    .priority-empty, .clear-state { padding: 28px 0; color: var(--soft); border-top: 1px solid var(--line); }
    .dimension-row { border-bottom: 1px solid var(--line); }
    .dimension-row-main { display: grid; grid-template-columns: 72px 1.7fr .7fr .55fr; gap: 18px; align-items: center; padding: 18px 0; }
    .dimension-number { font-size: 38px; }
    .tone-high .dimension-number { color: var(--warning); }
    .tone-stable .dimension-number { color: var(--stable); }
    .dimension-copy p { margin: 0; color: var(--muted); font-size: 13px; }
    .dimension-evidence span, .dimension-priority span { display: block; margin-bottom: 7px; color: var(--muted); font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; }
    .dimension-evidence strong, .dimension-evidence small { display: block; }
    .dimension-evidence small { margin-top: 4px; color: var(--muted); }
    .dimension-priority b { display: inline-flex; border: 1px solid currentColor; border-radius: 999px; padding: 5px 9px; color: var(--stable); font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .tone-critical .dimension-priority b { color: var(--danger); }
    .tone-high .dimension-priority b { color: var(--warning); }
    details { border-top: 1px solid var(--line); }
    summary { padding: 12px 0; cursor: pointer; color: var(--muted); font-size: 12px; }
    .dimension-detail { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 28px; padding: 18px 0 26px 72px; }
    .print-dimension-detail { display: none; }
    .dimension-detail p, .dimension-detail li, .print-dimension-detail p, .print-dimension-detail li { color: var(--soft); font-size: 13px; }
    .evidence-list, .plain-list { display: grid; gap: 10px; margin: 0 0 18px; padding-left: 20px; }
    .evidence-list li { color: var(--soft); }
    .evidence-list li > * { display: block; }
    .evidence-list span { margin-top: 4px; color: var(--muted); font-size: 13px; }
    code { overflow-wrap: anywhere; color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
    .fix-chapter { border-bottom: 1px solid var(--line); }
    .fix-chapter > header { display: grid; grid-template-columns: 52px 1fr auto; gap: 18px; align-items: start; padding: 24px 0; }
    .fix-chapter header p { margin: 0; color: var(--muted); font-size: 13px; }
    .chapter-meta { display: block; margin-bottom: 7px; color: var(--warning); font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; }
    .chapter-grid { display: grid; grid-template-columns: 1.15fr .95fr 1fr .9fr; border-top: 1px solid var(--line); }
    .chapter-grid section { min-width: 0; padding: 22px 20px 24px 0; }
    .chapter-grid section + section { padding-left: 20px; border-left: 1px solid var(--line); }
    .chapter-grid p, .chapter-grid li { color: var(--soft); font-size: 13px; }
    .chapter-fix p { color: var(--accent); }
    .limitations { margin-top: 76px; padding: 28px; border: 1px solid var(--line); }
    .limitations h2 { font-size: 26px; }
    .limitations ul { margin-bottom: 0; color: var(--soft); }
    .cta { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-top: 64px; padding: 24px 28px; border: 1px solid #6f8522; }
    .cta strong { display: block; color: var(--accent); font-size: 18px; }
    .cta p { margin: 5px 0 0; color: var(--muted); font-size: 13px; }
    .cta a { flex: 0 0 auto; padding: 12px 18px; background: var(--accent); color: #111408; font-weight: 800; text-decoration: none; }
    footer { margin-top: 54px; padding: 24px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    footer div { display: flex; justify-content: space-between; gap: 20px; }
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; gap: 36px; }
      .priority-head { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
      .priority-row { grid-template-columns: 48px 1fr auto; }
      .priority-row > :nth-child(3), .priority-row > :nth-child(5) { grid-column: 2 / -1; }
      .dimension-row-main { grid-template-columns: 64px 1fr auto; }
      .dimension-evidence { grid-column: 2; }
      .dimension-priority { grid-column: 3; grid-row: 1; }
      .dimension-detail { grid-template-columns: 1fr; padding-left: 64px; }
      .chapter-grid { grid-template-columns: 1fr 1fr; }
      .chapter-grid section:nth-child(3) { border-left: 0; border-top: 1px solid var(--line); }
      .chapter-grid section:nth-child(4) { border-top: 1px solid var(--line); }
    }
    @media (max-width: 680px) {
      .masthead-inner { min-height: 50px; }
      .masthead-inner > span { display: none; }
      main { padding-top: 34px; }
      .action-rail { grid-template-columns: 1fr; }
      .action-rail a + a { border-left: 0; border-top: 1px solid var(--line); }
      .dimension-rail { grid-template-columns: repeat(2, 1fr); }
      .section-heading { display: block; }
      .section-heading p { margin-top: 12px; }
      .priority-row { grid-template-columns: 42px 1fr; }
      .priority-row > :nth-child(4) { grid-column: 2; }
      .dimension-row-main { grid-template-columns: 54px 1fr; }
      .dimension-priority { grid-column: 2; grid-row: auto; }
      .dimension-detail { padding-left: 0; }
      .fix-chapter > header { grid-template-columns: 42px 1fr; }
      .fix-chapter > header > .severity-chip { grid-column: 2; }
      .chapter-grid { grid-template-columns: 1fr; }
      .chapter-grid section, .chapter-grid section + section { padding: 18px 0; border-left: 0; border-top: 1px solid var(--line); }
      .cta { align-items: stretch; flex-direction: column; }
      .cta a { text-align: center; }
    }
    @media (max-width: 420px) {
      .shell { width: min(100% - 24px, 1240px); }
      main { padding-bottom: 64px; }
      .hero { padding-bottom: 36px; }
      .limitations { padding: 22px; }
      footer div { display: block; }
      footer a { display: inline-block; margin-top: 10px; }
      h1, h2, h3, a, code, strong { overflow-wrap: anywhere; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    @media print {
      :root { --canvas: #fff; --surface: #fff; --surface-raised: #f5f6f1; --line: #bfc2ba; --text: #111; --muted: #4d5148; --soft: #272b23; --accent: #3f5200; --warning: #8f3f00; --danger: #9f1f17; --stable: #3f5200; --focus: #111; }
      body { background: #fff; color: #111; }
      .masthead, footer, .fix-chapter, .dimension-row, .limitations { break-inside: avoid; }
      .narrative, .priority-row, .section-heading, .fix-chapter > header { break-inside: avoid; }
      .section-heading, .fix-chapter > header { break-after: avoid-page; }
      .action-rail, .cta { display: none; }
      details { display: none; }
      .print-dimension-detail { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 28px; padding: 18px 0 26px 72px; }
      .skip-link { display: none; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#report">Skip to report</a>
  <header class="masthead">
    <div class="shell masthead-inner">
      <div class="brand">first-tree <span>/ agent team readiness</span></div>
      <span>Evidence-first repository scan</span>
    </div>
  </header>
  <main id="report" class="shell">
    <section class="hero" aria-labelledby="report-title">
      <div>
        <span class="eyebrow">Agent team readiness</span>
        <h1 id="report-title">${escapeHtml(report.repository.name, 180)}</h1>
        <div class="score-lockup tone-${scoreTone}" aria-label="Headline score ${score === null ? "withheld" : `${score} out of 100`}"><strong>${scoreText}</strong>${score === null ? "" : "<span>/100</span>"}</div>
        <h2 class="verdict">${escapeHtml(verdict, 80)}</h2>
        <p class="hero-summary">${escapeHtml(report.summary, 1200)}</p>
        <div class="repo-meta">
          <span>Revision <strong>${escapeHtml(revision, 80)}</strong></span>
          <span>Generated <strong>${escapeHtml(generatedDate, 16)}</strong></span>
          <span>Files <strong>${report.repository.analyzed_file_count.toLocaleString("en-US")}</strong></span>
          <span>Evidence <strong>${report.scope.evidence_coverage}%</strong></span>
        </div>
      </div>
      <div class="repo-panel">
        <div class="repo-card"><span>Repository</span><strong>${escapeHtml(report.repository.name, 180)}</strong><small>${escapeHtml(report.repository.worktree_state, 20)} worktree · ${escapeHtml(revision, 80)}</small></div>
        <div class="dimension-rail"><span class="dimension-rail-title">Six dimensions</span>${report.dimensions.map(renderDimensionRail).join("")}</div>
      </div>
    </section>

    <nav class="action-rail" aria-label="Report actions">
      <a href="#score-meaning">Review report scope</a>
      <a class="primary" href="${report.top_3_fixes.length ? "#must-fix" : "#dimensions-title"}">${report.top_3_fixes.length ? `Fix top ${report.top_3_fixes.length}` : "Review six dimensions"}</a>
      ${machineAction}
    </nav>

    <section class="narrative" aria-labelledby="score-meaning">
      <span class="eyebrow">What this score means</span>
      <h2 id="score-meaning">Repository readiness, not runtime certification.</h2>
      <p>${score === null ? "The headline score is withheld because the repository inventory is incomplete." : `${score}/100 reflects repository-observable support across six fixed dimensions for parallel coding agents.`} ${report.top_3_fixes.length ? "Start with the highest-priority blockers below, then use the evidence ledger to understand what remains unknown." : "Use the evidence ledger to review the repository contract and what remains unknown."}</p>
      <p class="scope-note">This scan does not certify runtime isolation, permissions, owner availability, actual team behavior, or private integrations.</p>
    </section>

    <section class="section" aria-labelledby="breaks-title">
      <div class="section-heading">
        <div><span class="eyebrow">Where repository support is weakest</span><h2 id="breaks-title">Highest-priority repository blockers</h2></div>
        <p>Ranked by blocker severity, dimension weight, and evidence gap.</p>
      </div>
      <div class="priority-table" role="table" aria-label="Priority findings">
        <div class="priority-head" role="row"><span role="columnheader">Priority</span><span role="columnheader">Blocker</span><span role="columnheader">Dimension</span><span role="columnheader">Severity</span><span role="columnheader">Impact</span></div>
        ${priorityRows}
      </div>
    </section>

    <section class="section" aria-labelledby="dimensions-title">
      <div class="section-heading">
        <div><span class="eyebrow">Six dimensions · Full results</span><h2 id="dimensions-title">The repository contract, line by line</h2></div>
        <p>Every score keeps its evidence, next useful improvement, and unknowns available.</p>
      </div>
      <div class="dimension-ledger">${report.dimensions.map(renderDimensionLedger).join("")}</div>
    </section>

    <section id="must-fix" class="section" aria-labelledby="must-fix-title">
      <div class="section-heading">
        ${mustFixHeading}
      </div>
      ${fixChapters}
    </section>

    <section class="limitations" aria-labelledby="limits-title">
      <span class="eyebrow">Scope boundary</span>
      <h2 id="limits-title">What this scan cannot prove</h2>
      <ul>${report.scope.limitations.map((limitation) => `<li>${escapeHtml(limitation, 1000)}</li>`).join("")}</ul>
    </section>

    ${nextStep}

    <footer>
      <div><span>first-tree · Agent Team Readiness</span><span>Report key: ${escapeHtml(key, 140)}</span></div>
    </footer>
  </main>
</body>
</html>`;
}

function usage() {
  return "Usage: render-report.mjs <atr-1.json> [--out-dir <directory>] [--hosted]";
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  let reportFile = null;
  let outputDirectory = null;
  let hosted = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out-dir") {
      outputDirectory = argv[++index];
      if (!outputDirectory) throw new Error("--out-dir requires a directory");
    } else if (argument === "--hosted") {
      hosted = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (reportFile === null) {
      reportFile = argument;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }
  if (!reportFile) throw new Error("atr-1.json path is required");
  return { reportFile: path.resolve(reportFile), outputDirectory, hosted };
}

export async function renderReportFile(reportFile, outputDirectory = null, { hosted = false } = {}) {
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  validateReport(report);
  const key = computeReportKey(report);
  const directory = path.resolve(outputDirectory ?? path.dirname(reportFile));
  await mkdir(directory, { recursive: true });
  const outputFile = path.join(directory, `${key}.html`);
  const sameDirectory = path.dirname(path.resolve(reportFile)) === directory;
  const machineHref = hosted
    ? `./${key}.json`
    : sameDirectory
      ? `./${encodeURIComponent(path.basename(reportFile))}`
      : null;
  await writeFile(outputFile, renderReport(report, { machineHref }), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { key, outputFile };
}

export async function runCli(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = await renderReportFile(options.reportFile, options.outputDirectory, { hosted: options.hosted });
    process.stdout.write(`${result.key}\n`);
  } catch (error) {
    process.stderr.write(`atr-render: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await runCli(process.argv.slice(2));
}
