/**
 * Every replay in a build, played through the engine, against what the rest
 * of the build records (the TypeScript half of `python -m pipeline
 * verify-replays`):
 * - each innings' team, total, wickets and legal balls, and its penalty runs,
 *   against matches.json, and the scorecard adding up to the same total with
 *   one fall of wicket per wicket;
 * - each bowler's balls, runs conceded, wickets and maidens in each innings
 *   against the bowling innings of their player file, for every player
 *   exported with bowling figures in the replay's formatKey.
 *
 * REPLAY_DATA_DIR selects the build directory (relative to the working
 * directory, like WINPROB_FILE for test:golden); the default is
 * fixtures/data-out. The daily refresh runs it on the full build.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isBall, type MatchesFile, type PlayerFile, type PlayersIndex, type Replay } from "../contract/pipeline";
import { buildTimeline, inningsTotals, scorecardAt } from "./engine";

const DEFAULT_DIR = fileURLToPath(new URL("../../../../fixtures/data-out", import.meta.url));
const dir = process.env.REPLAY_DATA_DIR ? resolve(process.cwd(), process.env.REPLAY_DATA_DIR) : DEFAULT_DIR;
// Skipped only when no directory was asked for and the fixture is absent; an
// explicit REPLAY_DATA_DIR without a build in it fails instead of passing.
const run = Boolean(process.env.REPLAY_DATA_DIR) || existsSync(`${DEFAULT_DIR}/matches.json`);

/**
 * fixtures/data-out's replays predate the extras breakdown (ball [9]) and can
 * only be regenerated from the archives the fixture was built from, which the
 * development sandbox cannot download. Until then three bowlers there are
 * charged byes or leg byes run off a no-ball. These are the only
 * disagreements (tests/test_contract.py pins the same ones); once the fixture
 * is regenerated there are none, and this list must go.
 */
const STALE_FIXTURE =
  resolve(dir) === resolve(DEFAULT_DIR)
    ? [
        "1448350: JE Root (a343262c) bowled [balls, runs, wickets, maidens] [[30,20,1,0],[54,66,1,1]] in the replay but [[30,20,1,0],[54,65,1,1]] in their player file",
        "1448352: JJ Bumrah (462411b3) bowled [balls, runs, wickets, maidens] [[198,116,2,5]] in the replay but [[198,112,2,5]] in their player file",
        "1449769: M Jansen (81c36ee9) bowled [balls, runs, wickets, maidens] [[84,50,3,5],[108,58,1,3]] in the replay but [[84,49,3,5],[108,58,1,3]] in their player file",
      ]
    : [];

const readJson = <T,>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
type Figures = [balls: number, runs: number, wickets: number, maidens: number];
const sorted = (rows: Figures[]) => JSON.stringify([...rows].sort((a, b) => a.join(",").localeCompare(b.join(","), "en", { numeric: true })));

describe(`every replay in ${dir}`, () => {
  it.runIf(run)("agrees with matches.json and the player files", { timeout: 60 * 60_000 }, () => {
    const matches = new Map(readJson<MatchesFile>(`${dir}/matches.json`).matches.map((m) => [m.id, m]));

    // match id -> person id -> each innings' figures, from the player files.
    const bowled = new Map<string, Map<string, Figures[]>>();
    const hasBowling = new Set<string>();
    for (const row of readJson<PlayersIndex>(`${dir}/players.json`).players) {
      const file = readJson<PlayerFile>(`${dir}/players/${row.slug}.json`);
      for (const fp of Object.values(file.formats)) {
        if (!fp?.bowling) continue;
        hasBowling.add(`${row.id}|${fp.formatKey}`);
        for (const i of fp.bowling.innings) {
          const byPerson = bowled.get(i.m) ?? new Map<string, Figures[]>();
          bowled.set(i.m, byPerson);
          byPerson.set(row.id, [...(byPerson.get(row.id) ?? []), [i.b, i.r, i.w, i.md]]);
        }
      }
    }

    const files = readdirSync(`${dir}/replays`).filter((f) => f.endsWith(".json.gz"));
    expect(files.length).toBeGreaterThan(0);
    const problems: string[] = [];
    let compared = 0;
    for (const f of files) {
      const r = JSON.parse(gunzipSync(readFileSync(`${dir}/replays/${f}`)).toString("utf8")) as Replay;
      const m = matches.get(r.id);
      if (!m) {
        problems.push(`${r.id}: the replay has no row in matches.json`);
        continue;
      }
      const bad = r.innings.reduce((n, inn) => n + inn.balls.filter((b) => !isBall(b)).length, 0);
      if (bad) {
        problems.push(`${r.id}: ${bad} malformed balls`);
        continue;
      }
      const tl = buildTimeline(r);
      const cards = scorecardAt(tl);
      const got = inningsTotals(tl).map((t, n) => [t.team, t.runs, t.wickets, t.legalBalls, (r.innings[n].penaltyRuns?.pre ?? 0) + (r.innings[n].penaltyRuns?.post ?? 0)]);
      const want = m.innings.map((i) => [i.team, i.runs, i.wickets, i.balls, i.penaltyRuns]);
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        problems.push(`${r.id}: innings [team, runs, wickets, legal balls, penalty runs] are ${JSON.stringify(got)} in the replay but ${JSON.stringify(want)} in matches.json`);
      }
      cards.forEach((c, n) => {
        const runs = c.batting.reduce((s, b) => s + b.runs, 0) + c.extras.total;
        if (runs !== m.innings[n]?.runs || c.fallOfWickets.length !== m.innings[n]?.wickets) {
          problems.push(`${r.id}: innings ${n + 1}'s scorecard adds up to ${runs} with ${c.fallOfWickets.length} falls of wicket; matches.json has ${m.innings[n]?.runs}/${m.innings[n]?.wickets}`);
        }
      });

      const figures = new Map<string, Figures[]>();
      for (const c of cards) {
        for (const b of c.bowling) {
          const pid = r.people[b.person]?.id || `~${r.people[b.person]?.name ?? ""}`;
          figures.set(pid, [...(figures.get(pid) ?? []), [b.legalBalls, b.runs, b.wickets, b.maidens]]);
        }
      }
      const fromFiles = bowled.get(r.id) ?? new Map<string, Figures[]>();
      const fk = r.formatKey ?? `${r.format}-${r.gender === "female" ? "w" : "m"}`;
      const names = new Map(r.people.map((p) => [p.id || `~${p.name}`, p.name]));
      for (const pid of [...new Set([...figures.keys(), ...fromFiles.keys()])].sort()) {
        // Only bowlers exported with bowling figures in this formatKey can be compared.
        if (!fromFiles.has(pid) && !hasBowling.has(`${pid}|${fk}`)) continue;
        compared += 1;
        const a = sorted(figures.get(pid) ?? []);
        const b = sorted(fromFiles.get(pid) ?? []);
        if (a !== b) problems.push(`${r.id}: ${names.get(pid) ?? pid} (${pid}) bowled [balls, runs, wickets, maidens] ${a} in the replay but ${b} in their player file`);
      }
    }
    console.info(`[replays] ${files.length} replays, ${compared} bowling innings compared, ${problems.length} problems`);
    if (problems.length > STALE_FIXTURE.length) console.error(problems.slice(0, 20).join("\n"));
    expect(compared).toBeGreaterThan(0);
    expect(problems.slice(0, 20), `${problems.length} problems`).toEqual(STALE_FIXTURE);
    expect(problems.length).toBe(STALE_FIXTURE.length);
  });
});
