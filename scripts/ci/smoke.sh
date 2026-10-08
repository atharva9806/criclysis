#!/usr/bin/env bash
# Smoke-test a running Criclysis server (`next build && next start`).
#
#   scripts/ci/smoke.sh [-w SECONDS] [-f ROUTES_FILE] BASE_URL [ROUTE[|TEXT] ...]
#
#   -w SECONDS     first wait up to SECONDS for the server to answer at all
#   -f ROUTES_FILE routes to check when none are given on the command line
#                  (default: smoke-routes.txt next to this script)
#
# A route fails when
#   - the status is not 200 (redirects are not followed);
#   - the HTML has <meta name="robots" content="noindex">, which Next adds when
#     a page calls notFound(), or an error "digest" (also escaped, \"digest\",
#     or data-dgst=), which is how Next reports a server error. Under
#     loading.tsx a page streams, so both still arrive with status 200 and
#     only the loading fallback in the markup;
#   - the body contains the word NaN or undefined. In HTML, <script> and
#     <style> blocks and comments are ignored, because the React Server
#     Components payload legitimately encodes undefined as "$undefined";
#   - the expected TEXT (case-insensitive) is missing. In HTML it is looked for
#     in what the page rendered: <head>, <nav> and <footer> are ignored, so the
#     site navigation cannot satisfy it.
#
# Each line of the routes file is
#
#   <route> | <expected text> | [<path> ...]
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

trim() {
  local s=$1
  s=${s#"${s%%[![:space:]]*}"}
  s=${s%"${s##*[![:space:]]}"}
  printf '%s' "$s"
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
expects=()
skipped=0
if [ $# -gt 0 ]; then
  for arg in "$@"; do
    routes+=("$(trim "${arg%%|*}")")
    if [[ $arg == *"|"* ]]; then
      expects+=("$(trim "${arg#*|}")")
    else
      expects+=("")
    fi
  done
else
  if [ ! -f "$routes_file" ]; then
    echo "smoke: routes file not found: $routes_file" >&2
    exit 2
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    route="" expect="" paths=""
    IFS='|' read -r route expect paths <<<"$line" || true
    route=$(trim "$route")
    if [ -z "$route" ] || [[ $route == \#* ]]; then
      continue
    fi
    guards=()
    read -r -a guards <<<"$paths" || true
    missing=""
    for path in "${guards[@]}"; do
      if [ ! -e "$repo_root/$path" ]; then
        missing=$path
        break
      fi
    done
    if [ -n "$missing" ]; then
      echo "skip  $route  ($missing does not exist yet)"
      skipped=$((skipped + 1))
    else
      routes+=("$route")
      expects+=("$(trim "$expect")")
    fi
  done <"$routes_file"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# strip_html MODE FILE. MODE "text" drops scripts, styles and comments;
# "content" also drops <head>, <nav> and <footer>, leaving what the page itself
# rendered (including content streamed into hidden <div>s).
strip_html() {
  perl -0777 -e '
    my $mode = shift;
    local $_ = <>;
    s{<script\b[^>]*>.*?</script\s*>}{}gis;
    s{<style\b[^>]*>.*?</style\s*>}{}gis;
    s{<!--.*?-->}{}gs;
    if ($mode eq "content") {
      s{<head\b[^>]*>.*?</head\s*>}{}gis;
      s{<footer\b[^>]*>.*?</footer\s*>}{}gis;
      s{<nav\b[^>]*>.*?</nav\s*>}{}gis;
    }
    print;
  ' "$1" "$2"
}

has_noindex() {
  perl -0777 -ne '
    while (/<meta\b[^>]*>/gi) {
      my $tag = $&;
      exit 0 if $tag =~ /\bname\s*=\s*["\x27]?robots\b/i && $tag =~ /noindex/i;
    }
    exit 1;
  ' "$1"
}

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

# check ROUTE EXPECT: prints nothing and returns 0 when the route passes,
# otherwise prints the reason and returns 1.
check() {
  local route=$1 expect=$2 body="$tmp/body" meta code ctype hits
  : >"$body"
  meta=$(curl -sS --max-time 60 -o "$body" -w '%{http_code} %{content_type}' \
    "$base$route" 2>"$tmp/err") || true
  code=${meta%% *}
  ctype=${meta#* }
  if [ "$code" != 200 ]; then
    printf 'HTTP %s' "${code:-000}"
    if [ -s "$tmp/err" ]; then
      printf ': %s' "$(head -c 200 "$tmp/err")"
    fi
    return 1
  fi

  if [[ $ctype == text/html* ]]; then
    if has_noindex "$body"; then
      printf 'the page has <meta name="robots" content="noindex"> (notFound() was called)'
      return 1
    fi
    # In the RSC payload the key is escaped inside a JS string: \"digest\".
    if grep -qE '\\?"digest\\?"|data-dgst=' "$body"; then
      printf 'the page contains an error "digest" (a server error was rendered)'
      return 1
    fi
    strip_html text "$body" >"$tmp/text"
    strip_html content "$body" >"$tmp/content"
  else
    cp "$body" "$tmp/text"
    cp "$body" "$tmp/content"
  fi

  hits=$(grep -aEo '.{0,40}\b(NaN|undefined)\b.{0,40}' "$tmp/text" | head -n 3 || true)
  if [ -n "$hits" ]; then
    printf 'body contains NaN or undefined:'
    while IFS= read -r hit; do
      printf '\n        ...%s...' "$hit"
    done <<<"$hits"
    return 1
  fi

  if [ -n "$expect" ] && ! grep -aqiF -- "$expect" "$tmp/content"; then
    printf 'expected text "%s" is not in the rendered page' "$expect"
    return 1
  fi
}

failed=0
checked=0
for i in "${!routes[@]}"; do
  route=${routes[$i]}
  checked=$((checked + 1))
  if reason=$(check "$route" "${expects[$i]}"); then
    echo "ok    $route"
  else
    echo "FAIL  $route  $reason"
    annotate "$route" "$(head -n 1 <<<"$reason")"
    failed=$((failed + 1))
  fi
done

echo "smoke: $checked checked, $failed failed, $skipped skipped (page not built yet)"
if [ "$checked" -eq 0 ]; then
  echo "smoke: no routes were checked" >&2
  exit 1
fi
[ "$failed" -eq 0 ]
