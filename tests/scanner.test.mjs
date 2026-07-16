import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runScan } from "../.claude/skills/agent-team-readiness/scripts/scan.mjs";
import { boundedEvidenceText, readRepositoryText } from "../.claude/skills/agent-team-readiness/scripts/lib/files.mjs";
import { validateReport } from "../.claude/skills/agent-team-readiness/scripts/lib/validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_TIME = "2026-07-16T00:00:00.000Z";

function dimension(report, key) {
  return report.dimensions.find((entry) => entry.key === key);
}

function collectNamedStrings(value, name, results = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedStrings(item, name, results);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === name && typeof item === "string") results.push(item);
      collectNamedStrings(item, name, results);
    }
  }
  return results;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function scanFixture(name) {
  const output = await mkdtemp(path.join(os.tmpdir(), `atr-${name}-`));
  const input = path.join(ROOT, "fixtures", name);
  const result = await runScan({ input, output, generatedAt: FIXED_TIME });
  return { ...result, input, cleanup: async () => rm(output, { recursive: true, force: true }) };
}

async function scanIsolationPolicy(sentence) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-isolation-policy-"));
  const input = path.join(sandbox, "target");
  const output = path.join(sandbox, "output");
  await mkdir(path.join(input, ".devcontainer"), { recursive: true });
  await mkdir(path.join(input, "generated"), { recursive: true });
  await writeFile(path.join(input, "AGENTS.md"), `# Rules\n\nnpm test\n\nNever edit generated files.\n\n${sentence}\n`);
  await writeFile(path.join(input, "package.json"), '{"scripts":{"test":"node --test"}}\n');
  await writeFile(path.join(input, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  await writeFile(path.join(input, ".devcontainer", "devcontainer.json"), '{"image":"node:22"}\n');
  await writeFile(path.join(input, "generated", "x.generated.js"), "export {};\n");
  const result = await runScan({ input, output, generatedAt: FIXED_TIME });
  return { ...result, cleanup: async () => rm(sandbox, { recursive: true, force: true }) };
}

test("emits a valid atr-1 report and all four artifacts", async () => {
  const result = await scanFixture("monorepo-scoped-instructions");
  try {
    assert.equal(validateReport(result.report), result.report);
    assert.equal(result.report.schema_version, "atr-1");
    assert.equal(result.report.dimensions.length, 6);
    assert.equal(result.report.scope.claim, "repo-level readiness");
    for (const file of ["atr-1.json", "evidence.json", "AGENTS.draft.md", "context-tree-seed-map.md"]) {
      await access(path.join(result.output, file));
    }
  } finally {
    await result.cleanup();
  }
});

test("no root instructions is a critical instruction blocker", async () => {
  const result = await scanFixture("no-instructions");
  try {
    const instructions = dimension(result.report, "instruction_convergence");
    assert.equal(instructions.score, 0);
    assert.equal(instructions.must_fix_blocker.severity, "critical");
    assert.equal(instructions.strongest_evidence[0].kind, "missing");
  } finally {
    await result.cleanup();
  }
});

test("conflicting root instructions reduce convergence instead of earning a file-count bonus", async () => {
  const result = await scanFixture("conflicting-instructions");
  try {
    assert.equal(result.evidence.instructions.root_files.length, 2);
    assert.equal(result.evidence.instructions.conflicts.length, 1);
    const instructions = dimension(result.report, "instruction_convergence");
    assert.ok(instructions.score < 8);
    assert.equal(instructions.must_fix_blocker.id, "instructions-conflicting-root-rules");
  } finally {
    await result.cleanup();
  }
});

test("scoped monorepo instructions are recognized without a root conflict", async () => {
  const result = await scanFixture("monorepo-scoped-instructions");
  try {
    assert.equal(result.evidence.instructions.conflicts.length, 0);
    assert.ok(result.evidence.instructions.files.some((file) => file.scope === "packages/api"));
    assert.equal(dimension(result.report, "instruction_convergence").score, 10);
  } finally {
    await result.cleanup();
  }
});

test("nested actionability cannot turn a hollow root instruction file strong", async () => {
  const result = await scanFixture("hollow-root-scoped");
  try {
    const instructions = dimension(result.report, "instruction_convergence");
    assert.ok(instructions.score <= 2);
    assert.equal(instructions.must_fix_blocker.id, "instructions-no-root-contract");
    assert.deepEqual(result.evidence.instructions.hollow_files, ["AGENTS.md"]);
    assert.equal(result.evidence.instructions.root_command_count, 0);
    assert.ok(result.evidence.instructions.command_count > 0);
  } finally {
    await result.cleanup();
  }
});

test("unsafe same-branch policy constrains isolation and emits a critical blocker", async () => {
  const result = await scanFixture("unsafe-isolation");
  try {
    const isolation = dimension(result.report, "task_workspace_isolation");
    assert.ok(isolation.score <= 2);
    assert.equal(isolation.must_fix_blocker.id, "workspace-unsafe-shared-state-policy");
    assert.equal(isolation.must_fix_blocker.severity, "critical");
    assert.equal(result.evidence.workspace.unsafe_policies.length, 1);
  } finally {
    await result.cleanup();
  }
});

test("shared-branch requirements for parallel agents are unsafe isolation policies", async () => {
  const result = await scanFixture("unsafe-shared-branch");
  try {
    const isolation = dimension(result.report, "task_workspace_isolation");
    assert.ok(isolation.score <= 2);
    assert.equal(isolation.must_fix_blocker.id, "workspace-unsafe-shared-state-policy");
    assert.equal(isolation.must_fix_blocker.severity, "critical");
    assert.equal(result.evidence.workspace.unsafe_policies.length, 1);
    const draft = await readFile(path.join(result.output, "AGENTS.draft.md"), "utf8");
    assert.doesNotMatch(draft, /Follow the isolation policy at `AGENTS\.md:/);
    assert.doesNotMatch(draft, /must use the shared branch/i);
  } finally {
    await result.cleanup();
  }
});

test("equivalent shared-state wording remains unsafe without flagging per-task isolation", async () => {
  const unsafeSentences = [
    "Parallel agent tasks must use the common branch.",
    "Parallel agent tasks must use the main branch.",
    "Parallel agents must use the shared branch.",
    "Never use one branch per task; parallel agent work stays on main.",
    "Agents share a single checkout.",
    "All agents commit directly to main."
  ];
  for (const sentence of unsafeSentences) {
    const result = await scanIsolationPolicy(sentence);
    try {
      const isolation = dimension(result.report, "task_workspace_isolation");
      assert.ok(isolation.score <= 2, sentence);
      assert.equal(isolation.must_fix_blocker.id, "workspace-unsafe-shared-state-policy", sentence);
      assert.equal(isolation.must_fix_blocker.severity, "critical", sentence);
      assert.ok(result.evidence.workspace.unsafe_policies.length > 0, sentence);
      const draft = await readFile(path.join(result.output, "AGENTS.draft.md"), "utf8");
      assert.doesNotMatch(draft, /Follow the isolation policy at `AGENTS\.md:/, sentence);
    } finally {
      await result.cleanup();
    }
  }

  for (const sentence of [
    "Use one branch per task for parallel agent work.",
    "Parallel agents must not use the same branch.",
    "Never allow agents to commit directly to main; use a separate branch per task."
  ]) {
    const result = await scanIsolationPolicy(sentence);
    try {
      assert.equal(result.evidence.workspace.unsafe_policies.length, 0, sentence);
      assert.ok(result.evidence.workspace.policies.length > 0, sentence);
      assert.notEqual(dimension(result.report, "task_workspace_isolation").must_fix_blocker?.id, "workspace-unsafe-shared-state-policy", sentence);
    } finally {
      await result.cleanup();
    }
  }
});

