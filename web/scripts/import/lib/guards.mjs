// Import guards (docs/ARCHITECTURE.md §3.2): refuse demo output, and refuse a
// build that would delete data the last full import had: a count that fell
// more than 5% below it, or matches marked hasReplay with no replay file.
import { formatKeyOf } from "./source.mjs";

export const SHRINK_LIMIT = 0.95;

/** Counts kept per formatKey in dataset_meta.counts.formats. */
export const PER_FORMAT_KINDS = ["players", "matches", "teamSummaries", "winModels"];
/** Counts kept for the whole build in dataset_meta.counts. */
export const TOTAL_KINDS = ["teams", "venues"];

/** Throws unless the manifest says the build is real Cricsheet output. */
export function assertLive(storedManifest) {
  const dataset = storedManifest.provenance?.dataset;
  if (dataset !== "live") throw new Error(`Refusing to import: manifest.provenance.dataset is ${JSON.stringify(dataset)}, not "live"`);
}

/**
 * Per-formatKey input counts: player-formats from players.json, matches from
 * matches.json, team summaries (one per team file format) and win models.
 */
export function inputCounts({ players = null, matches = null, teamSummaryKeys = null, winModelKeys = null } = {}) {
  const formats = {};
  const bump = (fk, k) => {
    formats[fk] ??= {};
    formats[fk][k] = (formats[fk][k] ?? 0) + 1;
  };
  for (const p of players ?? []) {
    for (const fmt of Object.keys(p.formats ?? {})) bump(formatKeyOf(fmt, p.gender ?? "male"), "players");
  }
  for (const m of matches ?? []) bump(m.formatKey ?? formatKeyOf(m.format, m.gender), "matches");
  for (const fk of teamSummaryKeys ?? []) bump(fk, "teamSummaries");
  for (const fk of winModelKeys ?? []) bump(fk, "winModels");
  return formats;
}

/**
 * The counts that shrank more than 5% since the last full import, as
 * "<fk> <kind>: before -> after" (or "<kind>: before -> after" for totals).
 * `before` and `now` are dataset_meta.counts objects ({ formats, teams,
 * venues }). `skip` names kinds whose source file is missing this run, so
 * nothing of theirs is deleted; `formatKeys` limits the per-format check to
 * a partial import's keys.
 */
export function shrinkProblems(before, now, { skip = [], formatKeys = null } = {}) {
  const problems = [];
  const drop = (prev, after) => typeof prev === "number" && prev > 0 && after < prev * SHRINK_LIMIT;
  for (const [fk, prev] of Object.entries(before?.formats ?? {})) {
    if (formatKeys && !formatKeys.includes(fk)) continue;
    for (const k of PER_FORMAT_KINDS) {
      if (skip.includes(k)) continue;
      const after = now?.formats?.[fk]?.[k] ?? 0;
      if (drop(prev?.[k], after)) problems.push(`${fk} ${k}: ${prev[k]} -> ${after}`);
    }
  }
  for (const k of TOTAL_KINDS) {
    if (skip.includes(k)) continue;
    const after = now?.[k] ?? 0;
    if (drop(before?.[k], after)) problems.push(`${k}: ${before[k]} -> ${after}`);
  }
  return problems;
}

/**
 * Matches marked hasReplay whose replay file is not in this build. Deleting
 * their stored replays would leave Replay links that 404, so the importer
 * refuses to (sorted ids).
 */
export function missingReplays(hasReplayIds, replayFileIds) {
  const files = new Set(replayFileIds);
  return [...new Set(hasReplayIds)].filter((id) => !files.has(id)).sort();
}

const indexBalls = (p) =>
  p.sampleBalls ?? Object.values(p.formats ?? {}).reduce((s, f) => s + (f.bat?.balls ?? 0) + (f.bowl?.balls ?? 0), 0);

/**
 * players.json must list each Cricsheet person id once. v1 output keyed
 * players by name, so one person can appear under two names (e.g. a player
 * who changed name). The database holds one row per id, and the importer
 * never merges statistics itself, so it keeps the entry with the most balls
 * (the first on a tie) and reports the rest.
 */
export function dedupePlayers(index) {
  const best = new Map();
  for (const p of index ?? []) {
    const cur = best.get(p.id);
    if (!cur || indexBalls(p) > indexBalls(cur)) best.set(p.id, p);
  }
  const kept = (index ?? []).filter((p) => best.get(p.id) === p);
  const dropped = (index ?? []).filter((p) => best.get(p.id) !== p).map((p) => ({ dropped: p.slug, kept: best.get(p.id).slug }));
  return { kept, dropped };
}
