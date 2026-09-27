#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
# Run it by hand: bash scripts/ci/smoke-commit.test.sh
#
# Tests for the post-deploy commit check. A fake `curl` on PATH replays a script
# of responses, one per call, so no network is used. Needs jq.
set -Eeuo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../.."

SCRIPT="$PWD/scripts/ci/smoke-commit.sh"
SHA=0123456789abcdef0123456789abcdef01234567
OLD=fedcba9876543210fedcba9876543210fedcba98
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

# Fake curl: each line of $FAKE_RESPONSES is "<code> <body>"; call N answers line N
# (the last line repeats). It writes the body to the -o file and prints the code.
mkdir -p "$work/bin"
cat >"$work/bin/curl" <<'FAKE'
#!/usr/bin/env bash
out=/dev/null
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac
done
n=$(( $(cat "$FAKE_COUNTER") + 1 ))
echo "$n" >"$FAKE_COUNTER"
total=$(wc -l <"$FAKE_RESPONSES")
line=$(sed -n "$(( n < total ? n : total ))p" "$FAKE_RESPONSES")
printf '%s' "${line#* }" >"$out"
printf '%s' "${line%% *}"
FAKE
chmod +x "$work/bin/curl"

run() {
  local want="$1" name="$2" expected="$3" responses="$4" got=0
  printf '%s\n' "$responses" >"$work/responses"
  echo 0 >"$work/counter"
  FAKE_RESPONSES="$work/responses" FAKE_COUNTER="$work/counter" \
    SMOKE_TIMEOUT=0 SMOKE_DELAY=0 PATH="$work/bin:$PATH" \
    bash "$SCRIPT" https://app.example "$expected" >"$work/out" 2>&1 || got=$?
  if [ "$got" -eq "$want" ]; then
    printf '  ok   %s\n' "$name"
  else
    printf '  FAIL %s (want exit %s, got %s)\n' "$name" "$want" "$got"
    sed 's/^/     /' "$work/out"
    failures=$((failures + 1))
  fi
}

# SMOKE_TIMEOUT=0 allows exactly one attempt; the polling cases raise it.
run 0 "200 with the expected commit passes" "$SHA" \
  '200 {"status":"ok","commit":"0123456789ab"}'
run 0 "a 12-character expected commit works too" "${SHA:0:12}" \
  '200 {"status":"ok","commit":"0123456789ab"}'
run 1 "200 from the old container fails at the deadline" "$SHA" \
  "200 {\"status\":\"ok\",\"commit\":\"${OLD:0:12}\"}"
run 1 "503 with the expected commit fails" "$SHA" \
  '503 {"status":"unavailable","commit":"0123456789ab"}'
run 1 "an image without the build arg fails" "$SHA" \
  '200 {"status":"ok","commit":"unknown"}'
run 1 "a non-JSON body fails without crashing" "$SHA" \
  '502 <html>Bad Gateway</html>'
run 1 "a pre-change body with no commit field fails" "$SHA" \
  '200 {"status":"ok"}'
run 2 "an expected value that is not a sha is rejected" "v0.2.0" \
  '200 {"status":"ok","commit":"0123456789ab"}'

# Polling: old container, then a 503 while the new one starts, then the new one.
printf '%s\n' \
  "200 {\"status\":\"ok\",\"commit\":\"${OLD:0:12}\"}" \
  '000 ' \
  '503 {"status":"unavailable","commit":"0123456789ab"}' \
  '200 {"status":"ok","commit":"0123456789ab"}' >"$work/responses"
echo 0 >"$work/counter"
got=0
FAKE_RESPONSES="$work/responses" FAKE_COUNTER="$work/counter" \
  SMOKE_TIMEOUT=30 SMOKE_DELAY=0 PATH="$work/bin:$PATH" \
  bash "$SCRIPT" https://app.example "$SHA" >"$work/out" 2>&1 || got=$?
if [ "$got" -eq 0 ] && [ "$(cat "$work/counter")" -eq 4 ]; then
  printf '  ok   %s\n' "keeps polling past the old container until the new one answers"
else
  printf '  FAIL %s (exit %s, calls %s)\n' "polling" "$got" "$(cat "$work/counter")"
  sed 's/^/     /' "$work/out"
  failures=$((failures + 1))
fi

# The failure message names both commits.
run 1 "failure output (checked below)" "$SHA" \
  "200 {\"status\":\"ok\",\"commit\":\"${OLD:0:12}\"}"
if grep -q "Expected commit: 0123456789ab" "$work/out" &&
  grep -q "Last seen:       commit ${OLD:0:12}, HTTP 200" "$work/out"; then
  printf '  ok   %s\n' "the failure shows the expected and the last seen commit"
else
  printf '  FAIL %s\n' "failure message"
  sed 's/^/     /' "$work/out"
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  echo "${failures} failure(s)." >&2
  exit 1
fi
echo "All smoke-commit tests passed."