test("unqualified bans on isolation mechanisms are unsafe policies", async () => {
  for (const sentence of [
    "Do not use git worktrees.",
    "Never use worktrees for tasks.",
    "Avoid separate branches for agent work."
  ]) {
    const result = await scanIsolationPolicy(sentence);
    try {
      const isolation = dimension(result.report, "task_workspace_isolation");
      assert.ok(isolation.score <= 2, sentence);
      assert.equal(isolation.must_fix_blocker.id, "workspace-unsafe-shared-state-policy", sentence);
      assert.ok(result.evidence.workspace.unsafe_policies.length > 0, sentence);
      const draft = await readFile(path.join(result.output, "AGENTS.draft.md"), "utf8");
      assert.doesNotMatch(draft, /Follow the isolation policy at `AGENTS\.md:/, sentence);
    } finally {
      await result.cleanup();
    }
  }

  for (const sentence of [
    "Do not share worktrees between tasks.",
    "Never reuse another task's worktree.",
    "Do not create worktrees inside the repository root."
  ]) {
    const result = await scanIsolationPolicy(sentence);
    try {
      assert.equal(result.evidence.workspace.unsafe_policies.length, 0, sentence);
      assert.notEqual(dimension(result.report, "task_workspace_isolation").must_fix_blocker?.id, "workspace-unsafe-shared-state-policy", sentence);
    } finally {
      await result.cleanup();
    }
  }
});

test("descriptive isolation keywords without a directive earn no policy evidence", async () => {
  for (const sentence of ["Git worktrees are neat.", "This repo predates worktrees."]) {
    const result = await scanIsolationPolicy(sentence);
    try {
      assert.equal(result.evidence.workspace.policies.length, 0, sentence);
      assert.equal(result.evidence.workspace.unsafe_policies.length, 0, sentence);
      const draft = await readFile(path.join(result.output, "AGENTS.draft.md"), "utf8");
      assert.doesNotMatch(draft, /Follow the isolation policy at `AGENTS\.md:/, sentence);
    } finally {
      await result.cleanup();
    }
  }
});

