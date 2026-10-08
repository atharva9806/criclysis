// Import guards (docs/ARCHITECTURE.md §3.2): refuse demo output, and refuse a
// build whose per-formatKey player or match count fell more than 5% below
// the last complete import.
import { formatKeyOf } from "./source.mjs";

export const SHRINK_LIMIT = 0.95;

/** Throws unless the manifest says the build is real Cricsheet output. */
export function assertLive(storedManifest) {
  const dataset = storedManifest.provenance?.dataset;
  if (dataset !== "live") throw new Error(`Refusing to import: manifest.provenance.dataset is ${JSON.stringify(dataset)}, not "live"`);
}

/** Per-formatKey input counts: players from players.json, matches from matches.json. */
export function inputCounts(playersIndex, matches) {
  const formats = {};
  const bump = (fk, k) => {
    formats[fk] ??= {};
    formats[fk][k] = (formats[fk][k] ?? 0) + 1;
  };
  for (const p of playersIndex ?? []) {
    for (const fmt of Object.keys(p.formats ?? {})) bump(formatKeyOf(fmt, p.gender ?? "male"), "players");
  }
  for (const m of matches ?? []) bump(m.formatKey ?? formatKeyOf(m.format, m.gender), "matches");
  return formats;
}

/**
 * The counts that shrank more than 5%, as "fk kind: before -> after".
 * `skip` names kinds whose source file is missing this run (not compared);
 * `formatKeys`, when given, limits the check to a partial import's keys.
 */
export function shrinkProblems(before, now, { skip = [], formatKeys = null } = {}) {
  const problems = [];
  for (const [fk, prev] of Object.entries(before ?? {})) {
    if (formatKeys && !formatKeys.includes(fk)) continue;
    for (const k of ["players", "matches"]) {
      if (!prev?.[k] || skip.includes(k)) continue;
      const after = now[fk]?.[k] ?? 0;
      if (after < prev[k] * SHRINK_LIMIT) problems.push(`${fk} ${k}: ${prev[k]} -> ${after}`);
    }
  }
  return problems;
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
