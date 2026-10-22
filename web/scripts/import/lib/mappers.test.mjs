import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha1, stableStringify } from "./hash.mjs";
import { mapMatch, mapPlayer, mapPlayerFormat, mapTeam, mapTeamSummary, mapVenue, mapWinModel, replayStats } from "./mappers.mjs";
import { normaliseManifest, openSource, rekeyV1 } from "./source.mjs";

const V1 = fileURLToPath(new URL("../../../../fixtures/data-out-v1/", import.meta.url));
const read = (rel) => JSON.parse(readFileSync(V1 + rel, "utf8"));
const kohli = read("players/v-kohli-ba607b88.json");
const index = read("players.json").players;
const kohliIndex = index.find((p) => p.id === "ba607b88");
const thresholds = normaliseManifest(read("manifest.json")).stored.thresholds;

describe("hash", () => {
  it("stable-stringifies with sorted keys at every level", () => {
    expect(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
    expect(sha1({ a: 1, b: 2 })).toBe(sha1({ b: 2, a: 1 }));
    expect(sha1({ a: 1 })).not.toBe(sha1({ a: 2 }));
  });

  it("drops undefined members like JSON.stringify", () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe("source normalisation (v1 tolerance)", () => {
  it("re-keys v1 formats to men's formatKeys and fills the §1.3 threshold constants", () => {
    const m = normaliseManifest(read("manifest.json"));
    expect(m.version).toBe(1);
    expect(Object.keys(m.stored.formats).sort()).toEqual(["odi-m", "t20i-m", "test-m"]);
    expect(m.stored.formats["odi-m"]).toMatchObject({ formatKey: "odi-m", format: "odi", gender: "male", matches: 2548 });
    expect(m.stored.thresholds).toMatchObject({ minBallsSplit: 60, minBallsBowledSplit: 90, teamMinMatches: 5, venueMinInnings: 3 });
    expect(m.buildId).toBe("2026-08-22T12:46:29+00:00-v1");
  });

  it("leaves v2 keys alone and refuses unknown schema versions", () => {
    expect(rekeyV1({ "odi-w": { n: 1 } })).toEqual({ "odi-w": { n: 1 } });
    expect(() => normaliseManifest({ schemaVersion: 3 })).toThrow(/schemaVersion/);
  });

  it("opens the v1 fixture, skipping the v2-only files with warnings", () => {
    const warnings = [];
    const src = openSource(V1, (w) => warnings.push(w));
    expect(src.matches).toBeNull();
    expect(src.teamsIndex).toBeNull();
    expect(src.missing).toEqual(expect.arrayContaining(["matches.json", "teams/index.json", "venues.json"]));
    expect(Object.keys(src.winprob.formats).sort()).toEqual(["odi-m", "t20i-m"]);
    expect(src.winprob.formats["odi-m"]).toMatchObject({ formatKey: "odi-m", gender: "male" });
    expect(src.replayFiles.map((r) => r.matchId).sort()).toEqual(["1144530", "1384439", "1415755"]);
    expect(src.replayIndex[0].formatKey).toBe("odi-m");
    expect(Object.keys(src.cohorts)).toEqual(expect.arrayContaining(["test-m", "odi-m", "t20i-m"]));
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("mapPlayer", () => {
  it("maps meta, defaults v1 gender to male and sums sampleBalls when absent", () => {
    const row = mapPlayer(kohli, kohliIndex);
    expect(row).toMatchObject({
      source_id: "ba607b88",
      slug: "v-kohli-ba607b88",
      name: "V Kohli",
      full_name: "Virat Kohli",
      gender: "male",
      teams: ["India"],
      team_ids: [],
      born: null, // "" in the file
      debut: "2008-08-18",
      last_played: "2026-01-18",
      bowling_type: "rm",
    });
    const f = kohliIndex.formats;
    expect(row.sample_balls).toBe(f.test.bat.balls + f.odi.bat.balls + f.odi.bowl.balls + f.t20i.bat.balls);
    expect(row.content_hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("prefers v2 sampleBalls and teamIds when present", () => {
    const row = mapPlayer({ ...kohli, gender: "male", meta: { ...kohli.meta, teamIds: ["india-m"] } }, { ...kohliIndex, sampleBalls: 7 });
    expect(row.sample_balls).toBe(7);
    expect(row.team_ids).toEqual(["india-m"]);
  });
});

describe("mapPlayerFormat", () => {
  const odi = kohli.formats.odi;
  const pf = mapPlayerFormat("odi", odi, "male", thresholds);

  it("derives the formatKey from the player's gender", () => {
    expect(pf.formatKey).toBe("odi-m");
    expect(mapPlayerFormat("odi", odi, "female", thresholds).formatKey).toBe("odi-w");
  });

  it("builds career_stats from overall, milestones and the innings (maidens)", () => {
    const bo = odi.batting.overall;
    const wo = odi.bowling.overall;
    expect(pf.career).toMatchObject({
      matches: null, // NEW in v2; v1 has no XI count
      bat_innings: bo.innings,
      runs: 14675,
      balls: bo.balls,
      outs: bo.outs,
      not_outs: odi.batting.milestones.notOuts,
      highest: 183,
      highest_not_out: false,
      hundreds: 54,
      fifties: 75,
      bat_avg: 58.47,
      bat_sr: 93.76,
      bowl_balls: wo.balls,
      wickets: 5,
      runs_conceded: wo.runs,
      maidens: odi.bowling.innings.reduce((s, i) => s + i.md, 0),
      best_wickets: 1,
      best_runs: 13,
      bowl_econ: wo.econ,
      strengths: odi.strengths.length,
      weaknesses: odi.weaknesses.length,
    });
  });

  it("keeps one innings row per batting and bowling innings", () => {
    const bat = pf.innings.filter((r) => r.discipline === "batting");
    const bowl = pf.innings.filter((r) => r.discipline === "bowling");
    expect(bat).toHaveLength(odi.batting.innings.length);
    expect(bowl).toHaveLength(odi.bowling.innings.length);
    expect(bat[0]).toMatchObject({ match_id: "343732", played_on: "2008-08-18", opponent: "Sri Lanka", runs: 12, balls_faced: 22, out: true, position: 3, innings_no: 1, dismissal: "lbw", dismissed_by_id: null, wickets: null });
    const notOut = bat.find((r) => !r.out);
    expect(notOut.dismissal).toBeNull();
    expect(bowl[0]).toMatchObject({ discipline: "bowling", balls_bowled: 18, runs_conceded: 21, wickets: 0, maidens: 0, runs: null, innings_no: null });
  });

  it("gates splits at the display thresholds and drops overall and byYear", () => {
    expect(pf.splits.every((s) => s.balls >= (s.discipline === "batting" ? 60 : 90))).toBe(true);
    const venues = Object.values(odi.batting.byVenue).filter((s) => s.balls >= 60).length;
    expect(pf.splits.filter((s) => s.dimension === "venue")).toHaveLength(venues);
    expect(pf.splits.some((s) => s.dimension === "year" || s.dimension === "overall")).toBe(false);
    const lb = pf.splits.find((s) => s.dimension === "type" && s.subject === "lb");
    expect(lb).toMatchObject({ discipline: "batting", balls: 1584, runs: 1582, outs: 25, wickets: null, innings: null, label: null });
    const pos = pf.splits.find((s) => s.dimension === "position" && s.subject === "3");
    expect(pos.innings).toBe(odi.batting.byPosition["3"].innings);
    const hand = pf.splits.find((s) => s.discipline === "bowling" && s.dimension === "hand" && s.subject === "left");
    expect(hand).toMatchObject({ wickets: 2, outs: null, balls: 163 });
  });

  it("keeps the vsBowler name as the label when the pipeline provides one (v2)", () => {
    const v2 = { ...odi, batting: { ...odi.batting, vsBowler: { "14f96089": { ...odi.batting.vsBowler["A Zampa"], name: "A Zampa" } } } };
    const row = mapPlayerFormat("odi", v2, "male", thresholds).splits.find((s) => s.dimension === "vsBowler");
    expect(row).toMatchObject({ subject: "14f96089", label: "A Zampa" });
  });

  it("builds yearly_stats from byYear and counts innings per year", () => {
    const y2008 = pf.yearly.find((y) => y.year === 2008);
    expect(y2008).toMatchObject({ runs: 159, balls: 239, outs: 5, bowl_balls: null });
    expect(y2008.bat_innings).toBe(odi.batting.innings.filter((i) => i.d.startsWith("2008")).length);
    expect(pf.yearly.reduce((s, y) => s + (y.runs ?? 0), 0)).toBe(14675);
    const y2009 = pf.yearly.find((y) => y.year === 2009);
    expect(y2009.bowl_balls).toBe(18);
  });

  it("maps dismissals, traits (ranked) and profile axes", () => {
    expect(pf.dismissals).toContainEqual({ discipline: "batting", kind: "how", subject: "caught", count: 171 });
    expect(pf.dismissals).toContainEqual({ discipline: "batting", kind: "byType", subject: "rfm", count: 89 });
    expect(pf.dismissals).toContainEqual({ discipline: "bowling", kind: "wicketKind", subject: "bowled", count: 2 });
    expect(pf.traits.filter((t) => t.kind === "strength").map((t) => t.rank)).toEqual(odi.strengths.map((_, i) => i + 1));
    expect(pf.traits[0]).toMatchObject({ claim_id: "batting.phase.death", dimension_key: "phase", subject_key: "death", metric: "strike_rate", value: 148.34, cohort_median: 103.52, higher_is_better: true });
    expect(pf.profile).toHaveLength(Object.keys(odi.profile).length);
    expect(pf.profile[0]).toMatchObject({ axis: "runScoring", label: "Run scoring", percentile: 99 });
  });

  it("hashes stats and analysis separately", () => {
    const again = mapPlayerFormat("odi", structuredClone(odi), "male", thresholds);
    expect(again.statsHash).toBe(pf.statsHash);
    expect(again.analysisHash).toBe(pf.analysisHash);
    const moreRuns = structuredClone(odi);
    moreRuns.batting.innings[0].r += 1;
    const a = mapPlayerFormat("odi", moreRuns, "male", thresholds);
    expect(a.statsHash).not.toBe(pf.statsHash);
    expect(a.analysisHash).toBe(pf.analysisHash);
    const newClaim = structuredClone(odi);
    newClaim.strengths[0].percentile = 50;
    const b = mapPlayerFormat("odi", newClaim, "male", thresholds);
    expect(b.statsHash).toBe(pf.statsHash);
    expect(b.analysisHash).not.toBe(pf.analysisHash);
  });

  it("handles a format with no bowling", () => {
    const t = mapPlayerFormat("test", kohli.formats.test, "male", thresholds);
    expect(t.career).toMatchObject({ bowl_balls: null, wickets: null, maidens: null, bowl_econ: null });
    expect(t.innings.every((r) => r.discipline === "batting")).toBe(true);
  });
});

// A v2 Match (§1.6) for the 2023 ODI World Cup final; the scores and toss
// match fixtures/data-out-v1/replays/1384439.json.
const final2023 = {
  id: "1384439",
  gender: "male",
  format: "odi",
  formatKey: "odi-m",
  matchTypeNumber: null,
  startDate: "2023-11-19",
  endDate: "2023-11-19",
  season: "2023/24",
  event: { name: "ICC Cricket World Cup", stage: "Final", matchNumber: null, group: null },
  venue: "Narendra Modi Stadium, Ahmedabad",
  venueKey: "Narendra Modi Stadium",
  city: "Ahmedabad",
  country: "India",
  teams: [
    { id: "india-m", name: "India" },
    { id: "australia-m", name: "Australia" },
  ],
  toss: { winner: "Australia", decision: "field" },
  result: { type: "win", winner: "Australia", winnerId: "australia-m", by: { wickets: 6 }, method: null, eliminator: null, text: "Australia won by 6 wickets" },
  playerOfMatch: [],
  scheduledOvers: 50,
  innings: [
    { team: "India", teamId: "india-m", runs: 240, wickets: 10, balls: 300, overs: "50", declared: false, target: null, penaltyRuns: 0 },
    { team: "Australia", teamId: "australia-m", runs: 241, wickets: 4, balls: 258, overs: "43", declared: false, target: { runs: 241, overs: 50 }, penaltyRuns: 0 },
  ],
  missing: [],
  hasReplay: true,
  featuredRank: null,
};

describe("mapMatch", () => {
  it("flattens teams, toss, result and margins", () => {
    const row = mapMatch(final2023, 1);
    expect(row).toMatchObject({
      id: "1384439",
      format_key: "odi-m",
      event_name: "ICC Cricket World Cup",
      event_stage: "Final",
      team1_id: "india-m",
      team2: "Australia",
      toss_winner: "Australia",
      toss_decision: "field",
      result_type: "win",
      winner_id: "australia-m",
      margin_wickets: 6,
      margin_runs: null,
      margin_innings: false,
      result_text: "Australia won by 6 wickets",
      scheduled_overs: 50,
      has_replay: true,
      featured_rank: 1, // from replays/index.json when matches.json has none
    });
    expect(row.innings).toHaveLength(2);
  });

  it("keeps the pipeline's featuredRank over the index position, and marks innings wins", () => {
    expect(mapMatch({ ...final2023, featuredRank: 4 }, 1).featured_rank).toBe(4);
    const inningsWin = { ...final2023, result: { ...final2023.result, by: { innings: 1, runs: 12 } } };
    expect(mapMatch(inningsWin)).toMatchObject({ margin_innings: true, margin_runs: 12, margin_wickets: null, featured_rank: null });
  });

  it("changes its hash when any field changes", () => {
    expect(mapMatch(final2023).content_hash).toBe(mapMatch(structuredClone(final2023)).content_hash);
    expect(mapMatch({ ...final2023, missing: ["player_of_match"] }).content_hash).not.toBe(mapMatch(final2023).content_hash);
  });
});

// A minimal v2 TeamFormat (§1.7) with invented counts: this only exercises the mapping.
const record = (n) => ({ matches: n, won: n - 1, lost: 1, tied: 0, drawn: 0, noResult: 0, winPct: (100 * (n - 1)) / n });
const teamFormat = {
  formatKey: "t20i-w",
  span: { first: "2010-01-01", last: "2020-01-01" },
  record: record(10),
  byYear: [],
  headToHead: [],
  venueType: { home: record(5), away: record(5), neutral: record(1), unknown: record(1) },
  batFirstChase: { battingFirst: record(5), chasing: record(5) },
  toss: { won: 5, lost: 5, winPctWonToss: 80, winPctLostToss: 100, decisions: { bat: record(2), field: record(3) } },
  venues: [],
  phases: { batting: [], bowling: [] },
  topBatters: [],
  topBowlers: [],
  recentMatchIds: ["1", "2"],
};

describe("mapTeam and mapTeamSummary", () => {
  it("builds a teams row from an index entry", () => {
    const row = mapTeam({
      id: "example-w",
      name: "Example",
      gender: "female",
      label: "Example Women",
      formats: { odi: { ...record(4), first: "2012-05-01", last: "2019-02-01" }, t20i: { ...record(10), first: "2010-01-01", last: "2020-01-01" } },
    });
    expect(row).toMatchObject({ id: "example-w", gender: "female", first_match: "2010-01-01", last_match: "2020-01-01", matches: 14 });
  });

  it("builds a teams row from a team file when the index lacks it", () => {
    const row = mapTeam({ id: "example-w", name: "Example", gender: "female", label: "Example Women", formats: { t20i: teamFormat } });
    expect(row).toMatchObject({ first_match: "2010-01-01", last_match: "2020-01-01", matches: 10 });
  });

  it("moves record and span to columns and keeps the rest as detail", () => {
    const row = mapTeamSummary("example-w", "t20i", "female", teamFormat);
    expect(row).toMatchObject({ team_id: "example-w", format_key: "t20i-w", matches: 10, won: 9, lost: 1, no_result: 0, first_date: "2010-01-01", last_date: "2020-01-01" });
    expect(row.detail.record).toBeUndefined();
    expect(row.detail.span).toBeUndefined();
    expect(row.detail.recentMatchIds).toEqual(["1", "2"]);
    expect(teamFormat.record).toBeDefined(); // input untouched
  });
});

describe("mapVenue and mapWinModel", () => {
  it("maps a venue, turning empty strings into nulls", () => {
    const row = mapVenue("Lord's", { name: "Lord's", city: "London", country: "", formats: { "test-m": { matches: 1 } } });
    expect(row).toMatchObject({ key: "Lord's", city: "London", country: null, formats: { "test-m": { matches: 1 } } });
  });

  it("splits a win model into the fitted core and its other columns", () => {
    const wp = read("winprob.json");
    const row = mapWinModel("odi-m", wp.formats.odi, wp.holdoutFrom);
    expect(row.format_key).toBe("odi-m");
    expect(row.model).toMatchObject({ format: "odi", maxBalls: 300, par: wp.formats.odi.par });
    expect(row.model.theta).toEqual(wp.formats.odi.theta);
    expect(row.golden).toHaveLength(60);
    expect(row.holdout_from).toBe("2023-01-01");
    expect(row.half_life_years).toBe(12);
    expect(row.matches).toBe(wp.formats.odi.matches);
  });
});

describe("replayStats", () => {
  it("counts every delivery in every innings", () => {
    const raw = readFileSync(V1 + "replays/1384439.json");
    const s = replayStats(JSON.parse(raw.toString("utf8")), raw.length);
    expect(s.balls).toBe(307 + 262);
    expect(s.bytes).toBe(raw.length);
  });
});