test("missing verification produces a critical command blocker", async () => {
  const result = await scanFixture("missing-verification");
  try {
    const verification = dimension(result.report, "repeatable_verification");
    assert.equal(verification.score, 1);
    assert.equal(verification.must_fix_blocker.id, "verification-no-test-command");
    assert.equal(verification.must_fix_blocker.severity, "critical");
  } finally {
    await result.cleanup();
  }
});

test("hollow manifests and workflows do not suppress the verification blocker", async () => {
  const result = await scanFixture("hollow-verification");
  try {
    const verification = dimension(result.report, "repeatable_verification");
    assert.equal(result.evidence.verification.commands.length, 0);
    assert.equal(result.evidence.verification.ci_files.length, 0);
    assert.ok(verification.score <= 4);
    assert.equal(verification.status, "constrained");
    assert.equal(verification.must_fix_blocker.id, "verification-no-test-command");
  } finally {
    await result.cleanup();
  }
});

test("no-op package scripts and an empty CI workflow do not count as verification", async () => {
  const result = await scanFixture("noop-verification");
  try {
    const verification = dimension(result.report, "repeatable_verification");
    assert.equal(result.evidence.verification.commands.length, 0);
    assert.equal(result.evidence.verification.ci_files.length, 0);
    assert.ok(verification.score <= 4);
    assert.equal(verification.status, "constrained");
    assert.equal(verification.must_fix_blocker.id, "verification-no-test-command");
  } finally {
    await result.cleanup();
  }
});

test("empty Make targets and a run-true workflow do not count as verification", async () => {
  const result = await scanFixture("hollow-make-ci");
  try {
    const verification = dimension(result.report, "repeatable_verification");
    assert.equal(result.evidence.verification.commands.length, 0);
    assert.equal(result.evidence.verification.ci_files.length, 0);
    assert.equal(verification.score, 4);
    assert.equal(verification.status, "constrained");
    assert.equal(verification.must_fix_blocker.id, "verification-no-test-command");
    assert.equal(verification.must_fix_blocker.severity, "critical");
  } finally {
    await result.cleanup();
  }
});

