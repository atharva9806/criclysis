/**
 * Unit tests for the win-probability port.
 *
 * __fixtures__/parity.json holds pipeline/winprob.py's outputs for the model
 * reloaded from fixtures/data-out-v1/winprob.json (rebuilt with a scratch
 * model_from_json that takes resources, dispersion, theta and firstInningsWin
 * verbatim). Both sides then evaluate identical numbers with identical float64
 * operations, so the tolerance is 1e-12 rather than the golden test's 5e-5.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WinModelJson, WinProbFile } from "../contract/pipeline";
import { pyRound, sigmoid, slimModel, WinModel } from "./model";

const read = <T,>(rel: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")) as T;
const file = read<WinProbFile>("../../../../fixtures/data-out-v1/winprob.json");
const parity = read<{ models: Record<string, { par: number; rows: number[][] }> }>("./__fixtures__/parity.json");
const odiJson = file.formats.odi as WinModelJson;
const odi = new WinModel(odiJson);

describe("pyRound", () => {
  it("rounds half to even like Python's round()", () => {
    expect([0.5, 1.5, 2.5, 3.5, -0.5, -1.5, 2.4999, 2.5001, 7].map(pyRound)).toEqual([0, 2, 2, 4, 0, -2, 2, 3, 7]);
  });
});

describe("sigmoid", () => {
  it("is symmetric and stable at the extremes", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(3) + sigmoid(-3)).toBeCloseTo(1, 15);
    expect(sigmoid(-800)).toBe(0);
    expect(sigmoid(800)).toBe(1);
  });
});

describe("WinModel", () => {
  it("defaults the formatKey of a v1 model to men's", () => {
    expect(odi.formatKey).toBe("odi-m");
    expect(odi.maxBalls).toBe(300);
  });

  it("returns 1 for a met target before checking wickets or balls", () => {
    expect(odi.chase(0, 10, 0)).toBe(1);
    expect(odi.chase(0, 10, -4)).toBe(1);
    expect(odi.chase(0, 3, 1)).toBe(0);
    expect(odi.chase(20, 10, 1)).toBe(0);
  });

  it("has no resources once all out or out of balls", () => {
    expect(odi.expected(0, 3)).toBe(0);
    expect(odi.expected(50, 10)).toBe(0);
    expect(odi.variance(0, 0)).toBe(0);
    expect(odi.projected(0, 4, 240)).toEqual([240, 240, 240]);
  });

  it("caps balls left at the format's maximum", () => {
    expect(odi.expected(400, 0)).toBe(odi.expected(300, 0));
  });

  it("finds venue pars by key, full name or the name before the comma", () => {
    expect(odi.venuePar(undefined, "Narendra Modi Stadium, Ahmedabad")).toMatchObject({ par: 262, matches: 8 });
    expect(odi.venuePar("Lord's", "Lord's, London")).toMatchObject({ key: "Lord's", par: 263, matches: 27 });
    expect(odi.venuePar(null, "Nowhere Ground, Atlantis")).toBeNull();
  });

  it("slims a model for the browser without changing any answer", () => {
    const slim = slimModel(odiJson, { name: "Narendra Modi Stadium, Ahmedabad" });
    expect(Object.keys(slim.venues)).toEqual(["Narendra Modi Stadium, Ahmedabad"]);
    expect("golden" in slim || "validation" in slim).toBe(false);
    const m = new WinModel(slim);
    expect(m.venuePar(null, "Narendra Modi Stadium, Ahmedabad")?.par).toBe(262);
    expect([m.chase(100, 3, 90), m.battingFirst(120, 2, 140), m.par()]).toEqual([odi.chase(100, 3, 90), odi.battingFirst(120, 2, 140), odi.par()]);
  });

  for (const [key, ref] of Object.entries(parity.models)) {
    it(`matches pipeline/winprob.py on ${ref.rows.length} ${key} states to 1e-12`, () => {
      const m = new WinModel(file.formats[key] as WinModelJson);
      expect(m.par()).toBe(ref.par);
      let worst = 0;
      for (const [u, w, runs, need, chase, first, mean, low, high, expected, variance] of ref.rows) {
        const proj = m.projected(u, w, runs);
        const got = [m.chase(u, w, need), m.battingFirst(u, w, runs), ...proj, m.expected(u, w), m.variance(u, w)];
        const want = [chase, first, mean, low, high, expected, variance];
        for (let i = 0; i < want.length; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
      }
      expect(worst).toBeLessThanOrEqual(1e-12);
    });
  }
});
