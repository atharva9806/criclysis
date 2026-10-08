/**
 * Golden test: the TypeScript port against the states the Python model
 * exported in winprob.json (`golden`).
 *
 * WINPROB_FILE selects the file (relative to the working directory); the
 * default is the v1 fixture. Tolerances follow docs/ARCHITECTURE.md §5.3:
 * - v1 golden was computed from the unrounded fitted model, so reloading the
 *   rounded JSON costs up to ~1.4e-5 in probability and ~1.4e-3 runs:
 *   5e-5 and 5e-3;
 * - v2 golden (schemaVersion 2) is computed from the reloaded JSON model:
 *   1e-9 and 1e-6.
 * WINPROB_TOL_P and WINPROB_TOL_RUNS override both.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WinModelJson, WinProbFile } from "../contract/pipeline";
import { WinModel } from "./model";

const DEFAULT_FILE = fileURLToPath(new URL("../../../../fixtures/data-out-v1/winprob.json", import.meta.url));
const file = process.env.WINPROB_FILE ? resolve(process.cwd(), process.env.WINPROB_FILE) : DEFAULT_FILE;
const data = JSON.parse(readFileSync(file, "utf8")) as WinProbFile;
const v2 = data.schemaVersion === 2;
const tolP = Number(process.env.WINPROB_TOL_P ?? (v2 ? 1e-9 : 5e-5));
const tolRuns = Number(process.env.WINPROB_TOL_RUNS ?? (v2 ? 1e-6 : 5e-3));

const models = Object.entries(data.formats).filter((e): e is [string, WinModelJson] => !!e[1]);

describe(`golden states from ${file}`, () => {
  it("has at least one model", () => {
    expect(models.length).toBeGreaterThan(0);
  });

  for (const [key, json] of models) {
    describe(key, () => {
      const model = new WinModel(json);

      it(`matches every golden state (p <= ${tolP}, runs <= ${tolRuns})`, () => {
        expect(json.golden.length).toBeGreaterThan(0);
        let maxP = 0;
        let maxRuns = 0;
        for (const g of json.golden) {
          const chase = model.chase(g.ballsLeft, g.wickets, g.need);
          const first = model.battingFirst(g.ballsLeft, g.wickets, g.runs);
          const proj = model.projected(g.ballsLeft, g.wickets, g.runs);
          maxP = Math.max(maxP, Math.abs(chase - g.chase), Math.abs(first - g.battingFirst));
          for (let i = 0; i < 3; i++) maxRuns = Math.max(maxRuns, Math.abs(proj[i] - g.projected[i]));
        }
        console.info(`[golden] ${key}: ${json.golden.length} states, max |dp| = ${maxP.toExponential(2)}, max |druns| = ${maxRuns.toExponential(2)}`);
        expect(maxP).toBeLessThanOrEqual(tolP);
        expect(maxRuns).toBeLessThanOrEqual(tolRuns);
      });

      it("reproduces the exported par", () => {
        expect(model.par()).toBe(json.par);
      });
    });
  }
});