test("substantive Make recipes, prerequisites, and CI shell blocks remain discoverable", async () => {
  const result = await scanFixture("substantive-make-ci");
  try {
    assert.deepEqual(
      result.evidence.verification.commands.map((entry) => entry.command),
      ["make test", "make check", "make build"]
    );
    assert.deepEqual(result.evidence.verification.ci_files, [".github/workflows/ci.yml"]);
    assert.equal(dimension(result.report, "repeatable_verification").must_fix_blocker, null);
  } finally {
    await result.cleanup();
  }
});

test("a shell pipeline with a substantive assertion is not reduced to its echo stage", async () => {
  const result = await scanFixture("pipeline-verification");
  try {
    assert.deepEqual(result.evidence.verification.commands.map((entry) => entry.command), ["npm run test"]);
    assert.deepEqual(result.evidence.verification.ci_files, [".github/workflows/ci.yml"]);
    assert.equal(dimension(result.report, "repeatable_verification").must_fix_blocker, null);
  } finally {
    await result.cleanup();
  }
});

test("uses-only automation workflows are not verification CI gates", async () => {
  const result = await scanFixture("uses-only-ci");
  try {
    assert.deepEqual(result.evidence.verification.commands.map((entry) => entry.command), ["npm run test"]);
    assert.deepEqual(result.evidence.verification.ci_files, []);
    const verification = dimension(result.report, "repeatable_verification");
    assert.ok(verification.score <= 7);
    assert.equal(verification.must_fix_blocker.id, "verification-no-ci-gate");
    assert.equal(verification.must_fix_blocker.severity, "medium");
  } finally {
    await result.cleanup();
  }
});

test("make variable assignments are not runnable verification targets", async () => {
  const result = await scanFixture("make-assignment-verification");
  try {
    assert.deepEqual(result.evidence.verification.commands, []);
    const verification = dimension(result.report, "repeatable_verification");
    assert.equal(verification.must_fix_blocker.id, "verification-no-test-command");
    assert.equal(verification.must_fix_blocker.severity, "critical");
  } finally {
    await result.cleanup();
  }
});

test("prose sentences starting with tool names are not commands and cannot fabricate conflicts", async () => {
  const result = await scanFixture("prose-instructions");
  try {
    assert.equal(result.evidence.instructions.conflicts.length, 0);
    assert.equal(result.evidence.instructions.root_files.length, 2);
    assert.equal(result.evidence.instructions.root_command_count, 1);
    const claude = result.evidence.instructions.files.find((file) => file.path === "CLAUDE.md");
    assert.deepEqual(claude.commands, []);
    const instructions = dimension(result.report, "instruction_convergence");
    assert.notEqual(instructions.must_fix_blocker?.id, "instructions-conflicting-root-rules");
  } finally {
    await result.cleanup();
  }
});

