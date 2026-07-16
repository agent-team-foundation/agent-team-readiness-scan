import { isDeepStrictEqual } from "node:util";
import { DIMENSIONS, ISO_UTC_RE, REPORT_SCHEMA_VERSION } from "./constants.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(`atr-1 invalid: ${message}`);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} keys must be exactly: ${wanted.join(", ")}`);
}

function validateEvidenceRef(reference, label) {
  assert(isObject(reference), `${label} must be an object`);
  assertKeys(reference, ["kind", "path", "line", "command", "detail"], label);
  assert(["file", "missing", "command"].includes(reference.kind), `${label}.kind is invalid`);
  assert(typeof reference.detail === "string" && reference.detail.length > 0 && reference.detail.length <= 240, `${label}.detail must be 1-240 characters`);
  assert(reference.path === null || typeof reference.path === "string", `${label}.path must be string|null`);
  assert(reference.line === null || (Number.isInteger(reference.line) && reference.line >= 1), `${label}.line must be positive integer|null`);
  assert(reference.command === null || (typeof reference.command === "string" && reference.command.length <= 240), `${label}.command must be string|null with at most 240 characters`);
  if (reference.kind === "command") assert(reference.command, `${label}.command is required for command evidence`);
  if (reference.kind !== "command") {
    assert(reference.path, `${label}.path is required for file/missing evidence`);
    assert(reference.command === null, `${label}.command must be null for file/missing evidence`);
  }
  if (reference.kind === "missing") assert(reference.line === null, `${label}.line must be null for missing evidence`);
}

