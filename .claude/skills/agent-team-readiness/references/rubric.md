# Six-dimension rubric

## Contents

1. Scope and anchors
2. Dimension rules
3. Blocker and unknown rules
4. Evidence integrity

## Scope and anchors

Score only repository-observable capability. Use integer scores from 0 to 10:

- `0–4 constrained`: absent or too weak to support safe parallel agent work
- `5–7 developing`: useful structure exists but important gaps remain
- `8–10 strong`: clear, converged, and actionable repo-level support

The weights total 100:

| Dimension | Weight |
| --- | ---: |
| Instruction convergence | 18 |
| Task and workspace isolation | 18 |
| Code and domain ownership | 16 |
| Shared decisions and context | 16 |
| Repeatable verification | 20 |
| Handoff and definition of done | 12 |

The headline is `round(sum(score / 10 * weight))`. Withhold it when evidence
coverage is below 60%.

Dimension raw sums may exceed 10 before clamping; every score is clamped to
0–10. Two hard caps apply inside repeatable verification: no discoverable test
command caps the score at 4, and a test command without any CI gate caps it
at 7. An unsafe shared-state policy caps task/workspace isolation at 2.

## Dimension rules

### Instruction convergence

Count one canonical root instruction surface, real setup/check commands, edit
boundaries, required-reading links, and genuinely scoped local overrides.
Never reward extra root files. When root files give disjoint commands for the
same action, record a conflict and subtract readiness.

Strong evidence: root `AGENTS.md`, `CLAUDE.md`, Cursor/Copilot rules, scoped
instruction files, cited commands, and explicit boundaries.

### Task and workspace isolation

Count observable branch/worktree policy, one-task boundaries, workspace/module
manifests, repository-local environment isolation, generated-output boundaries,
and explicit edit scope. Do not treat a monorepo manifest alone as proof that
parallel agents are isolated.

Interpret policy polarity. A rule telling parallel agents to share a mutable
branch, workspace, or worktree caps the dimension as constrained and is a
critical blocker; keywords such as “worktree” never earn credit by themselves.

Always keep actual worktree use, ports, credentials, caches, and runtime state
unknown unless separately observed.

### Code and domain ownership

Count `CODEOWNERS`/`OWNERS`, maintainership or governance maps, explicit
high-risk/edit boundaries, generated-file boundaries, and secrets guidance.
Prefer targeted review routing over blanket per-file bureaucracy.

Never infer that a listed owner is current, available, or required in practice.

### Shared decisions and context

Count a discoverable architecture/module map, durable decisions/ADRs, module
documentation, and a Context Tree reference or binding signal. Reward current
what/why constraints, not documentation volume or implementation walkthroughs.

Do not infer private shared memory or doc freshness from file presence.

### Repeatable verification

Count canonical test/check/build commands, tests, required CI, lockfiles, clean
setup documentation, and environment examples. A detected command is evidence
of a declared path, not evidence that it passes.

No discoverable test command is a critical blocker. A test command without a
shared CI gate is normally a medium blocker.

### Handoff and definition of done

Count issue templates, pull-request templates, acceptance criteria, verification
evidence prompts, contribution guidance, risk, and remaining-work fields.
Do not score real issue quality or review behavior without direct source
evidence outside this repo-only scan.

## Blocker and unknown rules

- Emit at most one must-fix blocker per dimension.
- Use `critical` only when agents cannot establish a safe basic loop, such as no
  root instruction contract or no discoverable test command.
- Use `high` for likely cross-agent divergence or misrouting.
- Use `medium` for incomplete enforcement or handoff structure.
- A healthy dimension has `must_fix_blocker: null`; do not manufacture one.
- Every dimension must retain its runtime/organization unknowns.

## Evidence integrity

Use bounded evidence only. Cite paths, line numbers where collected, explicitly
missing path sets, or commands. Do not copy secrets, full files, or executable
repository content into reports. Treat symlinks as unreadable so a target
cannot point the scanner outside its root. Cached-but-deleted, unreadable,
non-regular, and hollow files do not earn path-presence credit. Repository Git
configuration must not be allowed to execute fsmonitor, hooks, credential
helpers, or external protocols during collection.
