# `atr-1` report contract

## Contents

1. Contract purpose
2. Required report shape
3. Evidence and blockers
4. Validation invariants

## Contract purpose

`atr-1` is the stable machine-readable result for Agent Team Readiness. It
separates the scored repo-level claim from deterministic evidence and from
review-only generated drafts.

The published JSON Schema is `schemas/atr-1.schema.json`. The executable
validator is `scripts/validate-report.mjs`.

## Required report shape

```json
{
  "schema_version": "atr-1",
  "wedge": "agent-team-readiness",
  "generated_at": "ISO-8601",
  "repository": {
    "source": "...",
    "name": "owner/repo or local-name",
    "revision": "git-sha or null",
    "worktree_state": "clean|dirty|not-git|unknown",
    "file_count": 0,
    "analyzed_file_count": 0,
    "skipped_file_count": 0,
    "inventory_truncated": false
  },
  "scope": {
    "claim": "repo-level readiness",
    "observable_only": true,
    "evidence_coverage": 100,
    "limitations": ["…at least one scope limitation…"]
  },
  "headline_score": 0,
  "dimensions": ["…exactly six dimension records in fixed order…"],
  "top_3_fixes": ["…up to three blockers reused from dimensions…"],
  "artifacts": {
    "evidence": "evidence.json",
    "agents_draft": "AGENTS.draft.md",
    "context_tree_seed_map": "context-tree-seed-map.md"
  },
  "summary": "..."
}
```

The example above illustrates key order and field names only; a real report
must satisfy every constraint below (six dimension records, non-empty
limitations, and so on).

Dimensions appear once, in fixed order, with fixed weights. Each contains a
score, status, evidence status, rationale, strongest evidence, nullable
must-fix blocker, minimum improvement, and unknowns.

For a dirty or non-Git local scan, `revision` is null rather than falsely
claiming the working-tree content equals `HEAD`. Skipped symlinks, unreadable
paths, and non-regular paths reduce evidence coverage and are counted in
`skipped_file_count`.

## Evidence and blockers

Evidence references have one of three kinds:

- `file`: an observed path, optional line, and bounded detail
- `missing`: an explicitly searched path/pattern and absence detail
- `command`: a reproducible command candidate plus its source path when known

Every blocker contains a stable id, owning dimension, severity, evidence,
failure consequence, minimum fix, and first verification step. `top_3_fixes`
must reuse blockers already owned by dimensions; it cannot introduce a finding
without a dimension.

`top_3_fixes` selection and order are deterministic: each dimension blocker is
ranked by `severity_rank * 1000 + weight * (10 - score)` with severity ranks
`critical=3`, `high=2`, `medium=1`, sorted descending, and the first three are
taken. Producers must emit exactly this prioritized list; the executable
validator rejects any other selection or ordering.

## Validation invariants

- schema and wedge names are exact
- six keys and weights are exact and sum to 100
- scores are integers 0–10 and status matches the score band
- headline arithmetic is deterministic
- headline is null below 60% evidence coverage
- blocker ids are unique and Top 3 entries belong to dimension blockers
- every strongest-evidence and blocker-evidence list is non-empty
- every generated artifact path is present

The JSON Schema pins all directly expressible shape, order, band, evidence-kind,
and length rules. The executable validator additionally enforces arithmetic and
cross-record invariants such as coverage, headline weighting, skipped/truncated
counts, evidence status, and exact Top 3 blocker reuse.
