// Pure mappers from pipeline JSON (docs/ARCHITECTURE.md §1) to table rows
// (§2). Rows use the SQL column names. No I/O here, so every mapper is unit
// tested (mappers.test.mjs).
import { sha1 } from "./hash.mjs";
import { formatKeyOf } from "./source.mjs";

const orNull = (v) => (v === undefined || v === "" ? null : v);
const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);

/** Attach content_hash: sha1 of the row without it. */
function hashed(row) {
  return { ...row, content_hash: sha1(row) };
}

// ------------------------------------------------------------------ players

/**
 * players row from players/<slug>.json (.meta first) and its players.json
 * entry. `sampleBalls` is NEW in v2; for v1 it is the same definition (balls
 * faced plus bowled, all formats) summed from the pipeline's own totals.
 */
export function mapPlayer(file, indexRow) {
  const meta = file.meta ?? {};
  const gender = file.gender ?? meta.gender ?? indexRow?.gender ?? "male";
  const sampleBalls =
    indexRow?.sampleBalls ??
    sum(Object.values(file.formats ?? {}), (f) => (f.batting?.overall.balls ?? 0) + (f.bowling?.overall.balls ?? 0));
  return hashed({
    source_id: file.id,
    slug: file.slug,
    name: file.name,
    full_name: orNull(meta.fullName ?? indexRow?.fullName),
    gender,
    country: orNull(meta.country ?? indexRow?.country),
    teams: meta.teams ?? indexRow?.teams ?? [],
    team_ids: meta.teamIds ?? indexRow?.teamIds ?? [],
    role: orNull(meta.role ?? indexRow?.role),
    batting_hand: orNull(meta.battingHand ?? indexRow?.battingHand),
    bowling_type: orNull(meta.bowlingType ?? indexRow?.bowlingType),
    cricinfo_id: orNull(meta.cricinfoId ?? indexRow?.cricinfoId),
    born: orNull(meta.born ?? indexRow?.born),
    debut: orNull(meta.debut ?? indexRow?.debut),
    last_played: orNull(meta.lastPlayed ?? indexRow?.lastPlayed),
    sample_balls: sampleBalls,
  });
}

const BAT_DIMS = [
  ["type", "byType"],
  ["family", "byFamily"],
  ["phase", "byPhase"],
  ["entry", "byEntry"],
  ["typePhase", "byTypePhase"],
  ["opposition", "byOpposition"],
  ["country", "byCountry"],
  ["venue", "byVenue"],
  ["home", "byHome"],
  ["inningsNo", "byInningsNo"],
  ["chase", "byChase"],
  ["position", "byPosition"],
  ["vsBowler", "vsBowler"],
];
const BOWL_DIMS = [
  ["hand", "byHand"],
  ["phase", "byPhase"],
  ["opposition", "byOpposition"],
  ["country", "byCountry"],
  ["home", "byHome"],
  ["inningsNo", "byInningsNo"],
  ["vsBatter", "vsBatter"],
];

function batSplitRows(batting, minBalls) {
  const rows = [];
  for (const [dimension, key] of BAT_DIMS) {
    for (const [subject, s] of Object.entries(batting[key] ?? {})) {
      if (s.balls < minBalls) continue;
      rows.push({
        discipline: "batting",
        dimension,
        subject,
        label: s.name ?? null,
        balls: s.balls,
        runs: s.runs,
        outs: s.outs,
        wickets: null,
        dots: s.dots,
        fours: s.fours,
        sixes: s.sixes,
        // 0 means "not tracked for this dimension": only byPosition counts innings.
        innings: s.innings || null,
      });
    }
  }
  return rows;
}

