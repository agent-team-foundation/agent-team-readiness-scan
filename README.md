# Agent Team Readiness Scan

Evidence-first assessment of whether a repository gives multiple coding agents
enough repo-level structure to work safely in parallel. It does not infer team
quality, runtime isolation, permissions, or private SaaS configuration.

The scan covers six dimensions:

1. instruction convergence
2. task and workspace isolation
3. code and domain ownership
4. shared decisions and context
5. repeatable verification
6. handoff and definition of done

## Run it

Node.js 22+ and Git are the only runtime requirements.

```bash
git clone https://github.com/agent-team-foundation/agent-team-readiness-scan.git
cd agent-team-readiness-scan
node ./bin/atr-scan.mjs https://github.com/agent-team-foundation/first-tree \
  --output /tmp/first-tree-atr
```

The command writes four read-only artifacts outside the scanned repository:

- `atr-1.json` — scored report with per-dimension evidence and unknowns
- `evidence.json` — deterministic evidence inventory
- `AGENTS.draft.md` — tailored, review-before-adopting instructions
- `context-tree-seed-map.md` — source-backed seed proposal, not a tree write

Use a fresh output directory. The scanner refuses to overwrite an existing
artifact, including a symlink or hard link, so a crafted output path cannot be
used to modify another file.

Validate a report independently:

```bash
node ./.claude/skills/agent-team-readiness/scripts/validate-report.mjs \
  /tmp/first-tree-atr/atr-1.json
```

The default scanner never runs commands found in the target repository and
refuses to place output inside a local target. Repository text is treated as
untrusted evidence, not instructions. Local Git execution disables repository
fsmonitor/hooks; symlinks, deleted index entries, unreadable paths, and hollow
evidence surfaces are skipped. Dirty local scans report a null revision instead
of claiming their content equals `HEAD`.

## Skill use

The canonical skill is
[`.claude/skills/agent-team-readiness/SKILL.md`](.claude/skills/agent-team-readiness/SKILL.md).
It tells an agent to run deterministic collection first, then explain only what
the evidence supports, preserve unknowns, and offer generated drafts without
writing them into the scanned repository.

## Development

```bash
npm test
npm run check
npm run calibrate -- \
  --manifest calibration/repos.json \
  --review calibration/human-review.json \
  --output /tmp/atr-calibration
```

Calibration inputs pin 12 public repositories. Checked baselines include every
dimension, strongest evidence, unknowns, and human-review differences rather
than only an average score.
