export const EVIDENCE_SCHEMA_VERSION = "atr-evidence-1";
export const REPORT_SCHEMA_VERSION = "atr-1";
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export const DIMENSIONS = [
  { key: "instruction_convergence", name: "Instruction convergence", weight: 18 },
  { key: "task_workspace_isolation", name: "Task and workspace isolation", weight: 18 },
  { key: "ownership_boundaries", name: "Code and domain ownership", weight: 16 },
  { key: "shared_decision_context", name: "Shared decisions and context", weight: 16 },
  { key: "repeatable_verification", name: "Repeatable verification", weight: 20 },
  { key: "handoff_definition", name: "Handoff and definition of done", weight: 12 }
];

export const DEFAULT_MAX_FILES = 25_000;
export const MAX_TEXT_BYTES = 256 * 1024;

export const IGNORED_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "target",
  "Pods",
  ".venv",
  "venv",
  "__pycache__"
]);

export const ROOT_INSTRUCTION_PATHS = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md"
]);

export const LIMITATIONS = [
  "The conclusion is limited to repository-observable readiness.",
  "Actual concurrent workspace enforcement, organization permissions, team behavior, and private SaaS configuration remain unknown.",
  "Detected verification commands are not executed by the default read-only scan.",
  "Generated AGENTS.md and Context Tree materials are review drafts; the scanner never writes them into the target repository."
];