function bowlSplitRows(bowling, minBalls) {
  const rows = [];
  for (const [dimension, key] of BOWL_DIMS) {
    for (const [subject, s] of Object.entries(bowling[key] ?? {})) {
      if (s.balls < minBalls) continue;
      rows.push({
        discipline: "bowling",
        dimension,
        subject,
        label: s.name ?? null,
        balls: s.balls,
        runs: s.runs,
        outs: null,
        wickets: s.wickets,
        dots: s.dots,
        fours: s.fours,
        sixes: s.sixes,
        innings: s.innings || null,
      });
    }
  }
  return rows;
}

function dismissalRows(discipline, kind, counts) {
  return Object.entries(counts ?? {}).map(([subject, count]) => ({ discipline, kind, subject, count }));
}

function yearlyRows(batting, bowling) {
  const batYear = batting?.byYear ?? {};
  const bowlYear = bowling?.byYear ?? {};
  const countBy = (inns) => {
    const m = new Map();
    for (const i of inns ?? []) m.set(i.d.slice(0, 4), (m.get(i.d.slice(0, 4)) ?? 0) + 1);
    return m;
  };
  const batInns = countBy(batting?.innings);
  const bowlInns = countBy(bowling?.innings);
  const years = [...new Set([...Object.keys(batYear), ...Object.keys(bowlYear), ...batInns.keys(), ...bowlInns.keys()])].sort();
  return years.map((year) => {
    const b = batYear[year];
    const w = bowlYear[year];
    return {
      year: Number(year),
      bat_innings: batInns.get(year) ?? (b ? 0 : null),
      runs: b?.runs ?? null,
      balls: b?.balls ?? null,
      outs: b?.outs ?? null,
      fours: b?.fours ?? null,
      sixes: b?.sixes ?? null,
      bowl_innings: bowlInns.get(year) ?? (w ? 0 : null),
      bowl_balls: w?.balls ?? null,
      runs_conceded: w?.runs ?? null,
      wickets: w?.wickets ?? null,
    };
  });
}

function inningsRows(batting, bowling) {
  const rows = [];
  for (const i of batting?.innings ?? []) {
    rows.push({
      discipline: "batting",
      match_id: i.m,
      played_on: i.d,
      opponent: i.vs,
      innings_no: i.inn ?? null,
      runs: i.r,
      balls_faced: i.b,
      fours: i.f4,
      sixes: i.f6,
      position: i.pos ?? null,
      out: i.out,
      chase: i.chase ?? null,
      dismissal: orNull(i.how),
      dismissed_by_id: orNull(i.byId),
      balls_bowled: null,
      runs_conceded: null,
      wickets: null,
      maidens: null,
    });
  }
  for (const i of bowling?.innings ?? []) {
    rows.push({
      discipline: "bowling",
      match_id: i.m,
      played_on: i.d,
      opponent: i.vs,
      innings_no: null,
      runs: null,
      balls_faced: null,
      fours: null,
      sixes: null,
      position: null,
      out: null,
      chase: null,
      dismissal: null,
      dismissed_by_id: null,
      balls_bowled: i.b,
      runs_conceded: i.r,
      wickets: i.w,
      maidens: i.md,
    });
  }
  return rows;
}

function careerRow(payload) {
  const bat = payload.batting;
  const bowl = payload.bowling;
  const bo = bat?.overall;
  const bm = bat?.milestones;
  const wo = bowl?.overall;
  const wm = bowl?.milestones;
  return {
    matches: payload.matches ?? null,
    bat_innings: bo?.innings ?? null,
    not_outs: bm?.notOuts ?? null,
    runs: bo?.runs ?? null,
    balls: bo?.balls ?? null,
    outs: bo?.outs ?? null,
    highest: bm?.highest ?? null,
    highest_not_out: bm?.highestNotOut ?? null,
    hundreds: bm?.hundreds ?? null,
    fifties: bm?.fifties ?? null,
    fours: bo?.fours ?? null,
    sixes: bo?.sixes ?? null,
    dots: bo?.dots ?? null,
    bat_avg: bo?.avg ?? null,
    bat_sr: bo ? (bo.balls ? bo.sr : null) : null,
    bowl_innings: wo?.innings ?? null,
    bowl_balls: wo?.balls ?? null,
    runs_conceded: wo?.runs ?? null,
    wickets: wo?.wickets ?? null,
    maidens: bowl ? sum(bowl.innings ?? [], (i) => i.md) : null,
    bowl_dots: wo?.dots ?? null,
    four_wkts: wm?.fourWickets ?? null,
    five_wkts: wm?.fiveWickets ?? null,
    best_wickets: wm?.best?.wickets ?? null,
    best_runs: wm?.best?.runs ?? null,
    bowl_avg: wo?.avg ?? null,
    bowl_econ: wo ? (wo.balls ? wo.econ : null) : null,
    bowl_sr: wo?.sr ?? null,
  };
}

