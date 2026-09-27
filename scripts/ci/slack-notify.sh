#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
#
# Post a prod deploy outcome to a Slack-compatible Incoming Webhook. A Discord
# channel webhook with `/slack` appended works too: the `text` line carries
# everything, and the Slack `blocks` are extra detail for a receiver that renders
# them.
#
# Usage: slack-notify.sh <job-status>
#          job-status is GitHub's ${{ job.status }} — success | failure | cancelled.
# Env:   SLACK_WEBHOOK  (empty or unset => no-op; a repo without the secret is silent)
#        TAG            the release version that shipped (v0.2.0)
#        COMMIT_SHA     deployed commit (any length; displayed as 12 chars)
#        APP_URL        app URL, also the smoke target
#        GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID  (Actions-provided)
#
# Anything other than "success" is reported as a failure, cancellation included:
# an app that migrates its database on start can be left on a new schema by a run
# stopped mid-deploy. That is worth an alert whichever way it stopped.
#
# Always exits 0 — a dead webhook must never fail a deploy. Callers still set
# continue-on-error so that a missing jq or a malformed payload cannot either.
set -Eeuo pipefail

status="${1:?job status required}"

if [ -z "${SLACK_WEBHOOK:-}" ]; then
  echo "SLACK_WEBHOOK is empty; skipping deploy notification."
  exit 0
fi

repo_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}"
run_url="${repo_url}/actions/runs/${GITHUB_RUN_ID:-}"
commit_sha="${COMMIT_SHA:-}"
commit_short="${commit_sha:0:12}"
commit_url="${repo_url}/commit/${commit_sha}"
tag="${TAG:-unknown}"
repo_name="${GITHUB_REPOSITORY#*/}"

guidance=""
if [ "$status" = "success" ]; then
  header="✅ ${repo_name} prod deploy succeeded"
else
  case "$status" in
    cancelled) verb="cancelled" ;;
    *) verb="failed" ;;
  esac
  header="🔴 ${repo_name} prod deploy ${verb}"
  guidance="→ Open the log to see which step failed, then roll back by running *Deploy prod* with the previous \`vX.Y.Z\` version. A container rollback is not a database rollback."
fi

# One plain line for receivers that only read `text` (Discord's /slack endpoint).
text="${header} — ${tag}"
[ -n "$commit_short" ] && text="${text} (${commit_short})"
text="${text} — ${run_url}"

payload="$(jq -nc \
  --arg text "$text" \
  --arg header "$header" \
  --arg status "$status" \
  --arg tag "$tag" \
  --arg commit_short "$commit_short" \
  --arg commit_url "$commit_url" \
  --arg app_url "${APP_URL:-}" \
  --arg run_url "$run_url" \
  --arg guidance "$guidance" \
  '
  def field($label; $value): {type: "mrkdwn", text: ("*" + $label + ":*\n" + $value)};
  def button($label; $url): {type: "button", text: {type: "plain_text", text: $label}, url: $url};

  ( [field("Status"; $status), field("Tag"; "`" + $tag + "`")]
    + (if $commit_short != "" then [field("Commit"; "<" + $commit_url + "|" + $commit_short + ">")] else [] end)
    + (if $app_url != "" then [field("App"; $app_url)] else [] end)
  ) as $fields
  | ( [button("Open deploy log"; $run_url)]
    + (if $app_url != "" then [button("Open app"; $app_url)] else [] end)
  ) as $buttons
  | {
      text: $text,
      blocks: (
        [{type: "header", text: {type: "plain_text", text: $header}},
         {type: "section", fields: $fields}]
        + (if $guidance != "" then [{type: "section", text: {type: "mrkdwn", text: $guidance}}] else [] end)
        + [{type: "actions", elements: $buttons}]
      )
    }')"

# curl stderr is dropped: connection errors can echo the webhook host, and there is
# nothing in a failure here worth risking the URL in a log for.
if curl -fsS -X POST -H 'content-type: application/json' -d "$payload" "$SLACK_WEBHOOK" >/dev/null 2>&1; then
  echo "Deploy notification sent: ${header} (${tag})"
else
  echo "Deploy notification failed (webhook rejected or unreachable); not failing the deploy." >&2
fi
exit 0