export function isValidUtcTimestamp(value) {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function validateBlocker(value, label, dimensionKey) {
  assert(isObject(value), `${label} must be an object`);
  assertKeys(value, ["id", "dimension", "severity", "title", "evidence", "why_it_matters", "minimum_fix", "first_verification_step"], label);
  assert(/^[a-z0-9-]+$/.test(value.id ?? ""), `${label}.id is invalid`);
  assert(value.dimension === dimensionKey, `${label}.dimension must be ${dimensionKey}`);
  assert(["critical", "high", "medium"].includes(value.severity), `${label}.severity is invalid`);
  for (const field of ["title", "why_it_matters", "minimum_fix", "first_verification_step"]) {
    assert(typeof value[field] === "string" && value[field].length > 0, `${label}.${field} is required`);
  }
  assert(Array.isArray(value.evidence) && value.evidence.length > 0, `${label}.evidence must be non-empty`);
  value.evidence.forEach((reference, index) => validateEvidenceRef(reference, `${label}.evidence[${index}]`));
}

export function validateReport(report) {
  assert(isObject(report), "report must be an object");
  assertKeys(report, ["schema_version", "wedge", "generated_at", "repository", "scope", "headline_score", "dimensions", "top_3_fixes", "artifacts", "summary"], "report");
  assert(report.schema_version === REPORT_SCHEMA_VERSION, `schema_version must be ${REPORT_SCHEMA_VERSION}`);
  assert(report.wedge === "agent-team-readiness", "wedge must be agent-team-readiness");
  assert(isValidUtcTimestamp(report.generated_at), "generated_at must be a real ISO-8601 UTC date-time ending in Z");
  assert(isObject(report.repository), "repository is required");
  assertKeys(report.repository, ["source", "name", "revision", "worktree_state", "file_count", "analyzed_file_count", "skipped_file_count", "inventory_truncated"], "repository");
  for (const field of ["source", "name"]) assert(typeof report.repository[field] === "string" && report.repository[field], `repository.${field} is required`);
  for (const field of ["file_count", "analyzed_file_count", "skipped_file_count"]) assert(Number.isInteger(report.repository[field]) && report.repository[field] >= 0, `repository.${field} must be a non-negative integer`);
  assert(report.repository.analyzed_file_count + report.repository.skipped_file_count <= report.repository.file_count, "repository analyzed + skipped files cannot exceed file_count");
  assert(report.repository.revision === null || typeof report.repository.revision === "string", "repository.revision must be string|null");
  assert(["clean", "dirty", "not-git", "unknown"].includes(report.repository.worktree_state), "repository.worktree_state is invalid");
  if (report.repository.worktree_state !== "clean") assert(report.repository.revision === null, "repository.revision must be null unless worktree_state is clean");
  assert(typeof report.repository.inventory_truncated === "boolean", "repository.inventory_truncated must be boolean");
  assert(report.repository.inventory_truncated === (report.repository.analyzed_file_count + report.repository.skipped_file_count < report.repository.file_count), "repository.inventory_truncated must match the analysis limit");
  assert(isObject(report.scope), "scope is required");
  assertKeys(report.scope, ["claim", "observable_only", "evidence_coverage", "limitations"], "scope");
  assert(report.scope.claim === "repo-level readiness", "scope.claim must remain repo-level readiness");
  assert(report.scope.observable_only === true, "scope.observable_only must be true");
  assert(Number.isInteger(report.scope.evidence_coverage) && report.scope.evidence_coverage >= 0 && report.scope.evidence_coverage <= 100, "scope.evidence_coverage must be 0-100");
  const expectedCoverage = report.repository.file_count === 0
    ? 0
    : Math.min(100, Math.floor((report.repository.analyzed_file_count / report.repository.file_count) * 100));
  assert(report.scope.evidence_coverage === expectedCoverage, `scope.evidence_coverage must be ${expectedCoverage}`);
  assert(Array.isArray(report.scope.limitations) && report.scope.limitations.length > 0, "scope.limitations must be non-empty");
  assert(report.scope.limitations.every((limitation) => typeof limitation === "string" && limitation.length > 0), "scope.limitations entries must be non-empty strings");

  assert(Array.isArray(report.dimensions) && report.dimensions.length === DIMENSIONS.length, "dimensions must contain exactly six entries");
  const blockersById = new Map();
  for (const [index, expected] of DIMENSIONS.entries()) {
    const dimension = report.dimensions[index];
    assertKeys(dimension, ["key", "name", "weight", "score", "status", "evidence_status", "rationale", "strongest_evidence", "must_fix_blocker", "minimum_improvement", "unknowns"], `dimensions[${index}]`);
    assert(dimension.key === expected.key, `dimensions[${index}].key must be ${expected.key}`);
    assert(dimension.name === expected.name, `dimensions[${index}].name must be ${expected.name}`);
    assert(dimension.weight === expected.weight, `dimensions[${index}].weight must be ${expected.weight}`);
    assert(Number.isInteger(dimension.score) && dimension.score >= 0 && dimension.score <= 10, `dimensions[${index}].score must be 0-10`);
    assert(["strong", "developing", "constrained"].includes(dimension.status), `dimensions[${index}].status is invalid`);
    const expectedStatus = dimension.score >= 8 ? "strong" : dimension.score >= 5 ? "developing" : "constrained";
    assert(dimension.status === expectedStatus, `dimensions[${index}].status must match score (${expectedStatus})`);
    const expectedEvidenceStatus = report.repository.inventory_truncated || report.repository.skipped_file_count > 0 ? "partial" : "observed";
    assert(dimension.evidence_status === expectedEvidenceStatus, `dimensions[${index}].evidence_status must be ${expectedEvidenceStatus}`);
    assert(typeof dimension.rationale === "string" && dimension.rationale, `dimensions[${index}].rationale is required`);
    assert(Array.isArray(dimension.strongest_evidence) && dimension.strongest_evidence.length > 0, `dimensions[${index}].strongest_evidence must be non-empty`);
    dimension.strongest_evidence.forEach((reference, refIndex) => validateEvidenceRef(reference, `dimensions[${index}].strongest_evidence[${refIndex}]`));
    assert(typeof dimension.minimum_improvement === "string" && dimension.minimum_improvement, `dimensions[${index}].minimum_improvement is required`);
    assert(Array.isArray(dimension.unknowns) && dimension.unknowns.length > 0, `dimensions[${index}].unknowns must be a non-empty array`);
    assert(dimension.unknowns.every((unknown) => typeof unknown === "string" && unknown.length > 0), `dimensions[${index}].unknowns entries must be non-empty strings`);
    if (dimension.must_fix_blocker !== null) {
      validateBlocker(dimension.must_fix_blocker, `dimensions[${index}].must_fix_blocker`, dimension.key);
      assert(!blockersById.has(dimension.must_fix_blocker.id), `duplicate blocker id ${dimension.must_fix_blocker.id}`);
      blockersById.set(dimension.must_fix_blocker.id, dimension.must_fix_blocker);
    }
  }
  assert(DIMENSIONS.reduce((sum, dimension) => sum + dimension.weight, 0) === 100, "dimension weights must sum to 100");
  const expectedHeadline = Math.round(report.dimensions.reduce((sum, dimension) => sum + (dimension.score / 10) * dimension.weight, 0));
  if (report.scope.evidence_coverage >= 60) assert(report.headline_score === expectedHeadline, `headline_score must be ${expectedHeadline}`);
  else assert(report.headline_score === null, "headline_score must be null below 60% coverage");

  assert(Array.isArray(report.top_3_fixes) && report.top_3_fixes.length <= 3, "top_3_fixes must contain at most three entries");
  const expectedTopFixIds = report.dimensions
    .filter((dimension) => dimension.must_fix_blocker !== null)
    .sort((left, right) => {
      const severity = { critical: 3, high: 2, medium: 1 };
      const leftPriority = severity[left.must_fix_blocker.severity] * 1000 + left.weight * (10 - left.score);
      const rightPriority = severity[right.must_fix_blocker.severity] * 1000 + right.weight * (10 - right.score);
      return rightPriority - leftPriority;
    })
    .slice(0, 3)
    .map((dimension) => dimension.must_fix_blocker.id);
  assert(report.top_3_fixes.length === expectedTopFixIds.length, `top_3_fixes must contain ${expectedTopFixIds.length} prioritized dimension blockers`);
  const topFixIds = new Set();
  for (const [index, fix] of report.top_3_fixes.entries()) {
    validateBlocker(fix, `top_3_fixes[${index}]`, fix.dimension);
    assert(blockersById.has(fix.id), `top_3_fixes[${index}] must reference a dimension blocker`);
    assert(isDeepStrictEqual(fix, blockersById.get(fix.id)), `top_3_fixes[${index}] must exactly reuse its dimension blocker`);
    assert(fix.id === expectedTopFixIds[index], `top_3_fixes[${index}] must be prioritized blocker ${expectedTopFixIds[index]}`);
    assert(!topFixIds.has(fix.id), `top_3_fixes contains duplicate ${fix.id}`);
    topFixIds.add(fix.id);
  }
  assert(isObject(report.artifacts), "artifacts is required");
  assertKeys(report.artifacts, ["evidence", "agents_draft", "context_tree_seed_map"], "artifacts");
  assert(report.artifacts.evidence === "evidence.json", "artifacts.evidence must be evidence.json");
  assert(report.artifacts.agents_draft === "AGENTS.draft.md", "artifacts.agents_draft must be AGENTS.draft.md");
  assert(report.artifacts.context_tree_seed_map === "context-tree-seed-map.md", "artifacts.context_tree_seed_map must be context-tree-seed-map.md");
  assert(typeof report.summary === "string" && report.summary, "summary is required");
  return report;
}