function traitRows(payload) {
  const one = (kind) => (c, i) => ({
    kind,
    rank: i + 1,
    claim_id: c.id,
    discipline: c.discipline,
    dimension_key: c.dimensionKey,
    dimension: c.dimension,
    subject_key: c.subjectKey,
    subject: c.subject,
    metric: c.metric,
    metric_label: c.metricLabel,
    value: c.value,
    baseline: c.baseline ?? null,
    cohort_median: c.cohortMedian,
    percentile: c.percentile,
    balls: c.balls,
    confidence: c.confidence,
    higher_is_better: c.higherIsBetter,
    text: c.text,
  });
  return [...(payload.strengths ?? []).map(one("strength")), ...(payload.weaknesses ?? []).map(one("weakness"))];
}

function profileRows(payload) {
  return Object.entries(payload.profile ?? {}).map(([axis, p]) => ({
    axis,
    label: p.label,
    discipline: p.discipline,
    value: p.value,
    percentile: p.percentile,
    balls: p.balls,
  }));
}

/**
 * Every row for one player x format. `statsHash` covers career_stats (minus
 * the claim counts), innings, yearly_stats, splits and dismissal_counts;
 * `analysisHash` covers traits, profile_dimensions and the claim counts.
 */
export function mapPlayerFormat(fmt, payload, gender, thresholds) {
  const formatKey = payload.formatKey ?? formatKeyOf(fmt, gender);
  const bat = payload.batting;
  const bowl = payload.bowling;
  const career = careerRow(payload);
  const inningsR = inningsRows(bat, bowl);
  const yearly = yearlyRows(bat, bowl);
  const splitsR = [
    ...(bat ? batSplitRows(bat, thresholds.minBallsSplit) : []),
    ...(bowl ? bowlSplitRows(bowl, thresholds.minBallsBowledSplit) : []),
  ];
  const dismissals = [
    ...dismissalRows("batting", "how", bat?.dismissals),
    ...dismissalRows("batting", "byType", bat?.dismissedByType),
    ...dismissalRows("bowling", "wicketKind", bowl?.wicketKinds),
  ];
  const traitsR = traitRows(payload);
  const profile = profileRows(payload);
  const claimCounts = { strengths: (payload.strengths ?? []).length, weaknesses: (payload.weaknesses ?? []).length };
  return {
    formatKey,
    career: { ...career, ...claimCounts },
    innings: inningsR,
    yearly,
    splits: splitsR,
    dismissals,
    traits: traitsR,
    profile,
    statsHash: sha1({ career, innings: inningsR, yearly, splits: splitsR, dismissals }),
    analysisHash: sha1({ claimCounts, traits: traitsR, profile }),
  };
}

// ------------------------------------------------------------------ matches

