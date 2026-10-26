// Multi-row INSERT / guarded upsert helpers for the importer. Column lists
// mirror web/src/db/schema.ts (the migrations are generated from it).

/** Columns per table, in insert order; `json` columns are sent as JSON text. */
export const TABLES = {
  players: {
    cols: [
      "source_id", "slug", "name", "full_name", "gender", "country", "teams", "team_ids", "role", "batting_hand",
      "bowling_type", "cricinfo_id", "born", "debut", "last_played", "sample_balls", "content_hash",
    ],
    json: [],
    key: ["source_id"],
  },
  career_stats: {
    cols: [
      "player_id", "format_key", "matches", "bat_innings", "not_outs", "runs", "balls", "outs", "highest",
      "highest_not_out", "hundreds", "fifties", "fours", "sixes", "dots", "bat_avg", "bat_sr", "bowl_innings",
      "bowl_balls", "runs_conceded", "wickets", "maidens", "bowl_dots", "four_wkts", "five_wkts", "best_wickets",
      "best_runs", "bowl_avg", "bowl_econ", "bowl_sr", "strengths", "weaknesses", "stats_hash", "analysis_hash",
    ],
    json: [],
    key: ["player_id", "format_key"],
  },
  innings: {
    cols: [
      "player_id", "format_key", "discipline", "match_id", "played_on", "opponent", "innings_no", "runs", "balls_faced",
      "fours", "sixes", "position", "out", "chase", "dismissal", "dismissed_by_id", "balls_bowled", "runs_conceded",
      "wickets", "maidens",
    ],
    json: [],
  },
  yearly_stats: {
    cols: [
      "player_id", "format_key", "year", "bat_innings", "runs", "balls", "outs", "fours", "sixes", "bowl_innings",
      "bowl_balls", "runs_conceded", "wickets",
    ],
    json: [],
  },
  splits: {
    cols: [
      "player_id", "format_key", "discipline", "dimension", "subject", "label", "balls", "runs", "outs", "wickets",
      "dots", "fours", "sixes", "innings",
    ],
    json: [],
  },
  dismissal_counts: { cols: ["player_id", "format_key", "discipline", "kind", "subject", "count"], json: [] },
  traits: {
    cols: [
      "player_id", "format_key", "kind", "rank", "claim_id", "discipline", "dimension_key", "dimension", "subject_key",
      "subject", "metric", "metric_label", "value", "baseline", "cohort_median", "percentile", "balls", "confidence",
      "higher_is_better", "text",
    ],
    json: [],
  },
  profile_dimensions: {
    cols: ["player_id", "format_key", "axis", "label", "discipline", "value", "percentile", "balls"],
    json: [],
  },
  teams: {
    cols: ["id", "name", "gender", "label", "first_match", "last_match", "matches", "content_hash"],
    json: [],
    key: ["id"],
  },
  team_summaries: {
    cols: [
      "team_id", "format_key", "matches", "won", "lost", "tied", "drawn", "no_result", "win_pct", "first_date",
      "last_date", "detail", "content_hash",
    ],
    json: ["detail"],
    key: ["team_id", "format_key"],
  },
  venues: { cols: ["key", "name", "city", "country", "formats", "content_hash"], json: ["formats"], key: ["key"] },
  matches: {
    cols: [
      "id", "gender", "format", "format_key", "match_type_number", "start_date", "end_date", "season", "event_name",
      "event_stage", "event_group", "event_match_number", "venue", "venue_key", "city", "country", "team1_id", "team1",
      "team2_id", "team2", "toss_winner", "toss_decision", "result_type", "winner_id", "winner", "margin_runs",
      "margin_wickets", "margin_innings", "method", "eliminator", "result_text", "player_of_match", "innings",
      "scheduled_overs", "missing", "has_replay", "featured_rank", "content_hash",
    ],
    json: ["player_of_match", "innings"],
    key: ["id"],
  },
  match_replays: { cols: ["match_id", "gz", "bytes", "balls", "content_hash"], json: [], key: ["match_id"] },
  win_models: {
    cols: [
      "format_key", "model", "venues", "validation", "golden", "matches", "half_life_years", "holdout_from",
      "content_hash",
    ],
    json: ["model", "venues", "validation", "golden"],
    key: ["format_key"],
  },
};

const MAX_PARAMS = 60000;
const MAX_ROWS = 1000;
const q = (id) => `"${id}"`;

function chunks(rows, ncols) {
  const size = Math.max(1, Math.min(MAX_ROWS, Math.floor(MAX_PARAMS / ncols)));
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function valuesClause(spec, rows) {
  const params = [];
  const tuples = rows.map((row) => {
    const ph = spec.cols.map((c) => {
      const v = row[c];
      params.push(v === undefined ? null : spec.json.includes(c) && v !== null ? JSON.stringify(v) : v);
      return `$${params.length}`;
    });
    return `(${ph.join(",")})`;
  });
  return { sql: tuples.join(","), params };
}

/** Plain multi-row insert, at most 1,000 rows per statement. Returns rows inserted. */
export async function insertRows(client, table, rows) {
  const spec = TABLES[table];
  let n = 0;
  for (const part of chunks(rows, spec.cols.length)) {
    const v = valuesClause(spec, part);
    const res = await client.query(`INSERT INTO ${q(table)} (${spec.cols.map(q).join(",")}) VALUES ${v.sql}`, v.params);
    n += res.rowCount ?? 0;
  }
  return n;
}

/**
 * INSERT ... ON CONFLICT (key) DO UPDATE ... WHERE the guard holds, so
 * unchanged rows are never rewritten. `guard` defaults to a content_hash
 * comparison. Returns the RETURNING rows (each has `inserted`).
 */
export async function upsertRows(client, table, rows, { returning = [], guard } = {}) {
  const spec = TABLES[table];
  const where = guard ?? `t.content_hash IS DISTINCT FROM excluded.content_hash`;
  const set = spec.cols
    .filter((c) => !spec.key.includes(c))
    .map((c) => `${q(c)} = excluded.${q(c)}`)
    .join(", ");
  const extra = table === "players" || table === "win_models" ? `, "updated_at" = now()` : "";
  const ret = ["(xmax = 0) AS inserted", ...returning.map(q)].join(", ");
  const out = [];
  for (const part of chunks(rows, spec.cols.length)) {
    const v = valuesClause(spec, part);
    const res = await client.query(
      `INSERT INTO ${q(table)} AS t (${spec.cols.map(q).join(",")}) VALUES ${v.sql}
       ON CONFLICT (${spec.key.map(q).join(",")}) DO UPDATE SET ${set}${extra}
       WHERE ${where} RETURNING ${ret}`,
      v.params,
    );
    out.push(...res.rows);
  }
  return out;
}

/** DELETE FROM <table> for a set of (player_id, format_key) pairs. Returns rows deleted. */
export async function deletePlayerFormats(client, table, pairs) {
  if (!pairs.length) return 0;
  const res = await client.query(
    `DELETE FROM ${q(table)} t USING unnest($1::int[], $2::format_key[]) AS d(pid, fk)
     WHERE t.player_id = d.pid AND t.format_key = d.fk`,
    [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
  );
  return res.rowCount ?? 0;
}
