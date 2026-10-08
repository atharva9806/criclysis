import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BatSplit, BowlSplit, PlayerFile } from "./contract/pipeline";
import { batRates, bowlRates, oversNotation, toSplitRow } from "./metrics";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
// fixtures/data-out (v2) is checked too once the pipeline has produced it.
const dirs = ["fixtures/data-out-v1", "fixtures/data-out"].map((d) => join(repo, d)).filter((d) => existsSync(join(d, "players")));

function playerFiles(): [string, PlayerFile][] {
  return dirs.flatMap((d) =>
    readdirSync(join(d, "players"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => [`${d.split("/").pop()}/${f}`, JSON.parse(readFileSync(join(d, "players", f), "utf8")) as PlayerFile] as [string, PlayerFile]),
  );
}

/** The pipeline rounds with Python's round(x, digits); ours is unrounded, so it must sit within half a unit. */
function close(ours: number | null, theirs: number | null | undefined, digits: number, undefinedAs: number | null = null) {
  if (theirs === undefined) return;
  if (ours === null) {
    expect(theirs).toBe(undefinedAs);
    return;
  }
  expect(theirs).not.toBeNull();
  expect(Math.abs(ours - (theirs as number))).toBeLessThanOrEqual(0.5 * 10 ** -digits + 1e-9);
}

function batSplits(f: PlayerFile): [string, BatSplit][] {
  const out: [string, BatSplit][] = [];
  for (const [fmt, p] of Object.entries(f.formats)) {
    const b = p?.batting;
    if (!b) continue;
    out.push([`${fmt}.overall`, b.overall]);
    for (const [k, v] of Object.entries(b)) {
      if ((k.startsWith("by") || k === "vsBowler") && v && typeof v === "object" && !Array.isArray(v)) {
        for (const [s, split] of Object.entries(v as Record<string, BatSplit>)) out.push([`${fmt}.${k}.${s}`, split]);
      }
    }
  }
  return out;
}

function bowlSplits(f: PlayerFile): [string, BowlSplit][] {
  const out: [string, BowlSplit][] = [];
  for (const [fmt, p] of Object.entries(f.formats)) {
    const b = p?.bowling;
    if (!b) continue;
    out.push([`${fmt}.overall`, b.overall]);
    for (const [k, v] of Object.entries(b)) {
      if ((k.startsWith("by") || k === "vsBatter") && v && typeof v === "object" && !Array.isArray(v)) {
        for (const [s, split] of Object.entries(v as Record<string, BowlSplit>)) out.push([`${fmt}.${k}.${s}`, split]);
      }
    }
  }
  return out;
}

describe("metrics.ts reproduces the pipeline's split rates", () => {
  const files = playerFiles();

  it("has fixture player files to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const [name, file] of files) {
    it(`batting splits in ${name}`, () => {
      const splits = batSplits(file);
      for (const [, s] of splits) {
        const r = batRates(s);
        close(r.average, s.avg, 2);
        close(r.strikeRate, s.sr, 2, 0);
        close(r.ballsPerDismissal, s.bpd, 1);
        close(r.dotPct, s.dotPct, 1, 0);
        close(r.boundaryPct, s.bdryPct, 1, 0);
        close(r.boundaryRunsPct, s.bdryRunsPct, 1, 0);
      }
    });

    it(`bowling splits in ${name}`, () => {
      for (const [, s] of bowlSplits(file)) {
        const r = bowlRates(s);
        close(r.economy, s.econ, 2, 0);
        close(r.average, s.avg, 2);
        close(r.strikeRate, s.sr, 1);
        close(r.dotPct, s.dotPct, 1, 0);
        close(r.boundaryPct, s.bdryPct, 1, 0);
        close(r.overs, s.overs, 1);
      }
    });
  }

  it("checks a known value exactly (V Kohli, ODI overall)", () => {
    const kohli = files.find(([n]) => n.endsWith("v-kohli-ba607b88.json"))![1];
    const o = kohli.formats.odi!.batting!.overall;
    const r = batRates(o);
    expect(r.average).toBeCloseTo(14675 / 251, 10);
    expect(Math.round(r.average! * 100) / 100).toBe(o.avg);
    expect(Math.round(r.strikeRate! * 100) / 100).toBe(o.sr);
  });
});

describe("toSplitRow", () => {
  it("uses batting rates for batting rows and leaves economy empty", () => {
    const row = toSplitRow({
      discipline: "batting", dimension: "type", subject: "lb", label: null,
      balls: 200, runs: 150, outs: 3, wickets: null, dots: 80, fours: 12, sixes: 3, innings: null,
    });
    expect(row.average).toBe(50);
    expect(row.strikeRate).toBe(75);
    expect(row.economy).toBeNull();
    expect(row.dotPct).toBe(40);
    expect(row.boundaryPct).toBe(7.5);
  });

  it("uses bowling rates for bowling rows; undefined rates are null", () => {
    const row = toSplitRow({
      discipline: "bowling", dimension: "hand", subject: "left", label: null,
      balls: 120, runs: 100, outs: null, wickets: 0, dots: 50, fours: 6, sixes: 0, innings: null,
    });
    expect(row.economy).toBe(5);
    expect(row.average).toBeNull();
    expect(row.strikeRate).toBeNull();
  });
});

describe("oversNotation", () => {
  it("writes balls as overs.balls", () => {
    expect(oversNotation(662)).toBe("110.2");
    expect(oversNotation(300)).toBe("50");
    expect(oversNotation(5)).toBe("0.5");
  });
});