/** matches row; featured_rank falls back to the position in replays/index.json. */
export function mapMatch(m, indexRank = null) {
  const r = m.result;
  return hashed({
    id: m.id,
    gender: m.gender,
    format: m.format,
    format_key: m.formatKey ?? formatKeyOf(m.format, m.gender),
    match_type_number: m.matchTypeNumber ?? null,
    start_date: m.startDate,
    end_date: m.endDate,
    season: m.season,
    event_name: m.event?.name ?? null,
    event_stage: m.event?.stage ?? null,
    event_group: m.event?.group ?? null,
    event_match_number: m.event?.matchNumber ?? null,
    venue: m.venue,
    venue_key: m.venueKey,
    city: m.city ?? null,
    country: m.country ?? null,
    team1_id: m.teams[0].id,
    team1: m.teams[0].name,
    team2_id: m.teams[1].id,
    team2: m.teams[1].name,
    toss_winner: m.toss?.winner ?? null,
    toss_decision: m.toss?.decision ?? null,
    result_type: r.type,
    winner_id: r.winnerId ?? null,
    winner: r.winner ?? null,
    margin_runs: r.by?.runs ?? null,
    margin_wickets: r.by?.wickets ?? null,
    margin_innings: Boolean(r.by?.innings),
    method: r.method ?? null,
    eliminator: r.eliminator ?? null,
    result_text: r.text,
    player_of_match: m.playerOfMatch ?? [],
    innings: m.innings ?? [],
    scheduled_overs: m.scheduledOvers ?? null,
    missing: m.missing ?? [],
    has_replay: Boolean(m.hasReplay),
    featured_rank: m.featuredRank ?? indexRank,
  });
}

// -------------------------------------------------------------------- teams

/** teams row from a teams/index.json entry, or from a team file when the index lacks it. */
export function mapTeam(t) {
  const spans = Object.values(t.formats ?? {}).map((f) => ({
    first: f.first ?? f.span?.first ?? null,
    last: f.last ?? f.span?.last ?? null,
    matches: f.matches ?? f.record?.matches ?? 0,
  }));
  const firsts = spans.map((s) => s.first).filter(Boolean).sort();
  const lasts = spans.map((s) => s.last).filter(Boolean).sort();
  return hashed({
    id: t.id,
    name: t.name,
    gender: t.gender,
    label: t.label,
    first_match: firsts[0] ?? null,
    last_match: lasts[lasts.length - 1] ?? null,
    matches: sum(spans, (s) => s.matches),
  });
}

/** team_summaries row: the record and span as columns, the rest of TeamFormat as `detail`. */
export function mapTeamSummary(teamId, fmt, gender, tf) {
  const { record, span } = tf;
  const detail = { ...tf };
  delete detail.record;
  delete detail.span;
  return hashed({
    team_id: teamId,
    format_key: tf.formatKey ?? formatKeyOf(fmt, gender),
    matches: record.matches,
    won: record.won,
    lost: record.lost,
    tied: record.tied,
    drawn: record.drawn,
    no_result: record.noResult,
    win_pct: record.winPct ?? null,
    first_date: span?.first ?? null,
    last_date: span?.last ?? null,
    detail,
  });
}

// ------------------------------------------------------------------- venues

export function mapVenue(key, v) {
  return hashed({
    key,
    name: v.name,
    city: orNull(v.city),
    country: orNull(v.country),
    formats: v.formats ?? {},
  });
}

// --------------------------------------------------------------- win models

export function mapWinModel(formatKey, m, holdoutFrom) {
  return hashed({
    format_key: formatKey,
    model: {
      format: m.format,
      maxBalls: m.maxBalls,
      theta: m.theta,
      features: m.features,
      resources: m.resources,
      dispersion: m.dispersion,
      resourceParams: m.resourceParams,
      firstInningsWin: m.firstInningsWin,
      par: m.par,
    },
    venues: m.venues ?? {},
    validation: m.validation,
    golden: m.golden ?? [],
    matches: m.matches,
    half_life_years: m.halfLifeYears ?? null,
    holdout_from: holdoutFrom ?? null,
  });
}

// ------------------------------------------------------------------ replays

/** Uncompressed size and ball count for match_replays; `json` is the parsed replay. */
export function replayStats(json, rawBytes) {
  return { bytes: rawBytes, balls: sum(json.innings ?? [], (i) => (i.balls ?? []).length) };
}
