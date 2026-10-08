/**
 * DEV PREVIEW ONLY. Reads the v1 fixtures in fixtures/data-out-v1 from disk so
 * the replay player can be rendered before the data layer (stream B) lands.
 * Replace with getReplay, getWinModel and getReplayContext, then delete.
 *
 * The context is built only from the six real player files in the fixture,
 * mapped the way getReplayContext is specified (docs/ARCHITECTURE.md §4.3):
 * top two traits each, batting splits by type, type and phase, and bowler,
 * with rows below the display gates left out.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReplayContext, SplitRow, TraitRow } from "@/lib/contract/db";
import type { BatSplit, Claim, Manifest, PlayerFile, PlayersIndex, Replay, WinModelJson, WinProbFile } from "@/lib/contract/pipeline";

const ROOT = path.resolve(process.cwd(), "..", "fixtures", "data-out-v1");

const readJson = async <T,>(rel: string): Promise<T> => JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as T;

const split = (dimension: string, subject: string, s: BatSplit, label: string | null = null): SplitRow => ({
  discipline: "batting",
  dimension,
  subject,
  label,
  balls: s.balls,
  runs: s.runs,
  outs: s.outs,
  wickets: null,
  dots: s.dots,
  fours: s.fours,
  sixes: s.sixes,
  innings: s.innings || null,
  average: s.avg,
  strikeRate: s.sr,
  economy: null,
  dotPct: s.dotPct,
  boundaryPct: s.bdryPct,
});

const trait = (c: Claim, rank: number): TraitRow => ({
  kind: c.kind,
  rank,
  discipline: c.discipline,
  dimension: c.dimension,
  dimensionKey: c.dimensionKey,
  subject: c.subject,
  subjectKey: c.subjectKey,
  metric: c.metric,
  metricLabel: c.metricLabel,
  value: c.value,
  baseline: c.baseline,
  cohortMedian: c.cohortMedian,
  percentile: c.percentile,
  balls: c.balls,
  confidence: c.confidence,
  higherIsBetter: c.higherIsBetter,
  text: c.text,
});

export type PreviewData = { replay: Replay; model: WinModelJson | null; context: ReplayContext; datasetAsOf: string };

export async function loadPreview(matchId: string): Promise<PreviewData | null> {
  if (!/^\d+$/.test(matchId)) return null;
  let replay: Replay;
  try {
    replay = await readJson<Replay>(`replays/${matchId}.json`);
  } catch {
    return null;
  }
  const [winprob, manifest, index] = await Promise.all([
    readJson<WinProbFile>("winprob.json"),
    readJson<Manifest>("manifest.json"),
    readJson<PlayersIndex>("players.json"),
  ]);
  const fmt = replay.format;
  const model = (winprob.formats[replay.formatKey ?? ""] ?? winprob.formats[fmt]) ?? null;
  const min = manifest.thresholds.minBallsSplit;
  const byId = new Map(index.players.map((p) => [p.id, p]));

  const people: ReplayContext["people"] = await Promise.all(
    replay.people.map(async (p) => {
      const row = byId.get(p.id);
      const empty = { id: p.id, name: p.name, team: p.team, player: null, traits: { strengths: [], weaknesses: [] }, batting: { vsType: [], vsTypePhase: [], vsBowler: [] } };
      if (!row) return empty;
      const file = await readJson<PlayerFile>(`players/${row.slug}.json`);
      const f = file.formats[fmt];
      const bat = f?.batting;
      const gate = <T extends { balls: number }>(entries: [string, T][]) => entries.filter(([, s]) => s.balls >= min);
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        player: { slug: row.slug, bowlingType: row.bowlingType || null, battingHand: row.battingHand || null },
        traits: { strengths: (f?.strengths ?? []).slice(0, 2).map(trait), weaknesses: (f?.weaknesses ?? []).slice(0, 2).map(trait) },
        batting: {
          vsType: gate(Object.entries(bat?.byType ?? {})).map(([k, s]) => split("type", k, s)),
          vsTypePhase: gate(Object.entries(bat?.byTypePhase ?? {})).map(([k, s]) => split("typePhase", k, s)),
          // v1 keys vsBowler by name; v2 by person id.
          vsBowler: gate(Object.entries(bat?.vsBowler ?? {})).map(([k, s]) => split("vsBowler", k, s, s.name ?? k)),
        },
      };
    }),
  );

  const datasetAsOf = manifest.generated.slice(0, 10);
  return {
    replay,
    model,
    datasetAsOf,
    context: { formatKey: replay.formatKey ?? `${fmt}-m`, model: null, datasetAsOf, thresholds: { minBallsSplit: min, minBallsBowledSplit: manifest.thresholds.minBallsBowledSplit }, people },
  };
}
