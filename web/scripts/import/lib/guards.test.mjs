import { describe, expect, it } from "vitest";
import { assertLive, dedupePlayers, inputCounts, shrinkProblems } from "./guards.mjs";

describe("assertLive", () => {
  it("accepts live output and refuses demo or unlabelled output", () => {
    expect(() => assertLive({ provenance: { dataset: "live" } })).not.toThrow();
    expect(() => assertLive({ provenance: { dataset: "demo" } })).toThrow(/demo/);
    expect(() => assertLive({})).toThrow(/Refusing/);
  });
});

describe("inputCounts", () => {
  it("counts player-formats per formatKey by gender, and matches per formatKey", () => {
    const players = [
      { formats: { odi: {}, t20i: {} } }, // v1: no gender, so men's
      { gender: "female", formats: { odi: {} } },
      { gender: "male", formats: { odi: {} } },
    ];
    const matches = [{ formatKey: "odi-w" }, { format: "test", gender: "male" }];
    expect(inputCounts(players, matches)).toEqual({
      "odi-m": { players: 2 },
      "t20i-m": { players: 1 },
      "odi-w": { players: 1, matches: 1 },
      "test-m": { matches: 1 },
    });
    expect(inputCounts(null, null)).toEqual({});
  });
});

describe("shrinkProblems", () => {
  const before = { "odi-m": { players: 100, matches: 200 }, "t20i-w": { players: 40 } };

  it("passes growth and drops of up to 5%", () => {
    expect(shrinkProblems(before, { "odi-m": { players: 95, matches: 250 }, "t20i-w": { players: 40 } })).toEqual([]);
  });

  it("flags a drop of more than 5%, and a formatKey that disappeared", () => {
    expect(shrinkProblems(before, { "odi-m": { players: 94, matches: 200 } })).toEqual(["odi-m players: 100 -> 94", "t20i-w players: 40 -> 0"]);
  });

  it("skips kinds whose file is missing this run, and keys outside a partial import", () => {
    expect(shrinkProblems(before, { "odi-m": { players: 100 }, "t20i-w": { players: 40 } }, { skip: ["matches"] })).toEqual([]);
    expect(shrinkProblems(before, { "odi-m": { players: 100, matches: 200 } }, { formatKeys: ["odi-m"] })).toEqual([]);
  });

  it("has nothing to compare on a first import", () => {
    expect(shrinkProblems(undefined, { "odi-m": { players: 1 } })).toEqual([]);
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
