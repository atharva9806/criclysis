#!/usr/bin/env bash
# Tests for scripts/ci/smoke.sh against tests/stub_server.py.
#
#   scripts/ci/tests/test_smoke.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
smoke="$here/../smoke.sh"
tmp=$(mktemp -d)
server_pid=""
cleanup() {
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -rf "$tmp"
}
trap cleanup EXIT

python3 "$here/stub_server.py" "$tmp/port" &
server_pid=$!
for _ in $(seq 50); do
  [ -s "$tmp/port" ] && break
  sleep 0.1
done
base="http://127.0.0.1:$(cat "$tmp/port")"

failures=0
fail() {
  echo "not ok - $1"
  failures=$((failures + 1))
}
pass() { echo "ok - $1"; }

# <expected result> <route>[|<expected text>]
cases=(
  "ok   /players|Players"
  "ok   /players?a=1&b=2|nanda"
  "ok   /players/v-kohli|Kohli"
  "FAIL /players/throws|Kohli"
  "FAIL /players/throws"
  "FAIL /throws-plain"
  "FAIL /throws-dgst"
  "FAIL /players/missing"
  "FAIL /nav-only|Players"
  "FAIL /nav-only|Teams"
  "ok   /nav-only|Nothing here"
  "FAIL /players/v-kohli|Sharma"
  "FAIL /nan"
  "FAIL /undefined"
  "ok   /api/health|\"ok\":true"
  "FAIL /api/health|\"buildId\""
  "FAIL /api/bad"
  "FAIL /missing"
  "FAIL /redirect"
)

args=()
for c in "${cases[@]}"; do
  read -r _ arg <<<"$c"
  args+=("$arg")
done
set +e
out=$("$smoke" -w 10 "$base" "${args[@]}" 2>&1)
status=$?
set -e

# One result line per route, in order: "ok    <route>" or "FAIL  <route>  ...".
mapfile -t results < <(grep -E '^(ok|FAIL)  ' <<<"$out")
for i in "${!cases[@]}"; do
  want=${cases[$i]%% *}
  got=${results[$i]:-}
  if [ "${got%% *}" = "$want" ]; then
    pass "${args[$i]} -> $want"
  else
    fail "${args[$i]}: expected $want, got '${got:-no line}'"
  fi
done
if [ "$status" -eq 1 ]; then pass "exit status 1 when a route fails"; else fail "exit status $status"; fi

# Routes file: guards, comments, blank lines and trimming.
cat >"$tmp/routes.txt" <<'EOF'
# comment

/players            | Players | scripts/ci/smoke.sh
/players/v-kohli    | Kohli   |
/missing            | x       | scripts/ci/does-not-exist.txt
EOF
set +e
out=$("$smoke" -f "$tmp/routes.txt" "$base" 2>&1)
status=$?
set -e
if [ "$status" -eq 0 ] && grep -q '2 checked, 0 failed, 1 skipped' <<<"$out"; then
  pass "routes file with a skipped route"
else
  fail "routes file: status $status, output: $out"
fi

# Every route skipped means nothing was tested, which is a failure.
printf '/players | Players | nope\n' >"$tmp/none.txt"
if "$smoke" -f "$tmp/none.txt" "$base" >/dev/null 2>&1; then
  fail "no routes checked should fail"
else
  pass "no routes checked fails"
fi

# No server.
if "$smoke" -w 2 http://127.0.0.1:9 / >/dev/null 2>&1; then
  fail "an unreachable server should fail"
else
  pass "an unreachable server fails"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures smoke test(s) failed"
  echo "--- smoke output:"
  echo "$out"
  exit 1
fi
echo "all smoke tests passed"
