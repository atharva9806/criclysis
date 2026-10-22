import { describe, expect, it } from "vitest";
import { DASH, decided, planUnavailable, record, tossWinPcts, winPct } from "./format";

const r5 = (matches: number, won: number, lost: number, tied = 0, drawn = 0) => {
  const d = won + lost + tied + drawn;
  return { matches, won, lost, tied, drawn, noResult: matches - d, winPct: d ? (100 * won) / d : null };
};

describe("win percentages are gated on decided matches", () => {
  it("leaves no-results out of the decided count", () => {
    expect(decided(r5(5, 1, 0))).toBe(1);
    expect(decided(r5(6, 2, 1, 1, 1))).toBe(5);
  });

  it("hides 100% from 1 decided match out of 5 played (four no-results)", () => {
    const oneDecided = r5(5, 1, 0);
    expect(oneDecided.winPct).toBe(100);
    expect(winPct(oneDecided, 5)).toBe(DASH);
    expect(record(oneDecided, 5)).toBe("won 1 of 5");
  });

  it("shows the percentage from the threshold of decided matches", () => {
    const fiveDecided = r5(7, 3, 2);
    expect(winPct(fiveDecided, 5)).toBe("60.0%");
    expect(record(fiveDecided, 5)).toBe("won 3 of 7 (60.0%)");
    expect(winPct(r5(7, 3, 1), 5)).toBe(DASH);
  });

  it("gates toss win percentages on the decided matches behind each", () => {
    const toss = (won: number, lost: number, bat: ReturnType<typeof r5>, field: ReturnType<typeof r5>) => ({
      won, lost, winPctWonToss: 50, winPctLostToss: 40, decisions: { bat, field },
    });
    // 10 matches: won 6 tosses (decided 4 + 2 = 6), lost 4 (decided 10 - 6 - 0 = 4, below 5).
    const overall = r5(10, 5, 5);
    expect(tossWinPcts(toss(6, 4, r5(4, 2, 2), r5(2, 1, 1)), overall, 5)).toEqual({ won: "50.0%", lost: DASH });
    // Won-toss matches are mostly no-results: 6 tosses but only 2 decided.
    expect(tossWinPcts(toss(6, 4, r5(4, 1, 0), r5(2, 1, 0)), r5(10, 6, 2), 5).won).toBe(DASH);
    // Lost-toss decided count can't be derived when tosses don't cover every match.
    expect(tossWinPcts(toss(3, 2, r5(2, 1, 1), r5(1, 0, 1)), r5(20, 10, 10), 5).lost).toBe(DASH);
    expect(tossWinPcts(toss(3, 17, r5(2, 1, 1), r5(1, 0, 1)), r5(20, 10, 10), 5)).toEqual({ won: DASH, lost: "40.0%" });
  });
});

describe("planUnavailable", () => {
  const india = { label: "India Women", gender: "female", formats: { odi: {}, t20i: {} } };
  const australia = { label: "Australia Women", gender: "female", formats: { odi: {} } };
  const indiaMen = { label: "India", gender: "male", formats: { odi: {}, t20i: {} } };

  it("allows a pairing that both teams have records for", () => {
    expect(planUnavailable(india, australia, "odi")).toBeNull();
  });

  it("names the team without the requested format instead of falling back", () => {
    expect(planUnavailable(india, australia, "t20i")).toBe("No T20I data for this pairing: Australia Women has no T20I matches in the data.");
    expect(planUnavailable(australia, { ...australia, label: "England Women" }, "test")).toBe(
      "No Test data for this pairing: Australia Women and England Women have no Test matches in the data.",
    );
  });

  it("refuses mixed genders, the same team twice and unknown teams", () => {
    expect(planUnavailable(india, indiaMen, "odi")).toMatch(/same gender/);
    expect(planUnavailable(india, india, "odi")).toBe("Choose two different teams.");
    expect(planUnavailable(undefined, india, "odi")).toMatch(/not in the data/);
  });
});