test("prose-only root instructions stay non-actionable instead of scoring strong", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-prose-only-"));
  const input = path.join(sandbox, "target");
  const output = path.join(sandbox, "output");
  try {
    await mkdir(input, { recursive: true });
    await writeFile(
      path.join(input, "AGENTS.md"),
      "# Rules\n\nGo through the onboarding documentation before starting.\n\nMake sure you understand the module layout first.\n"
    );
    await writeFile(path.join(input, "package.json"), '{"scripts":{"test":"node --test"}}\n');
    const result = await runScan({ input, output, generatedAt: FIXED_TIME });
    assert.equal(result.evidence.instructions.root_command_count, 0);
    const instructions = dimension(result.report, "instruction_convergence");
    assert.equal(instructions.must_fix_blocker.id, "instructions-not-actionable");
    assert.notEqual(instructions.status, "strong");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("clear ownership and missing ownership remain distinguishable", async () => {
  const clear = await scanFixture("ownership-clear");
  const missing = await scanFixture("ownership-missing");
  try {
    assert.equal(dimension(clear.report, "ownership_boundaries").score, 10);
    assert.equal(dimension(clear.report, "ownership_boundaries").must_fix_blocker, null);
    assert.ok(dimension(missing.report, "ownership_boundaries").score <= 2);
    assert.equal(dimension(missing.report, "ownership_boundaries").must_fix_blocker.id, "ownership-no-review-map");
  } finally {
    await clear.cleanup();
    await missing.cleanup();
  }
});

test("clear and missing handoff contracts remain distinguishable", async () => {
  const clear = await scanFixture("handoff-clear");
  const missing = await scanFixture("handoff-missing");
  try {
    assert.equal(dimension(clear.report, "handoff_definition").score, 10);
    assert.equal(dimension(clear.report, "handoff_definition").must_fix_blocker, null);
    assert.equal(dimension(missing.report, "handoff_definition").score, 0);
    assert.equal(dimension(missing.report, "handoff_definition").must_fix_blocker.id, "handoff-incomplete-task-contract");
  } finally {
    await clear.cleanup();
    await missing.cleanup();
  }
});

test("substantive comment-only pull request guidance counts as a template", async () => {
  const result = await scanFixture("comment-only-template");
  try {
    assert.deepEqual(result.evidence.handoff.pull_request_templates, [".github/PULL_REQUEST_TEMPLATE.md"]);
    assert.equal(dimension(result.report, "handoff_definition").must_fix_blocker, null);
  } finally {
    await result.cleanup();
  }
});

test("hollow ownership, context, and handoff surfaces do not earn presence credit", async () => {
  const result = await scanFixture("hollow-evidence");
  try {
    assert.equal(result.evidence.ownership.codeowners[0].rule_count, 0);
    assert.equal(result.evidence.ownership.ownership_docs.length, 0);
    assert.equal(result.evidence.context.architecture_docs.length, 0);
    assert.equal(result.evidence.context.decision_docs.length, 0);
    assert.equal(result.evidence.handoff.issue_templates.length, 0);
    assert.equal(result.evidence.handoff.pull_request_templates.length, 0);
    assert.equal(dimension(result.report, "ownership_boundaries").must_fix_blocker.id, "ownership-no-review-map");
    assert.equal(dimension(result.report, "shared_decision_context").must_fix_blocker.id, "context-no-shared-decision-surface");
    assert.equal(dimension(result.report, "handoff_definition").must_fix_blocker.id, "handoff-incomplete-task-contract");
  } finally {
    await result.cleanup();
  }
});

test("TODO-later placeholders do not earn ownership, context, or handoff credit", async () => {
  const result = await scanFixture("placeholder-evidence");
  try {
    assert.equal(result.evidence.ownership.ownership_docs.length, 0);
    assert.equal(result.evidence.context.architecture_docs.length, 0);
    assert.equal(result.evidence.context.decision_docs.length, 0);
    assert.equal(result.evidence.handoff.issue_templates.length, 0);
    assert.equal(result.evidence.handoff.pull_request_templates.length, 0);
    assert.equal(dimension(result.report, "ownership_boundaries").must_fix_blocker.id, "ownership-no-review-map");
    assert.equal(dimension(result.report, "shared_decision_context").must_fix_blocker.id, "context-no-shared-decision-surface");
    assert.equal(dimension(result.report, "handoff_definition").must_fix_blocker.id, "handoff-incomplete-task-contract");
  } finally {
    await result.cleanup();
  }
});

test("nested fixture and example content cannot shadow repository-level contracts", async () => {
  const result = await scanFixture("fixture-shadowing");
  try {
    assert.equal(result.evidence.instructions.files.length, 0);
    assert.equal(result.evidence.verification.commands.length, 0);
    assert.equal(result.evidence.ownership.codeowners.length, 0);
    assert.equal(result.evidence.handoff.issue_templates.length, 0);
    assert.equal(dimension(result.report, "instruction_convergence").must_fix_blocker.id, "instructions-no-root-contract");
    assert.equal(dimension(result.report, "repeatable_verification").must_fix_blocker.id, "verification-no-test-command");
  } finally {
    await result.cleanup();
  }
});

test("repository content and declared commands are never executed", async () => {
  const result = await scanFixture("untrusted-content");
  try {
    await assert.rejects(access(path.join(result.input, "scanner-executed")));
    await assert.rejects(access(path.join(result.input, "package-script-executed")));
    assert.notEqual(result.report.headline_score, 100);
    const serializedEvidence = JSON.stringify(result.evidence);
    assert.doesNotMatch(serializedEvidence, /ghp_fixturefake0redactiononly0token/);
    assert.doesNotMatch(serializedEvidence, /xoxb-fake-fixture-redaction-secret/);
    assert.doesNotMatch(serializedEvidence, /glpat-fixturefake0redaction0/);
    assert.doesNotMatch(JSON.stringify(result.report), /xoxb-fake-fixture-redaction-secret/);
    assert.doesNotMatch(JSON.stringify(result.report), /glpat-fixturefake0redaction0/);
    assert.match(serializedEvidence, /\[redacted-token\]/);
    assert.equal(boundedEvidenceText("api_key=ghp_fixturefake0redactiononly0token"), "api_key=[redacted]");
  } finally {
    await result.cleanup();
  }
});

test("long conflicting commands are bounded without aborting the scan", async () => {
  const result = await scanFixture("long-conflicting-instructions");
  try {
    const instructions = dimension(result.report, "instruction_convergence");
    assert.equal(result.evidence.instructions.conflicts.length, 1);
    assert.equal(instructions.must_fix_blocker.id, "instructions-conflicting-root-rules");
    const details = [
      ...collectNamedStrings(result.evidence, "detail"),
      ...collectNamedStrings(result.report, "detail")
    ];
    assert.ok(details.length > 0);
    assert.ok(details.every((detail) => detail.length <= 240));
  } finally {
    await result.cleanup();
  }
});

test("local Git fsmonitor configuration is never executed", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-fsmonitor-"));
  const input = path.join(sandbox, "target");
  const output = path.join(sandbox, "output");
  const hook = path.join(input, "fsmonitor.sh");
  const marker = path.join(input, "fsmonitor-executed");
  try {
    await mkdir(input, { recursive: true });
    git(input, ["init", "--quiet"]);
    await writeFile(path.join(input, "README.md"), "# target\n");
    git(input, ["add", "README.md"]);
    await writeFile(hook, "#!/bin/sh\n: > \"$(dirname \"$0\")/fsmonitor-executed\"\n");
    await chmod(hook, 0o755);
    git(input, ["config", "core.fsmonitor", hook]);
    await runScan({ input, output, generatedAt: FIXED_TIME });
    await assert.rejects(access(marker));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("symlinked and cached-deleted surfaces are skipped instead of earning evidence", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-phantom-"));
  const input = path.join(sandbox, "target");
  const output = path.join(sandbox, "output");
  try {
    await mkdir(path.join(input, ".github", "ISSUE_TEMPLATE"), { recursive: true });
    await mkdir(path.join(input, "docs"), { recursive: true });
    git(input, ["init", "--quiet"]);
    await writeFile(path.join(input, "README.md"), "# target\n");
    await writeFile(path.join(input, ".github", "PULL_REQUEST_TEMPLATE.md"), "## Verification\n");
    await symlink(path.join(input, "README.md"), path.join(input, ".github", "CODEOWNERS"));
    await symlink(path.join(input, "README.md"), path.join(input, "docs", "architecture.md"));
    await symlink(path.join(input, "README.md"), path.join(input, ".github", "ISSUE_TEMPLATE", "bug.md"));
    git(input, ["add", "-A"]);
    await unlink(path.join(input, ".github", "PULL_REQUEST_TEMPLATE.md"));

    const result = await runScan({ input, output, generatedAt: FIXED_TIME });
    assert.equal(result.evidence.ownership.codeowners.length, 0);
    assert.equal(result.evidence.context.architecture_docs.length, 0);
    assert.equal(result.evidence.handoff.issue_templates.length, 0);
    assert.equal(result.evidence.handoff.pull_request_templates.length, 0);
    assert.equal(result.report.repository.skipped_file_count, 4);
    assert.equal(result.report.scope.evidence_coverage, 20);
    assert.ok(result.report.dimensions.every((entry) => entry.evidence_status === "partial"));
    assert.equal(dimension(result.report, "ownership_boundaries").must_fix_blocker.id, "ownership-no-review-map");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("dirty local content is not mislabeled as the HEAD revision", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-dirty-"));
  const input = path.join(sandbox, "target");
  const output = path.join(sandbox, "output");
  try {
    await mkdir(input, { recursive: true });
    git(input, ["init", "--quiet"]);
    await writeFile(path.join(input, "README.md"), "# committed\n");
    git(input, ["add", "README.md"]);
    git(input, ["-c", "user.name=ATR Test", "-c", "user.email=atr@example.invalid", "commit", "--quiet", "-m", "fixture"]);
    assert.match(git(input, ["rev-parse", "HEAD"]), /^[0-9a-f]{40}$/);
    await writeFile(path.join(input, "AGENTS.md"), "# untracked instructions\n");

    const result = await runScan({ input, output, generatedAt: FIXED_TIME });
    assert.equal(result.report.repository.worktree_state, "dirty");
    assert.equal(result.report.repository.revision, null);
    const draft = await readFile(path.join(output, "AGENTS.draft.md"), "utf8");
    assert.match(draft, /dirty worktree; no commit identity/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("refuses output inside a local target repository", async () => {
  const input = path.join(ROOT, "fixtures", "no-instructions");
  await assert.rejects(
    runScan({ input, output: path.join(input, "agent-team-readiness-output"), generatedAt: FIXED_TIME }),
    /Output must be outside the scanned repository/
  );
});

test("rejects misleading local refs and remote Git option syntax", async () => {
  const input = path.join(ROOT, "fixtures", "no-instructions");
  await assert.rejects(
    runScan({ input, ref: "main", output: path.join(os.tmpdir(), "atr-local-ref"), generatedAt: FIXED_TIME }),
    /supported only for remote GitHub scans/
  );
  await assert.rejects(
    runScan({ input: "https://github.com/agent-team-foundation/first-tree", ref: "--upload-pack=bad", output: path.join(os.tmpdir(), "atr-remote-ref"), generatedAt: FIXED_TIME }),
    /without Git option\/refspec syntax/
  );
});

test("refuses an outside-looking output symlink that resolves inside the target", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-output-symlink-"));
  const input = path.join(sandbox, "target");
  const inside = path.join(input, "generated");
  const link = path.join(sandbox, "outside-looking-output");
  try {
    await mkdir(inside, { recursive: true });
    await writeFile(path.join(input, "README.md"), "# target\n");
    await symlink(inside, link, "dir");
    await assert.rejects(
      runScan({ input, output: link, generatedAt: FIXED_TIME }),
      /Output must be outside the scanned repository/
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("refuses pre-existing artifact symlinks instead of overwriting their targets", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "atr-artifact-symlink-"));
  const input = path.join(sandbox, "target");
  const output = path.join(sandbox, "output");
  const victim = path.join(input, "README.md");
  try {
    await mkdir(input, { recursive: true });
    await mkdir(output, { recursive: true });
    await writeFile(victim, "# keep me\n");
    await symlink(victim, path.join(output, "atr-1.json"));
    await assert.rejects(
      runScan({ input, output, generatedAt: FIXED_TIME }),
      /Refusing to overwrite existing artifact/
    );
    assert.equal(await readFile(victim, "utf8"), "# keep me\n");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("reads files when a temporary root resolves through an operating-system path alias", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atr-canonical-root-"));
  try {
    await writeFile(path.join(root, "README.md"), "# canonical root\n");
    assert.equal(await readRepositoryText(root, "README.md"), "# canonical root\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated drafts use detected commands and remain explicitly review-only", async () => {
  const result = await scanFixture("monorepo-scoped-instructions");
  try {
    const agents = await readFile(path.join(result.output, "AGENTS.draft.md"), "utf8");
    const seed = await readFile(path.join(result.output, "context-tree-seed-map.md"), "utf8");
    assert.match(agents, /pnpm test/);
    assert.match(agents, /review draft/i);
    assert.match(seed, /not a Context Tree write/i);
    assert.match(seed, /Human approval required/);
  } finally {
    await result.cleanup();
  }
});
