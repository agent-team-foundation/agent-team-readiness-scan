# Hosted report publishing

Use this flow only for a public GitHub repository in the hosted
`agent-readiness` trial, or when a user explicitly asks for a hosted report.
Ordinary local and private-repository scans keep their artifacts local.

## Fixed contracts

- Report base: `https://report.first-tree.ai`
- Bucket: `s3://first-tree-report`
- HTML object: `<report_key>.html`, retained for 7 days by bucket lifecycle
- Machine handoff: `<report_key>.json`, retained for 30 days by bucket lifecycle
- Cloud fix handoff:
  `https://cloud.first-tree.ai/quickstart?campaign=agent-readiness&repo=<encoded-public-repo-url>&action=fix&report=<report_key>`

`scripts/render-report.mjs` is the single implementation of report rendering
and `report_key` derivation. The key format is
`<owner>-<repo>-<YYYYMMDD>-<8-char-hash>` with no extension. Owner and repo are
lowercased, restricted to `[a-z0-9._-]`, collapsed/trimmed, and capped at 39
and 50 characters. The date comes from `atr-1.generated_at`. The hash is SHA-256
over a recursively key-sorted `atr-1` report excluding `generated_at`, so
sub-day clock noise cannot change the content identity.

Never hand-roll or re-derive the key in shell. Never use an upload command's
printed URL as the report base.

## Eligibility and render gate

Before rendering or publishing, all of these must hold:

1. `repository.source` has the exact
   `https://github.com/<owner>/<repo>` URL shape requested by the trial. Local
   paths and user-supplied lookalike hosts are not eligible.
2. GitHub reports that exact repository as `PUBLIC`. The URL shape is not
   evidence of visibility: private repositories use the same shape. A missing
   `gh` CLI, authentication/access error, lookup failure, or any visibility
   other than `PUBLIC` stops hosted rendering and publishing. Fail closed.
3. `atr-1.json` passes `scripts/validate-report.mjs`.
4. The scan artifacts are outside the target repository.
5. Rendering succeeds without overwriting an existing HTML path.

Verify the repository's public visibility before rendering, then capture the
key in the same shell session:

```bash
OUT=<fresh-scan-output-directory>
node scripts/validate-report.mjs "$OUT/atr-1.json"

REPO_URL="$(jq -er '.repository.source' "$OUT/atr-1.json")" || {
  echo "Could not read the repository URL; not publishing." >&2
  exit 1
}
if ! printf '%s\n' "$REPO_URL" \
  | grep -Eq '^https://github\.com/[^/[:space:]]+/[^/[:space:]]+/?$'; then
  echo "Repository is not an eligible GitHub URL; not publishing." >&2
  exit 1
fi
VISIBILITY="$(gh repo view "$REPO_URL" --json visibility --jq '.visibility' 2>/dev/null)" || {
  echo "Could not verify public repository visibility; not publishing." >&2
  exit 1
}
if [ "$VISIBILITY" != "PUBLIC" ]; then
  echo "Repository is not public; not publishing." >&2
  exit 1
fi

KEY="$(node scripts/render-report.mjs "$OUT/atr-1.json" --out-dir "$OUT")"
test -n "$KEY"
test -f "$OUT/$KEY.html"
```

Do not infer public visibility from the source URL or from the scanner's
ability to read the repository. Ambient credentials may make a private
repository readable. The GitHub visibility result is the authoritative gate,
and a failed check must not fall through to rendering or either upload.

The HTML is self-contained, has no script or external asset dependency, uses a
restrictive Content Security Policy, escapes every report string, and links
only to the matching machine-readable JSON object.

## JSON-first gated upload

Credentials come from the hosted runtime. Do not hardcode a key, secret,
region, or profile. The runtime may set `HOME` to the agent workspace, so point
AWS CLI at the runtime credential files when they exist:

```bash
if [ -f /home/ubuntu/.aws/credentials ]; then
  export AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials
  export AWS_CONFIG_FILE=/home/ubuntu/.aws/config
fi

PUBLISHED=false
if aws s3 cp "$OUT/atr-1.json" "s3://first-tree-report/$KEY.json" \
  --content-type application/json --only-show-errors; then
  if aws s3 cp "$OUT/$KEY.html" "s3://first-tree-report/$KEY.html" \
    --content-type text/html --only-show-errors; then
    PUBLISHED=true
  fi
fi
```

Upload JSON first and HTML second. A failed JSON upload exposes nothing. A
failed HTML upload can leave an unlinked JSON object, but can never leave a live
HTML report whose machine handoff is missing. Do not retry with a different key
or reorder the uploads.

Only when both commands exit zero, form the hosted URL yourself as:

`https://report.first-tree.ai/<report_key>.html`

If either upload fails, say that hosted publishing failed and present the four
local artifacts. Never print a speculative hosted URL or a local-file URL the
user cannot reach.

## Hosted-trial closing choice

The trial agent remains read-only: it reports and hands off; it never applies
the generated draft or findings to the scanned repository.

After presenting the report, raise one tracked First Tree `chat ask` asking
whether the user wants to build their own team to apply the prioritized fixes,
or stop after the report. If publishing succeeded, the fix choice uses the
fixed Cloud handoff above with the URL-encoded public repository and exact
`report_key`. If publishing failed, do not include a `report` parameter that
would point to a missing object; explain that the hosted handoff is unavailable.

Do not put the Cloud conversion link inside the HTML report. Do not file issues,
edit the repository, apply `AGENTS.draft.md`, or create a Context Tree without a
separate explicit user choice and the normal workflow gates.
