#!/usr/bin/env bash
# Smoke-test a running Criclysis server (`next build && next start`).
#
#   scripts/ci/smoke.sh [-w SECONDS] [-f ROUTES_FILE] BASE_URL [ROUTE ...]
#
#   -w SECONDS     first wait up to SECONDS for the server to answer at all
#   -f ROUTES_FILE routes to check when none are given on the command line
#                  (default: smoke-routes.txt next to this script)
#
# Every route must answer HTTP 200 (redirects are not followed), and its body
# must not contain the word NaN or undefined. For HTML, <script> and <style>
# blocks and comments are removed before that check, because the React Server
# Components payload legitimately encodes undefined as "$undefined".
#
# Each line of the routes file is
#
#   <route> [<path> ...]
#
# A route is checked only when every listed path exists, relative to the
# repository root, so a route joins the smoke test when its page lands. Routes
# given on the command line are always checked. Blank lines and lines starting
# with # are ignored.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)

usage() {
  sed -n '4,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

wait_secs=0
routes_file="$script_dir/smoke-routes.txt"
while getopts ':w:f:h' opt; do
  case $opt in
    w) wait_secs=$OPTARG ;;
    f) routes_file=$OPTARG ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
if [ $# -lt 1 ]; then
  usage >&2
  exit 2
fi
if ! [[ $wait_secs =~ ^[0-9]+$ ]]; then
  echo "smoke: -w takes a whole number of seconds, not '$wait_secs'" >&2
  exit 2
fi
base=${1%/}
shift

annotate() {
  # Surface failures on the workflow run page when running in GitHub Actions.
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    echo "::error title=smoke $1::$2"
  fi
}

routes=()
skipped=0
if [ $# -gt 0 ]; then
  routes=("$@")
else
  if [ ! -f "$routes_file" ]; then
    echo "smoke: routes file not found: $routes_file" >&2
    exit 2
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    fields=()
    read -r -a fields <<<"$line" || true
    if [ ${#fields[@]} -eq 0 ] || [[ ${fields[0]} == \#* ]]; then
      continue
    fi
    missing=""
    for path in "${fields[@]:1}"; do
      if [ ! -e "$repo_root/$path" ]; then
        missing=$path
        break
      fi
    done
    if [ -n "$missing" ]; then
      echo "skip  ${fields[0]}  ($missing does not exist yet)"
      skipped=$((skipped + 1))
    else
      routes+=("${fields[0]}")
    fi
  done <"$routes_file"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ "$wait_secs" -gt 0 ]; then
  deadline=$((SECONDS + wait_secs))
  until curl -s -o /dev/null --max-time 5 "$base/"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "smoke: no answer from $base within ${wait_secs}s" >&2
      annotate server "no answer from $base within ${wait_secs}s"
      exit 1
    fi
    sleep 2
  done
fi

failed=0
checked=0
for route in "${routes[@]}"; do
  checked=$((checked + 1))
  body="$tmp/body"
  : >"$body"
  meta=$(curl -sS --max-time 60 -o "$body" -w '%{http_code} %{content_type}' \
    "$base$route" 2>"$tmp/err") || true
  code=${meta%% *}
  ctype=${meta#* }
  if [ "$code" != 200 ]; then
    reason="HTTP ${code:-000}"
    if [ -s "$tmp/err" ]; then
      reason="$reason: $(head -c 200 "$tmp/err")"
    fi
    echo "FAIL  $route  $reason"
    annotate "$route" "$reason"
    failed=$((failed + 1))
    continue
  fi

  if [[ $ctype == text/html* ]]; then
    perl -0777 -pe 's{<script\b[^>]*>.*?</script\s*>}{}gis;
                    s{<style\b[^>]*>.*?</style\s*>}{}gis;
                    s{<!--.*?-->}{}gs' "$body" >"$tmp/text"
  else
    cp "$body" "$tmp/text"
  fi
  hits=$(grep -aEo '.{0,40}\b(NaN|undefined)\b.{0,40}' "$tmp/text" | head -n 3 || true)
  if [ -n "$hits" ]; then
    echo "FAIL  $route  body contains NaN or undefined:"
    while IFS= read -r hit; do
      echo "        ...$hit..."
    done <<<"$hits"
    annotate "$route" "body contains NaN or undefined: $(head -n 1 <<<"$hits")"
    failed=$((failed + 1))
    continue
  fi
  echo "ok    $route"
done

echo "smoke: $checked checked, $failed failed, $skipped skipped (page not built yet)"
if [ "$checked" -eq 0 ]; then
  echo "smoke: no routes were checked" >&2
  exit 1
fi
[ "$failed" -eq 0 ]
