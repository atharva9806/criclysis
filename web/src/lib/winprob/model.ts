/**
 * Win probability, projected score and par: a line-for-line port of
 * pipeline/winprob.py (Resources, chase_features, WinModel), evaluated from the
 * exported winprob.json model. Nothing is refitted here.
 *
 * Python semantics are reproduced exactly (docs/ARCHITECTURE.md §5.3, C1):
 * - `int(round(x))` rounds half to even (pyRound);
 * - `int(x)` truncates toward zero (Math.trunc);
 * - `range(lo, hi + 1)` is inclusive of hi;
 * - resources are floored at 0.5 before the log;
 * - `chase` returns 1 when need <= 0, then 0 when wickets >= 10 or no balls are left.
 *
 * The first-innings table is used as exported (`firstInningsWin`), which is how
 * a model is reloaded from JSON; it is not rebuilt from theta.
 */
import type { FormatKey, VenueKey, WinModelJson } from "../contract/pipeline";

/** Python's round() for floats: round half to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Numerically stable logistic, identical branches to winprob._sigmoid. */
export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export type Projection = [mean: number, low: number, high: number];

/** The parts of a model the maths needs; validation and golden states are left out. */
export type WinModelCore = Pick<
  WinModelJson,
  "formatKey" | "gender" | "format" | "maxBalls" | "theta" | "resources" | "dispersion" | "firstInningsWin" | "par" | "venues"
>;

/** Keys a ground's par may be stored under: the VenueKey (v2), the full name, the name before the comma (v1). */
export function venueCandidates(venueKey?: string | null, venueName?: string | null): string[] {
  const out = [venueKey, venueName, venueName?.split(",")[0].trim()].filter((k): k is string => !!k);
  return [...new Set(out)];
}

/**
 * A model trimmed for the browser: no golden states or validation, and only
 * the venue par for this ground when one is named.
 */
export function slimModel(json: WinModelJson, venue?: { key?: string | null; name?: string | null }): WinModelCore {
  const { formatKey, gender, format, maxBalls, theta, resources, dispersion, firstInningsWin, par } = json;
  const all = json.venues ?? {};
  const venues = venue ? Object.fromEntries(venueCandidates(venue.key, venue.name).filter((k) => all[k]).map((k) => [k, all[k]])) : all;
  return { formatKey, gender, format, maxBalls, theta, resources, dispersion, firstInningsWin, par, venues };
}

export type VenuePar = { key: VenueKey; par: number; matches: number; averageFirstInnings: number };

/** The 80% band: ±1.2816 standard deviations, as in WinModel.projected. */
const Z80 = 1.2816;

export class WinModel {
  readonly format: "odi" | "t20i";
  readonly formatKey: FormatKey;
  readonly maxBalls: number;
  private readonly theta: number[];
  private readonly table: number[][];
  private readonly dispersion: number[];
  private readonly firstInningsWin: number[];
  private readonly venues: WinModelCore["venues"];
  private readonly exportedPar: number;

  constructor(json: WinModelCore) {
    this.format = json.format;
    // v1 files carry only `format` and are men's.
    this.formatKey = json.formatKey ?? `${json.format}-m`;
    this.maxBalls = json.maxBalls;
    this.theta = json.theta;
    this.table = json.resources;
    this.dispersion = json.dispersion;
    this.firstInningsWin = json.firstInningsWin;
    this.venues = json.venues ?? {};
    this.exportedPar = json.par;
  }

  // -- resources --------------------------------------------------------------

  /** Expected further runs with `ballsLeft` legal balls left and `wickets` down. */
  expected(ballsLeft: number, wickets: number): number {
    if (wickets >= 10 || ballsLeft <= 0) return 0;
    return this.table[wickets][Math.min(ballsLeft, this.maxBalls)];
  }

  variance(ballsLeft: number, wickets: number): number {
    if (wickets >= 10 || ballsLeft <= 0) return 0;
    return this.dispersion[wickets] * this.expected(ballsLeft, wickets);
  }

  // -- chase ------------------------------------------------------------------

  /** winprob.chase_features: [1, x, x*f, f, x*w/10] with x = log(need / R). */
  features(ballsLeft: number, wickets: number, need: number): number[] {
    const r = Math.max(this.expected(ballsLeft, wickets), 0.5);
    const x = Math.log(need / r);
    const f = ballsLeft / this.maxBalls;
    return [1.0, x, x * f, f, (x * wickets) / 10];
  }

  /** P(chasing side wins) with `need` runs still required. */
  chase(ballsLeft: number, wickets: number, need: number): number {
    if (need <= 0) return 1.0;
    if (wickets >= 10 || ballsLeft <= 0) return 0.0;
    const xs = this.features(ballsLeft, wickets, need);
    let z = 0;
    for (let i = 0; i < this.theta.length; i++) z += this.theta[i] * xs[i];
    return sigmoid(z);
  }

  // -- first innings ----------------------------------------------------------

  /** P(side batting first wins), integrating over their final total. */
  battingFirst(ballsLeft: number, wickets: number, runs: number): number {
    const table = this.firstInningsWin;
    const top = table.length - 1;
    const mean = runs + this.expected(ballsLeft, wickets);
    const v = this.variance(ballsLeft, wickets);
    const atMean = () => table[Math.min(pyRound(mean), top)];
    if (v <= 0.25) return atMean();
    const sd = Math.sqrt(v);
    const lo = Math.max(runs, Math.trunc(mean - 4 * sd));
    const hi = Math.min(top, Math.trunc(mean + 4 * sd) + 1);
    let totalW = 0;
    let acc = 0;
    for (let t = lo; t <= hi; t++) {
      const wt = Math.exp(-0.5 * ((t - mean) / sd) ** 2);
      totalW += wt;
      acc += wt * table[t];
    }
    return totalW ? acc / totalW : atMean();
  }

  // -- projections ------------------------------------------------------------

  /** Projected final total with an 80% band: [mean, low, high]. */
  projected(ballsLeft: number, wickets: number, runs: number): Projection {
    const mean = runs + this.expected(ballsLeft, wickets);
    const sd = Math.sqrt(this.variance(ballsLeft, wickets));
    return [mean, Math.max(runs, mean - Z80 * sd), mean + Z80 * sd];
  }

  /** WinModel.par_total: the first total that gives the side batting first >= 50%. */
  par(): number {
    const table = this.firstInningsWin;
    if (!table.length) return this.exportedPar;
    for (let t = 0; t < table.length; t++) if (table[t] >= 0.5) return t;
    return table.length - 1;
  }

  /**
   * Ground-adjusted par from the exported `venues` table, or null when the
   * ground has too few matches to have one. Keys are VenueKeys (v2); v1 files
   * key by the raw venue name, so the full name and the part before the first
   * comma are tried too.
   */
  venuePar(venueKey?: string | null, venueName?: string | null): VenuePar | null {
    for (const key of venueCandidates(venueKey, venueName)) {
      const v = this.venues[key];
      if (v) return { key, par: v.par, matches: v.matches, averageFirstInnings: v.averageFirstInnings };
    }
    return null;
  }
}
