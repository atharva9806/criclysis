/**
 * Ball-by-ball replay state: a port of pipeline/replay.py (replay_states,
 * win_curve) plus the scoreboard, scorecard, partnerships, required rate,
 * phase and the win-probability display rules (docs/ARCHITECTURE.md §4.4).
 *
 * A replay is a flat timeline of deliveries. A cursor is the number of
 * deliveries bowled so far: 0 is before the first ball, and
 * `timeline.deliveries.length` is the end of the match.
 *
 * Counting conventions follow pipeline/sources/cricsheet.py and aggregate.py:
 * - a delivery is legal unless it is a wide or a no-ball;
 * - a wide is not a ball faced, a no-ball is;
 * - "retired hurt" and "retired not out" do not cost a wicket;
 * - the bowler is charged bat runs plus wides and no-balls, and is credited
 *   with every dismissal except run outs, retirements, obstructing the field,
 *   handled the ball and timed out;
 * - fours and sixes are deliveries with 4 or 6 bat runs.
 * Penalty runs (v2 `penaltyRuns`) are added to the innings total: `pre` before
 * the first ball and `post` after the last one. v1 replays have none.
 */
import type { Ball, Fmt, FormatKey, Replay } from "../contract/pipeline";
import type { WinModel, WinModelCore } from "../winprob/model";

export const NOT_WICKETS = new Set(["retired hurt", "retired not out"]);
export const NON_BOWLER_DISMISSALS = new Set([
  "run out",
  "retired hurt",
  "retired out",
  "retired not out",
  "obstructing the field",
  "handled the ball",
  "timed out",
]);

/** Legal balls per innings (config.FORMATS); null for Tests. */
export const BALLS_PER_INNINGS: Record<Fmt, number | null> = { test: null, odi: 300, t20i: 120 };

export type Phase = { key: string; from: number; to: number; label: string };

/** config.PHASES: over index is 0-based, `to` is exclusive. */
export const PHASES: Record<Fmt, Phase[]> = {
  t20i: [
    { key: "powerplay", from: 0, to: 6, label: "Powerplay (1-6)" },
    { key: "middle", from: 6, to: 15, label: "Middle (7-15)" },
    { key: "death", from: 15, to: 20, label: "Death (16-20)" },
  ],
  odi: [
    { key: "powerplay", from: 0, to: 10, label: "Powerplay (1-10)" },
    { key: "middle", from: 10, to: 40, label: "Middle (11-40)" },
    { key: "death", from: 40, to: 50, label: "Death (41-50)" },
  ],
  test: [
    { key: "new_ball", from: 0, to: 20, label: "New ball (1-20)" },
    { key: "old_ball", from: 20, to: 60, label: "Old ball (21-60)" },
    { key: "second_new", from: 60, to: 1000, label: "Second new ball (80+)" },
  ],
};

/** sources/cricsheet.phase_for */
export function phaseFor(format: Fmt, over: number): Phase {
  const phases = PHASES[format] ?? PHASES.odi;
  return phases.find((p) => p.from <= over && over < p.to) ?? phases[phases.length - 1];
}

export const isLegal = (b: Ball) => b[6] !== "wides" && b[6] !== "noballs";
export const isWicket = (b: Ball) => !!b[7] && !NOT_WICKETS.has(b[7]);
const isBatterBall = (b: Ball) => b[6] !== "wides";
const conceded = (b: Ball) => b[4] + (b[6] === "wides" || b[6] === "noballs" ? b[5] : 0);
const bowlerCredited = (kind: string | null) => !!kind && !NON_BOWLER_DISMISSALS.has(kind);

/** "43.4" from legal balls. */
export function oversString(legalBalls: number): string {
  const rest = legalBalls % 6;
  return rest ? `${Math.floor(legalBalls / 6)}.${rest}` : `${legalBalls / 6}`;
}

// ---------------------------------------------------------------------------
// Port of replay.replay_states and replay.win_curve
// ---------------------------------------------------------------------------

