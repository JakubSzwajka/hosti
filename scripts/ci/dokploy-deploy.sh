#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
#
# Point a fixed Docker-source Dokploy application at an immutable image and deploy it.
#
# Usage: dokploy-deploy.sh <application-id> <docker-image> [title]
# Env:   DOKPLOY_BASE_URL, DOKPLOY_API_KEY  (required)
#        DOKPLOY_DEPLOY_TIMEOUT             (optional, seconds; default 600)
#
# application.deploy is asynchronous and returns no deployment id, so we record the
# newest deployment's createdAt before triggering and then wait for a strictly newer
# row to reach a terminal status. "Deploy prod" serializes deployments (one
# non-canceling concurrency group), so only our own deploy adds rows here.
set -Eeuo pipefail

app_id="${1:?application id required}"
image="${2:?docker image required}"
title="${3:-Deploy ${image}}"

: "${DOKPLOY_BASE_URL:?DOKPLOY_BASE_URL is required}"
: "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY is required}"

timeout_secs="${DOKPLOY_DEPLOY_TIMEOUT:-600}"
# The base URL may carry a trailing slash; drop it so paths do not start with "//".
base_url="${DOKPLOY_BASE_URL%/}"

post() {
  curl -fsS -X POST "${base_url}/api/$1" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H 'content-type: application/json' \
    -d "$2"
}
list_deployments() {
  curl -fsS "${base_url}/api/deployment.all?applicationId=${app_id}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}"
}

before="$(list_deployments | jq -r 'sort_by(.createdAt) | last | .createdAt // ""')"

echo "Pointing ${app_id} at ${image}"
post application.update \
  "$(jq -nc --arg id "$app_id" --arg img "$image" '{applicationId:$id, dockerImage:$img}')" > /dev/null

echo "Triggering deployment: ${title}"
post application.deploy \
  "$(jq -nc --arg id "$app_id" --arg t "$title" '{applicationId:$id, title:$t}')" > /dev/null

echo "Waiting for the new deployment to finish (timeout ${timeout_secs}s)"
deadline=$(( $(date +%s) + timeout_secs ))
while :; do
  row="$(list_deployments | jq -c 'sort_by(.createdAt) | last')"
  ts="$(printf '%s' "$row" | jq -r '.createdAt // ""')"
  status="$(printf '%s' "$row" | jq -r '.status // "unknown"')"
  if [ -n "$before" ] && [ "$ts" = "$before" ]; then
    echo "  new deployment not registered yet..."
  else
    echo "  status=${status}"
    case "$status" in
      done) echo "Deployment done."; break ;;
      error|cancelled) echo "Deployment ${status} for ${app_id}." >&2; exit 1 ;;
    esac
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Timed out waiting for Dokploy deployment of ${app_id}." >&2
    exit 1
  fi
  sleep 10
done
