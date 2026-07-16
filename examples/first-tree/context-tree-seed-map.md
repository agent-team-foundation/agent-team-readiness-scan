# Context Tree seed map — generated proposal

Source: `https://github.com/agent-team-foundation/first-tree` at `2d5bacb917c26400598563ef5500f9b4be7c5140`

> This is a source-backed map, not a Context Tree write. Top-level domains and owners require explicit human approval. Apply the Decision + Durability tests before creating any node.

| Candidate node | Durable purpose | Source evidence | Ownership |
| --- | --- | --- | --- |
| `repository/NODE.md` | Root product/repository boundary and durable cross-domain constraints | `README.md:200` | Human approval required |
| `repository/architecture/apps.md` | Durable decisions and boundaries for apps; omit implementation walkthroughs | `apps/cli/README.md` | Derive from repository ownership evidence; do not guess |
| `repository/architecture/assets.md` | Durable decisions and boundaries for assets; omit implementation walkthroughs | `assets/logos/README.md` | Derive from repository ownership evidence; do not guess |
| `repository/architecture/docs.md` | Durable decisions and boundaries for docs; omit implementation walkthroughs | `docs/development/agent-workspace-state.md` | Derive from repository ownership evidence; do not guess |
| `repository/architecture/packages.md` | Durable decisions and boundaries for packages; omit implementation walkthroughs | `packages/web/DESIGN.md` | Derive from repository ownership evidence; do not guess |
| `team-practice/verification.md` | Canonical clean-checkout verification contract and surviving rationale | `apps/cli/package.json` | Human approval required |
| `team-practice/ownership.md` | Review routing and high-risk boundary rationale | `.github/CODEOWNERS` | Human approval required |
| `team-practice/handoff.md` | Acceptance, evidence, and completion contract for agent handoffs | `.github/PULL_REQUEST_TEMPLATE.md` | Human approval required |

## Do not seed

- Function signatures, types, API payloads, build configuration, test fixtures, or step-by-step implementation detail.
- Historical narratives or PR/commit provenance in normal nodes.
- Runtime/organization claims that this repository scan marked unknown.

## Readiness gaps to resolve before seeding

