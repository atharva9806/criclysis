// End-to-end tests of the importer, check-fingerprint and the data layer
// against a real Postgres. Opt-in, because it WIPES the database it is given:
//
//   IMPORT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/scratch \
//     npx vitest run scripts/import/import.int.test.mjs
//
// The builds are SYNTHETIC v2-shaped data made from fixtures/data-out-v1 for
// these tests only (team records and matches are invented around the real
// player files and replays); they are never imported anywhere else.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.IMPORT_TEST_DATABASE_URL;
const WEB = fileURLToPath(new URL("../../", import.meta.url));
const V1 = join(WEB, "../fixtures/data-out-v1");
const IMPORTER = join(WEB, "scripts/import/index.mjs");
const CHECK = join(WEB, "scripts/import/check-fingerprint.mjs");
const TABLES = [
  "players", "career_stats", "innings", "yearly_stats", "splits", "traits", "profile_dimensions", "dismissal_counts",
  "teams", "team_summaries", "venues", "matches", "match_replays", "win_models",
];

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o));

/** A synthetic v2 build. `clones` adds that many copies of a v1 player under new ids. */
function makeBuild(dir, { buildId, fingerprint, clones = 0, badClone = -1 }) {
  rmSync(dir, { recursive: true, force: true });
  for (const d of ["players", "teams", "replays"]) mkdirSync(join(dir, d), { recursive: true });
  const man = readJson(join(V1, "manifest.json"));
  const formats = {};
  for (const [fmt, f] of Object.entries(man.formats)) formats[`${fmt}-m`] = { ...f, formatKey: `${fmt}-m`, format: fmt, gender: "male" };
  formats["odi-w"] = { ...formats["odi-m"], formatKey: "odi-w", gender: "female", label: "ODI" };
  writeJson(join(dir, "manifest.json"), {
    ...man,
    schemaVersion: 2,
    buildId,
    fingerprint,
    matchCount: 4,
    formats,
    thresholds: { ...man.thresholds, teamMinMatches: 5, venueMinInnings: 3 },
    provenance: { ...man.provenance, identity: { ambiguousNames: 0, stylesSkippedAmbiguous: 0 } },
  });
  writeJson(join(dir, "fingerprint.json"), { archives: {}, combined: fingerprint });
  const cohorts = readJson(join(V1, "cohorts.json"));
  writeJson(join(dir, "cohorts.json"), Object.fromEntries(Object.entries(cohorts).map(([k, v]) => [`${k}-m`, v])));

  const index = readJson(join(V1, "players.json")).players.map((p) => ({ ...p, gender: "male" }));
  for (const p of index) {
    const f = readJson(join(V1, "players", `${p.slug}.json`));
    f.gender = "male";
    writeJson(join(dir, "players", `${p.slug}.json`), f);
  }
  const zampa = index.find((p) => p.id === "14f96089");
  for (let i = 0; i < clones; i++) {
    const id = `c${i.toString(16).padStart(7, "0")}`;
    const slug = `clone-${id}`;
    const f = readJson(join(V1, "players", `${zampa.slug}.json`));
    Object.assign(f, { id, slug, name: `Clone ${i}`, gender: "male" });
    // A value outside smallint makes this player's batch fail at insert time.
    if (i === badClone) f.formats.odi.batting.innings[0].r = 99999;
    writeJson(join(dir, "players", `${slug}.json`), f);
    index.push({ ...zampa, id, slug, name: `Clone ${i}` });
  }
  writeJson(join(dir, "players.json"), { players: index });

  const venue = (key, city, country) => ({ key, name: key, city, country, formats: { "odi-m": { matches: 3, runsPerOver: 5, ballsPerWicket: 30, firstInnings: { n: 3, avg: 250 } } } });
  writeJson(join(dir, "venues.json"), { venues: { "Lord's": venue("Lord's", "London", "England"), "Eden Gardens": venue("Eden Gardens", "Kolkata", "India") } });

  const tid = (name, g) => `${name.toLowerCase().replace(/ /g, "-")}-${g}`;
  const match = (id, fk, date, t1, t2, winner, hasReplay) => {
    const g = fk.endsWith("-w") ? "w" : "m";
    return {
      id, gender: g === "w" ? "female" : "male", format: fk.split("-")[0], formatKey: fk, matchTypeNumber: null,
      startDate: date, endDate: date, season: date.slice(0, 4), event: { name: "Test Cup", stage: null, matchNumber: null, group: null },
      venue: "Lord's", venueKey: "Lord's", city: "London", country: "England",
      teams: [{ id: tid(t1, g), name: t1 }, { id: tid(t2, g), name: t2 }], toss: { winner: t1, decision: "bat" },
      result: { type: "win", winner, winnerId: tid(winner, g), by: { runs: 1 }, method: null, eliminator: null, text: `${winner} won by 1 run` },
      playerOfMatch: [], scheduledOvers: 50, innings: [], missing: [], hasReplay, featuredRank: null,
    };
  };
  writeJson(join(dir, "matches.json"), {
    schemaVersion: 2,
    matches: [
      match("1415755", "t20i-m", "2024-06-29", "India", "South Africa", "India", true),
      match("1384439", "odi-m", "2023-11-19", "India", "Australia", "Australia", true),
      match("900002", "odi-w", "2021-01-01", "Australia", "India", "Australia", false),
      match("1144530", "odi-m", "2019-07-14", "New Zealand", "England", "England", true),
    ],
  });

  const rec = (m, w, l) => ({ matches: m, won: w, lost: l, tied: 0, drawn: 0, noResult: m - w - l, winPct: w + l ? (100 * w) / (w + l) : null });
  const tf = (fk, oppId, opp) => ({
    formatKey: fk, span: { first: "2019-01-01", last: "2024-06-29" }, record: rec(6, 3, 2), byYear: [],
    headToHead: [{ opponentId: oppId, opponent: opp, lastMatchId: "x", lastDate: "2024-01-01", ...rec(3, 1, 2) }],
    venueType: { home: rec(6, 3, 2), away: rec(0, 0, 0), neutral: rec(0, 0, 0), unknown: rec(0, 0, 0) },
    batFirstChase: { battingFirst: rec(6, 3, 2), chasing: rec(0, 0, 0) },
    toss: { won: 3, lost: 3, winPctWonToss: 50, winPctLostToss: 50, decisions: { bat: rec(3, 1, 1), field: rec(0, 0, 0) } },
    venues: [], phases: { batting: [], bowling: [] }, topBatters: [], topBowlers: [], recentMatchIds: [],
  });
  const teams = [];
  const teamDefs = [
    ["India", "m", ["odi", "t20i"], "australia-m", "Australia"],
    ["Australia", "m", ["odi", "t20i"], "india-m", "India"],
    ["England", "m", ["odi"], "new-zealand-m", "New Zealand"],
    ["New Zealand", "m", ["odi"], "england-m", "England"],
    ["South Africa", "m", ["t20i"], "india-m", "India"],
    ["Australia", "w", ["odi"], "india-w", "India Women"],
    ["India", "w", ["odi"], "australia-w", "Australia Women"],
  ];
  for (const [name, g, fmts, oppId, opp] of teamDefs) {
    const id = tid(name, g);
    const label = g === "w" ? `${name} Women` : name;
    const fmtsObj = Object.fromEntries(fmts.map((f) => [f, tf(`${f}-${g}`, oppId, opp)]));
    writeJson(join(dir, "teams", `${id}.json`), { schemaVersion: 2, id, name, gender: g === "w" ? "female" : "male", label, formats: fmtsObj });
    teams.push({ id, name, gender: g === "w" ? "female" : "male", label, formats: Object.fromEntries(fmts.map((f) => [f, { ...rec(6, 3, 2), first: "2019-01-01", last: "2024-06-29" }])) });
  }
  writeJson(join(dir, "teams", "index.json"), { schemaVersion: 2, teams });

  const wp = readJson(join(V1, "winprob.json"));
  writeJson(join(dir, "winprob.json"), {
    schemaVersion: 2, generatedFrom: wp.generatedFrom, holdoutFrom: wp.holdoutFrom,
    formats: Object.fromEntries(Object.entries(wp.formats).map(([k, v]) => [`${k}-m`, { ...v, formatKey: `${k}-m`, gender: "male" }])),
  });
  writeJson(join(dir, "replays", "index.json"), readJson(join(V1, "replays", "index.json")));
  for (const id of ["1384439", "1415755", "1144530"]) {
    writeFileSync(join(dir, "replays", `${id}.json.gz`), gzipSync(readFileSync(join(V1, "replays", `${id}.json`)), { level: 6 }));
  }
  return dir;
}

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: WEB, env: { ...process.env, DATABASE_URL: DB_URL }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const importBuild = (dir, ...args) => run(IMPORTER, ["--data", dir, ...args]);

