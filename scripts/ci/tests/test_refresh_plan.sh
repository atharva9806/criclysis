#!/usr/bin/env bash
# Tests for scripts/ci/refresh-plan.sh.
#
#   scripts/ci/tests/test_refresh_plan.sh
#
# Each case builds a throwaway repository: a stub `python -m pipeline` whose
# subcommands and flags are chosen per case (as streams A and B land them),
# plus the web files the plan looks for. It then runs the plan script there
# and compares its key=value decisions with the expected ones.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
plan=${PLAN:-"$here/../refresh-plan.sh"}  # PLAN= tests another copy
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# make_repo DIR FEATURE...
#   pipeline features: build_genders winprob replays fingerprint
#   web files:         golden importer check journal
make_repo() {
  local dir=$1 f
  shift
  mkdir -p "$dir/pipeline"
  : >"$dir/pipeline/__init__.py"
  {
    echo 'import argparse'
    echo 'p = argparse.ArgumentParser(prog="python -m pipeline")'
    echo 's = p.add_subparsers(dest="c", required=True)'
    echo 'b = s.add_parser("build"); b.add_argument("--gender")'
    echo 'w = s.add_parser("winprob"); w.add_argument("--formats")'
    echo 'r = s.add_parser("replays"); r.add_argument("--out")'
    for f in "$@"; do
      case $f in
        build_genders) echo 'b.add_argument("--genders", nargs="+")' ;;
        winprob) echo 'w.add_argument("--genders", nargs="+")' ;;
        replays) echo 'r.add_argument("--all", action="store_true"); r.add_argument("--genders", nargs="+")' ;;
        fingerprint) echo 's.add_parser("fingerprint").add_argument("--out")' ;;
      esac
    done
    echo 'p.parse_args()'
  } >"$dir/pipeline/__main__.py"
  for f in "$@"; do
    case $f in
      golden) mkdir -p "$dir/web/src/lib/winprob" && : >"$dir/web/src/lib/winprob/golden.test.ts" ;;
      importer) mkdir -p "$dir/web/scripts/import" && : >"$dir/web/scripts/import/index.mjs" ;;
      check) mkdir -p "$dir/web/scripts/import" && : >"$dir/web/scripts/import/check-fingerprint.mjs" ;;
      journal) mkdir -p "$dir/web/drizzle/meta" && : >"$dir/web/drizzle/meta/_journal.json" ;;
    esac
  done
}

failures=0
n=0
# expect NAME "ENV ASSIGNMENTS" "FEATURES" "KEY=VALUE ..."
expect() {
  local name=$1 envs=$2 features=$3 wanted=$4 dir out kv key line
  n=$((n + 1))
  dir="$tmp/repo$n"
  # shellcheck disable=SC2086 # word splitting is intended for the lists
  make_repo "$dir" $features
  # shellcheck disable=SC2086
  out=$(cd "$dir" && env -u GITHUB_OUTPUT -u GITHUB_STEP_SUMMARY \
    FORCE=false DO_IMPORT=true HAS_DATABASE_URL=false HAS_REVALIDATE_SECRET=false SITE_URL= \
    $envs "$plan")
  local bad=""
  for kv in $wanted; do
    key=${kv%%=*}
    line=$(grep -E "^$key=" <<<"$out" || true)
    if [ "$line" != "$kv" ]; then
      bad="$bad $kv (got ${line:-nothing})"
    fi
  done
  if [ -z "$bad" ]; then
    echo "ok - $name"
  else
    echo "not ok - $name:$bad"
    failures=$((failures + 1))
  fi
}

all="build_genders winprob replays fingerprint golden importer check journal"
secrets="HAS_DATABASE_URL=true HAS_REVALIDATE_SECRET=true SITE_URL=https://example.org"

expect "today: nothing has landed" "" "" \
  "build_mode=legacy fingerprint=false winprob=false replays=false golden=false migrate=false check_fingerprint=false import=false revalidate=false node=false"

expect "import=false dispatch builds and checks but never writes" \
  "DO_IMPORT=false $secrets" "$all" \
  "build_mode=genders golden=true migrate=false check_fingerprint=false import=false revalidate=false node=true"

# A3 and B1 land before A6, A7, A8 and C1: no partial import.
expect "partial landing: build --genders, importer and secret, nothing else" \
  "$secrets" "build_genders importer check journal" \
  "build_mode=genders winprob=false replays=false fingerprint=false import=false check_fingerprint=false revalidate=false migrate=true node=true"

for missing in winprob replays fingerprint golden importer build_genders; do
  expect "no import while $missing is missing" "$secrets" "${all/$missing/}" \
    "import=false revalidate=false migrate=true"
done

expect "winprob without the golden test: no golden, no import" \
  "$secrets" "build_genders winprob replays fingerprint importer journal" \
  "golden=false import=false"

expect "everything landed, secrets set" "$secrets" "$all" \
  "build_mode=genders fingerprint=true winprob=true replays=true golden=true migrate=true check_fingerprint=true import=true revalidate=true node=true"

expect "force skips the fingerprint check" "FORCE=true $secrets" "$all" \
  "check_fingerprint=false import=true migrate=true"

expect "no check-fingerprint script: import without the check" "$secrets" "${all/check/}" \
  "check_fingerprint=false import=true"

expect "no DATABASE_URL: no migrate, import or revalidate" \
  "HAS_REVALIDATE_SECRET=true SITE_URL=https://example.org" "$all" \
  "migrate=false import=false check_fingerprint=false revalidate=false golden=true node=true"

expect "no SITE_URL: import without revalidate" \
  "HAS_DATABASE_URL=true HAS_REVALIDATE_SECRET=true" "$all" \
  "import=true revalidate=false"

expect "no migrations yet: import without migrate" "$secrets" "${all/journal/}" \
  "migrate=false import=true"

if [ "$failures" -gt 0 ]; then
  echo "$failures of $n plan test(s) failed"
  exit 1
fi
echo "all $n plan tests passed"
