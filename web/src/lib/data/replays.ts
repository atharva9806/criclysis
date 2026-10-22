import { gunzipSync } from "node:zlib";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { matchReplays, matches, players, splits, traits } from "@/db/schema";
import type { ReplayContext, SplitRow } from "@/lib/contract/db";
import type { Replay } from "@/lib/contract/pipeline";
import { toSplitRow } from "@/lib/metrics";
import { cached } from "./cache";
import { getDatasetMeta } from "./meta";
import { getWinModel } from "./models";
import { fmtOfKey, toTraitRow } from "./rows";

/** The stored replays/<matchId>.json.gz, gunzipped and parsed. */
async function loadReplay(matchId: string): Promise<Replay | null> {
  const [r] = await db.select({ gz: matchReplays.gz }).from(matchReplays).where(eq(matchReplays.matchId, matchId)).limit(1);
  return r ? (JSON.parse(gunzipSync(r.gz).toString("utf8")) as Replay) : null;
}

export const getReplay = cached("getReplay", loadReplay);

/**
 * Player context for a replay (docs/ARCHITECTURE.md §4.3): for everyone in the
 * match, their top two strengths and weaknesses in this formatKey and their
 * batting splits against the bowling types and bowlers actually used against
 * them in this match. Splits below the display gates are never stored, so
 * they are omitted here too.
 */
async function loadReplayContext(matchId: string): Promise<ReplayContext | null> {
  const [m] = await db.select({ formatKey: matches.formatKey }).from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!m) return null;
  const [replay, meta] = await Promise.all([loadReplay(matchId), getDatasetMeta()]);
  if (!replay) return null;
  const fk = m.formatKey;
  const model = fmtOfKey(fk) === "test" ? null : await getWinModel(fk);

  const ids = replay.people.map((p) => p.id);
  const known = ids.length
    ? await db
        .select({ id: players.id, sourceId: players.sourceId, slug: players.slug, bowlingType: players.bowlingType, battingHand: players.battingHand })
        .from(players)
        .where(inArray(players.sourceId, ids))
    : [];
  const bySource = new Map(known.map((p) => [p.sourceId, p]));
  const pids = known.map((p) => p.id);
  const [traitRows, splitRows] = pids.length
    ? await Promise.all([
        db
          .select()
          .from(traits)
          .where(and(inArray(traits.playerId, pids), eq(traits.formatKey, fk), lte(traits.rank, 2))),
        db
          .select()
          .from(splits)
          .where(
            and(
              inArray(splits.playerId, pids),
              eq(splits.formatKey, fk),
              eq(splits.discipline, "batting"),
              inArray(splits.dimension, ["type", "typePhase", "vsBowler"]),
            ),
          ),
      ])
    : [[], []];

  // Who bowled in this match, and what type they bowl.
  const bowlerIdx = new Set<number>();
  for (const inn of replay.innings) for (const ball of inn.balls) bowlerIdx.add(ball[2]);
  const bowlers = [...bowlerIdx]
    .map((i) => replay.people[i])
    .filter(Boolean)
    .map((p) => ({ ...p, type: p.bt ?? bySource.get(p.id)?.bowlingType ?? null }));

  return {
    formatKey: fk,
    model,
    datasetAsOf: meta?.dataAsOf ?? "",
    thresholds: {
      minBallsSplit: meta?.thresholds.minBallsSplit ?? 60,
      minBallsBowledSplit: meta?.thresholds.minBallsBowledSplit ?? 90,
    },
    people: replay.people.map((person) => {
      const p = bySource.get(person.id);
      if (!p) {
        return { id: person.id, name: person.name, team: person.team, player: null, traits: { strengths: [], weaknesses: [] }, batting: { vsType: [], vsTypePhase: [], vsBowler: [] } };
      }
      const mine = traitRows.filter((t) => t.playerId === p.id).sort((a, b) => a.rank - b.rank).map(toTraitRow);
      const opp = bowlers.filter((b) => b.team !== person.team);
      const types = new Set(opp.map((b) => b.type).filter((t): t is string => Boolean(t)));
      // v2 keys vsBowler by person id; v1 keyed it by name.
      const bowlerKeys = new Set(opp.flatMap((b) => [b.id, b.name]));
      const own = splitRows.filter((s) => s.playerId === p.id);
      const pick = (f: (s: (typeof own)[number]) => boolean): SplitRow[] => own.filter(f).map(toSplitRow).sort((a, b) => b.balls - a.balls);
      return {
        id: person.id,
        name: person.name,
        team: person.team,
        player: { slug: p.slug, bowlingType: p.bowlingType, battingHand: p.battingHand },
        traits: { strengths: mine.filter((t) => t.kind === "strength"), weaknesses: mine.filter((t) => t.kind === "weakness") },
        batting: {
          vsType: pick((s) => s.dimension === "type" && types.has(s.subject)),
          vsTypePhase: pick((s) => s.dimension === "typePhase" && types.has(s.subject.split("|")[0])),
          vsBowler: pick((s) => s.dimension === "vsBowler" && bowlerKeys.has(s.subject)),
        },
      };
    }),
  };
}

export const getReplayContext = cached("getReplayContext", loadReplayContext);
