// Reads a pipeline output directory (docs/ARCHITECTURE.md §1) and normalises
// v1 output (the men's sample in fixtures/data-out-v1) to the v2 shapes.
//
// v1 has no schemaVersion, no gender and keys formats by "test" | "odi" |
// "t20i"; it is men's only, so every v1 format maps to `${fmt}-m`. Fields
// that §1 marks NEW are left absent when v1 does not carry them: nothing is
// invented. A missing file means that entity is skipped (with a warning) and
// none of its existing rows are deleted.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FMTS = ["test", "odi", "t20i"];
/** The literal values §1.3 gives for the thresholds that v1 lacks. */
const V2_THRESHOLD_DEFAULTS = { teamMinMatches: 5, venueMinInnings: 3 };

export const g = (gender) => (gender === "female" ? "w" : "m");
export const formatKeyOf = (fmt, gender) => `${fmt}-${g(gender)}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Re-key a v1 `{ test: x, odi: y }` record to `{ "test-m": x, ... }`; v2 records pass through. */
export function rekeyV1(record, extra = () => ({})) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (FMTS.includes(k)) out[`${k}-m`] = { ...v, ...extra(k) };
    else out[k] = v;
  }
  return out;
}

/** The manifest fields stored in dataset_meta, in the v2 shape. */
export function normaliseManifest(raw) {
  const version = raw.schemaVersion === undefined ? 1 : raw.schemaVersion;
  if (version !== 1 && version !== 2) throw new Error(`Unsupported manifest schemaVersion ${raw.schemaVersion}`);
  const formats = rekeyV1(raw.formats, (fmt) => ({ formatKey: `${fmt}-m`, format: fmt, gender: "male" }));
  return {
    version,
    buildId: raw.buildId ?? `${raw.generated}-v1`,
    generated: raw.generated,
    fingerprint: raw.fingerprint ?? null,
    playerCount: raw.playerCount,
    matchCount: raw.matchCount ?? null,
    stored: {
      formats,
      phases: raw.phases,
      bowlingTypes: raw.bowlingTypes,
      thresholds: { ...V2_THRESHOLD_DEFAULTS, ...raw.thresholds },
      sources: raw.sources,
      provenance: raw.provenance,
    },
  };
}

/**
 * Open a data directory. Returns the manifest plus lazy readers for every
 * entity; an entity whose file is missing is `null` and is listed in `missing`.
 */
export function openSource(dir, warn = () => {}) {
  const at = (...p) => join(dir, ...p);
  if (!existsSync(at("manifest.json"))) throw new Error(`No manifest.json in ${dir}`);
  const manifest = normaliseManifest(readJson(at("manifest.json")));
  const v1 = manifest.version === 1;
  if (v1) warn("v1 output (no schemaVersion): treating it as men's data and skipping the v2-only files");
  const missing = [];
  const optional = (rel, load) => {
    if (!existsSync(at(rel))) {
      missing.push(rel);
      warn(`${rel} not found: skipping it`);
      return null;
    }
    return load(at(rel));
  };

  const fingerprintFile = optional("fingerprint.json", readJson);
  const fingerprint = fingerprintFile?.combined ?? manifest.fingerprint ?? null;

  const cohorts = optional("cohorts.json", (p) => rekeyV1(readJson(p)));

  const playersIndex = optional("players.json", (p) => readJson(p).players);
  const readPlayer = (slug) => {
    const p = at("players", `${slug}.json`);
    return existsSync(p) ? readJson(p) : null;
  };

  const venues = optional("venues.json", (p) => {
    const raw = readJson(p).venues ?? {};
    const out = {};
    for (const [key, v] of Object.entries(raw)) out[key] = { ...v, key: v.key ?? key, formats: rekeyV1(v.formats) ?? {} };
    return out;
  });

  const matches = optional("matches.json", (p) => readJson(p).matches);

  const teamsIndex = optional("teams/index.json", (p) => readJson(p).teams);
  const teamFileIds = existsSync(at("teams"))
    ? readdirSync(at("teams"))
        .filter((f) => f.endsWith(".json") && f !== "index.json")
        .map((f) => f.slice(0, -".json".length))
        .sort()
    : [];
  const readTeam = (id) => {
    const p = at("teams", `${id}.json`);
    return existsSync(p) ? readJson(p) : null;
  };

  const winprob = optional("winprob.json", (p) => {
    const raw = readJson(p);
    const formats = {};
    for (const [k, m] of Object.entries(raw.formats ?? {})) {
      const fk = FMTS.includes(k) ? `${k}-m` : k;
      formats[fk] = { ...m, formatKey: m.formatKey ?? fk, gender: m.gender ?? (fk.endsWith("-w") ? "female" : "male") };
    }
    return { generatedFrom: raw.generatedFrom, holdoutFrom: raw.holdoutFrom, formats };
  });

  const replayIndex = optional("replays/index.json", (p) => {
    const raw = readJson(p);
    return (Array.isArray(raw) ? raw : (raw.replays ?? [])).map((r) => ({
      ...r,
      formatKey: r.formatKey ?? formatKeyOf(r.format, r.gender ?? "male"),
    }));
  });
  // v2 ships replays/<id>.json.gz; v1 ships plain replays/<id>.json.
  const replayFiles = existsSync(at("replays"))
    ? readdirSync(at("replays"))
        .map((f) => {
          const m = /^([^.]+)\.json(\.gz)?$/.exec(f);
          return m && f !== "index.json" ? { matchId: m[1], path: at("replays", f), gzipped: Boolean(m[2]) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : Number(b.gzipped) - Number(a.gzipped)))
        .filter((r, i, all) => i === 0 || all[i - 1].matchId !== r.matchId) // prefer .json.gz when both exist
    : null;
  if (replayFiles === null) {
    missing.push("replays/");
    warn("replays/ not found: skipping replays");
  }

  return {
    dir,
    manifest,
    fingerprint,
    missing,
    cohorts,
    playersIndex,
    readPlayer,
    venues,
    matches,
    teamsIndex,
    teamFileIds,
    readTeam,
    winprob,
    replayIndex,
    replayFiles,
  };
}
