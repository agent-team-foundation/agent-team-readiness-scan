import { DIMENSIONS, LIMITATIONS, REPORT_SCHEMA_VERSION } from "./constants.mjs";
import { commandEvidence, fileEvidence, missingEvidence } from "./files.mjs";

const UNKNOWN_BY_DIMENSION = {
  instruction_convergence: [
    "Whether every agent runtime actually loads the discovered instruction files is not observable from the repository."
  ],
  task_workspace_isolation: [
    "Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone."
  ],
  ownership_boundaries: [
    "Whether named owners are current, available, and required reviewers is not observable from static repository evidence."
  ],
  shared_decision_context: [
    "Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable."
  ],
  repeatable_verification: [
    "The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown."
  ],
  handoff_definition: [
    "The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown."
  ]
};

function clampScore(value) {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function statusFor(score) {
  if (score >= 8) return "strong";
  if (score >= 5) return "developing";
  return "constrained";
}

function blocker({ id, dimension, severity, title, evidence, why, fix, verify }) {
  return {
    id,
    dimension,
    severity,
    title,
    evidence,
    why_it_matters: why,
    minimum_fix: fix,
    first_verification_step: verify
  };
}

function evidenceStatus(evidence) {
  return evidence.repository.inventory_truncated || evidence.repository.skipped_file_count > 0 ? "partial" : "observed";
}

function dimensionRecord({ evidence, definition, score, rationale, strongest, blocker: mustFix, improvement }) {
  return {
    key: definition.key,
    name: definition.name,
    weight: definition.weight,
    score: clampScore(score),
    status: statusFor(clampScore(score)),
    evidence_status: evidenceStatus(evidence),
    rationale,
    strongest_evidence: strongest,
    must_fix_blocker: mustFix,
    minimum_improvement: improvement,
    unknowns: UNKNOWN_BY_DIMENSION[definition.key]
  };
}

function instructionDimension(evidence, definition) {
  const data = evidence.instructions;
  const nested = data.files.filter((file) => file.scope !== ".");
  let score = data.root_files.length > 0 ? 3 : data.files.length > 0 ? 1 : 0;
  if (data.root_command_count > 0) score += 2;
  if (data.root_boundary_count > 0) score += 2;
  if (data.root_required_reading_count > 0) score += 1;
  if (nested.length > 0) score += 1;
  if (data.root_files.length > 0 && data.root_command_count > 0 && data.root_boundary_count > 0 && data.conflicts.length === 0) score += 1;
  score -= Math.min(4, data.conflicts.length * 2);

  const strongest = data.root_files.length > 0
    ? data.root_files.slice(0, 3).map((file) => fileEvidence(file, "Root-scoped agent instruction source", 1))
    : data.hollow_root_files.length > 0
      ? data.hollow_root_files.slice(0, 3).map((file) => fileEvidence(file, "Root instruction path has no substantive policy content", 1))
      : [missingEvidence("AGENTS.md|CLAUDE.md|.cursor/rules/|.github/copilot-instructions.md", "No root-scoped agent instruction source was found")];
  if (data.conflicts.length > 0) {
    const conflict = data.conflicts[0];
    strongest.unshift(
      fileEvidence(
        conflict.sources[0].path,
        `Conflicting root ${conflict.action} commands: ${conflict.sources.flatMap((source) => source.commands).join(" vs ")}`
      )
    );
  }

  let mustFix = null;
  let improvement = "Keep one canonical root instruction source and use scoped files only for real local overrides.";
  if (data.root_files.length === 0) {
    mustFix = blocker({
      id: "instructions-no-root-contract",
      dimension: definition.key,
      severity: "critical",
      title: "No root agent instruction contract",
      evidence: strongest,
      why: "Agents can select different setup, verification, and edit rules before they even choose a task boundary.",
      fix: "Add one root AGENTS.md with canonical setup, verification commands, repository map, and edit boundaries.",
      verify: "Run the scanner again and confirm AGENTS.md is the root instruction source with commands and boundaries."
    });
    improvement = mustFix.minimum_fix;
  } else if (data.conflicts.length > 0) {
    mustFix = blocker({
      id: "instructions-conflicting-root-rules",
      dimension: definition.key,
      severity: "high",
      title: "Root instruction files disagree",
      evidence: strongest.slice(0, 3),
      why: "Parallel agents may run different checks or follow different completion rules on the same change.",
      fix: "Choose one canonical command per action and make other root instruction files link to or exactly mirror it.",
      verify: `Compare the root instruction sources for ${data.conflicts.map((item) => item.action).join(", ")} and confirm one command per action.`
    });
    improvement = mustFix.minimum_fix;
  } else if (data.root_command_count === 0 || data.root_boundary_count === 0) {
    mustFix = blocker({
      id: "instructions-not-actionable",
      dimension: definition.key,
      severity: "medium",
      title: "Instructions do not close the execution loop",
      evidence: strongest,
      why: "An agent can read the file but still cannot tell how to verify or where not to edit.",
      fix: "Add the real test/check commands and explicit generated, ownership, and do-not-edit boundaries.",
      verify: "Read the root instruction file and confirm it names at least one runnable verification command and one edit boundary."
    });
    improvement = mustFix.minimum_fix;
  }

  return dimensionRecord({
    evidence,
    definition,
    score,
    rationale: `${data.root_files.length} root and ${nested.length} scoped instruction sources; root has ${data.root_command_count} commands and ${data.root_boundary_count} boundary signals; ${data.conflicts.length} detected root conflicts.`,
    strongest: strongest.slice(0, 4),
    blocker: mustFix,
    improvement
  });
}

function workspaceDimension(evidence, definition) {
  const data = evidence.workspace;
  const instructionBoundaries = evidence.instructions.boundary_count;
  const strongPolicies = data.policies.filter((policy) => policy.strength === "strong");
  const branchOnlyPolicies = data.policies.filter((policy) => policy.strength !== "strong");
  const rootInstructionPaths = new Set(evidence.instructions.files.filter((file) => file.scope === ".").map((file) => file.path));
  const rootStrongPolicies = strongPolicies.filter((policy) => rootInstructionPaths.has(policy.path));
  let score = 0;
  if (rootStrongPolicies.length > 0) score += 3;
  else if (strongPolicies.length > 0 || branchOnlyPolicies.length > 0) score += 1;
  if (data.workspace_manifests.length > 0) score += 2;
  if (data.environment_isolation.length > 0) score += 2;
  if (instructionBoundaries > 0) score += 2;
  if (data.generated_paths.length > 0) score += 1;
  if (data.unsafe_policies.length > 0) score = Math.min(score, 2);

  const strongest = [];
  if (data.unsafe_policies[0]) strongest.push(fileEvidence(data.unsafe_policies[0].path, data.unsafe_policies[0].detail, data.unsafe_policies[0].line));
  if (data.policies[0]) strongest.push(fileEvidence(data.policies[0].path, data.policies[0].detail, data.policies[0].line));
  if (data.workspace_manifests[0]) strongest.push(fileEvidence(data.workspace_manifests[0], "Repository workspace boundary manifest", 1));
  if (data.environment_isolation[0]) strongest.push(fileEvidence(data.environment_isolation[0], "Repository-local environment isolation surface", 1));
  if (strongest.length === 0) strongest.push(missingEvidence("AGENTS.md|CONTRIBUTING.md|.devcontainer/|docker-compose.yml", "No repo-level task/workspace isolation contract was found"));

  const mustFix = data.unsafe_policies.length > 0
    ? blocker({
        id: "workspace-unsafe-shared-state-policy",
        dimension: definition.key,
        severity: "critical",
        title: "Repository policy requires agents to share mutable work",
        evidence: strongest.slice(0, 3),
        why: "Parallel agents following this policy can overwrite each other's branch, index, generated output, ports, credentials, or temporary state.",
        fix: "Replace the shared-work policy with one task per isolated branch/worktree and explicit task-local state boundaries.",
        verify: "Read every isolation-policy line and confirm none requires parallel agents to edit the same branch, workspace, or worktree."
      })
    : data.policies.length === 0
      ? blocker({
        id: "workspace-no-parallel-task-contract",
        dimension: definition.key,
        severity: score <= 2 ? "high" : "medium",
        title: "No observable parallel-task isolation contract",
        evidence: [missingEvidence("AGENTS.md|CONTRIBUTING.md", "No worktree, branch, or separate-workspace policy was found")],
        why: "Multiple agents can collide on a branch, build output, ports, generated state, or credentials without a shared repo-level rule.",
        fix: "Document one-task-per-branch/worktree rules plus the repository-local state and generated outputs that must not be shared.",
        verify: "Search the adopted instruction or contribution guide for worktree/branch isolation and shared-state boundaries."
        })
      : null;

  return dimensionRecord({
    evidence,
    definition,
    score,
    rationale: `${rootStrongPolicies.length} root-strong, ${strongPolicies.length - rootStrongPolicies.length} scoped-strong, ${branchOnlyPolicies.length} branch-only, and ${data.unsafe_policies.length} unsafe isolation policy signals; ${data.workspace_manifests.length} workspace manifests and ${data.environment_isolation.length} environment-isolation files.`,
    strongest,
    blocker: mustFix,
    improvement: mustFix?.minimum_fix ?? "Add explicit port, credential, cache, and generated-output boundaries to the existing branch/worktree policy."
  });
}

function ownershipDimension(evidence, definition) {
  const data = evidence.ownership;
  const actionableCodeowners = data.codeowners.filter((file) => file.rule_count > 0);
  const codeownerRules = actionableCodeowners.reduce((sum, file) => sum + file.rule_count, 0);
  let score = 0;
  if (actionableCodeowners.length > 0) score += 4;
  if (codeownerRules >= 3) score += 1;
  if (data.ownership_docs.length > 0) score += 2;
  if (data.generated_boundaries.length > 0) score += 1;
  if (data.security_guidance.length > 0) score += 1;
  if (data.explicit_boundaries.length > 0) score += 1;

  const strongest = [];
  if (actionableCodeowners[0]) strongest.push(fileEvidence(actionableCodeowners[0].path, `${actionableCodeowners[0].rule_count} ownership rules`, 1));
  if (data.ownership_docs[0]) strongest.push(fileEvidence(data.ownership_docs[0], "Repository ownership or governance map", 1));
  if (data.explicit_boundaries[0]) strongest.push(fileEvidence(data.explicit_boundaries[0].path, data.explicit_boundaries[0].detail, data.explicit_boundaries[0].line));
  if (strongest.length === 0) strongest.push(missingEvidence(".github/CODEOWNERS|CODEOWNERS|MAINTAINERS.md|OWNERSHIP.md", "No ownership map or explicit code boundary was found"));

  const mustFix = actionableCodeowners.length === 0 && data.ownership_docs.length === 0
    ? blocker({
        id: "ownership-no-review-map",
        dimension: definition.key,
        severity: "high",
        title: "No code or domain ownership map",
        evidence: strongest,
        why: "Agents cannot route a risky change or know which boundary requires human review.",
        fix: "Add CODEOWNERS or a maintained ownership map covering high-risk and generated areas; keep lightweight paths lightweight.",
        verify: "Check that representative high-risk paths resolve to an owner or review scope."
      })
    : null;

  return dimensionRecord({
    evidence,
    definition,
    score,
    rationale: `${actionableCodeowners.length} actionable CODEOWNERS/OWNERS files with ${codeownerRules} rules, ${data.ownership_docs.length} ownership docs, and ${data.explicit_boundaries.length} instruction boundaries.`,
    strongest,
    blocker: mustFix,
    improvement: mustFix?.minimum_fix ?? "Cover any unmapped high-risk, generated, migration, and release paths without imposing blanket per-file gating."
  });
}

function contextDimension(evidence, definition) {
  const data = evidence.context;
  let score = 0;
  if (data.architecture_docs.length > 0) score += 4;
  if (data.decision_docs.length > 0) score += 3;
  if (data.root_map) score += 1;
  if (data.module_docs.length > 0) score += 1;
  if (data.context_tree_reference || data.context_tree_binding_file) score += 2;

  const strongest = [];
  if (data.architecture_docs[0]) strongest.push(fileEvidence(data.architecture_docs[0], "Architecture or design context", 1));
  if (data.decision_docs[0]) strongest.push(fileEvidence(data.decision_docs[0], "Durable decision record", 1));
  if (data.root_map) strongest.push(fileEvidence(data.root_map.path, data.root_map.detail, data.root_map.line));
  if (strongest.length === 0) strongest.push(missingEvidence("docs/architecture.md|docs/adr/|docs/decisions/|README.md", "No architecture map or durable decision record was found"));

  const mustFix = data.architecture_docs.length === 0 && data.decision_docs.length === 0
    ? blocker({
        id: "context-no-shared-decision-surface",
        dimension: definition.key,
        severity: "high",
        title: "No shared architecture or decision surface",
        evidence: strongest,
        why: "Parallel agents can each make a locally reasonable change that violates a cross-domain decision nobody can discover.",
        fix: "Add a concise architecture map and one durable decision location with current what/why constraints, not implementation dumps.",
        verify: "Ask a new contributor to locate the module map and a current cross-domain decision from the repository root."
      })
    : null;

  return dimensionRecord({
    evidence,
    definition,
    score,
    rationale: `${data.architecture_docs.length} architecture docs, ${data.decision_docs.length} decision records, ${data.module_docs.length} module docs, and ${data.context_tree_reference || data.context_tree_binding_file ? 1 : 0} Context Tree signals.`,
    strongest,
    blocker: mustFix,
    improvement: mustFix?.minimum_fix ?? "Link the root module map to current decisions and retire stale implementation walkthroughs from the decision surface."
  });
}

function verificationDimension(evidence, definition) {
  const data = evidence.verification;
  const actions = new Set(data.commands.map((command) => command.action));
  let score = 0;
  if (actions.has("test")) score += 2;
  if (actions.has("lint") || actions.has("typecheck")) score += 1;
  if (actions.has("build")) score += 1;
  if (data.ci_files.length > 0) score += 2;
  if (data.lockfiles.length > 0) score += 1;
  if (data.test_files.length > 0) score += 1;
  if (data.setup_docs.length > 0) score += 1;
  if (data.environment_files.length > 0) score += 1;
  if (!actions.has("test")) score = Math.min(score, 4);
  else if (data.ci_files.length === 0) score = Math.min(score, 7);

  const strongest = [];
  for (const command of data.commands.slice(0, 3)) {
    strongest.push(commandEvidence(command.command, command.detail, command.path, command.line));
  }
  if (data.ci_files[0]) strongest.push(fileEvidence(data.ci_files[0], "Continuous integration configuration", 1));
  if (strongest.length === 0) strongest.push(missingEvidence("package.json|Makefile|pyproject.toml|Cargo.toml|go.mod|.github/workflows/", "No declared verification command or CI gate was found"));

  const mustFix = !actions.has("test")
    ? blocker({
        id: "verification-no-test-command",
        dimension: definition.key,
        severity: "critical",
        title: "No discoverable test command",
        evidence: strongest,
        why: "Agents cannot establish a repeatable red/green loop or prove that their changes preserve behavior.",
        fix: "Expose one canonical test command at the repository root and run it in CI; document prerequisites next to it.",
        verify: "Run the documented root test command in a clean checkout and confirm CI invokes the same path."
      })
    : data.ci_files.length === 0
      ? blocker({
          id: "verification-no-ci-gate",
          dimension: definition.key,
          severity: "medium",
          title: "Verification is not enforced in repository CI",
          evidence: [missingEvidence(".github/workflows/|.gitlab-ci.yml|.circleci/config.yml", "No CI configuration was found")],
          why: "Two agents can each report local success while incompatible changes merge without one shared gate.",
          fix: "Run the canonical test and check commands in a required CI workflow.",
          verify: "Open a pull request and confirm the canonical checks run from a clean environment."
        })
      : null;

  return dimensionRecord({
    evidence,
    definition,
    score,
    rationale: `${data.commands.length} canonical command candidates across ${actions.size} action types, ${data.ci_files.length} CI files, ${data.test_files.length} test files, and ${data.lockfiles.length} lockfiles.`,
    strongest,
    blocker: mustFix,
    improvement: mustFix?.minimum_fix ?? "Document a clean-checkout verification sequence and keep local commands identical to required CI gates."
  });
}

function handoffDimension(evidence, definition) {
  const data = evidence.handoff;
  let score = 0;
  if (data.issue_templates.length > 0) score += 3;
  if (data.pull_request_templates.length > 0) score += 3;
  if (data.acceptance_signals.length > 0) score += 2;
  if (data.testing_signals.length > 0) score += 1;
  if (data.contribution_docs.length > 0) score += 1;

  const strongest = [];
  if (data.issue_templates[0]) strongest.push(fileEvidence(data.issue_templates[0], "Issue handoff template", 1));
  if (data.pull_request_templates[0]) strongest.push(fileEvidence(data.pull_request_templates[0], "Pull request completion template", 1));
  if (data.acceptance_signals[0]) strongest.push(fileEvidence(data.acceptance_signals[0].path, data.acceptance_signals[0].detail, data.acceptance_signals[0].line));
  if (strongest.length === 0) strongest.push(missingEvidence(".github/ISSUE_TEMPLATE/|.github/PULL_REQUEST_TEMPLATE.md|CONTRIBUTING.md", "No structured task handoff or completion template was found"));

  const mustFix = data.issue_templates.length === 0 || data.pull_request_templates.length === 0
    ? blocker({
        id: "handoff-incomplete-task-contract",
        dimension: definition.key,
        severity: "medium",
        title: "Task handoff or completion contract is missing",
        evidence: strongest,
        why: "An agent may start without acceptance criteria or finish without reporting verification, risk, and remaining unknowns.",
        fix: "Add issue and pull request templates with scope, acceptance criteria, verification evidence, risk, and completion/remaining-work fields.",
        verify: "Create a sample issue and pull request; confirm both can be handed to another agent without oral context."
      })
    : null;

  return dimensionRecord({
    evidence,
    definition,
    score,
    rationale: `${data.issue_templates.length} issue templates, ${data.pull_request_templates.length} pull request templates, ${data.acceptance_signals.length} acceptance signals, and ${data.testing_signals.length} verification signals.`,
    strongest,
    blocker: mustFix,
    improvement: mustFix?.minimum_fix ?? "Keep handoff templates short but require acceptance criteria, verification evidence, risk, and unresolved unknowns."
  });
}

function priority(blockerRecord, dimensions) {
  const severity = { critical: 3, high: 2, medium: 1 }[blockerRecord.severity];
  const dimension = dimensions.find((entry) => entry.key === blockerRecord.dimension);
  return severity * 1000 + dimension.weight * (10 - dimension.score);
}

export function buildReport(evidence, artifactPaths, generatedAt = new Date().toISOString()) {
  const byKey = Object.fromEntries(DIMENSIONS.map((definition) => [definition.key, definition]));
  const dimensions = [
    instructionDimension(evidence, byKey.instruction_convergence),
    workspaceDimension(evidence, byKey.task_workspace_isolation),
    ownershipDimension(evidence, byKey.ownership_boundaries),
    contextDimension(evidence, byKey.shared_decision_context),
    verificationDimension(evidence, byKey.repeatable_verification),
    handoffDimension(evidence, byKey.handoff_definition)
  ];
  const coverage = evidence.repository.file_count === 0
    ? 0
    : Math.min(100, Math.floor((evidence.repository.analyzed_file_count / evidence.repository.file_count) * 100));
  const weighted = Math.round(dimensions.reduce((sum, dimension) => sum + (dimension.score / 10) * dimension.weight, 0));
  const topFixes = dimensions
    .map((dimension) => dimension.must_fix_blocker)
    .filter(Boolean)
    .sort((a, b) => priority(b, dimensions) - priority(a, dimensions))
    .slice(0, 3);
  const strongest = dimensions.filter((dimension) => dimension.status === "strong").map((dimension) => dimension.name);
  const constrained = dimensions.filter((dimension) => dimension.status === "constrained").map((dimension) => dimension.name);
  const summary = `Repo-level score ${coverage >= 60 ? weighted : "withheld"}/100 at ${coverage}% evidence coverage. Strong: ${strongest.join(", ") || "none"}. Constrained: ${constrained.join(", ") || "none"}. ${topFixes.length} prioritized readiness fixes.`;

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    wedge: "agent-team-readiness",
    generated_at: generatedAt,
    repository: {
      source: evidence.repository.source,
      name: evidence.repository.name,
      revision: evidence.repository.revision,
      worktree_state: evidence.repository.worktree_state,
      file_count: evidence.repository.file_count,
      analyzed_file_count: evidence.repository.analyzed_file_count,
      skipped_file_count: evidence.repository.skipped_file_count,
      inventory_truncated: evidence.repository.inventory_truncated
    },
    scope: {
      claim: "repo-level readiness",
      observable_only: true,
      evidence_coverage: coverage,
      limitations: LIMITATIONS
    },
    headline_score: coverage >= 60 ? weighted : null,
    dimensions,
    top_3_fixes: topFixes,
    artifacts: artifactPaths,
    summary
  };
}
