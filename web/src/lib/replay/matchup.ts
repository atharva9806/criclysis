/**
 * Player context for a replay, read from the optional ReplayContext
 * (docs/ARCHITECTURE.md §4.3): the matchup card (current batter against the
 * current bowler's type) and each XI with its top strength and weakness.
 *
 * Everything here is a lookup. No figure is computed or estimated: rows the
 * data layer left out (below the display gates) come back as null, and the
 * view says "not enough balls".
 */
import type { SplitRow, ReplayContext, TraitRow } from "../contract/db";
import type { Replay } from "../contract/pipeline";
import type { Phase } from "./engine";

/** config.BOWLING_TYPES: the taxonomy behind `bowlingType` and `bt` codes. */
export const BOWLING_TYPES: Record<string, { label: string; family: "pace" | "spin" }> = {
  rf: { label: "Right-arm fast", family: "pace" },
  rfm: { label: "Right-arm fast-medium", family: "pace" },
  rm: { label: "Right-arm medium", family: "pace" },
  lf: { label: "Left-arm fast", family: "pace" },
  lfm: { label: "Left-arm fast-medium", family: "pace" },
  lm: { label: "Left-arm medium", family: "pace" },
  ob: { label: "Off break", family: "spin" },
  lb: { label: "Leg break", family: "spin" },
  sla: { label: "Slow left-arm orthodox", family: "spin" },
  slc: { label: "Left-arm wrist spin", family: "spin" },
};

export const bowlingTypeLabel = (code: string | null | undefined) => (code ? BOWLING_TYPES[code]?.label ?? code : null);

type ContextPerson = ReplayContext["people"][number];

export function contextPerson(ctx: ReplayContext | null | undefined, replay: Replay, person: number | null): ContextPerson | null {
  if (!ctx || person == null) return null;
  const p = replay.people[person];
  if (!p) return null;
  return ctx.people.find((c) => (p.id ? c.id === p.id : c.name === p.name)) ?? null;
}

/** Bowling type code: the replay's own `bt` (v2) or the player's profile. */
export function bowlingTypeOf(ctx: ReplayContext | null | undefined, replay: Replay, person: number | null): string | null {
  if (person == null) return null;
  return replay.people[person]?.bt || contextPerson(ctx, replay, person)?.player?.bowlingType || null;
}

export type Matchup = {
  batter: { person: number; name: string; slug: string | null; inDataset: boolean };
  bowler: { person: number; name: string; type: string | null; typeLabel: string | null };
  phase: Phase | null;
  /** Career figures against this bowling type (all phases). */
  vsType: SplitRow | null;
  /** Career figures against this type in this phase of the innings. */
  vsTypePhase: SplitRow | null;
  /** Career figures against this bowler. */
  vsBowler: SplitRow | null;
  minBalls: number;
};

const gated = (row: SplitRow | undefined, min: number) => (row && row.balls >= min ? row : null);

export function matchupFor(
  ctx: ReplayContext | null | undefined,
  replay: Replay,
  batter: number | null,
  bowler: number | null,
  phase: Phase | null,
): Matchup | null {
  if (!ctx || batter == null || bowler == null) return null;
  const bat = replay.people[batter];
  const bowl = replay.people[bowler];
  if (!bat || !bowl) return null;
  const cp = contextPerson(ctx, replay, batter);
  const type = bowlingTypeOf(ctx, replay, bowler);
  const min = ctx.thresholds.minBallsSplit;
  const rows = cp?.batting;
  return {
    batter: { person: batter, name: bat.name, slug: cp?.player?.slug ?? null, inDataset: !!cp?.player },
    bowler: { person: bowler, name: bowl.name, type, typeLabel: bowlingTypeLabel(type) },
    phase,
    vsType: type ? gated(rows?.vsType.find((r) => r.subject === type), min) : null,
    vsTypePhase: type && phase ? gated(rows?.vsTypePhase.find((r) => r.subject === `${type}|${phase.key}`), min) : null,
    vsBowler: gated(rows?.vsBowler.find((r) => (bowl.id && r.subject === bowl.id) || r.label === bowl.name), min),
    minBalls: min,
  };
}

export type SquadMember = {
  person: number;
  name: string;
  slug: string | null;
  inDataset: boolean;
  strength: TraitRow | null;
  weakness: TraitRow | null;
};

/** Both XIs in team-sheet order, each with its top strength and weakness when the context has them. */
export function squads(replay: Replay, ctx: ReplayContext | null | undefined): { team: string; players: SquadMember[] }[] {
  const teams = replay.teams.length ? replay.teams : [...new Set(replay.people.map((p) => p.team))];
  return teams.map((team) => ({
    team,
    players: replay.people
      .map((p, person) => ({ p, person }))
      .filter(({ p }) => p.team === team)
      .map(({ p, person }) => {
        const cp = contextPerson(ctx, replay, person);
        return {
          person,
          name: p.name,
          slug: cp?.player?.slug ?? null,
          inDataset: !!cp?.player,
          strength: cp?.traits.strengths[0] ?? null,
          weakness: cp?.traits.weaknesses[0] ?? null,
        };
      }),
  }));
}