describe.skipIf(!DB_URL)("importer, check-fingerprint and data layer against Postgres", () => {
  let client;
  let data;
  let pool;
  let tmp;
  const q = async (text, params) => (await client.query(text, params)).rows;
  const tableCounts = async () => {
    const out = {};
    for (const t of TABLES) out[t] = (await q(`SELECT count(*)::int AS n FROM ${t}`))[0].n;
    return out;
  };
  const latestRun = async () => (await q(`SELECT status, build_id, changes, error FROM dataset_meta ORDER BY id DESC LIMIT 1`))[0];

  async function resetDb() {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
    const dir = join(WEB, "drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.query(stmt);
    }
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    await resetDb();
    tmp = mkdtempSync(join(tmpdir(), "criclysis-import-test-"));
    process.env.DATABASE_URL = DB_URL;
    data = await import("@/lib/data");
    ({ pool } = await import("@/db"));
  });

  afterAll(async () => {
    await pool?.end();
    await client?.end();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("imports a v2 build, then re-imports it with no changes", () => {
    const a = makeBuild(join(tmp, "a"), { buildId: "build-a", fingerprint: "sha256:aaaa" });
    expect(importBuild(a).code).toBe(0);
    const second = importBuild(a);
    expect(second.code).toBe(0);
    expect(second.out).toMatch(/changes: none/);
  });

  it("refuses builds that would empty teams, team summaries, venues, models or replays", async () => {
    const before = await tableCounts();
    expect(before).toMatchObject({ teams: 7, team_summaries: 9, venues: 2, win_models: 2, match_replays: 3 });
    const cases = [
      ["no teams", (d) => {
        writeJson(join(d, "teams", "index.json"), { schemaVersion: 2, teams: [] });
        for (const f of readdirSync(join(d, "teams"))) if (f !== "index.json") unlinkSync(join(d, "teams", f));
      }, ["teams: 7 -> 0", "odi-m teamSummaries: 4 -> 0", "odi-w teamSummaries: 2 -> 0"]],
      ["no venues", (d) => writeJson(join(d, "venues.json"), { venues: {} }), ["venues: 2 -> 0"]],
      ["no models", (d) => writeJson(join(d, "winprob.json"), { ...readJson(join(d, "winprob.json")), formats: {} }), ["odi-m winModels: 1 -> 0", "t20i-m winModels: 1 -> 0"]],
      ["no replay files", (d) => {
        for (const f of readdirSync(join(d, "replays"))) if (f.endsWith(".gz")) unlinkSync(join(d, "replays", f));
      }, ["3 matches marked hasReplay have no file in replays/ (1144530, 1384439, 1415755)"]],
    ];
    for (const [name, mutate, expected] of cases) {
      const d = makeBuild(join(tmp, name.replace(/ /g, "-")), { buildId: "build-a", fingerprint: "sha256:aaaa" });
      mutate(d);
      const r = importBuild(d);
      expect(r.code, name).toBe(1);
      expect(r.err, name).toMatch(/Shrink guard/);
      for (const e of expected) expect(r.err, name).toContain(e);
      expect(await tableCounts(), name).toEqual(before);
      const failed = await latestRun();
      expect(failed.status, name).toBe("failed");
      expect(failed.changes, name).toEqual({});
    }
    // The operator can accept the loss explicitly; then the deletions go through.
    const noReplays = join(tmp, "no-replay-files");
    const forced = importBuild(noReplays, "--allow-shrink");
    expect(forced.code).toBe(0);
    expect((await tableCounts()).match_replays).toBe(0);
    expect(importBuild(join(tmp, "a")).code).toBe(0); // restore
    expect((await tableCounts()).match_replays).toBe(3);
  });

  it("records --format-keys runs as partial, which never become the active dataset or fingerprint baseline", async () => {
    const b = makeBuild(join(tmp, "b"), { buildId: "build-b", fingerprint: "sha256:bbbb" });
    const kohli = join(b, "players", "v-kohli-ba607b88.json");
    const k = readJson(kohli);
    k.formats.odi.batting.innings[0].r += 1;
    writeJson(kohli, k);

    const partial = importBuild(b, "--format-keys", "odi-m");
    expect(partial.code).toBe(0);
    expect(partial.out).toMatch(/partial import/);
    expect(await latestRun()).toMatchObject({ status: "partial", build_id: "build-b" });
    expect(run(CHECK, [join(b, "fingerprint.json")]).out.trim()).toBe("changed");
    expect(run(CHECK, [join(tmp, "a", "fingerprint.json")]).out.trim()).toBe("unchanged");
    expect((await data.getDatasetMeta()).buildId).toBe("build-a");

    // The next full run of the same build completes it and takes over.
    const full = importBuild(b);
    expect(full.code).toBe(0);
    expect(await latestRun()).toMatchObject({ status: "complete", build_id: "build-b" });
    expect(run(CHECK, [join(b, "fingerprint.json")]).out.trim()).toBe("unchanged");
    expect((await data.getDatasetMeta()).buildId).toBe("build-b");
  });

  it("reports the true total for a page past the end of the player list", async () => {
    const all = await data.listPlayers({ pageSize: 50 });
    expect(all.total).toBe(6);
    const past = await data.listPlayers({ page: 2, pageSize: 50 });
    expect(past.rows).toEqual([]);
    expect(past.total).toBe(6);
    const filtered = await data.listPlayers({ search: "kohli", page: 3 });
    expect(filtered).toMatchObject({ rows: [], total: 1, page: 3 });
  });

  it("builds a matchup plan for the requested format only", async () => {
    // Both women's teams play ODIs only: no plan for T20Is, rather than an ODI plan under a T20I request.
    expect(await data.buildMatchupPlan("australia-w", "india-w", "t20i")).toBeNull();
    const odi = await data.buildMatchupPlan("australia-w", "india-w", "odi");
    expect(odi.formatKey).toBe("odi-w");
    expect(odi.recent.map((m) => m.formatKey)).toEqual(["odi-w"]);
    // One team lacks the format; mixed genders.
    expect(await data.buildMatchupPlan("india-m", "england-m", "t20i")).toBeNull();
    expect(await data.buildMatchupPlan("india-m", "australia-w", "odi")).toBeNull();
    const t20 = await data.buildMatchupPlan("india-m", "australia-m", "t20i");
    expect(t20.formatKey).toBe("t20i-m");
    expect(t20.headToHead?.opponentId).toBe("australia-m");
  });

  it("counts only committed work when a run fails part-way", async () => {
    await resetDb();
    // 6 real + 120 cloned players: batches of 50 commit until the bad clone's batch (players 101-126).
    const c = makeBuild(join(tmp, "c"), { buildId: "build-c", fingerprint: "sha256:cccc", clones: 120, badClone: 100 });
    const r = importBuild(c);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/out of range for type smallint/);
    const failed = await latestRun();
    expect(failed.status).toBe("failed");
    const counts = await tableCounts();
    expect(counts.players).toBe(100);
    // From an empty database, every table holds exactly what the failed run says it inserted.
    for (const t of TABLES) {
      const c2 = failed.changes[t] ?? { inserted: 0, updated: 0, deleted: 0 };
      expect(c2.inserted - c2.deleted, t).toBe(counts[t]);
    }
  });
});
