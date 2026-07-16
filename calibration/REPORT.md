# Agent Team Readiness calibration

Pinned repositories: 12
Dimension comparisons: 72
Band agreements: 72
Band disagreements: 0
Implementation: sha256:fa45003ae5e7cbc5b196a93e4e25790776be57e508ab337de07c0cc8a413f543
Inputs: sha256:a05b437713d0e64ea17f0d39e2c860fa22cd16ef208544fd1e0b626a2b251917

> Scores are repo-level heuristics. Every row preserves evidence and unknowns; the average is not a release gate.

## first-tree

- Source: https://github.com/agent-team-foundation/first-tree@2d5bacb917c26400598563ef5500f9b4be7c5140
- Headline: 84/100; coverage 99%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 10/10 strong | strong | yes | AGENTS.md: Root-scoped agent instruction source | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 7/10 developing | developing | yes | AGENTS.md: Task/workspace isolation policy | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 6/10 developing | developing | yes | .github/CODEOWNERS: 1 ownership rules | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 8/10 strong | strong | yes | packages/web/DESIGN.md: Architecture or design context | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 10/10 strong | strong | yes | pnpm --dir apps/cli test (apps/cli/package.json) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 9/10 strong | strong | yes | .github/ISSUE_TEMPLATE/bug_report.md: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## express

- Source: https://github.com/expressjs/express@ae6dd37680e3a00618d6c8a3e522f0ee4eeba1a4
- Headline: 14/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 0/10 constrained | constrained | yes | AGENTS.md\|CONTRIBUTING.md\|.devcontainer/\|docker-compose.yml: No repo-level task/workspace isolation contract was found | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 0/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 0/10 constrained | constrained | yes | docs/architecture.md\|docs/adr/\|docs/decisions/\|README.md: No architecture map or durable decision record was found | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 7/10 developing | developing | yes | npm run test (package.json) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 0/10 constrained | constrained | yes | .github/ISSUE_TEMPLATE/\|.github/PULL_REQUEST_TEMPLATE.md\|CONTRIBUTING.md: No structured task handoff or completion template was found | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## flask

- Source: https://github.com/pallets/flask@36e4a824f340fdee7ed50937ba8e7f6bc7d17f81
- Headline: 36/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 2/10 constrained | constrained | yes | .devcontainer/devcontainer.json: Repository-local environment isolation surface | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 0/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 5/10 developing | developing | yes | docs/design.rst: Architecture or design context | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 8/10 strong | strong | yes | pytest (pyproject.toml) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 7/10 developing | developing | yes | .github/ISSUE_TEMPLATE/bug-report.md: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## requests

- Source: https://github.com/psf/requests@f361ead047be5cb873174218582f7d8b9fcd9f49
- Headline: 32/100; coverage 98%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 0/10 constrained | constrained | yes | AGENTS.md\|CONTRIBUTING.md\|.devcontainer/\|docker-compose.yml: No repo-level task/workspace isolation contract was found | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 6/10 developing | developing | yes | .github/CODEOWNERS: 5 ownership rules | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 1/10 constrained | constrained | yes | docs/architecture.md\|docs/adr/\|docs/decisions/\|README.md: No architecture map or durable decision record was found | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 6/10 developing | developing | yes | make test (Makefile) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 7/10 developing | developing | yes | .github/ISSUE_TEMPLATE.md: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## chi

- Source: https://github.com/go-chi/chi@8b258c7bb28f97a5f2a856ff7ef962578fec9215
- Headline: 19/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 0/10 constrained | constrained | yes | AGENTS.md\|CONTRIBUTING.md\|.devcontainer/\|docker-compose.yml: No repo-level task/workspace isolation contract was found | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 1/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 2/10 constrained | constrained | yes | README.md: Root architecture or repository-map reference | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 6/10 developing | developing | yes | make test (Makefile) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 2/10 constrained | constrained | yes | .github/ISSUE_TEMPLATE/\|.github/PULL_REQUEST_TEMPLATE.md\|CONTRIBUTING.md: No structured task handoff or completion template was found | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## ripgrep

- Source: https://github.com/BurntSushi/ripgrep@5e16a5c9e57e81f6031a23faa2ace52205fa8242
- Headline: 26/100; coverage 99%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 2/10 constrained | constrained | yes | Cargo.toml: Repository workspace boundary manifest | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 0/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 2/10 constrained | constrained | yes | README.md: Root architecture or repository-map reference | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 7/10 developing | developing | yes | cargo test (Cargo.toml) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 4/10 constrained | constrained | yes | .github/ISSUE_TEMPLATE/bug_report.yml: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## axum

- Source: https://github.com/tokio-rs/axum@b7e37889932edcf521ca54e5ed30245f01180994
- Headline: 28/100; coverage 99%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 2/10 constrained | constrained | yes | Cargo.toml: Repository workspace boundary manifest | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 0/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 1/10 constrained | constrained | yes | docs/architecture.md\|docs/adr/\|docs/decisions/\|README.md: No architecture map or durable decision record was found | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 7/10 developing | developing | yes | cargo test (Cargo.toml) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 7/10 developing | developing | yes | .github/ISSUE_TEMPLATE/bug_report.md: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## fastify

