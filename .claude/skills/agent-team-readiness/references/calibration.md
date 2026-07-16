# Calibration workflow

## Contents

1. Synthetic fixtures
2. Public repository set
3. Human review comparison
4. Change gate

## Synthetic fixtures

Run `npm test`. The fixture matrix must cover, at minimum:

- no instructions
- conflicting root instructions
- monorepo scoped instructions
- hollow root with scoped-only actionability
- unsafe same-branch/shared-workspace language
- missing verification command
- hollow verification manifests and workflows
- clear and missing ownership
- clear and missing handoff
- repository-configured Git execution and phantom paths

Assert evidence and dimension behavior, not only the headline score.

## Public repository set

Run:

```bash
npm run calibrate -- \
  --manifest calibration/repos.json \
  --review calibration/human-review.json \
  --output /tmp/atr-calibration
```

Keep at least 12 public repositories spanning languages, sizes, monorepos,
libraries, applications, and infrastructure. Pin every row to a commit.

## Human review comparison

For every repository and every dimension, record:

- expected band (`strong`, `developing`, `constrained`)
- human-observed evidence or absence
- expected unknowns
- machine result
- agreement or disagreement note

Checked results also carry SHA-256 digests of the collector, scorer, contract,
manifest, and human-review inputs. Tests recompute both digests so an
implementation or review-input change cannot leave a stale baseline green.

Do not use an average score as the acceptance criterion. A false high score in
instruction convergence, isolation, ownership, or verification is more harmful
than a small headline-score error.

## Change gate

Approve a rule change only when:

1. all synthetic fixtures pass;
2. all `atr-1` reports validate;
3. no high-risk dimension regresses silently;
4. every new disagreement is explained as a collector limitation, a human
   review correction, or an intentional rubric change;
5. unknowns remain visible.
