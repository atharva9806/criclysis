/**
 * Replay engine tests on real matches (fixtures/data-out-v1/replays).
 *
 * __fixtures__/<id>.wincurve.json is pipeline/replay.py's win_curve, run on
 * the model reloaded from fixtures/data-out-v1/winprob.json (a scratch
 * model_from_json taking resources, dispersion, theta and firstInningsWin
 * verbatim). The TypeScript port evaluates the same numbers with the same
 * float64 operations, so the curve is held to 1e-9 (the contract asks 1e-6).
 *
 * When A1's fixtures/data-out exists, every replay there is also checked
 * against matches.json totals and A's 1384439.wincurve.json.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ReplayContext, SplitRow, TraitRow } from "../contract/db";
import type { Match, MatchesFile, Replay, WinModelJson, WinProbFile } from "../contract/pipeline";
import { WinModel } from "../winprob/model";
import {
  ballLabel,
  buildTimeline,
  chartSeries,
  currentPartnership,
  inningsTotals,
  outcomeOf,
  overBoundary,
  phaseFor,
  probabilityAt,
  replayStates,
  scorecardAt,
  stateAt,
  winCurve,
  winProbEligibility,
  type WinPoint,
} from "./engine";
import { matchupFor, squads } from "./matchup";

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(path(rel), "utf8")) as T;
const V1 = "../../../../fixtures/data-out-v1/";
const winprob = readJson<WinProbFile>(`${V1}winprob.json`);
const models = { odi: new WinModel(winprob.formats.odi as WinModelJson), t20i: new WinModel(winprob.formats.t20i as WinModelJson) };
const replay = (id: string) => readJson<Replay>(`${V1}replays/${id}.json`);
const FINAL_2023 = replay("1384439");
const FINAL_2024 = replay("1415755");
const TIE_2019 = replay("1144530");

const maxDiff = (a: WinPoint[], b: WinPoint[]) => {
  expect(a.length).toBe(b.length);
  let worst = 0;
  a.forEach((p, i) => {
    expect([p[0], p[1]]).toEqual([b[i][0], b[i][1]]);
    worst = Math.max(worst, Math.abs(p[2] - b[i][2]));
  });
  return worst;
};

describe("win curve against pipeline/replay.py", () => {
  for (const r of [FINAL_2023, FINAL_2024, TIE_2019]) {
    it(`${r.id} ${r.title} matches the Python reference`, () => {
      const ref = readJson<WinPoint[]>(`./__fixtures__/${r.id}.wincurve.json`);
      const curve = winCurve(r, models[r.format as "odi" | "t20i"]);
      const worst = maxDiff(curve, ref);
      console.info(`[wincurve] ${r.id}: ${curve.length} deliveries, max |dp| = ${worst.toExponential(2)}`);
      expect(worst).toBeLessThanOrEqual(1e-9);
    });
  }

  it("follows the 2023 final's documented swings (docs/WINPROB.md)", () => {
    const tl = buildTimeline(FINAL_2023);
    const curve = winCurve(FINAL_2023, models.odi);
    // P(India win) after Australia's 10th, 20th and 30th overs of the chase.
    const afterOver = (overs: number) => {
      const i = tl.deliveries.findIndex((d) => d.innings === 1 && d.legalBalls === overs * 6);
      return curve[i][2];
    };
    expect(afterOver(10)).toBeCloseTo(0.59, 2);
    expect(afterOver(20)).toBeCloseTo(0.34, 2);
    expect(afterOver(30)).toBeCloseTo(0.03, 2);
  });

  it("states after every delivery, wides and no-balls included", () => {
    const states = replayStates(FINAL_2024, 120);
    expect(states.length).toBe(FINAL_2024.innings[0].balls.length + FINAL_2024.innings[1].balls.length);
    expect(states.at(-1)).toMatchObject({ innings: 2, ballsLeft: 0, wickets: 8, runs: 169, target: 177 });
  });
});

describe("innings totals equal the official scores", () => {
  const cases: [Replay, [string, number, number, string][]][] = [
    [FINAL_2023, [["India", 240, 10, "50"], ["Australia", 241, 4, "43"]]],
    [FINAL_2024, [["India", 176, 7, "20"], ["South Africa", 169, 8, "20"]]],
    [TIE_2019, [["New Zealand", 241, 8, "50"], ["England", 241, 10, "50"]]],
  ];
  for (const [r, want] of cases) {
    it(`${r.id} ${r.title}`, () => {
      const got = inningsTotals(buildTimeline(r)).map((t) => [t.team, t.runs, t.wickets, t.overs]);
      expect(got).toEqual(want);
    });
  }

  const A1 = path("../../../../fixtures/data-out/");
  it.runIf(existsSync(`${A1}matches.json`))("every replay in fixtures/data-out matches matches.json", () => {
    const matches = new Map((JSON.parse(readFileSync(`${A1}matches.json`, "utf8")) as MatchesFile).matches.map((m): [string, Match] => [m.id, m]));
    const files = readdirSync(`${A1}replays`).filter((f) => f.endsWith(".json.gz"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const r = JSON.parse(gunzipSync(readFileSync(`${A1}replays/${f}`)).toString("utf8")) as Replay;
      const m = matches.get(r.id);
      expect(m, r.id).toBeDefined();
      const got = inningsTotals(buildTimeline(r)).map((t) => [t.team, t.runs, t.wickets, t.legalBalls]);
      expect(got, r.id).toEqual(m!.innings.map((i) => [i.team, i.runs, i.wickets, i.balls]));
    }
  });

  it.runIf(existsSync(`${A1}replays/1384439.wincurve.json`))("matches A's 1384439.wincurve.json to 1e-6", () => {
    const file = JSON.parse(readFileSync(`${A1}winprob.json`, "utf8")) as WinProbFile;
    const json = (file.formats["odi-m"] ?? file.formats.odi) as WinModelJson;
    const r = JSON.parse(gunzipSync(readFileSync(`${A1}replays/1384439.json.gz`)).toString("utf8")) as Replay;
    const ref = JSON.parse(readFileSync(`${A1}replays/1384439.wincurve.json`, "utf8")) as WinPoint[];
    expect(maxDiff(winCurve(r, new WinModel(json)), ref)).toBeLessThanOrEqual(1e-6);
  });
});

describe("scorecard", () => {
  const people = FINAL_2023.people;
  const name = (i: number | null) => (i == null ? null : people[i].name);
  const cards = scorecardAt(buildTimeline(FINAL_2023));

  it("reproduces the 2023 final's batting and bowling figures", () => {
    const bat = (team: number, who: string) => cards[team].batting.find((b) => name(b.person) === who)!;
    expect(bat(1, "TM Head")).toMatchObject({ runs: 137, balls: 120, fours: 15, sixes: 4 });
    expect(bat(1, "TM Head").dismissal?.label).toBe("caught b Mohammed Siraj");
    expect(bat(1, "M Labuschagne")).toMatchObject({ runs: 58, balls: 110, dismissal: null });
    expect(bat(0, "V Kohli")).toMatchObject({ runs: 54, balls: 63, dismissal: { kind: "bowled", label: "b PJ Cummins" } });
    expect(bat(0, "Kuldeep Yadav").dismissal).toMatchObject({ kind: "run out", bowler: null, label: "run out" });

    const bowl = (team: number, who: string) => cards[team].bowling.find((b) => name(b.person) === who)!;
    expect(bowl(0, "MA Starc")).toMatchObject({ overs: "10", maidens: 0, runs: 55, wickets: 3 });
    expect(bowl(0, "PJ Cummins")).toMatchObject({ overs: "10", runs: 34, wickets: 2 });
    expect(bowl(1, "JJ Bumrah")).toMatchObject({ overs: "9", maidens: 2, runs: 43, wickets: 2 });
  });

  it("adds up: bat runs plus extras is the total, and the bowlers' wickets plus run outs are the wickets", () => {
    for (const r of [FINAL_2023, FINAL_2024, TIE_2019]) {
      for (const c of scorecardAt(buildTimeline(r))) {
        expect(c.batting.reduce((s, b) => s + b.runs, 0) + c.extras.total).toBe(c.total.runs);
        const runOuts = c.batting.filter((b) => b.dismissal?.kind === "run out").length;
        expect(c.bowling.reduce((s, b) => s + b.wickets, 0) + runOuts).toBe(c.total.wickets);
        expect(c.fallOfWickets.length).toBe(c.total.wickets);
        expect(c.partnerships.reduce((s, p) => s + p.runs, 0)).toBe(c.total.runs - c.extras.penalty);
      }
    }
  });

  it("lists the fall of wickets and the record partnership", () => {
    expect(cards[1].fallOfWickets.map((f) => [f.wicket, f.runs, name(f.person), f.label])).toEqual([
      [1, 16, "DA Warner", "1.1"],
      [2, 41, "MR Marsh", "4.3"],
      [3, 47, "SPD Smith", "6.6"],
      [4, 239, "TM Head", "42.5"],
    ]);
    const best = cards[1].partnerships.reduce((a, b) => (b.runs > a.runs ? b : a));
    expect(best).toMatchObject({ wicket: 4, runs: 192, balls: 215, unbroken: false });
    expect(best.batters.map(name).sort()).toEqual(["M Labuschagne", "TM Head"]);
  });

  it("shows only what has happened by the cursor", () => {
    const tl = buildTimeline(FINAL_2023);
    const c = scorecardAt(tl, 10);
    expect(c).toHaveLength(1);
    expect(c[0].total.runs).toBe(tl.deliveries[9].runs);
    expect(c[0].batting.filter((b) => b.atCrease)).toHaveLength(2);
    expect(currentPartnership(c[0])).not.toBeNull();
  });
});

describe("match state", () => {
  const tl = buildTimeline(FINAL_2023);
  const breakAt = tl.innings[0].end;

  it("starts before the first ball with the openers in", () => {
    const s = stateAt(tl, 0);
    expect(s).toMatchObject({ innings: 0, runs: 0, wickets: 0, overs: "0", runRate: null, target: null, ballsLeft: 300 });
    expect(s.phase?.key).toBe("powerplay");
    expect([s.striker, s.nonStriker, s.bowler].map((i) => FINAL_2023.people[i!].name)).toEqual(["RG Sharma", "Shubman Gill", "MA Starc"]);
  });

  it("holds at the innings break", () => {
    const s = stateAt(tl, breakAt);
    expect(s).toMatchObject({ innings: 0, runs: 240, wickets: 10, inningsComplete: true, matchComplete: false, next: null });
    expect(stateAt(tl, breakAt + 1)).toMatchObject({ innings: 1, battingTeam: "Australia", target: 241, previous: [{ team: "India", runs: 240 }] });
  });

  it("computes run rate, what is needed and the required rate", () => {
    const i = tl.deliveries.findIndex((d) => d.innings === 1 && d.legalBalls === 60);
    const s = stateAt(tl, i + 1);
    expect(s).toMatchObject({ runs: 60, wickets: 3, overs: "10", need: 181, ballsLeft: 240 });
    expect(s.runRate).toBeCloseTo(6, 10);
    expect(s.requiredRate).toBeCloseTo(181 / 40, 10);
  });

  it("ends with the official result, not a probability", () => {
    const s = stateAt(tl, 1e9);
    expect(s).toMatchObject({ cursor: tl.deliveries.length, matchComplete: true, runs: 241, wickets: 4, need: 0 });
    expect(s.requiredRate).toBeNull();
  });

  it("steps over by over", () => {
    expect(overBoundary(tl, 0, 1)).toBe(6);
    expect(overBoundary(tl, 6, -1)).toBe(0);
    expect(overBoundary(tl, 8, -1)).toBe(6);
    expect(overBoundary(tl, tl.deliveries.length, 1)).toBe(tl.deliveries.length);
    // An over with a wide has seven deliveries.
    const tie = buildTimeline(TIE_2019);
    expect(overBoundary(tie, 0, 1)).toBe(7);
  });

  it("knows the phase of the innings", () => {
    expect([0, 9, 10, 39, 40, 49].map((o) => phaseFor("odi", o).key)).toEqual(["powerplay", "powerplay", "middle", "middle", "death", "death"]);
    expect([5, 6, 15].map((o) => phaseFor("t20i", o).key)).toEqual(["powerplay", "middle", "death"]);
  });

  it("labels balls for the ticker", () => {
    expect(ballLabel([0, 0, 1, 2, 0, 0, null, null, null]).text).toBe("•");
    expect(ballLabel([0, 0, 1, 2, 4, 0, null, null, null])).toMatchObject({ text: "4", tone: "boundary" });
    expect(ballLabel([0, 0, 1, 2, 0, 1, "wides", null, null])).toMatchObject({ text: "1wd", tone: "extra" });
    expect(ballLabel([0, 0, 1, 2, 4, 1, "noballs", null, null])).toMatchObject({ text: "5nb", description: "5 no-balls, 4 off the bat" });
    expect(ballLabel([0, 0, 1, 2, 0, 0, null, "caught", 0])).toMatchObject({ text: "W", tone: "wicket" });
  });
});

describe("display rules (§4.4)", () => {
  const odiJson = winprob.formats.odi as WinModelJson;

  it("allows full, decided limited-overs matches", () => {
    expect(winProbEligibility(FINAL_2023, odiJson)).toEqual({ ok: true });
    expect(winProbEligibility(FINAL_2024, models.t20i)).toEqual({ ok: true });
  });

  it("hides win probability for Tests, rain rules, shortened matches and missing models", () => {
    const why = (r: Replay, m: WinModelJson | null = odiJson) => {
      const e = winProbEligibility(r, m);
      return e.ok ? "ok" : e.reason;
    };
    expect(why({ ...FINAL_2023, format: "test" })).toMatch(/only for ODIs and T20Is/);
    expect(why({ ...FINAL_2023, method: "D/L" })).toMatch(/D\/L method/);
    expect(why({ ...FINAL_2023, result: "Australia won by 6 wickets (D/L method)" })).toMatch(/D\/L method/);
    expect(why({ ...FINAL_2023, scheduledOvers: 45 })).toMatch(/shortened to 45 overs/);
    const reduced = { ...FINAL_2023, innings: [FINAL_2023.innings[0], { ...FINAL_2023.innings[1], targetOvers: 38 }] };
    expect(why(reduced)).toMatch(/reduced to 38 overs/);
    expect(why({ ...FINAL_2023, formatKey: "odi-w", gender: "female" })).toMatch(/No win-probability model is available for odi-w/);
    expect(why(FINAL_2023, null)).toMatch(/No win-probability model/);
    expect(why(FINAL_2024)).toMatch(/No win-probability model is available for t20i-m/);
    expect(why({ ...FINAL_2023, winner: null, result: "No result" })).toMatch(/no result/);
  });

  it("shows the official result at the end of a tie, never the model's last probability", () => {
    const tl = buildTimeline(TIE_2019);
    const curve = winCurve(TIE_2019, models.odi);
    const ok = winProbEligibility(TIE_2019, odiJson);
    expect(ok.ok).toBe(true);
    // The model's last state reads as a New Zealand win (England 241/10 chasing 242).
    expect(curve.at(-1)![2]).toBe(1);
    const end = probabilityAt(tl, curve, models.odi, ok, tl.deliveries.length);
    expect(end).toEqual({ kind: "result", outcome: { kind: "tie", text: "Match tied (England won the Super Over)" } });
    const series = chartSeries(tl, curve, models.odi, tl.deliveries.length);
    expect(series.at(-1)!.p).toBeLessThan(1);
    expect(series).toHaveLength(curve.length); // the start point, minus the final delivery
    // One ball earlier the model is still shown.
    expect(probabilityAt(tl, curve, models.odi, ok, tl.deliveries.length - 1)).toEqual({ kind: "model", battingFirst: curve.at(-2)![2] });
  });

  it("ends a decided match on its winner", () => {
    const tl = buildTimeline(FINAL_2023);
    const curve = winCurve(FINAL_2023, models.odi);
    expect(outcomeOf(FINAL_2023)).toEqual({ kind: "win", winner: "Australia", text: "Australia won by 6 wickets" });
    expect(chartSeries(tl, curve, models.odi, 1e9).at(-1)!.p).toBe(0);
    const start = probabilityAt(tl, curve, models.odi, { ok: true }, 0);
    expect(start.kind === "model" && start.battingFirst).toBeCloseTo(models.odi.battingFirst(300, 0, 0), 15);
  });

  it("explains hidden probability", () => {
    const tl = buildTimeline(FINAL_2023);
    expect(probabilityAt(tl, null, null, { ok: false, reason: "why" }, 5)).toEqual({ kind: "hidden", reason: "why" });
  });
});

describe("player context", () => {
  const split = (subject: string, balls: number, label: string | null = null): SplitRow => ({
    discipline: "batting", dimension: "type", subject, label, balls, runs: balls, outs: 2, wickets: null, dots: 0,
    fours: 0, sixes: 0, innings: null, average: balls / 2, strikeRate: 100, economy: null, dotPct: 30, boundaryPct: 10,
  });
  const trait = (kind: "strength" | "weakness", text: string): TraitRow => ({
    kind, rank: 1, discipline: "batting", dimension: "Match phase", dimensionKey: "phase", subject: "Death", subjectKey: "death",
    metric: "strike_rate", metricLabel: "strike rate", value: 1, baseline: 1, cohortMedian: 1, percentile: 90, balls: 500,
    confidence: "high", higherIsBetter: true, text,
  });
  const kohli = FINAL_2023.people.findIndex((p) => p.name === "V Kohli");
  const starc = FINAL_2023.people.findIndex((p) => p.name === "MA Starc");
  const ctx: ReplayContext = {
    formatKey: "odi-m",
    model: null,
    datasetAsOf: "2026-08-22",
    thresholds: { minBallsSplit: 60, minBallsBowledSplit: 90 },
    people: [
      {
        id: FINAL_2023.people[kohli].id, name: "V Kohli", team: "India",
        player: { slug: "v-kohli-ba607b88", bowlingType: "rm", battingHand: "right" },
        traits: { strengths: [trait("strength", "Death: strike rate")], weaknesses: [trait("weakness", "Left-arm pace")] },
        batting: { vsType: [split("lf", 437)], vsTypePhase: [split("lf|middle", 40)], vsBowler: [split(FINAL_2023.people[starc].id, 70, "MA Starc")] },
      },
      {
        id: FINAL_2023.people[starc].id, name: "MA Starc", team: "Australia",
        player: { slug: "ma-starc-3fb19989", bowlingType: "lf", battingHand: "left" },
        traits: { strengths: [], weaknesses: [] },
        batting: { vsType: [], vsTypePhase: [], vsBowler: [] },
      },
    ],
  };

  it("builds the matchup card from the context and gates small samples", () => {
    const m = matchupFor(ctx, FINAL_2023, kohli, starc, phaseFor("odi", 20))!;
    expect(m.batter).toMatchObject({ name: "V Kohli", slug: "v-kohli-ba607b88", inDataset: true });
    expect(m.bowler).toMatchObject({ name: "MA Starc", type: "lf", typeLabel: "Left-arm fast" });
    expect(m.vsType?.balls).toBe(437);
    expect(m.vsTypePhase).toBeNull(); // 40 balls is below the 60-ball gate
    expect(m.vsBowler?.balls).toBe(70);
    expect(matchupFor(null, FINAL_2023, kohli, starc, null)).toBeNull();
  });

  it("lists both XIs with top strength and weakness when known", () => {
    const xi = squads(FINAL_2023, ctx);
    expect(xi.map((t) => [t.team, t.players.length])).toEqual([["India", 11], ["Australia", 11]]);
    const k = xi[0].players.find((p) => p.name === "V Kohli")!;
    expect([k.strength?.text, k.weakness?.text, k.inDataset]).toEqual(["Death: strike rate", "Left-arm pace", true]);
    expect(xi[0].players.find((p) => p.name === "RG Sharma")).toMatchObject({ strength: null, inDataset: false });
  });
});