export type ReplayState = {
  innings: number; // 1-based, as in Python
  ballsLeft: number;
  wickets: number;
  runs: number;
  target: number | null;
  index: number; // ball index within the innings
};

/**
 * State after every delivery of the first two innings. Python's replay_states,
 * except that `penaltyRuns.pre` (v2 only) opens the innings total.
 */
export function replayStates(replay: Replay, maxBalls: number): ReplayState[] {
  const out: ReplayState[] = [];
  replay.innings.slice(0, 2).forEach((inn, n) => {
    let legal = 0;
    let wickets = 0;
    let runs = inn.penaltyRuns?.pre ?? 0;
    const target = inn.target ?? null;
    inn.balls.forEach((b, i) => {
      runs += b[4] + b[5];
      if (isWicket(b)) wickets += 1;
      if (isLegal(b)) legal += 1;
      out.push({ innings: n + 1, ballsLeft: maxBalls - legal, wickets, runs, target, index: i });
    });
  });
  return out;
}

export type WinPoint = [innings: number, index: number, p: number];

/** P(side batting first wins) after every delivery: [innings, index, p]. */
export function winCurve(replay: Replay, model: WinModel): WinPoint[] {
  return replayStates(replay, model.maxBalls).map((s) => [
    s.innings,
    s.index,
    s.innings === 1 ? model.battingFirst(s.ballsLeft, s.wickets, s.runs) : 1 - model.chase(s.ballsLeft, s.wickets, (s.target ?? 0) - s.runs),
  ]);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type InningsMeta = {
  team: string;
  bowlingTeam: string;
  target: number | null;
  /** Balls available in this innings, when the format limits them. */
  ballLimit: number | null;
  penaltyPre: number;
  penaltyPost: number;
  /** [start, end) into timeline.deliveries */
  start: number;
  end: number;
};

export type Delivery = {
  seq: number;
  innings: number; // 0-based
  index: number; // within the innings' balls
  ball: Ball;
  over: number; // 0-based, from the data
  legal: boolean;
  /** "12.3": the over and the legal ball it belongs to (a wide repeats the number). */
  label: string;
  /** Innings state after this delivery. */
  runs: number;
  wickets: number;
  legalBalls: number;
};

export type Timeline = {
  replay: Replay;
  format: Fmt;
  formatKey: FormatKey;
  maxBalls: number | null;
  innings: InningsMeta[];
  deliveries: Delivery[];
};

export function buildTimeline(replay: Replay): Timeline {
  const maxBalls = BALLS_PER_INNINGS[replay.format] ?? null;
  const fullOvers = maxBalls ? maxBalls / 6 : null;
  const deliveries: Delivery[] = [];
  const innings: InningsMeta[] = replay.innings.map((inn, n) => {
    const start = deliveries.length;
    let runs = inn.penaltyRuns?.pre ?? 0;
    let wickets = 0;
    let legal = 0;
    let over = -1;
    let legalInOver = 0;
    inn.balls.forEach((b, index) => {
      if (b[0] !== over) {
        over = b[0];
        legalInOver = 0;
      }
      const ballNo = legalInOver + 1;
      const legalBall = isLegal(b);
      runs += b[4] + b[5];
      if (isWicket(b)) wickets += 1;
      if (legalBall) {
        legal += 1;
        legalInOver += 1;
      }
      deliveries.push({
        seq: deliveries.length,
        innings: n,
        index,
        ball: b,
        over,
        legal: legalBall,
        label: `${over}.${ballNo}`,
        runs,
        wickets,
        legalBalls: legal,
      });
    });
    const overs = n === 0 ? replay.scheduledOvers ?? fullOvers : inn.targetOvers ?? replay.scheduledOvers ?? fullOvers;
    return {
      team: inn.team,
      bowlingTeam: replay.teams.find((t) => t !== inn.team) ?? "",
      target: inn.target ?? null,
      ballLimit: maxBalls && overs ? Math.round(overs * 6) : null,
      penaltyPre: inn.penaltyRuns?.pre ?? 0,
      penaltyPost: inn.penaltyRuns?.post ?? 0,
      start,
      end: deliveries.length,
    };
  });
  return {
    replay,
    format: replay.format,
    formatKey: replay.formatKey ?? `${replay.format}-${replay.gender === "female" ? "w" : "m"}`,
    maxBalls,
    innings,
    deliveries,
  };
}

export type InningsTotal = { team: string; runs: number; wickets: number; legalBalls: number; overs: string };

/** Totals for the innings bowled up to `cursor` (penalty `post` once the innings is over). */
export function inningsTotals(tl: Timeline, cursor = tl.deliveries.length): InningsTotal[] {
  const out: InningsTotal[] = [];
  tl.innings.forEach((inn, n) => {
    if (cursor <= inn.start && !(cursor === inn.start && n === 0)) return;
    const upto = Math.min(cursor, inn.end);
    const last = upto > inn.start ? tl.deliveries[upto - 1] : null;
    const complete = cursor >= inn.end;
    const runs = (last ? last.runs : inn.penaltyPre) + (complete ? inn.penaltyPost : 0);
    const legalBalls = last ? last.legalBalls : 0;
    out.push({ team: inn.team, runs, wickets: last ? last.wickets : 0, legalBalls, overs: oversString(legalBalls) });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Outcome and win-probability eligibility (§4.4)
// ---------------------------------------------------------------------------

export type Outcome =
  | { kind: "win"; winner: string; text: string }
  | { kind: "tie"; text: string }
  | { kind: "draw"; text: string }
  | { kind: "noResult"; text: string };

/** The official result, as Cricsheet records it. */
export function outcomeOf(replay: Replay): Outcome {
  const text = replay.result?.trim() ?? "";
  if (replay.winner) return { kind: "win", winner: replay.winner, text: text || `${replay.winner} won` };
  if (/^match tied/i.test(text)) return { kind: "tie", text };
  if (/^no result/i.test(text)) return { kind: "noResult", text };
  if (replay.format === "test") return { kind: "draw", text: text || "Match drawn" };
  return { kind: "noResult", text: text || "No result" };
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

const RAIN_RULE = /\b(D\/L|DLS|VJD)\b/;

/**
 * Win probability, projected score and par are shown only for ODIs and T20Is
 * with no rain rule and the full scheduled and target overs, and only when a
 * model for the match's formatKey is available.
 */
export function winProbEligibility(replay: Replay, model: WinModelCore | WinModel | null | undefined): Eligibility {
  if (replay.format === "test") {
    return { ok: false, reason: "Win probability is modelled only for ODIs and T20Is. Tests can be drawn, so a two-outcome model does not fit them." };
  }
  const fullOvers = (BALLS_PER_INNINGS[replay.format] ?? 0) / 6;
  const method = replay.method ?? (RAIN_RULE.exec(replay.result ?? "")?.[1] || null);
  if (method) {
    return { ok: false, reason: `This match was decided by the ${method} method after rain, so its target does not mean what the model assumes. Win probability, projected score and par are hidden.` };
  }
  if (replay.scheduledOvers != null && replay.scheduledOvers !== fullOvers) {
    return { ok: false, reason: `This match was shortened to ${replay.scheduledOvers} overs a side. The model covers only full ${fullOvers}-over matches, so win probability, projected score and par are hidden.` };
  }
  const chase = replay.innings[1];
  if (chase?.targetOvers != null && chase.targetOvers !== fullOvers) {
    return { ok: false, reason: `The chase was reduced to ${chase.targetOvers} overs. The model covers only full ${fullOvers}-over matches, so win probability, projected score and par are hidden.` };
  }
  if (outcomeOf(replay).kind === "noResult") {
    return { ok: false, reason: "This match had no result, so win probability is not shown." };
  }
  const fk = replay.formatKey ?? `${replay.format}-${replay.gender === "female" ? "w" : "m"}`;
  const modelKey = model ? (model.formatKey ?? `${model.format}-m`) : null;
  if (!model || modelKey !== fk || model.maxBalls !== fullOvers * 6) {
    return { ok: false, reason: `No win-probability model is available for ${fk}.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Match state at a cursor
// ---------------------------------------------------------------------------

export type MatchState = {
  cursor: number;
  total: number;
  /** 0-based index of the innings in progress (or just completed). */
  innings: number;
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  runRate: number | null;
  target: number | null;
  need: number | null;
  ballsLeft: number | null;
  requiredRate: number | null;
  phase: Phase | null;
  last: Delivery | null;
  /** The delivery about to be bowled, when it belongs to the same innings. */
  next: Delivery | null;
  striker: number | null;
  nonStriker: number | null;
  bowler: number | null;
  inningsComplete: boolean;
  matchComplete: boolean;
  /** Completed innings before this one. */
  previous: InningsTotal[];
};

export function clampCursor(tl: Timeline, cursor: number): number {
  return Math.max(0, Math.min(tl.deliveries.length, Math.trunc(cursor)));
}

export function stateAt(tl: Timeline, rawCursor: number): MatchState {
  const cursor = clampCursor(tl, rawCursor);
  const total = tl.deliveries.length;
  const last = cursor > 0 ? tl.deliveries[cursor - 1] : null;
  const n = last ? last.innings : 0;
  const inn = tl.innings[n] ?? { team: tl.replay.teams[0] ?? "", bowlingTeam: tl.replay.teams[1] ?? "", target: null, ballLimit: tl.maxBalls, penaltyPre: 0, penaltyPost: 0, start: 0, end: 0 };
  const inningsComplete = cursor >= inn.end;
  const matchComplete = cursor >= total;
  const upcoming = cursor < total ? tl.deliveries[cursor] : null;
  const next = upcoming && upcoming.innings === n ? upcoming : null;

  const runs = (last ? last.runs : inn.penaltyPre) + (inningsComplete && last ? inn.penaltyPost : 0);
  const wickets = last ? last.wickets : 0;
  const legalBalls = last ? last.legalBalls : 0;
  const runRate = legalBalls ? (runs * 6) / legalBalls : null;

  let need: number | null = null;
  let ballsLeft: number | null = null;
  let requiredRate: number | null = null;
  if (inn.target != null) {
    need = Math.max(0, inn.target - runs);
    if (inn.ballLimit != null) {
      ballsLeft = Math.max(0, inn.ballLimit - legalBalls);
      requiredRate = ballsLeft > 0 && need > 0 ? (need * 6) / ballsLeft : null;
    }
  } else if (inn.ballLimit != null) {
    ballsLeft = Math.max(0, inn.ballLimit - legalBalls);
  }

  const ref = next ?? last;
  const phaseOver = (next ?? last)?.over ?? 0;
  let striker = ref ? ref.ball[1] : null;
  let nonStriker = ref ? ref.ball[3] : null;
  if (!next && last && last.ball[8] != null) {
    // The innings ended on a dismissal: only the survivor is left at the crease.
    if (last.ball[8] === striker) striker = null;
    if (last.ball[8] === nonStriker) nonStriker = null;
  }

  return {
    cursor,
    total,
    innings: n,
    battingTeam: inn.team,
    bowlingTeam: inn.bowlingTeam,
    runs,
    wickets,
    legalBalls,
    overs: oversString(legalBalls),
    runRate,
    target: inn.target,
    need,
    ballsLeft,
    requiredRate,
    phase: tl.innings.length ? phaseFor(tl.format, phaseOver) : null,
    last,
    next,
    striker,
    nonStriker,
    bowler: ref ? ref.ball[2] : null,
    inningsComplete,
    matchComplete,
    previous: inningsTotals(tl, cursor).slice(0, n),
  };
}

/** Cursor at the start of the next (dir 1) or previous (dir -1) over boundary. */
export function overBoundary(tl: Timeline, rawCursor: number, dir: 1 | -1): number {
  const cursor = clampCursor(tl, rawCursor);
  const d = tl.deliveries;
  const key = (i: number) => `${d[i].innings}:${d[i].over}`;
  if (dir === 1) {
    if (cursor >= d.length) return d.length;
    const k = key(cursor);
    let i = cursor;
    while (i < d.length && key(i) === k) i++;
    return i;
  }
  if (cursor <= 0) return 0;
  // Step back to the start of the over that holds the last bowled delivery;
  // if we are already at an over start, go to the start of the previous over.
  let i = cursor - 1;
  const k = key(i);
  while (i > 0 && key(i - 1) === k) i--;
  return i;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export type BattingRow = {
  person: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** null while batting (not out). */
  dismissal: { kind: string; bowler: number | null; label: string } | null;
  atCrease: boolean;
};

export type BowlingRow = {
  person: number;
  legalBalls: number;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  wides: number;
  noballs: number;
};

export type Partnership = {
  /** 1-based: the wicket this partnership was for. */
  wicket: number;
  batters: [number, number];
  runs: number;
  balls: number;
  unbroken: boolean;
};

export type FallOfWicket = { wicket: number; runs: number; person: number | null; label: string };

export type InningsCard = {
  innings: number;
  team: string;
  bowlingTeam: string;
  total: InningsTotal;
  complete: boolean;
  batting: BattingRow[];
  bowling: BowlingRow[];
  extras: { byes: number; legbyes: number; wides: number; noballs: number; penalty: number; total: number };
  fallOfWickets: FallOfWicket[];
  partnerships: Partnership[];
};

/**
 * "lbw b MA Starc". Replays carry no fielders, so a catch reads
 * "caught b MA Starc" rather than naming the catcher.
 */
export function dismissalLabel(kind: string, bowlerName: string | null): string {
  if (!bowlerCredited(kind) || !bowlerName) return kind;
  if (kind === "bowled") return `b ${bowlerName}`;
  if (kind === "caught and bowled") return `c & b ${bowlerName}`;
  return `${kind} b ${bowlerName}`;
}

export function scorecardAt(tl: Timeline, rawCursor = tl.deliveries.length): InningsCard[] {
  const cursor = clampCursor(tl, rawCursor);
  const people = tl.replay.people;
  const totals = inningsTotals(tl, cursor);
  const cards: InningsCard[] = [];
  tl.innings.forEach((inn, n) => {
    const total = totals[n];
    if (!total) return;
    const end = Math.min(cursor, inn.end);
    const complete = cursor >= inn.end;
    const batting = new Map<number, BattingRow>();
    const bowling = new Map<number, BowlingRow>();
    const overRuns = new Map<string, { bowler: number; runs: number; legal: number }>();
    const extras = { byes: 0, legbyes: 0, wides: 0, noballs: 0, penalty: inn.penaltyPre + (complete ? inn.penaltyPost : 0), total: 0 };
    const fallOfWickets: FallOfWicket[] = [];
    const partnerships: Partnership[] = [];
    let current: Partnership | null = null;

    const bat = (p: number | null) => {
      if (p == null) return null;
      let row = batting.get(p);
      if (!row) {
        row = { person: p, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: null, atCrease: false };
        batting.set(p, row);
      }
      return row;
    };

    for (let i = inn.start; i < end; i++) {
      const d = tl.deliveries[i];
      const [, batter, bowler, nonStriker, runsBat, ext, extraType, kind, out] = d.ball;
      const striker = bat(batter)!;
      const other = bat(nonStriker)!;
      // A batter who retired hurt and came back is batting again.
      for (const row of [striker, other]) if (row.dismissal && NOT_WICKETS.has(row.dismissal.kind)) row.dismissal = null;

      if (!current || current.batters[0] !== Math.min(batter, nonStriker) || current.batters[1] !== Math.max(batter, nonStriker)) {
        if (current) partnerships.push(current);
        current = { wicket: d.wickets - (isWicket(d.ball) ? 1 : 0) + 1, batters: [Math.min(batter, nonStriker), Math.max(batter, nonStriker)], runs: 0, balls: 0, unbroken: true };
      }
      current.runs += runsBat + ext;
      if (d.legal) current.balls += 1;

      striker.runs += runsBat;
      if (isBatterBall(d.ball)) striker.balls += 1;
      if (runsBat === 4) striker.fours += 1;
      else if (runsBat === 6) striker.sixes += 1;

      if (extraType && extraType in extras) extras[extraType as "byes" | "legbyes" | "wides" | "noballs" | "penalty"] += ext;

      let bw = bowling.get(bowler);
      if (!bw) {
        bw = { person: bowler, legalBalls: 0, overs: "0", maidens: 0, runs: 0, wickets: 0, wides: 0, noballs: 0 };
        bowling.set(bowler, bw);
      }
      bw.runs += conceded(d.ball);
      if (d.legal) bw.legalBalls += 1;
      if (extraType === "wides") bw.wides += 1;
      if (extraType === "noballs") bw.noballs += 1;
      if (bowlerCredited(kind)) bw.wickets += 1;
      const ok = `${bowler}:${d.over}`;
      const o = overRuns.get(ok) ?? { bowler, runs: 0, legal: 0 };
      o.runs += conceded(d.ball);
      if (d.legal) o.legal += 1;
      overRuns.set(ok, o);

      if (kind && out != null) {
        const victim = bat(out)!;
        victim.dismissal = { kind, bowler: bowlerCredited(kind) ? bowler : null, label: dismissalLabel(kind, bowlerCredited(kind) ? people[bowler]?.name ?? null : null) };
        if (isWicket(d.ball)) {
          fallOfWickets.push({ wicket: d.wickets, runs: d.runs, person: out, label: d.label });
        }
        current.unbroken = false;
        partnerships.push(current);
        current = null;
      }
    }
    if (current) partnerships.push(current);

    for (const o of overRuns.values()) {
      if (o.legal >= 6 && o.runs === 0) bowling.get(o.bowler)!.maidens += 1;
    }
    for (const bw of bowling.values()) bw.overs = oversString(bw.legalBalls);
    extras.total = extras.byes + extras.legbyes + extras.wides + extras.noballs + extras.penalty;

    const last = end > inn.start ? tl.deliveries[end - 1] : null;
    const next = !complete && cursor < tl.deliveries.length ? tl.deliveries[cursor] : null;
    const atCrease = new Set<number>();
    if (next && next.innings === n) {
      atCrease.add(next.ball[1]);
      atCrease.add(next.ball[3]);
    } else if (last) {
      for (const p of [last.ball[1], last.ball[3]]) if (!batting.get(p)?.dismissal) atCrease.add(p);
    }
    // A new batter who has not faced yet still appears, at the crease.
    for (const p of atCrease) bat(p);
    for (const row of batting.values()) row.atCrease = !complete && atCrease.has(row.person) && !row.dismissal;

    cards.push({
      innings: n,
      team: inn.team,
      bowlingTeam: inn.bowlingTeam,
      total,
      complete,
      batting: [...batting.values()],
      bowling: [...bowling.values()],
      extras,
      fallOfWickets,
      partnerships,
    });
  });
  return cards;
}

/** Current partnership at the cursor, if the innings is in progress. */
export function currentPartnership(card: InningsCard | undefined): Partnership | null {
  const p = card?.partnerships[card.partnerships.length - 1];
  return p && p.unbroken && !card.complete ? p : null;
}

// ---------------------------------------------------------------------------
// Ball labels for the ticker
// ---------------------------------------------------------------------------

export type BallTone = "dot" | "run" | "boundary" | "wicket" | "extra";

export function ballLabel(b: Ball): { text: string; tone: BallTone; description: string } {
  const [, , , , runsBat, ext, extraType, kind] = b;
  if (kind) {
    const runs = runsBat + ext;
    return { text: "W", tone: "wicket", description: runs ? `${kind}, ${runs} run${runs === 1 ? "" : "s"}` : kind };
  }
  if (extraType) {
    const short = { wides: "wd", noballs: "nb", byes: "b", legbyes: "lb", penalty: "p" }[extraType];
    const name = { wides: "wide", noballs: "no-ball", byes: "bye", legbyes: "leg bye", penalty: "penalty" }[extraType];
    const runs = runsBat + ext;
    return { text: `${runs}${short}`, tone: "extra", description: `${runs} ${name}${runs === 1 ? "" : "s"}${runsBat ? `, ${runsBat} off the bat` : ""}` };
  }
  if (runsBat === 0) return { text: "•", tone: "dot", description: "dot ball" };
  if (runsBat === 4 || runsBat === 6) return { text: String(runsBat), tone: "boundary", description: runsBat === 4 ? "four" : "six" };
  return { text: String(runsBat), tone: "run", description: `${runsBat} run${runsBat === 1 ? "" : "s"}` };
}

// ---------------------------------------------------------------------------
// Win probability for display
// ---------------------------------------------------------------------------

export type ProbabilityView =
  | { kind: "hidden"; reason: string }
  | { kind: "model"; battingFirst: number }
  | { kind: "result"; outcome: Outcome };

/**
 * What the view shows for "who is winning" at a cursor. At the end of the
 * match it is always the official result: a tie (or no result) never shows
 * the model's last probability.
 */
export function probabilityAt(
  tl: Timeline,
  curve: WinPoint[] | null,
  model: WinModel | null,
  eligibility: Eligibility,
  rawCursor: number,
): ProbabilityView {
  const cursor = clampCursor(tl, rawCursor);
  if (cursor >= tl.deliveries.length) return { kind: "result", outcome: outcomeOf(tl.replay) };
  if (!eligibility.ok) return { kind: "hidden", reason: eligibility.reason };
  if (!curve || !model) return { kind: "hidden", reason: "No win-probability model is available." };
  if (cursor === 0) return { kind: "model", battingFirst: model.battingFirst(model.maxBalls, 0, tl.innings[0]?.penaltyPre ?? 0) };
  const point = curve[cursor - 1];
  return point ? { kind: "model", battingFirst: point[2] } : { kind: "hidden", reason: "Only the first two innings are modelled." };
}

export type ChartPoint = {
  seq: number;
  /** Overs across the match: innings 2 starts at the format's full overs. */
  x: number;
  /** P(side batting first wins), 0..1 */
  p: number;
  innings: number;
  label: string;
  score: string;
  /** The delivery completed an over (or is the start point). */
  overEnd: boolean;
};

/**
 * Win-probability series up to the cursor. When the replay reaches the end of
 * a match that was not won outright, the final model point is dropped so the
 * chart never shows a winner the official result does not.
 */
export function chartSeries(tl: Timeline, curve: WinPoint[], model: WinModel, rawCursor: number): ChartPoint[] {
  const cursor = clampCursor(tl, rawCursor);
  const maxOvers = model.maxBalls / 6;
  const out: ChartPoint[] = [
    { seq: -1, x: 0, p: model.battingFirst(model.maxBalls, 0, tl.innings[0]?.penaltyPre ?? 0), innings: 1, label: "0.0", score: "Start", overEnd: true },
  ];
  const upto = Math.min(cursor, curve.length);
  for (let i = 0; i < upto; i++) {
    const d = tl.deliveries[i];
    out.push({
      seq: i,
      x: d.innings * maxOvers + d.legalBalls / 6,
      p: curve[i][2],
      innings: d.innings + 1,
      label: d.label,
      score: `${d.runs}/${d.wickets}`,
      overEnd: d.legal && d.legalBalls % 6 === 0,
    });
  }
  if (cursor >= tl.deliveries.length && out.length > 1) {
    const outcome = outcomeOf(tl.replay);
    if (outcome.kind !== "win") out.pop();
    else out[out.length - 1].p = outcome.winner === tl.innings[0]?.team ? 1 : 0;
  }
  return out;
}
