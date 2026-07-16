# Calibration analysis

## Result

- 12 public repositories at pinned commits
- 72 per-dimension machine/human comparisons
- 72 matching bands after evidence-rule iteration
- 0 current band disagreements

`baseline.json` and `REPORT.md` retain every dimension's strongest evidence,
unknowns, human band, evidence note, and comparison note. The result is not
accepted from the average score. Implementation and input digests make this
baseline fail tests as soon as collector, scorer, contract, manifest, or human
review inputs drift.

## Discrepancies found and fixed during calibration

1. **Scoped isolation inflated a whole-repo score.** A QA-only worktree rule in
   First Tree initially counted as a global parallel-task contract. Root and
   scoped isolation evidence are now separated; First Tree moved from `9/10
   strong` to `7/10 developing`.
2. **Non-Markdown design context was missed.** Flask's `docs/design.rst` was
   invisible to the first collector. Architecture, decision, module, setup, and
   contribution discovery now supports Markdown, reStructuredText, AsciiDoc,
   and text files; Flask moved from constrained to developing context.
3. **A specialized context artifact was missed.** uv's checked-in agent threat
   model is real shared context. Threat/security models and design-principle
   files now count as architecture context; uv moved from constrained to
   developing context.
4. **Nested evidence inflated root readiness.** Scoped commands and boundaries
   no longer make a hollow root instruction source actionable. Fixture,
   example, and sample trees are excluded from repository-level contracts.
5. **Keyword polarity inverted unsafe policy.** A policy requiring agents to
   share one branch/workspace previously earned isolation credit. Negative
   shared-state policies now cap isolation at constrained and emit a critical
   blocker.
6. **Path presence created phantom readiness.** Symlinks, cached-but-deleted
   entries, unreadable/non-regular files, LFS pointers, empty manifests, and
   placeholder templates no longer earn evidence. Skips reduce coverage and
   set dimension evidence status to partial.
7. **Local worktrees were mislabeled.** Dirty local scans now have a null
   revision and explicit `worktree_state`; remote pinned scans remain clean
   commit snapshots.
8. **Incidental prose looked like architecture.** A bare mention of “packages”
   no longer counts as a repository map. Express, Requests, and GitHub CLI lost
   that false context point while remaining in their human-reviewed bands.
9. **Equivalent unsafe wording escaped polarity checks.** A requirement that
   parallel agent tasks use a shared branch now receives the same critical
   blocker as explicit bans on worktrees or separate workspaces.
10. **No-op verification surfaces looked runnable.** Placeholder package
    scripts such as `true` and workflow files without executable steps no
    longer count as commands or CI evidence.
11. **Metadata-only documents looked substantive.** Leading YAML frontmatter
    is removed before ownership, architecture, ADR, and Markdown-template
    content checks, so metadata without policy prose earns no presence credit.
12. **Evidence serialization needed one trust boundary.** GitLab token families
    are redacted and every emitted evidence command/detail is bounded before it
    reaches a report, preventing secret leakage and overlong conflict records.
13. **Unsafe isolation has multiple equivalent phrasings.** Requirements to use
    a common branch, main branch, single checkout, or to avoid a branch per task
    now produce the same critical shared-state blocker. Clause-aware polarity
    preserves compound safe policies that forbid main while requiring a
    separate branch; explicit per-task and do-not-share policies remain safe.
14. **Declared verification was not necessarily executable.** Empty Make
    targets, no-op recipes, and CI `run: true` steps no longer count. Real Make
    recipes/prerequisites, shell-block CI steps, and assertion pipelines after
    an `echo | ...` stage have positive-control tests.
15. **Plain placeholders looked like policy.** `TODO`, `TBD`, and equivalent
    placeholder-only bodies (including `TODO later`) are excluded from
    ownership, context, and handoff evidence just like headings, metadata, and
    empty templates.
16. **Timestamp validation differed by implementation.** The published schema
    now constrains calendar components as well as shape, matching the executable
    validator for impossible month, day, and time values.
17. **English prose parsed as commands.** Instruction lines that merely start
    with a tool word ("Make sure you run the test before pushing.", "Go through
    the docs.") previously counted as commands — fabricating false root command
    conflicts and letting prose-only instruction files score actionable.
    Command candidates are now case-sensitive and reject sentences containing
    common English function words.
18. **Automation-only workflows counted as CI gates.** A workflow whose only
    steps are `uses:` action references (stale bots, labelers, release
    drafters) earned CI-gate credit and suppressed the no-CI-gate blocker.
    Only shell-executing steps count now; in this calibration set the fix
    replaced Flask's lock-thread bot and Fastify's backport bot citations with
    their real check workflows without changing any score.
19. **Make variable assignments looked like targets.** `test := node --test`
    matched the target probe, fabricating a runnable `make test` that could
    downgrade the critical no-test-command blocker. Assignments (`:=`, `::=`,
    `:::=`) are now rejected while real rules, prerequisites, and recipes still
    count.
20. **Isolation polarity and bare keywords tightened.** An unqualified ban on
    the isolation mechanism itself ("Do not use git worktrees.") is now a
    critical shared-state blocker rather than safe strong-policy credit, while
    sharing bans ("Do not share worktrees") and placement constraints ("Do not
    create worktrees inside the repository root") stay safe. Descriptive
    keyword mentions without a directive ("Git worktrees are neat.") no longer
    earn any isolation evidence, matching the rubric's "keywords never earn
    credit by themselves" rule.

## Residual false-positive risks

- `cargo test`, `go test ./...`, and `pytest` can be inferred from manifests or
  test configuration even when a project wraps them in a different canonical
  command. Reports label execution unknown and generated drafts call detected
  commands candidates until a clean-checkout run confirms them.
- `CODEOWNERS` presence and rule count do not prove path coverage, current
  humans, or enforcement. Scores therefore stop below exemplary without
  additional ownership/boundary evidence.
- Instruction conflict detection compares canonical command actions. It can
  miss semantic prose conflicts that do not expose different commands.
- Comment-only Markdown templates use a conservative length/keyword heuristic;
  a long but low-value prompt can still earn template-presence credit.
- A CI workflow with any substantive shell step counts as a CI gate even when
  that step does not run the canonical test command.

## Residual false-negative risks

- YAML issue forms are discovered, but free-form semantic acceptance/testing
  prompts are not deeply interpreted. Rich YAML-only handoff contracts can be
  understated.
- Architecture and decision discovery is path/title based. Unusually named
  durable context may be missed unless it uses a recognized architecture,
  design, ADR, RFC, threat-model, or decision surface.
- Symlinks are deliberately not read. This prevents a hostile repository from
  pointing outside its root, but can hide legitimate linked documentation.
- Content under conventional fixture/example/sample directories is excluded
  from repo-level contracts. A repository that intentionally treats one of
  those directories as an active product module can be understated.
- CI that verifies exclusively through `uses:` action references or composite
  actions (no shell step) is no longer counted as a CI gate and can be
  understated.
- Lowercase prose that starts with a tool word but avoids common function
  words ("go run all checks") can still register as a command candidate;
  capitalized or ordinary English sentences no longer do.

## Unknowns kept by design

- actual worktree, branch, port, cache, credential, and temporary-state
  isolation
- owner availability and required-review enforcement
- document freshness and actual use
- target verification command pass/fail
- real issue, review, and completion quality
- private organization policy and SaaS integration
