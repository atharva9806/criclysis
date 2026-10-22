import { describe, expect, it } from "vitest";
import { assertLive, dedupePlayers, inputCounts, missingReplays, shrinkProblems } from "./guards.mjs";

describe("assertLive", () => {
  it("accepts live output and refuses demo or unlabelled output", () => {
    expect(() => assertLive({ provenance: { dataset: "live" } })).not.toThrow();
    expect(() => assertLive({ provenance: { dataset: "demo" } })).toThrow(/demo/);
    expect(() => assertLive({})).toThrow(/Refusing/);
  });
});

describe("inputCounts", () => {
  it("counts player-formats by gender, matches, team summaries and win models per formatKey", () => {
    const players = [
      { formats: { odi: {}, t20i: {} } }, // v1: no gender, so men's
      { gender: "female", formats: { odi: {} } },
      { gender: "male", formats: { odi: {} } },
    ];
    const matches = [{ formatKey: "odi-w" }, { format: "test", gender: "male" }];
    expect(inputCounts({ players, matches, teamSummaryKeys: ["odi-w", "odi-w", "test-m"], winModelKeys: ["odi-w"] })).toEqual({
      "odi-m": { players: 2 },
      "t20i-m": { players: 1 },
      "odi-w": { players: 1, matches: 1, teamSummaries: 2, winModels: 1 },
      "test-m": { matches: 1, teamSummaries: 1 },
    });
    expect(inputCounts()).toEqual({});
  });
});

describe("shrinkProblems", () => {
  const before = {
    formats: { "odi-m": { players: 100, matches: 200, teamSummaries: 20, winModels: 1 }, "t20i-w": { players: 40 } },
    teams: 40,
    venues: 300,
  };
  const same = structuredClone(before);

  it("passes an identical build, growth, and drops of up to 5%", () => {
    expect(shrinkProblems(before, same)).toEqual([]);
    const grown = { formats: { "odi-m": { players: 95, matches: 250, teamSummaries: 19, winModels: 1 }, "t20i-w": { players: 40 } }, teams: 41, venues: 285 };
    expect(shrinkProblems(before, grown)).toEqual([]);
  });

  it("flags a drop of more than 5%, and a formatKey that disappeared", () => {
    const now = { ...same, formats: { "odi-m": { players: 94, matches: 200, teamSummaries: 20, winModels: 1 } } };
    expect(shrinkProblems(before, now)).toEqual(["odi-m players: 100 -> 94", "t20i-w players: 40 -> 0"]);
  });

  it("flags emptied teams, team summaries, venues and win models", () => {
    const now = { formats: { "odi-m": { players: 100, matches: 200 }, "t20i-w": { players: 40 } }, teams: 0, venues: 0 };
    expect(shrinkProblems(before, now)).toEqual(["odi-m teamSummaries: 20 -> 0", "odi-m winModels: 1 -> 0", "teams: 40 -> 0", "venues: 300 -> 0"]);
  });

  it("skips kinds whose file is missing this run, and keys outside a partial import", () => {
    const noMatches = { ...same, formats: { "odi-m": { players: 100, teamSummaries: 20, winModels: 1 }, "t20i-w": { players: 40 } } };
    expect(shrinkProblems(before, noMatches, { skip: ["matches"] })).toEqual([]);
    const noTeamsOrVenues = { formats: same.formats, teams: null, venues: null };
    expect(shrinkProblems(before, noTeamsOrVenues, { skip: ["teams", "venues"] })).toEqual([]);
    const onlyOdi = { ...same, formats: { "odi-m": same.formats["odi-m"] } };
    expect(shrinkProblems(before, onlyOdi, { formatKeys: ["odi-m"] })).toEqual([]);
  });

  it("has nothing to compare on a first import, or with counts recorded before a kind existed", () => {
    expect(shrinkProblems(undefined, { formats: { "odi-m": { players: 1 } } })).toEqual([]);
    expect(shrinkProblems({ formats: { "odi-m": { players: 10 } } }, { formats: { "odi-m": { players: 10 } }, teams: 0 })).toEqual([]);
  });
});

describe("missingReplays", () => {
  it("lists matches marked hasReplay that have no replay file", () => {
    expect(missingReplays(["3", "1", "2", "2"], ["1", "9"])).toEqual(["2", "3"]);
    expect(missingReplays(["1"], ["1", "2"])).toEqual([]);
    expect(missingReplays([], [])).toEqual([]);
  });
});

describe("dedupePlayers", () => {
  it("keeps one entry per person id, the one with the most balls, in input order", () => {
    const idx = [
      { id: "a", slug: "old-name-a", formats: { odi: { bat: { balls: 100 } } } },
      { id: "b", slug: "b", formats: {} },
      { id: "a", slug: "new-name-a", formats: { odi: { bat: { balls: 300 }, bowl: { balls: 10 } } } },
    ];
    const { kept, dropped } = dedupePlayers(idx);
    expect(kept.map((p) => p.slug)).toEqual(["b", "new-name-a"]);
    expect(dropped).toEqual([{ dropped: "old-name-a", kept: "new-name-a" }]);
  });

  it("prefers sampleBalls when present and the first entry on a tie", () => {
    const { kept } = dedupePlayers([
      { id: "a", slug: "x", sampleBalls: 5, formats: {} },
      { id: "a", slug: "y", sampleBalls: 5, formats: {} },
    ]);
    expect(kept.map((p) => p.slug)).toEqual(["x"]);
  });
});
