import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { players, splits, traits } from "@/db/schema";
import type { DossierLine, MatchupPlan, PlayerDossier, TraitRow } from "@/lib/contract/db";
import type { Fmt, PhaseRow, TeamFormat } from "@/lib/contract/pipeline";
import { num, plural, record } from "@/lib/format";
import { phaseRates, toSplitRow } from "@/lib/metrics";
import { cached } from "./cache";
import { getDatasetMeta } from "./meta";
import { getPlayerSummary } from "./players";
import { getHeadToHead, getTeam } from "./teams";
import { toTraitRow } from "./rows";

/**
 * A scouting dossier built only from stored evidence: the player's claims
 * (each with its value, baseline and balls) and their gated splits.
 */
async function loadPlayerDossier(slug: string, fmt?: Fmt): Promise<PlayerDossier | null> {
  const s = await getPlayerSummary(slug, fmt);
  if (!s?.formatKey) return null;
  const fk = s.formatKey;
  const [p] = await db.select({ id: players.id }).from(players).where(eq(players.slug, slug)).limit(1);
  const rows = await db
    .select()
    .from(splits)
    .where(and(eq(splits.playerId, p.id), eq(splits.formatKey, fk), inArray(splits.dimension, ["type", "phase", "hand"])));
  const all = rows.map(toSplitRow).sort((a, b) => b.balls - a.balls);
  const career = s.careers.find((c) => c.formatKey === fk) ?? null;
  const of = (ts: TraitRow[], d: "batting" | "bowling") => ts.filter((t) => t.discipline === d);
  const batted = (career?.balls ?? 0) > 0;
  const bowled = (career?.bowlBalls ?? 0) > 0;
  return {
    player: s.player,
    formatKey: fk,
    career,
    batting: batted
      ? {
          attack: of(s.weaknesses, "batting"),
          avoid: of(s.strengths, "batting"),
          vsType: all.filter((x) => x.discipline === "batting" && x.dimension === "type"),
          byPhase: all.filter((x) => x.discipline === "batting" && x.dimension === "phase"),
        }
      : null,
    bowling: bowled
      ? {
          strengths: of(s.strengths, "bowling"),
          weaknesses: of(s.weaknesses, "bowling"),
          byHand: all.filter((x) => x.discipline === "bowling" && x.dimension === "hand"),
          byPhase: all.filter((x) => x.discipline === "bowling" && x.dimension === "phase"),
        }
      : null,
  };
}

function phaseLines(rows: PhaseRow[], what: "scores" | "concedes"): DossierLine[] {
  return rows
    .filter((r) => r.balls > 0)
    .map((r) => {
      const x = phaseRates(r);
      const wkts = x.ballsPerWicket !== null ? `, a wicket every ${num(x.ballsPerWicket, 1)} balls` : "";
      return {
        text: `${r.label}: ${what} ${num(x.runsPerOver, 2)} runs per over${wkts}`,
        sample: `${plural(r.innings, "innings", "innings")}, ${plural(r.balls, "ball")}`,
      };
    });
}

/**
 * A fixture plan from both teams' summaries: head to head, batting first or
 * chasing, toss choices, phase rates, and the opponent's leading players with
 * their own weaknesses. Every line carries the sample it rests on.
 */
async function loadMatchupPlan(teamId: string, oppId: string, fmt: Fmt): Promise<MatchupPlan | null> {
  const [team, opp, h2h, meta] = await Promise.all([getTeam(teamId, fmt), getTeam(oppId, fmt), getHeadToHead(teamId, oppId, fmt), getDatasetMeta()]);
  if (!team || !opp || team.formatKey !== opp.formatKey) return null;
  const fk = team.formatKey;
  const minM = meta?.thresholds.teamMinMatches ?? 5;
  const T = team.team.label;
  const O = opp.team.label;
  const lines: MatchupPlan["lines"] = [];

  const h = h2h.summary;
  if (h) {
    lines.push({
      heading: "Head to head",
      items: [
        {
          text: `${T} ${record(h, minM)} against ${O}; lost ${h.lost}, tied ${h.tied}, drawn ${h.drawn}, no result ${h.noResult}`,
          sample: `${plural(h.matches, "match", "matches")}, last on ${h.lastDate}`,
        },
      ],
    });
  }

  const order = (label: string, d: TeamFormat["batFirstChase"]): DossierLine[] =>
    [
      { text: `${label} batting first: ${record(d.battingFirst, minM)}`, sample: plural(d.battingFirst.matches, "match", "matches"), n: d.battingFirst.matches },
      { text: `${label} chasing: ${record(d.chasing, minM)}`, sample: plural(d.chasing.matches, "match", "matches"), n: d.chasing.matches },
    ]
      .filter((l) => l.n > 0)
      .map(({ text, sample }) => ({ text, sample }));
  const orderItems = [...order(T, team.detail.batFirstChase), ...order(O, opp.detail.batFirstChase)];
  if (orderItems.length) lines.push({ heading: "Batting first or chasing", items: orderItems });

  const toss = (label: string, t: TeamFormat["toss"]): DossierLine[] =>
    t.won > 0
      ? [
          {
            text: `${label} won the toss ${plural(t.won, "time")}: chose to bat ${plural(t.decisions.bat.matches, "time")} (${record(t.decisions.bat, minM)}), to field ${plural(t.decisions.field.matches, "time")} (${record(t.decisions.field, minM)})`,
            sample: plural(t.won + t.lost, "toss", "tosses"),
          },
        ]
      : [];
  const tossItems = [...toss(T, team.detail.toss), ...toss(O, opp.detail.toss)];
  if (tossItems.length) lines.push({ heading: "Toss", items: tossItems });

  const oppBat = phaseLines(opp.detail.phases.batting, "scores");
  if (oppBat.length) lines.push({ heading: `${O} batting, by phase`, items: oppBat });
  const oppBowl = phaseLines(opp.detail.phases.bowling, "concedes");
  if (oppBowl.length) lines.push({ heading: `${O} bowling, by phase`, items: oppBowl });

  // The opponent's leading players, with their own weaknesses in this format.
  const batters = opp.detail.topBatters.slice(0, 6);
  const bowlers = opp.detail.topBowlers.slice(0, 6);
  const ids = [...new Set([...batters, ...bowlers].map((p) => p.playerId))];
  const known = ids.length ? await db.select({ id: players.id, sourceId: players.sourceId }).from(players).where(inArray(players.sourceId, ids)) : [];
  const pidOf = new Map(known.map((k) => [k.sourceId, k.id]));
  const weak = known.length
    ? await db
        .select()
        .from(traits)
        .where(and(inArray(traits.playerId, known.map((k) => k.id)), eq(traits.formatKey, fk), eq(traits.kind, "weakness")))
    : [];
  const weaknessesOf = (personId: string, discipline: "batting" | "bowling") =>
    weak
      .filter((t) => t.playerId === pidOf.get(personId) && t.discipline === discipline)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 2)
      .map(toTraitRow);

  return {
    formatKey: fk,
    team: { id: team.team.id, label: T },
    opponent: { id: opp.team.id, label: O },
    headToHead: h,
    lines,
    opponentBatters: batters.map((b) => ({ ...b, traits: weaknessesOf(b.playerId, "batting") })),
    opponentBowlers: bowlers.map((b) => ({ ...b, traits: weaknessesOf(b.playerId, "bowling") })),
    recent: h2h.matches.slice(0, 5),
  };
}

export const buildPlayerDossier = cached("buildPlayerDossier", loadPlayerDossier);
export const buildMatchupPlan = cached("buildMatchupPlan", loadMatchupPlan);