- Source: https://github.com/fastify/fastify@6e680c3e8150071be96cba6b30e1d74487559b54
- Headline: 25/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 1/10 constrained | constrained | yes | CONTRIBUTING.md: Task/workspace isolation policy | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 3/10 constrained | constrained | yes | GOVERNANCE.md: Repository ownership or governance map | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 2/10 constrained | constrained | yes | README.md: Root architecture or repository-map reference | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 7/10 developing | developing | yes | npm run test (package.json) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 1/10 constrained | constrained | yes | .github/ISSUE_TEMPLATE/\|.github/PULL_REQUEST_TEMPLATE.md\|CONTRIBUTING.md: No structured task handoff or completion template was found | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## vue-core

- Source: https://github.com/vuejs/core@fa2885d8c48768d26f1666a01bd540ffe3b20f9b
- Headline: 35/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 3/10 constrained | constrained | yes | .github/contributing.md: Task/workspace isolation policy | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 1/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 1/10 constrained | constrained | yes | docs/architecture.md\|docs/adr/\|docs/decisions/\|README.md: No architecture map or durable decision record was found | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 9/10 strong | strong | yes | pnpm test (package.json) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 7/10 developing | developing | yes | .github/ISSUE_TEMPLATE/bug_report.yml: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## github-cli

- Source: https://github.com/cli/cli@c14cbaa24a75272958161751240fd538a68e6c04
- Headline: 64/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 8/10 strong | strong | yes | AGENTS.md: Root-scoped agent instruction source | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 4/10 constrained | constrained | yes | .devcontainer/devcontainer.json: Repository-local environment isolation surface | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 7/10 developing | developing | yes | .github/CODEOWNERS: 12 ownership rules | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 1/10 constrained | constrained | yes | docs/architecture.md\|docs/adr/\|docs/decisions/\|README.md: No architecture map or durable decision record was found | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 9/10 strong | strong | yes | make test (Makefile) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 10/10 strong | strong | yes | .github/ISSUE_TEMPLATE/bug_report.md: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## uv

- Source: https://github.com/astral-sh/uv@456cd2d919a2ebaeb0863b0fdbc53b3d79da1382
- Headline: 53/100; coverage 99%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 6/10 developing | developing | yes | AGENTS.md: Root-scoped agent instruction source | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 4/10 constrained | constrained | yes | Cargo.toml: Repository workspace boundary manifest | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 2/10 constrained | constrained | yes | AGENTS.md: Explicit edit or scope boundary | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 5/10 developing | developing | yes | agents/references/threat-model.md: Architecture or design context | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 7/10 developing | developing | yes | cargo test (Cargo.toml) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 8/10 strong | strong | yes | .github/ISSUE_TEMPLATE/1_bug_report.yaml: Issue handoff template | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

## p-map

- Source: https://github.com/sindresorhus/p-map@3ada5f36632aca8df860c376856270b6d2ba2de8
- Headline: 10/100; coverage 100%

| Dimension | Machine | Human | Agreement | Strongest evidence | Unknown / difference |
| --- | --- | --- | --- | --- | --- |
| instruction_convergence | 0/10 constrained | constrained | yes | AGENTS.md\|CLAUDE.md\|.cursor/rules/\|.github/copilot-instructions.md: No root-scoped agent instruction source was found | Whether every agent runtime actually loads the discovered instruction files is not observable from the repository. Band agrees; evidence and unknown notes still require review |
| task_workspace_isolation | 0/10 constrained | constrained | yes | AGENTS.md\|CONTRIBUTING.md\|.devcontainer/\|docker-compose.yml: No repo-level task/workspace isolation contract was found | Actual concurrent worktree, branch, credential, port, and temporary-state isolation is not observable from repository files alone. Band agrees; evidence and unknown notes still require review |
| ownership_boundaries | 0/10 constrained | constrained | yes | .github/CODEOWNERS\|CODEOWNERS\|MAINTAINERS.md\|OWNERSHIP.md: No ownership map or explicit code boundary was found | Whether named owners are current, available, and required reviewers is not observable from static repository evidence. Band agrees; evidence and unknown notes still require review |
| shared_decision_context | 0/10 constrained | constrained | yes | docs/architecture.md\|docs/adr/\|docs/decisions/\|README.md: No architecture map or durable decision record was found | Whether decision material is current, routinely consulted, or backed by private shared context is not fully observable. Band agrees; evidence and unknown notes still require review |
| repeatable_verification | 5/10 developing | developing | yes | npm run test (package.json) | The default scan detects commands and CI configuration but does not execute target-repository commands. Runtime pass/fail remains unknown. Band agrees; evidence and unknown notes still require review |
| handoff_definition | 0/10 constrained | constrained | yes | .github/ISSUE_TEMPLATE/\|.github/PULL_REQUEST_TEMPLATE.md\|CONTRIBUTING.md: No structured task handoff or completion template was found | The quality of real tasks, review conversations, and completion behavior outside repository templates remains unknown. Band agrees; evidence and unknown notes still require review |

