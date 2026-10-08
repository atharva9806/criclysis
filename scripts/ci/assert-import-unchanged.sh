#!/usr/bin/env bash
# Assert that re-importing the same data/out changed nothing (ARCHITECTURE §3.3).
#
#   DATABASE_URL=postgres://... scripts/ci/assert-import-unchanged.sh
#
# Run it right after importing the same directory twice. It reads dataset_meta
# (§2): each complete import records its inserted, updated and deleted row
# counts per table in the `changes` jsonb column. The check passes when
#   - the latest complete import's `changes` holds only zeros, and
#   - the import before it changed at least one row, which shows the counts
#     are real rather than always zero.
# Needs psql.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
if ! command -v psql >/dev/null 2>&1; then
  echo "assert-import-unchanged: psql is not installed" >&2
  exit 2
fi

# Prints the sum of every number in the `changes` of the complete import at
# OFFSET (0 = latest), "missing" when that run recorded no changes object, or
# nothing when there is no such run.
sum_changes() {
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -v offset="$1" <<'SQL'
SELECT CASE
         WHEN m.changes IS NULL OR jsonb_typeof(m.changes) <> 'object' THEN 'missing'
         ELSE (SELECT coalesce(sum((v #>> '{}')::numeric), 0)::text
                 FROM jsonb_path_query(m.changes, 'strict $.**') AS v
                WHERE jsonb_typeof(v) = 'number')
       END
  FROM (SELECT changes FROM dataset_meta
         WHERE status = 'complete'
         ORDER BY id DESC OFFSET :offset LIMIT 1) AS m;
SQL
}

latest=$(sum_changes 0)
previous=$(sum_changes 1)

echo "changes recorded by the latest complete import:"
psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 \
  -c "SELECT changes FROM dataset_meta WHERE status = 'complete' ORDER BY id DESC LIMIT 1"

fail() {
  echo "assert-import-unchanged: $1" >&2
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    echo "::error title=Re-import was not a no-op::$1"
  fi
  exit 1
}

if [ -z "$latest" ] || [ -z "$previous" ]; then
  fail "expected at least two complete imports in dataset_meta"
fi
if [ "$latest" = missing ] || [ "$previous" = missing ]; then
  fail "dataset_meta.changes is not a JSON object for one of the last two imports"
fi
if [ "$previous" = 0 ]; then
  fail "the first import recorded 0 changed rows, so the counts cannot be trusted"
fi
if [ "$latest" != 0 ]; then
  fail "re-importing the same data changed $latest rows (expected 0)"
fi
echo "assert-import-unchanged: first import changed $previous rows; the re-import changed 0"
