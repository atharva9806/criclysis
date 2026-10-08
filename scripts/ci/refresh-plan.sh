#!/usr/bin/env bash
# Decide which steps of the daily refresh can run (ARCHITECTURE §3.1, §5.4).
#
#   FORCE=false DO_IMPORT=true HAS_DATABASE_URL=true HAS_REVALIDATE_SECRET=true \
#   SITE_URL=https://example.org scripts/ci/refresh-plan.sh
#
# Run from the repository root with Python on the PATH. Streams A and B land
# the commands the refresh needs over several PRs, so each step is switched on
# by checking that its command exists:
#
#   fingerprint       `python -m pipeline fingerprint` exists           (A8)
#   build_mode        "genders" when `build --genders` exists (A3), else
#                     "legacy": the current single-gender build, run once
#                     for men (data/out) and once for women (data/out-female)
#   winprob           `winprob --genders` exists                        (A6)
#   replays           `replays --all --genders` exists                  (A7)
#   golden            web/src/lib/winprob/golden.test.ts exists, and winprob
#   check_fingerprint web/scripts/import/check-fingerprint.mjs exists, and
#                     fingerprint, import, and force is off
#   migrate           web/drizzle/meta/_journal.json exists, and import
#   import            web/scripts/import/index.mjs exists, build_mode is
#                     "genders", the DATABASE_URL secret is set and the
#                     dispatch did not say import=false
#   revalidate        import, and the REVALIDATE_SECRET secret and the SITE_URL
#                     variable are set
#   node              any web step above runs (setup-node and npm ci)
#
# Each decision is printed as key=value and, inside GitHub Actions, appended to
# $GITHUB_OUTPUT. A table with the reasons goes to $GITHUB_STEP_SUMMARY.
set -euo pipefail

force=${FORCE:-false}
do_import=${DO_IMPORT:-true}
has_db=${HAS_DATABASE_URL:-false}
has_secret=${HAS_REVALIDATE_SECRET:-false}
site_url=${SITE_URL:-}

help_for() {
  # The --help text of a pipeline subcommand, or nothing if it does not exist.
  python -m pipeline "$1" --help 2>/dev/null || true
}

has_flags() {
  local text=$1 flag
  shift
  [ -n "$text" ] || return 1
  for flag in "$@"; do
    [[ $text == *"$flag"* ]] || return 1
  done
}

summary=()
decide() {
  # decide KEY VALUE REASON
  echo "$1=$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "$1=$2" >>"$GITHUB_OUTPUT"
  fi
  summary+=("| $1 | $2 | $3 |")
}

on() { [ "$1" = true ]; }
pick() { if on "$1"; then echo "$2"; else echo "$3"; fi; }

fingerprint=false
if [ -n "$(help_for fingerprint)" ]; then fingerprint=true; fi
decide fingerprint "$fingerprint" "$(pick "$fingerprint" \
  "\`python -m pipeline fingerprint --out data/out/fingerprint.json\`" \
  "waiting for \`python -m pipeline fingerprint\` (A8)")"

build_genders=false
if has_flags "$(help_for build)" --genders; then build_genders=true; fi
build_mode=$(pick "$build_genders" genders legacy)
decide build_mode "$build_mode" "$(pick "$build_genders" \
  "\`build --genders male female\`" \
  "no \`build --genders\` yet (A3): current build, men to data/out and women to data/out-female")"

winprob=false
if has_flags "$(help_for winprob)" --genders; then winprob=true; fi
decide winprob "$winprob" "$(pick "$winprob" \
  "\`winprob --genders male female\`" "waiting for \`winprob --genders\` (A6)")"

replays=false
if has_flags "$(help_for replays)" --all --genders; then replays=true; fi
decide replays "$replays" "$(pick "$replays" \
  "\`replays --all --genders male female\`" "waiting for \`replays --all --genders\` (A7)")"

golden=false
if [ -f web/src/lib/winprob/golden.test.ts ] && on "$winprob"; then golden=true; fi
decide golden "$golden" "$(pick "$golden" \
  "\`npm run test:golden\` against the new winprob.json" \
  "needs web/src/lib/winprob/golden.test.ts (C1) and \`winprob --genders\`")"

import=false
import_reason=""
if ! on "$do_import"; then
  import_reason="dispatched with import=false: data/out* is uploaded instead"
elif [ ! -f web/scripts/import/index.mjs ]; then
  import_reason="waiting for web/scripts/import/index.mjs (B1)"
elif ! on "$build_genders"; then
  import_reason="the pipeline does not build v2 output yet (no \`build --genders\`)"
elif ! on "$has_db"; then
  import_reason="secret DATABASE_URL is not set"
else
  import=true
  import_reason="\`npm run import -- --data ../data/out\`"
fi

check_fingerprint=false
check_reason="compares fingerprint.json with the last complete import"
if ! on "$import"; then
  check_reason="only runs before an import"
elif on "$force"; then
  check_reason="force=true: rebuild and import even if unchanged"
elif ! on "$fingerprint"; then
  check_reason="needs \`python -m pipeline fingerprint\` (A8)"
elif [ ! -f web/scripts/import/check-fingerprint.mjs ]; then
  check_reason="waiting for web/scripts/import/check-fingerprint.mjs (B)"
else
  check_fingerprint=true
fi
decide check_fingerprint "$check_fingerprint" "$check_reason"

migrate=false
if on "$import" && [ -f web/drizzle/meta/_journal.json ]; then migrate=true; fi
decide migrate "$migrate" "$(pick "$migrate" \
  "\`npm run db:migrate\` before the import" \
  "runs before an import, once web/drizzle/meta/_journal.json exists")"

decide import "$import" "$import_reason"

revalidate=false
revalidate_reason="POST \$SITE_URL/api/revalidate after the import"
if ! on "$import"; then
  revalidate_reason="only runs after an import"
elif ! on "$has_secret"; then
  revalidate_reason="secret REVALIDATE_SECRET is not set"
elif [ -z "$site_url" ]; then
  revalidate_reason="variable SITE_URL is not set"
else
  revalidate=true
fi
decide revalidate "$revalidate" "$revalidate_reason"

node=false
if on "$check_fingerprint" || on "$golden" || on "$migrate" || on "$import"; then node=true; fi
decide node "$node" "setup-node and npm ci, needed by any web step"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Refresh plan"
    echo
    echo "force=$force, import=$do_import"
    echo
    echo "| Step | Runs | Why |"
    echo "|---|---|---|"
    printf '%s\n' "${summary[@]}"
    echo
  } >>"$GITHUB_STEP_SUMMARY"
fi
