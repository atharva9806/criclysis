# Criclysis architecture (v2)

Status: the design for the v2 build (men's and women's internationals, team analysis, an index of all matches, daily refresh and replays). Written 2026-10-08 against `main` @ `2e8bd37`. Owner: F (docs). Sections 1, 2 and 4.3 are **contracts**: change them only through a contract PR (§5.0).

## 0. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Every player is keyed by **Cricsheet person id**, never by name. | Keying by name merges different people today (R1, verified). |
| D2 | `formatKey = "<format>-<m\|w>"` (e.g. `odi-w`) keys cohorts, database rows, models and URLs. A player's gender is stored on the player. | Women are only compared with women, and the format key alone tells men's ODI from women's ODI. |
| D3 | The pipeline computes every number and the web reads Postgres. The only maths in TypeScript is the win-probability port and the replay state, both tested against Python output. | One source of truth, covered by Python tests. |
| D4 | Player tables stay normalised (the proven design). Team summaries are JSONB. Replays are gzip `bytea`, for every international. | Fits in 0.5 GB, and any match can be replayed. |
| D5 | A refresh is a set of hash-guarded upserts in small transactions, not a second full copy of the data. | Two copies plus Neon's write history do not fit the free tier (§6). |
| D6 | "Live" means the latest results from a daily Cricsheet import, plus replays in the browser. | No score API and no scraping (CLAUDE.md). |

```
cricsheet.org --(GitHub Action, daily)--> .cache/raw/cricsheet/{tests,odis,t20s}_json.zip
  --python -m pipeline--> data/out/ (§1) --node web/scripts/import--> Neon Postgres (§2)
  --Drizzle--> Next.js on Vercel (§4)
```

---

## 1. Pipeline output contract (`data/out/`, `schemaVersion: 2`)

### 1.1 Identifiers

| Name | Form | Example | Source |
|---|---|---|---|
| `Gender` | `"male" \| "female"` | | `info.gender` |
| `G` | `"m" \| "w"` | | |
| `Fmt` | `"test" \| "odi" \| "t20i"` | | archive |
| `FormatKey` | `` `${Fmt}-${G}` `` | `odi-w` | |
| `PersonId` | Cricsheet registry id (8 hex characters) | `ba607b88` | `info.registry.people`; equals `players.source_id` |
| `Slug` | `` `${slug(name)}-${PersonId}` `` | `v-kohli-ba607b88` | `export.slugify` (unchanged) |
| `TeamId` | `` `${slug(teamName)}-${G}` `` | `india-w` | |
| `MatchId` | Cricsheet file stem | `1384439` | The pipeline asserts it is unique across archives. |
| `VenueKey` | Ground name before the first comma, with `\|<city>` added for ambiguous names | `County Ground\|Bristol` | §1.10 |

The shapes below are TypeScript. **NEW** and **CHANGED** mark differences from the v1 output (the men's sample). Everything else is unchanged. The importer refuses a build whose `manifest.provenance.dataset` is not `"live"`; `"demo"` marks the simulated output of `pipeline/seed.py`.

### 1.2 Files

```
data/out/
  manifest.json               build metadata                        CHANGED
  fingerprint.json            source fingerprint                    NEW
  players.json                player index                          CHANGED
  players/<slug>.json         one file per player                   CHANGED
  cohorts.json                cohort quartiles per formatKey        CHANGED
  venues.json                 ground context per formatKey          CHANGED
  matches.json                every international match             NEW
  teams/index.json            team list                             NEW
  teams/<teamId>.json         team analysis                         NEW
  winprob.json                models per formatKey                  CHANGED
  replays/index.json          featured replays                      CHANGED
  replays/<matchId>.json.gz   ball by ball, every match, gzipped    NEW
```

Removed:
- `teams.json` (v1 squads), superseded by `teams/*.json`.
- `rankings.json`: ICC rankings are not Cricsheet data, so they are never shown.

### 1.3 `manifest.json` and `fingerprint.json`

```ts
type Manifest = {
  schemaVersion: 2;                                   // NEW
  buildId: string;                                    // NEW `${generated}-${gitSha7 | "local"}`
  generated: string;                                  // ISO timestamp, UTC
  fingerprint: string;                                // NEW, = fingerprint.json .combined
  playerCount: number;
  matchCount: number;                                 // NEW
  formats: Partial<Record<FormatKey, {                // CHANGED: keyed by formatKey
    formatKey: FormatKey; format: Fmt; gender: Gender; label: string;
    archive: string; innings_limit: number; balls_per_innings: number | null; white_ball: boolean;
    matches: number; deliveries: number; players: number; venues: number;
    bowlersMissingStyle: number; firstDate: string; lastDate: string;
  }>>;
  phases: Record<Fmt, { key: string; from: number; to: number; label: string }[]>;   // unchanged
  bowlingTypes: Record<string, { label: string; family: "pace" | "spin"; arm: string; swing?: string; turn?: string }>;
  thresholds: { minBallsSplit: 60; minBallsClaim: 150; minBallsCohort: 600;
                minBallsBowledSplit: 90; minBallsBowledClaim: 240; minBallsBowledCohort: 900;
                strengthPercentile: 70; weaknessPercentile: 30;
                teamMinMatches: 5; venueMinInnings: 3 };             // NEW: the last two
  sources: Record<string, { name: string; base: string; licence: string; role: string; bulk: boolean }>;
  provenance: { sources: { id: string; used: boolean; note: string }[]; enrichment: Record<string, number | boolean>;
                dataset: "live" | "demo";
                identity: { ambiguousNames: number; stylesSkippedAmbiguous: number } };  // NEW
};

type Fingerprint = {                                  // sha256 over sorted (name, CRC32, size) from each zip's central directory
  archives: Record<string, { files: number; sha256: string }>;   // "tests_json.zip" -> ...
  combined: string;                                   // "sha256:<hex>"
};
```

### 1.4 `players.json` and `players/<slug>.json`

The `formats` keys stay `"test" | "odi" | "t20i"`. The gender comes from the player, so `formatKey = `${fmt}-${G(player.gender)}``.

```ts
type PlayersIndex = { players: Array<{
  id: PersonId; slug: string; name: string; fullName: string;
  gender: Gender;                                     // NEW
  teams: string[]; teamIds: TeamId[];                 // teamIds NEW
  country: string; role: string; battingHand: string; bowlingType: string; bowlingLabel: string;
  born: string; debut: string; lastPlayed: string; cricinfoId: string;
  sampleBalls: number;                                // NEW: balls faced plus bowled, all formats
  formats: Partial<Record<Fmt, {
    matches: number;                                  // NEW
    bat?: { inns: number; runs: number; balls: number; avg: number | null; sr: number; hs: number; "100s": number; "50s": number };
    bowl?: { inns: number; wkts: number; balls: number; runs: number; avg: number | null; econ: number; sr: number | null; "5w": number };
    strengths: number; weaknesses: number;
  }>>;
}> };

type PlayerFile = {
  id: PersonId; slug: string; name: string;
  gender: Gender;                                     // NEW
  meta: { bowlingType: string; battingHand: string; role: string; country: string; cricinfoId: string;
          fullName: string; born: string; teams: string[]; teamIds: TeamId[] /* NEW */;
          debut: string; lastPlayed: string; gender: Gender /* NEW */ };
  formats: Partial<Record<Fmt, FormatPayload>>;
};

type FormatPayload = {
  format: Fmt; formatLabel: string;
  formatKey: FormatKey; gender: Gender;               // NEW
  matches: number;                                    // NEW: appearances in info.players (XIs)
  strengths: Claim[]; weaknesses: Claim[];            // at most 12 each, ranked (unchanged)
  profile: Record<string, { label: string; value: number; percentile: number; discipline: "batting" | "bowling"; balls: number }>;
  batting?: {
    overall: BatSplit;
    milestones: { fifties: number; hundreds: number; oneFifties: number; doubleHundreds: number;
                  notOuts: number; highest: number; highestNotOut: boolean };
    // CHANGED: exported only when balls >= thresholds.minBallsSplit (60). byYear is not gated.
    byType: Rec<BatSplit>; byFamily: Rec<BatSplit>; byPhase: Rec<BatSplit>; byEntry: Rec<BatSplit>;
    byTypePhase: Rec<BatSplit>;            // key "<type>|<phase>", e.g. "lb|middle"
    byOpposition: Rec<BatSplit>; byCountry: Rec<BatSplit>;
    byVenue: Rec<BatSplit>;                // CHANGED: keyed by VenueKey
    byHome: Rec<BatSplit>; byInningsNo: Rec<BatSplit>; byChase: Rec<BatSplit>; byPosition: Rec<BatSplit>;
    byYear: Rec<BatSplit>;
    dismissals: Rec<number>; dismissedByType: Rec<number>;
    vsBowler: Record<PersonId, BatSplit & { name: string }>;   // CHANGED: keyed by id; gated; top 40 by balls
    innings: Array<{ m: MatchId; d: string; vs: string; g: string; c: string; r: number; b: number;
                     f4: number; f6: number; out: boolean; pos: number; inn: number; chase: boolean;
                     how: string; by: string; byId: PersonId | "" /* NEW */ }>;
  };
  bowling?: {
    overall: BowlSplit;
    milestones: { best: { wickets: number; runs: number } | null; fiveWickets: number; fourWickets: number };
    // CHANGED: exported only when balls >= thresholds.minBallsBowledSplit (90). byYear is not gated.
    byHand: Rec<BowlSplit>; byPhase: Rec<BowlSplit>; byOpposition: Rec<BowlSplit>; byCountry: Rec<BowlSplit>;
    byHome: Rec<BowlSplit>; byInningsNo: Rec<BowlSplit>; byYear: Rec<BowlSplit>;
    wicketKinds: Rec<number>;
    vsBatter: Record<PersonId, BowlSplit & { name: string }>;  // CHANGED
    innings: Array<{ m: MatchId; d: string; vs: string; g: string; c: string; b: number; r: number; w: number; md: number }>;
  };
};
type Rec<T> = Record<string, T>;
type BatSplit = { balls: number; runs: number; outs: number; fours: number; sixes: number; dots: number; innings: number;
                  avg: number | null; sr: number; bpd: number | null; dotPct: number; bdryPct: number; bdryRunsPct: number };
type BowlSplit = { balls: number; runs: number; wickets: number; dots: number; fours: number; sixes: number; innings: number;
                   overs: number; econ: number; avg: number | null; sr: number | null; dotPct: number; bdryPct: number };
type Claim = { id: string; kind: "strength" | "weakness"; discipline: "batting" | "bowling";
               dimension: string; dimensionKey: string; subject: string; subjectKey: string;
               metric: string; metricLabel: string; value: number; baseline: number | null; cohortMedian: number;
               percentile: number; balls: number; sampleNote: string; confidence: "high" | "medium" | "low";
               text: string; higherIsBetter: boolean };
```

### 1.5 `cohorts.json` and `venues.json`

```ts
type Cohorts = Partial<Record<FormatKey,          // CHANGED: was keyed by Fmt; cohorts never mix genders
  Record<"batting.average" | "batting.strike_rate" | "batting.dot_pct" | "batting.boundary_pct" |
         "batting.balls_per_dismissal" | "bowling.average" | "bowling.economy" | "bowling.strike_rate" | "bowling.dot_pct",
         { n: number; p10: number; p25: number; p50: number; p75: number; p90: number }>>>;

type Venues = { venues: Record<VenueKey, {         // CHANGED: keyed by VenueKey, not the raw name
  key: VenueKey; name: string; city: string; country: string;
  formats: Partial<Record<FormatKey, { matches: number; runsPerOver: number; ballsPerWicket: number | null;
                                       firstInnings: { n: number; avg: number | null } }>>;   // firstInnings NEW
}> };
```

### 1.6 `matches.json` (NEW)

```ts
type MatchesFile = { schemaVersion: 2; matches: Match[] };   // sorted by endDate desc, then id desc
type Match = {
  id: MatchId; gender: Gender; format: Fmt; formatKey: FormatKey;
  matchTypeNumber: number | null;
  startDate: string; endDate: string; season: string;        // dates[0], dates[-1]
  event: { name: string | null; stage: string | null; matchNumber: number | null; group: string | null };
  venue: string; venueKey: VenueKey; city: string | null; country: string | null;   // country from venues.py; null when unknown
  teams: [{ id: TeamId; name: string }, { id: TeamId; name: string }];             // info.teams order
  toss: { winner: string | null; decision: "bat" | "field" | null };
  result: {
    type: "win" | "tie" | "draw" | "noResult";
    winner: string | null; winnerId: TeamId | null;
    by: { runs?: number; wickets?: number; innings?: number };   // outcome.by verbatim
    method: string | null;                                       // outcome.method verbatim ("D/L", "Awarded")
    eliminator: string | null;                                   // outcome.eliminator ?? outcome.bowl_out
    text: string;   // "X won by 6 wickets" | "X won by an innings and 12 runs" | "X won (awarded)" |
                    // "Match tied (X won the Super Over)" | "Match drawn" | "No result"; " (D/L method)" appended when method is D/L
  };
  playerOfMatch: { id: PersonId | null; name: string }[];
  scheduledOvers: number | null;                                  // info.overs; null for Tests
  innings: Array<{ team: string; teamId: TeamId;
                   runs: number;          // sum of runs.total plus penalty_runs.pre/post
                   wickets: number;       // excludes "retired hurt" and "retired not out"
                   balls: number;         // legal balls
                   overs: string;         // "43.4"
                   declared: boolean;
                   target: { runs: number; overs: number | null } | null;
                   penaltyRuns: number }>;                       // super overs excluded
  missing: string[];                                             // info.missing verbatim (e.g. ["player_of_match"])
  hasReplay: boolean; featuredRank: number | null;
};
```

### 1.7 `teams/index.json` and `teams/<teamId>.json` (NEW)

```ts
type Record5 = { matches: number; won: number; lost: number; tied: number; drawn: number; noResult: number; winPct: number | null };

type TeamsIndex = { schemaVersion: 2; teams: Array<{
  id: TeamId; name: string; gender: Gender; label: string;    // label: "India Women" / "India"
  formats: Partial<Record<Fmt, Record5 & { first: string; last: string }>>;
}> };

type TeamFile = { schemaVersion: 2; id: TeamId; name: string; gender: Gender; label: string;
                  formats: Partial<Record<Fmt, TeamFormat>> };
type TeamFormat = {
  formatKey: FormatKey;
  span: { first: string; last: string };
  record: Record5;
  byYear: Array<{ year: string } & Record5>;                                   // ascending
  headToHead: Array<{ opponentId: TeamId; opponent: string; lastMatchId: MatchId; lastDate: string } & Record5>;  // by matches desc
  venueType: { home: Record5; away: Record5; neutral: Record5; unknown: Record5 };
  batFirstChase: { battingFirst: Record5; chasing: Record5 };
  toss: { won: number; lost: number;
          winPctWonToss: number | null; winPctLostToss: number | null;
          decisions: { bat: Record5; field: Record5 } };                     // decisions when this team won the toss
  venues: Array<{ venueKey: VenueKey; name: string; city: string; country: string;
                  firstInnings: { n: number; avg: number | null };         // all sides, this formatKey
                  teamFirstInnings: { n: number; avg: number | null };     // this team batting first
                  record: Record5 }>;                                      // top 40 by matches
  phases: { batting: PhaseRow[]; bowling: PhaseRow[] };                    // team totals incl. extras
  topBatters: Array<{ playerId: PersonId; name: string; slug: string | null; innings: number; runs: number;
                      balls: number; outs: number; hundreds: number; fifties: number; highest: number }>;  // top 15, for THIS team only
  topBowlers: Array<{ playerId: PersonId; name: string; slug: string | null; innings: number; balls: number;
                      runsConceded: number; wickets: number; fiveWickets: number }>;                       // top 15
  recentMatchIds: MatchId[];                                                // last 10, newest first
};
type PhaseRow = { phase: string; label: string; innings: number; balls: number; runs: number;
                  wickets: number; dots: number; fours: number; sixes: number };
```

`slug` is null when the player is below the export gates and has no page.

### 1.8 `winprob.json` (CHANGED)

```ts
type WinProbFile = { schemaVersion: 2; generatedFrom: string; holdoutFrom: string;
  formats: Partial<Record<"odi-m" | "t20i-m" | "odi-w" | "t20i-w", WinModelJson>> };   // CHANGED: keyed by formatKey
type WinModelJson = {
  formatKey: FormatKey; gender: Gender; format: "odi" | "t20i";            // formatKey and gender NEW
  maxBalls: number; theta: number[]; features: ["1", "x", "x*f", "f", "x*w/10"];
  resources: number[][];                  // [10][maxBalls+1]
  dispersion: number[]; resourceParams: { z: number; b: number }[];
  firstInningsWin: number[];              // [601]
  par: number; matches: number; halfLifeYears: number | null;
  validation: { trainMatches: number; testMatches: number; halfLifeSelection: object[];
                firstInnings: ScoreSummary; chase: ScoreSummary };
  venues: Record<VenueKey, { matches: number; averageFirstInnings: number; par: number }>;
  golden: Array<{ ballsLeft: number; wickets: number; runs: number; need: number;
                  chase: number; battingFirst: number; projected: [number, number, number] }>;
  // CHANGED: golden is computed from the model reloaded from this JSON (model_from_json), so the TS port can match to 1e-9.
};
```

### 1.9 Replays (CHANGED)

- `replays/index.json` stays a bare array (the v1 shape). Each row is `{ id, format, formatKey, gender, title, event, stage, date, venue, result }`. formatKey and gender are NEW.
- Featured matches are the curated `FEATURED` list followed by a rule: `event.stage == "Final"` and the event name matches `/World Cup|World T20|T20 World Cup|Champions Trophy/`.
- `replays/<matchId>.json.gz` holds the gzip of compact JSON for **every** match in `matches.json`.
- Super overs are excluded from replays.

```ts
type Replay = {
  schemaVersion: 2;                                                         // NEW
  id: MatchId; format: Fmt; formatKey: FormatKey; gender: Gender;           // formatKey and gender NEW
  title: string; event: string; stage: string; date: string;
  venue: string; venueKey: VenueKey /* NEW */; city: string;
  teams: string[]; toss: { winner?: string; decision?: string };
  result: string; winner: string | null;
  scheduledOvers: number | null; method: string | null;                     // NEW
  people: Array<{ id: PersonId; name: string; team: string;
                  bt?: string; bh?: "right" | "left" }>;                    // bt and bh NEW: bowling type, batting hand
  innings: Array<{ team: string; target: number | null;
                   targetOvers: number | null;                              // NEW
                   penaltyRuns: { pre: number; post: number };              // NEW
                   balls: Ball[] }>;
  credit: string;
};
// Ball tuple is unchanged from replay.py:
type Ball = [over: number, batter: number, bowler: number, nonStriker: number, runsBat: number, extras: number,
             extraType: "wides" | "noballs" | "byes" | "legbyes" | "penalty" | null, wicketKind: string | null, playerOut: number | null];
```

### 1.10 Definitions used by the pipeline

- **Result buckets.**
  - `win`/`loss` come from `outcome.winner`; awarded matches count as results.
  - `tie` is `outcome.result == "tie"`, including super-over and bowl-out deciders, which are recorded in `eliminator`.
  - `draw` and `noResult` map directly.
  - `winPct = 100·won/(won+lost+tied+drawn)`, or null when the denominator is 0.
- **Home, away and neutral.**
  - The match country comes from `venues.py`.
  - `home` if it is in `TEAM_HOME[team]`, `away` if it is in `TEAM_HOME[opponent]`, otherwise `neutral`.
  - `unknown` when the country or the team's home is unknown. Never guessed.
  - `TEAM_HOME` becomes a set per team, e.g. England = {England, Wales}.
- **Batting first and chasing.** Decided by innings order. Matches with no innings are excluded.
- **First-innings average.**
  - Limited overs: only first innings that ran their course (all out or full overs) in matches with the standard scheduled overs. This is the rule `winprob.venue_pars` uses.
  - Tests: every first innings.
- **Phase rows.**
  - Legal balls; runs include extras.
  - Wickets exclude retired hurt and retired not out.
  - Phases come from `config.PHASES`.
- **VenueKey.**
  - The ground name before the first comma.
  - When that name occurs in more than one normalised city, `|<city>` is appended.
  - An alias table in `venues.py` folds spelling variants: Bangalore/Bengaluru, Chittagong/Chattogram, Port Elizabeth/Gqeberha, Mirpur/Dhaka, Dharmasala/Dharamsala, and island names to cities.
  - The web never recomputes it.

---

## 2. Postgres schema (Drizzle, `web/src/db/schema.ts`)

Conventions:
- camelCase in TypeScript and snake_case in SQL (the existing pattern).
- `liveMatches`, `syncLog` and every `attr*` column are deleted.
- drizzle-orm 0.45.2 has no `bytea` builder (checked: `pg-core/columns` has none), so `bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" })`.

```
enums  gender(male,female)  format(test,odi,t20i)  discipline(batting,bowling)
       format_key(test-m,odi-m,t20i-m,test-w,odi-w,t20i-w)

players                                    PK id
  id serial | source_id text NOT NULL UNIQUE (Cricsheet person id) | slug text NOT NULL UNIQUE
  name text NOT NULL | full_name text | gender gender NOT NULL | country text
  teams text[] NOT NULL default '{}' | team_ids text[] NOT NULL default '{}'
  role text | batting_hand text | bowling_type text | cricinfo_id text | born text
  debut date | last_played date | sample_balls int NOT NULL
  overall_rating real NULL | form_index real NULL      -- reserved, unpopulated; never rendered
  content_hash text NOT NULL | updated_at timestamptz NOT NULL default now()
  idx (gender, last_played)

career_stats   -- one row per player x formatKey     PK (player_id, format_key)
  player_id int FK players ON DELETE CASCADE | format_key format_key | matches int
  bat_innings, not_outs, runs, balls, outs, highest, hundreds, fifties, fours, sixes, dots int NULL
  highest_not_out bool NULL | bat_avg real NULL | bat_sr real NULL
  bowl_innings, bowl_balls, runs_conceded, wickets, maidens, bowl_dots, four_wkts, five_wkts int NULL
  best_wickets int NULL | best_runs int NULL | bowl_avg real NULL | bowl_econ real NULL | bowl_sr real NULL
  strengths smallint | weaknesses smallint
  stats_hash text NOT NULL | analysis_hash text NOT NULL     -- drive incremental import (§3)

innings        -- no PK; replaced per (player_id, format_key)
  player_id int FK CASCADE | format_key | discipline | match_id text NOT NULL | played_on date NOT NULL
  opponent text NOT NULL | innings_no smallint NULL
  batting: runs, balls_faced, fours, sixes, position smallint NULL | out bool NULL | chase bool NULL
           dismissal text NULL | dismissed_by_id text NULL
  bowling: balls_bowled, runs_conceded, wickets, maidens smallint NULL
  idx (player_id, format_key)              -- venue/country dropped: join matches on match_id

yearly_stats                                PK (player_id, format_key, year)
  player_id | format_key | year smallint | bat_innings, runs, balls, outs, fours, sixes int NULL
  bowl_innings, bowl_balls, runs_conceded, wickets int NULL

splits         -- no PK; replaced per (player_id, format_key)
  player_id | format_key | discipline | dimension text | subject text | label text NULL (names for vsBowler/vsBatter)
  balls int NOT NULL | runs int NOT NULL | outs int NULL | wickets int NULL | dots int | fours int | sixes int | innings smallint NULL
  idx (player_id, format_key)
  dimension: batting type|family|phase|entry|typePhase|opposition|country|venue|home|inningsNo|chase|position|vsBowler
             bowling hand|phase|opposition|country|home|inningsNo|vsBatter      (overall -> career_stats, byYear -> yearly_stats)
  derived values (avg, sr, econ, dot%, boundary%) are computed in web/src/lib/metrics.ts, not stored

traits                                      idx (player_id, format_key)
  player_id | format_key | kind text | rank smallint | claim_id text | discipline | dimension_key | dimension
  subject_key | subject | metric | metric_label | value real | baseline real NULL | cohort_median real
  percentile real | balls int | confidence text | higher_is_better bool | text text

profile_dimensions                          idx (player_id, format_key)
  player_id | format_key | axis text | label text | discipline | value real | percentile real | balls int

dismissal_counts                            idx (player_id, format_key)
  player_id | format_key | discipline | kind text ('how'|'byType'|'wicketKind') | subject text | count int

teams                                       PK id
  id text ('india-w') | name text | gender gender | label text | first_match date | last_match date
  matches int | content_hash text           idx (gender, name)

team_summaries                              PK (team_id, format_key)
  team_id text FK teams CASCADE | format_key | matches, won, lost, tied, drawn, no_result int | win_pct real NULL
  first_date date | last_date date | detail jsonb NOT NULL ($type<TeamFormatDetail>: §1.7 minus record/span)
  content_hash text

venues                                      PK key
  key text | name text | city text | country text | formats jsonb | content_hash text

matches                                     PK id
  id text | gender | format | format_key | match_type_number int NULL | start_date date | end_date date | season text
  event_name, event_stage, event_group text NULL | event_match_number smallint NULL
  venue text | venue_key text | city text NULL | country text NULL
  team1_id, team1, team2_id, team2 text NOT NULL      -- no FK to teams (simpler upsert order)
  toss_winner text NULL | toss_decision text NULL
  result_type text | winner_id text NULL | winner text NULL | margin_runs smallint NULL | margin_wickets smallint NULL
  margin_innings bool | method text NULL | eliminator text NULL | result_text text NOT NULL
  player_of_match jsonb | innings jsonb ($type<Match["innings"]>) | scheduled_overs smallint NULL
  missing text[] | has_replay bool | featured_rank smallint NULL | content_hash text
  idx (end_date DESC, id) | (format_key, end_date DESC) | (team1_id, end_date DESC) | (team2_id, end_date DESC)

match_replays                               PK match_id
  match_id text FK matches ON DELETE CASCADE | gz bytea NOT NULL (the .json.gz file as is)
  bytes int (uncompressed) | balls int | content_hash text (sha256 of gz)

win_models                                  PK format_key   (odi-*, t20i-* only)
  format_key | model jsonb (maxBalls, theta, features, resources, dispersion, resourceParams, firstInningsWin, par)
  venues jsonb | validation jsonb | golden jsonb | matches int | half_life_years real NULL
  holdout_from date | content_hash text | updated_at timestamptz

dataset_meta   -- one row per import run; the "active" dataset is the latest status='complete'
  id serial PK | build_id text | schema_version smallint | source_fingerprint text | status text
  started_at timestamptz | finished_at timestamptz NULL | generated_at timestamptz
  manifest jsonb (formats, phases, bowlingTypes, thresholds, sources, provenance) | cohorts jsonb
  counts jsonb | changes jsonb | error text NULL       idx (status, finished_at DESC)
```

**JSON to table mapping**

| Source | Tables | Key | Replace unit |
|---|---|---|---|
| `players.json` and `players/<slug>.json` `.meta` | players | source_id | row when `content_hash` differs |
| `formats.<fmt>` without strengths, weaknesses and profile | career_stats, innings, yearly_stats, splits, dismissal_counts | (player_id, format_key) | all five when `stats_hash` differs |
| `formats.<fmt>` strengths, weaknesses and profile | traits, profile_dimensions | (player_id, format_key) | both when `analysis_hash` differs |
| `teams/index.json` and `teams/*.json` | teams, team_summaries | id; (team_id, format_key) | row hash |
| `venues.json` | venues | key | row hash |
| `matches.json` and `replays/index.json` | matches (featured_rank) | id | row hash |
| `replays/<id>.json.gz` | match_replays | match_id | sha256 of the file |
| `winprob.json` | win_models | format_key | row hash |
| `manifest.json` and `cohorts.json` | dataset_meta | new row per run | |

Field details:
- **innings:**
  - `m`→match_id, `d`→played_on, `vs`→opponent, `inn`→innings_no.
  - Batting: `r`→runs, `b`→balls_faced, `f4`, `f6`, `out`, `pos`, `chase`, `how`→dismissal (`""`→null), `byId`→dismissed_by_id.
  - Bowling: `b`→balls_bowled, `r`→runs_conceded, `w`, `md`.
  - `g` and `c` are not stored.
- **yearly_stats:** counts come from `byYear`; innings per year come from counting the innings arrays.
- **career_stats:** comes from `overall`, `milestones` and sums over the innings (maidens).

---

## 3. Import and refresh

### 3.1 Daily workflow (`.github/workflows/refresh.yml`)

1. **Triggers:** `schedule: "23 4 * * *"` (UTC) plus `workflow_dispatch` with inputs `force` (bool) and `import` (bool, default true). Concurrency group `refresh`, no cancelling. Timeout 90 minutes.
2. `python -m pipeline fetch --refresh --no-mirror --formats test odi t20i` fetches from cricsheet.org. The mirror has no women's data, no Afghanistan matches, and stops at 2026-06-28 (R2).
3. `python -m pipeline fingerprint --out data/out/fingerprint.json`.
4. `npm ci`, then `npm run check-fingerprint -- ../data/out/fingerprint.json`. It compares against the latest complete `dataset_meta.source_fingerprint`. If nothing changed and `force` is false, the job stops successfully.
5. Build:
   - `python -m pipeline build --genders male female`
   - `python -m pipeline winprob --genders male female`
   - `python -m pipeline replays --all --genders male female`
6. `WINPROB_FILE=../data/out/winprob.json npm run test:golden` checks the TypeScript port against all four models. This is the only place the women's models are checked.
7. `npm run db:migrate`, then `npm run import -- --data ../data/out`.
8. `curl -fsS -X POST "$SITE_URL/api/revalidate" -H "x-revalidate-secret: $REVALIDATE_SECRET"`.
9. Upload `manifest.json`, `fingerprint.json` and the import report, kept for 14 days. When `import=false`, upload all of `data/out` instead, kept for 3 days, so A, B and C can inspect real women's output.

Secrets and variables:
- GitHub secret `DATABASE_URL`: the Neon **direct** URL, which advisory locks and DDL need.
- GitHub secret `REVALIDATE_SECRET`; GitHub variable `SITE_URL`.
- Vercel `DATABASE_URL`: the Neon **pooled** URL; plus `REVALIDATE_SECRET`.

If any step fails, the import never starts or stops at a batch boundary, and the site keeps serving its current data.

### 3.2 Importer (`web/scripts/import/index.mjs`, Node and `pg`)

0. Load the manifest. Require `schemaVersion === 2` and `provenance.dataset === "live"`. Take `pg_try_advisory_lock(4242)` or exit. Insert a `dataset_meta` row with status `running`.
1. **Shrink guard.** If the player or match count of any formatKey falls more than 5% below the last complete run, abort (override with `--allow-shrink`).
2. **Reference data, in one transaction:** upsert teams, venues, matches, team_summaries and win_models with `INSERT … ON CONFLICT (pk) DO UPDATE … WHERE t.content_hash IS DISTINCT FROM excluded.content_hash`. Unchanged rows are not rewritten.
3. **Players, in batches of 50 per transaction.**
   - Before the first batch, preload `career_stats(player_id, format_key, stats_hash, analysis_hash)`, which is about 8K rows.
   - Upsert `players` by `source_id`, using `RETURNING id`.
   - For each player-format whose `stats_hash` differs: delete and re-insert innings, yearly_stats, splits and dismissal_counts.
   - For each whose `analysis_hash` differs: delete and re-insert traits and profile_dimensions.
   - Then upsert `career_stats`.
   - Inserts are multi-row, at most 1,000 rows per statement, which keeps well under Postgres's 65,535 bind-parameter limit.
   - After every 1,000 changed player-formats, run `VACUUM (ANALYZE)` on the churned tables outside a transaction, so freed space is reused and peak bloat stays near 1.2x.
   - Hashes are sha1 of stable-stringified JSON (keys sorted).
4. **Replays.** Upsert files whose sha256 differs, 200 per transaction.
5. **Deletions, in one transaction:** players not in `players.json` (cascades), player-formats that are no longer present, matches, teams, venues and models that are no longer present (cascades replays).
6. Update `dataset_meta`: status `complete`, `counts`, `changes` (inserted, updated and deleted per table) and `finished_at`. Keep the last 30 rows.
7. Run `ANALYZE` and print `pg_total_relation_size` per table and `pg_database_size()`. Exit non-zero if the database is over `--budget-mb` (default 400).

### 3.3 Guarantees

- **No half-empty site.** Every player, team and match is replaced atomically, so a reader sees a complete set of rows from exactly one build. Different entities can come from different builds only during the import window, which should be about a minute for a daily change (unverified until measured).
- **Idempotent.** Re-running on the same `data/out` changes 0 rows; CI asserts this.
- **Resumable.** After a crash, a re-run only redoes rows whose hashes still differ.
- **Single writer.** The advisory lock and the workflow concurrency group prevent two imports at once.

### 3.4 Alternatives rejected

- **Staging schema then rename.** It needs two full copies (about 2 × 170 MB) plus the history of writing a whole copy, which comes to roughly 600 MB at peak (§6). That is over the 0.5 GB cap.
- **Dataset version column.** Same doubling, and the table files stay at about 2x after the old version is deleted.

If the measured database ends up under about 150 MB, and Neon history turns out not to count towards the cap, the schema swap becomes a valid drop-in replacement for steps 2 to 5.

### 3.5 Migrations and caching

- **Migrations.**
  - `drizzle-kit generate` writes `web/drizzle/*.sql`, which is committed.
  - `drizzle-kit migrate` runs in `refresh.yml` and in a `migrate` job on pushes to `main` that touch `web/drizzle/**`.
  - Changes follow expand then contract: add columns first, deploy readers, drop columns later.
- **Caching (Next 16 without Cache Components; checked against the bundled docs).**
  - Data functions are wrapped in `unstable_cache(fn, key, { tags: ["dataset"], revalidate: 86400 })`.
  - Pages without search params set `export const revalidate = 86400`.
  - `POST /api/revalidate` calls `revalidateTag("dataset", "max")` (Next 16's two-argument form) and `revalidatePath("/", "layout")`.

---

## 4. Web route map

### 4.1 Pages

| Route | Owner (phase 1) | Shows | Queries (all indexed) |
|---|---|---|---|
| `/` | B | Coverage per formatKey, latest 8 results, featured replays, run and wicket leaders with a Men/Women toggle | `getDatasetMeta`, `getLatestResults({limit:8})`, `listReplayable({featured:true})`, `getLeaders(fk, metric, 8)`: `career_stats JOIN players WHERE format_key=$1 ORDER BY runs DESC LIMIT 8` |
| `/players?q&gender&format&team&role&sort&page` | B | Paginated table (50 rows) | `listPlayers`: `players JOIN career_stats` filtered, `ORDER BY <sort> LIMIT 50 OFFSET n`, `count(*) OVER()`. "All formats" uses `SUM … GROUP BY p.id`. Innings are never loaded. |
| `/players/[slug]?f=odi` | B | Header (gender, teams, debut and last match, "since <first date>" coverage note); career table across formats; strengths and weaknesses with value, baseline, cohort median, percentile and balls; percentile radar; matchups by type, family, phase, type×phase and stage of innings; opposition, venue, country, home, chase and position tables; head-to-heads; career by year; recent innings and form; dismissals | `getPlayerProfile`: 1 + 7 parallel queries `WHERE player_id=$1 [AND format_key=$2]`; innings `JOIN matches` for venue |
| `/compare?a&b&f` | B | Two players side by side, with a note when the genders differ (different cohorts) | `getPlayerSummary` ×2 (career_stats and profile_dimensions) |
| `/strategy?mode=player\|team&…` | B | Dossiers built only from traits, splits and team summaries; every line carries its number and sample size | `buildPlayerDossier(slug, fk)`, `buildMatchupPlan(teamId, oppId, fmt)` |
| `/teams?gender` | B | Teams grouped by gender, with records per format | `listTeams`: `teams JOIN team_summaries` |
| `/teams/[teamId]?f=` | B | Every section of §1.7 plus recent results | `getTeam`: a team_summaries row plus `matches WHERE (team1_id=$1 OR team2_id=$1) AND format_key=$2 ORDER BY end_date DESC LIMIT 10` |
| `/teams/[teamId]/vs/[oppId]?f=` | B | Head-to-head summary and every match between the two | `getHeadToHead` |
| `/matches?gender&format&team&year&page` | B | Index of all matches | `listMatches` (index on format_key, end_date) |
| `/matches/[id]` | C | Header, result, toss, player of the match, innings totals, full scorecard and worm built from the replay, win-probability curve when eligible, link to the replay | `getMatch`, `getReplay`, `getWinModel` |
| `/live` | C | Latest 12 results (filter chips); "Replay a match" (featured plus recent limited-overs); an explanation of what "live" means here and the date the data runs to | `getLatestResults`, `listReplayable`, `getDatasetMeta` |
| `/live/[matchId]` | C | Replay player: scoreboard, ball ticker, controls (play, pause, 1×/5×/20×, step ball or over, scrubber), win probability and curve so far, projected score with 80% band, par (venue par with match count, otherwise format par), required rate, matchup card, both XIs with their top strength and weakness | `getMatch`, `getReplay`, `getReplayContext` |
| `/method` | E (copy from F) | Sources, Cricsheet credit, thresholds, cohorts, win-prob validation per formatKey, coverage | `getDatasetMeta`, `getWinModel` |

Every route segment has `loading.tsx`, `error.tsx` and, where it applies, `not-found.tsx`.

### 4.2 API routes

| Route | Owner | Returns |
|---|---|---|
| `GET /api/health` | B | `{ ok, dataset: { buildId, generatedAt, importedAt, ageHours, stale: ageHours > 72 } }` |
| `GET /api/meta` | B | Public subset of the active `dataset_meta` row |
| `GET /api/players`, `/api/players/[slug]` | B | `listPlayers`, `getPlayerProfile` |
| `GET /api/teams`, `/api/teams/[teamId]` | B | `listTeams`, `getTeam` |
| `GET /api/matches`, `/api/matches/[id]` | B | `listMatches`, `getMatch` |
| `POST /api/revalidate` | B | Checks the `x-revalidate-secret` header, then revalidates (§3.5) |
| `GET /api/replays/[id]` | C | Replay JSON, gunzipped on the server (whether Vercel passes `Content-Encoding` through is unverified, so it isn't relied on); `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` |
| `GET /api/replays/[id]/context` | C | `getReplayContext` |
| `GET /api/models/[formatKey]` | C | `getWinModel` |

Deleted: `/api/live`, `/api/sync`, `/api/strategy`, `lib/live.ts`, `lib/seed.ts`, `lib/seed-data.ts`, `lib/analytics.ts`, `components/LiveTicker.tsx`, `app/live/LiveBoard.tsx`. Nav polling of `/api/live` goes too.

### 4.3 Data-layer signatures (`web/src/lib/data/*.ts`, owned by B and used by C and E)

```ts
listPlayers(q: { search?: string; gender?: Gender; format?: Fmt; teamId?: string; role?: string;
                 sort?: "runs"|"wickets"|"batAvg"|"batSr"|"bowlAvg"|"econ"|"name"; page?: number; pageSize?: number })
  : Promise<{ rows: PlayerListRow[]; total: number; page: number; pageSize: number }>;
getPlayerProfile(slug: string, fmt?: Fmt): Promise<PlayerProfile | null>;
getPlayerSummary(slug: string, fmt?: Fmt): Promise<PlayerSummary | null>;
getLeaders(fk: FormatKey, metric: "runs" | "wickets", limit: number): Promise<LeaderRow[]>;
listTeams(gender?: Gender): Promise<TeamListRow[]>;
getTeam(teamId: string, fmt?: Fmt): Promise<TeamPage | null>;
getHeadToHead(teamId: string, oppId: string, fmt: Fmt): Promise<{ summary: H2HRow | null; matches: MatchRow[] }>;
listMatches(q: { gender?: Gender; format?: Fmt; teamId?: string; year?: number; page?: number; pageSize?: number })
  : Promise<{ rows: MatchRow[]; total: number }>;
getLatestResults(q: { gender?: Gender; format?: Fmt; limit?: number }): Promise<MatchRow[]>;
getMatch(id: string): Promise<MatchRow | null>;
listReplayable(q: { featured?: boolean; gender?: Gender; format?: Fmt; limit?: number }): Promise<MatchRow[]>;
getReplay(matchId: string): Promise<Replay | null>;            // gunzip + JSON.parse
getWinModel(fk: FormatKey): Promise<WinModelJson | null>;
getDatasetMeta(): Promise<DatasetMeta | null>;
getReplayContext(matchId: string): Promise<ReplayContext | null>;

type ReplayContext = {
  formatKey: FormatKey; model: WinModelJson | null; datasetAsOf: string;
  thresholds: { minBallsSplit: number; minBallsBowledSplit: number };
  people: Array<{ id: PersonId; name: string; team: string;
    player: { slug: string; bowlingType: string | null; battingHand: string | null } | null;   // null if not in the dataset
    traits: { strengths: TraitRow[]; weaknesses: TraitRow[] };                                // top 2 each, this formatKey
    batting: { vsType: SplitRow[];          // dimension 'type', only types bowled in this match
               vsTypePhase: SplitRow[];     // only "<type>|<phase>" for those types
               vsBowler: SplitRow[] } }>;   // only bowlers in this match; rows below the gates omitted
};
```

The `MatchRow`, `PlayerProfile` and other row types live in `web/src/lib/contract/db.ts`, created in Phase 0. The JSON types from §1 live in `web/src/lib/contract/pipeline.ts`.

### 4.4 Display rules (every stream)

- Splits are hidden below `thresholds.minBallsSplit` and `minBallsBowledSplit`. The UI shows "not enough balls" instead.
- Team win percentages are hidden below `teamMinMatches`; venue averages below `venueMinInnings`.
- Every claim shows its sample size.
- Cricsheet (CC BY 4.0) is credited in the footer and on every data view, together with the "data as of" date.
- Team lists come from Cricsheet `teams`. The `country` metadata is secondary.
- Win probability, projected score and par are shown only for `odi`/`t20i` matches whose `method` is null and whose scheduled and target overs are the full format. Otherwise the UI states why they are missing.
- Replays label player context as "career figures as of <dataset date>". It is hindsight for older matches.

---

## 5. Work breakdown

### 5.0 Phase 0: scaffold (serial, about 1 hour, done by the orchestrator before fan-out)

1. Commit this file as `docs/ARCHITECTURE.md`.
2. Create `fixtures/data-out-v1/` (about 1.5 MB) from real v1 pipeline output:
   - From `/home/user/atharva9806/web/data/`: `manifest.json`, `cohorts.json`, `players.json` filtered to the players below, and the player files `v-kohli-ba607b88`, `rg-sharma-740742ef`, `ma-starc-3fb19989`, `a-zampa-14f96089`, `jm-anderson-d12143bf`, and `a-mishra-6b19d823` (a merged identity, kept as a regression case).
   - From `/tmp/claude-0/-home-user-atharva9806/ba3a875a-2168-5911-8364-1263a8d59dab/scratchpad/wp/`: `winprob.json`, `replays/{1384439,1415755,1144530}.json` and `replays/index.json`.
3. Create `web/src/lib/contract/{pipeline,db}.ts`, the types from §1 and §4.3.
4. Update `web/package.json`:
   - Add `vitest` as a dev dependency.
   - Scripts: `"test": "vitest run --passWithNoTests"`, `"test:golden": "vitest run src/lib/winprob/golden.test.ts"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"import": "node scripts/import/index.mjs"`, `"check-fingerprint": "node scripts/import/check-fingerprint.mjs"`.

**Contract-change rule.** §1, §2, §4.3, `web/src/lib/contract/**` and the fixture shapes change only in a PR that touches just those files and the fixtures, with A, B and C agreeing.

### 5.1 A: pipeline (Python)

**Owns:** `pipeline/**`, `tests/**`, `data/*.csv`, `fixtures/data-out/**` (generated).

**Can rely on:**
- Men's archives in `.cache/raw/cricsheet/`.
- Cricsheet-shaped fixtures in `tests/fixtures.py`; add female and same-name-different-id variants.
- Women's data only through D1's dispatch artifact.

**Delivers, in order:**
1. **A1: contract-complete v2 output for men's data, plus `python -m pipeline fixtures --out fixtures/data-out`.**
   - Covers every file in §1.2, with logic allowed to be naive at first.
   - The fixture is about 60 matches per format, under 3 MB, deterministic.
   - It includes the full real `winprob.json`, plus `replays/1384439.wincurve.json`: `[innings, ballIndex, p]` from `replay.win_curve`, for C's end-to-end test.
2. **A2: person-id identity.**
   - `Delivery` carries `*_id` fields.
   - `Aggregator`, `export`, `vsBowler`/`vsBatter` and innings `byId` are keyed by id.
   - Styles are looked up by id. If that is not possible, by name only when the name maps to exactly one id in the corpus; ambiguous names get no style and are counted in `provenance.identity`.
   - `playermeta.convert` writes `cricsheet_id`.
3. **A3: gender.**
   - `--genders male female`; aggregators keyed by (gender, fmt); cohorts per formatKey.
   - `matches` count per player-format from `info.players`.
   - Export gates set to the display thresholds.
   - `byVenue` keyed by VenueKey.
4. **A4: `matches.json`.** Includes the result-text fixes, penalty runs and `missing`.
5. **A5: `teams/*`.** A new `pipeline/teams.py`, with `TEAM_HOME` as sets.
6. **A6: win probability per gender and formatKey.** `trace_match(gender)`, `model_from_json`, golden computed from the reloaded model, and VenueKey-based venue pars.
7. **A7: `replays --all` (gzip, v2 fields) and the featured rule.**
8. **A8: the `fingerprint` command** and `manifest.buildId`/`fingerprint`.
9. **Optional:** catches and stumpings from `wickets[].fielders[]`, excluding `substitute: true` (fields verified).

**Done when:**
- `python -m unittest discover -s tests -p "test_*.py"` is green.
- New tests cover:
  - Two people with the same name stay separate.
  - Cohorts never mix genders.
  - Result text for innings wins and draws.
  - Penalty runs are included in totals.
  - No VenueKey spans two cities.
  - The golden round trip matches to 1e-12.
  - `tests/test_contract.py` validates every file in `fixtures/data-out` against §1.
- Two builds are byte-identical.
- A men's full build in the sandbox reports `ambiguousNames` and no merged identities.

### 5.2 B: schema, importer and server data layer

**Owns:**
- `web/src/db/**`, `web/drizzle/**`, `web/drizzle.config.ts` (deletes `drizzle.config.json`).
- `web/scripts/import/**`, `web/src/lib/data/**`, `web/src/lib/metrics.ts`, `web/src/lib/format.ts`.
- `web/.env.example`, `web/package.json` (dependency changes).
- Phase-1 pages: `web/src/app/{page.tsx,layout.tsx,players/**,compare/**,strategy/**,teams/**,matches/page.tsx,matches/loading.tsx,matches/error.tsx}`.
- `web/src/app/api/**` except `api/replays/**` and `api/models/**`.
- `web/src/components/**` except `components/replay/**`.
- Deleting the fake modules (§4.2).

**Can rely on:**
- `fixtures/data-out-v1/` immediately; `fixtures/data-out/` once A1 lands.
- Contract types.
- A local Postgres (a Docker or system Postgres in the sandbox is unverified), or the CI service container.

**Delivers:**
1. **B1 (first, unblocks C):** schema, migrations, the full importer, and `getMatch`, `getLatestResults`, `listReplayable`, `getReplay`, `getReplayContext`, `getWinModel` and `getDatasetMeta`.
2. **B2:** the remaining data functions, every B page wired to real data, and the fake code removed.
3. **B3:** the size report and the budget, shrink and demo guards.

**Done when:**
- `npm run typecheck && npm run lint && npm run test && npm run build` are green.
- Vitest covers:
  - `metrics.ts` matches the `avg`/`sr`/`econ`/`dotPct`/`bdryPct` values in the fixture JSON for every split.
  - Every importer mapper.
- Importing the fixtures into an empty database and then re-importing reports 0 changes.
- An import killed mid-run and re-run converges.
- No `Math.random`, `seed` or `live` imports remain under `web/src`.

### 5.3 C: live and replay engine

**Owns:** `web/src/lib/winprob/**`, `web/src/lib/replay/**`, `web/src/components/replay/**`, `web/src/app/live/**`, `web/src/app/matches/[id]/**`, `web/src/app/api/replays/**`, `web/src/app/api/models/**`.

**Can rely on:**
- `fixtures/data-out-v1/winprob.json`: real men's ODI and T20I models, 60 golden states each.
- v1 replays: the 2023 ODI final, the 2024 T20 final, and the 2019 tie. Treat the v2 fields as optional.
- Signatures from §4.3. Pages are wired after B1 merges; until then, build the pure libraries and prop-driven components.

**Delivers:**
1. **C1: `winprob/model.ts`.** Ports `expected`, `variance`, `chase`, `battingFirst`, `projected`, `par` and `venuePar`, reproducing Python semantics exactly:
   - `int(round(x))` is round-half-to-even.
   - `int(x)` truncates.
   - `lo..hi` ranges are inclusive.
   - `max(expected, 0.5)`.
   - Early-return order in `chase`: `need <= 0` returns 1, then `wickets >= 10 || ballsLeft <= 0` returns 0.
   - `golden.test.ts` reads `WINPROB_FILE`.
2. **C2: `replay/engine.ts`, a port of `replay_states` and `win_curve`.** Also:
   - Scorecard, partnerships, required rate and phase.
   - Eligibility for win probability (§4.4).
   - The final state shows the official result. A tie must not display the model's last probability.
3. **C3: the replay components** plus `/live`, `/live/[matchId]`, `/matches/[id]` and the C API routes.

**Done when:**
- Golden tolerance:
  - Against the v1 golden: ≤ 5e-5 for probabilities and ≤ 5e-3 runs. Measured: rebuilding from the rounded JSON gives ≤ 1.4e-5 and ≤ 1.4e-3.
  - After A6: ≤ 1e-9 and ≤ 1e-6.
- The win curve matches `1384439.wincurve.json` to ≤ 1e-6.
- Replay innings totals equal `matches.json` totals for every fixture match.
- The controls work by keyboard.
- Checks are green, and a full replay plays in `next build && next start`.

### 5.4 D: CI and daily refresh

**Owns:** `.github/workflows/ci.yml` (exists from PR #1; extend it), `.github/workflows/refresh.yml`, `scripts/ci/**`.

**Can rely on:** the CLI commands in §3.1 and §5.1 and the npm script names from Phase 0. Steps for commands that don't exist yet are guarded with `if: hashFiles(...)` until they land.

**Delivers:**
1. **D1 (day 1):** `refresh.yml` with `workflow_dispatch import=false`, running the **current** pipeline with `--gender female`. This measures real women's volume (R4) and produces the first women's artifact.
2. **D2:** the `ci.yml` additions:
   - A vitest step.
   - An `e2e` job with a `postgres:16` service: `db:migrate` → `import` from the fixtures → import again and assert 0 changes → `next build && next start` → `scripts/ci/smoke.sh` curls every route in §4.1 and §4.2 and expects 200 with no `NaN` or `undefined` in the HTML.
3. **D3:** the full refresh in §3.1, including the `migrate` job.

**Done when:**
- CI is green on a PR.
- A dispatch run against a Neon branch completes. A second run the same day reports "unchanged, skipped" in under 3 minutes.
- An injected fetch failure leaves the database untouched.

### 5.5 E: UI polish (starts after B2 and C3 merge)

**Owns:** all page and route-segment UI files under `web/src/app/**` (page, layout, loading, error and not-found), `web/src/components/**` including the markup of `components/replay/**`, `globals.css`, and `app/method/**`. It must not edit `lib/data/**`, `lib/replay/**`, `lib/winprob/**`, `db/**` or `scripts/**`; changes there are requested from B or C.

**Delivers:**
- A design system and the Criclysis rename. The footer currently claims ESPN and CricAPI sources and a simulation, and must be rewritten.
- Responsive layouts from 360px, and loading, empty and error states everywhere.
- Charts that are accessible (tables as fallbacks).
- The gender toggle kept in the URL.
- Replay accessibility: `aria-live` updates throttled to the end of each over, and reduced motion.
- The method page.

**Done when:** checks are green; the PR has screenshots at 360, 768 and 1280 px for every route; there are no console errors under `next start`; and an automated accessibility pass is clean if a tool is available (unverified).

### 5.6 F: docs (and first deploy, task #8)

**Owns:** `docs/**`, `README.md`, `CLAUDE.md`.

**Delivers:**
- Update `DATA_SOURCES.md`: women's coverage, person-id identity, mirror versus cricsheet.org, the Afghanistan gap, styles provenance.
- Update `WINPROB.md`: per-gender models, with numbers from the first CI build.
- Write `OPERATIONS.md`: Neon and Vercel setup, secrets, the refresh runbook, a forced full re-import with `--format-keys` split across two days, and recovery.
- Update the README.
- Update the layout table in `CLAUDE.md` (`fixtures/`, `web/scripts/import`, workflows).
- Carry out the first deploy following `OPERATIONS.md`.

**Done when:** every documented command has been run once as written, and the numbers match the latest manifest and `winprob.json`.

### 5.7 Sequencing

```
Phase 0 ─┬─ A1 ─ A2 ─ A3 ─ A4 ─ A5 ─ A6 ─ A7 ─ A8
         ├─ B1 ─ B2 ─ B3 ─────────────┐
         ├─ C1 ─ C2 ──(after B1) C3 ──┼─ E ── F (final)
         ├─ D1 ─ D2 ─ D3 (needs A8, B1)│
         └─ F (drafts) ────────────────┘
```

Branches: `feat/pipeline-v2`, `feat/db-importer`, `feat/replay-engine`, `ci/refresh`, `ui/polish`, `docs/v2`. Every merge needs CI green.

---

## 6. Storage estimate

**Measured** (men's sample built 2026-08-22 from the mirror; every one of the 3,531 player files streamed):
- 5,234 player-formats.
- Innings: 205,258 rows (123,100 batting, 82,158 bowling).
- Splits exported: 282,918. Of the 250,272 non-year rows, 93,634 are below the display gates, leaving 156,638. byYear has 32,646, which becomes 22,237 `yearly_stats` rows.
- Traits 30,686; profile axes 33,458; dismissal counts 50,060.
- Matches: 6,872 (884 Test, 2,548 ODI, 3,440 T20I); 3.83M deliveries; archives 47.7 MB zipped, 1.32 GB as JSON.
- Replays at gzip -6: ODI 5.9 MB (2.3 KB each), T20I 5.4 MB (1.6 KB), Test 4.5 MB (5.1 KB); 15.8 MB in all. The last 15 months alone are 1.4 MB.

**Modelled** bytes per row: column widths, plus a 24 to 32 B tuple header, plus a 4 B line pointer, on 8 KB pages. Indexes on `(player_id, format_key)` use btree deduplication (Postgres 13 and later). Accuracy is about ±20%. It is verified by B3's size report on first import.

| Table | Men's rows | B/row | Men's MB |
|---|---|---|---|
| innings | 205,258 | ~116 + index | 25.2 |
| splits (gated, without year and overall) | 156,638 | ~100 + index | 16.9 |
| match_replays (all formats, gzip) | 6,872 | 2.3 KB | 16.5 |
| traits | 30,686 | ~312 | 9.9 |
| matches | 6,872 | ~520 | 4.4 |
| dismissal_counts | 50,060 | ~68 | 3.8 |
| profile_dimensions | 33,458 | ~84 | 3.1 |
| yearly_stats | 22,237 | ~76 + PK | 2.3 |
| players, career_stats | 3,531, 5,234 | | 2.9 |
| teams, team_summaries, venues, win_models, dataset_meta | ~500 | | 1.8 |
| **Men's total** | | | **≈ 87 MB** |

**Totals.**
- Men's: about 87 MB, or about 91 MB with the missing Afghanistan matches (+~5%, unverified).
- Assumption, as given: women's adds 35 to 50% of men's volume.
- Data total: about 123 to 137 MB. With Postgres and Neon fixed overhead (catalogs; estimated at 10 to 30 MB, unverified): **≈ 135 to 170 MB**.
- A naive port (every exported row, derived columns stored, venue text kept in innings) would be about 115 MB for men's, or about 175 to 210 MB in total.

**Peak headroom on the 0.5 GB (about 512 MB) cap.**
- **Daily delta:**
  - It rewrites traits and profile rows for the affected formatKeys (at most about 18 MB), plus rows for players who played (under about 5 MB).
  - Dead tuples stay at or below about 25 MB. Write history is about 1.5 to 2x the rows written (unverified for Neon).
- **Full re-import** (only after a contract change):
  - About 130 MB is rewritten, with bloat held at about +30 MB by periodic VACUUM.
  - If Neon counts history towards the cap (unverified), the worst case is about 170 + 30 + 260 ≈ 460 MB. That is why full re-imports are split by `--format-keys` across two days.
  - A schema swap would need about 600 MB, so it is not viable.

**Guard.** The importer fails above 400 MB and prints sizes per table.

**What to cap if needed**, largest saving first (men's measurements):
1. **Replays:** keep only featured matches plus the last 3 seasons, or drop Test replays first (4.5 MB; Tests have no win probability). Saves about 12 to 14 MB of 16.5.
2. **Innings detail:** keep the last 50 per player, format and discipline. 161,271 rows instead of 205,258, saving about 5 MB. Older seasons then rely on `yearly_stats`.
3. **Traits:** keep the top 6 per kind instead of 12. 22,649 rows instead of 30,686, saving about 2.5 MB.
4. **vsBowler/vsBatter:** after gating they are already 15,833 rows (down from 44,770). A top-15 cap gives 10,594, saving about 0.5 MB. Low yield.
5. **byVenue:** 17,379 rows at 60 balls or more; 8,103 at 120 or more. Saves about 0.9 MB. Low yield.

---

## 7. Risks and unverified items

**Risks (with mitigation and owner):**

1. **R1: identities merged by name (verified).**
   - 48 names map to more than one person id in men's data (43 within T20Is).
   - Examples: `A Mishra` has teams [Ghana, India]; `Rashid Khan` has [Belgium, ICC World XI, Nepal] and the Afghan player's style, `lb`.
   - Styles keyed by name repeat the error.
   - Mitigation: A2 and its tests.
2. **R2: the source mirror (verified).**
   - The mirror has no women's archives (404 for `*_female_json.zip`).
   - It has **no Afghanistan matches in any format**.
   - Its latest match is 2026-06-28.
   - cricsheet.org is blocked from this sandbox.
   - Mitigation: production builds only from cricsheet.org in Actions (`--no-mirror`); fixtures are labelled men's-only.
   - Unverified: whether cricsheet.org reliably serves GitHub runners. A failure leaves the site on its last good data, and `/api/health` reports `stale`.
3. **R3: VenueKey collisions (verified).** Cutting at the comma merges distinct grounds (County Ground, Nehru Stadium, National Stadium, Gymkhana Club Ground). Today this corrupts venue pars. Mitigation: §1.10 and A6.
4. **R4: women's volume and coverage are unknown.**
   - The 35 to 50% figure is an assumption, and women's coverage start dates are unverified.
   - Women's cohorts, especially Tests, may be too small for percentiles; the existing `len(dist) < 8` guard hides those claims.
   - Mitigation: D1 measures the real volume on day 1.
5. **R5: Neon free tier.**
   - Verify at neon.tech, all unverified:
     - whether history counts towards 0.5 GB, and the minimum restore window;
     - compute-hour limits;
     - autosuspend and cold-start latency;
     - PgBouncer transaction mode with `pg` (the web uses the pooled URL; the importer uses the direct URL, which advisory locks need).
   - Mitigation: §3 and §6 guards, plus `unstable_cache` to cut database hits.
6. **R6: GitHub may disable scheduled workflows in public repos after 60 days without activity** (GitHub's documented policy; check the current wording). Mitigation: `workflow_dispatch`, the `stale` flag in `/api/health`, and the "data as of" date on the site.
7. **R7: model scope.**
   - Training uses only full-length, decided, non-D/L matches, so the model is disabled outside that scope.
   - Replays of historical matches are in-sample.
   - Women's models are validated only in CI, through `test:golden` on the real build.
8. **R8: numerical parity of the TypeScript port** (round-half-to-even, truncation). Mitigation: golden computed from the reloaded model, with tight tolerances.
9. **R9: data quirks (verified).**
   - Test results print "won by N runs" for innings wins (165 Tests) and an empty string for draws (167).
   - 8 innings have `penalty_runs` `{pre|post}`.
   - 98 have `absent_hurt`.
   - 1,883 of 6,872 files are revisions (so the fingerprint uses CRCs).
   - 8 matches in the T20I archive have `overs: 50` (unexplained; investigate).
   - The replay format keeps only the first wicket of a delivery.
   - Mitigation: A4, A7 and A8.
10. **R10: fabricated content in the web app.**
    - `seed.ts`, `seed-data.ts`, `live.ts` and analytics `attr*` ratings are fake.
    - The footer cites ESPN, CricAPI and a simulator.
    - The pipeline's `seed`/`simulate` output is fictional; it is kept only for tests.
    - Mitigation: B2 deletes the fake code, the importer refuses `dataset: "demo"`, and E rewrites the copy.
11. **R11: provenance of non-Cricsheet metadata.** Styles and roles come from `data/player_styles.csv` (see the `DATA_SOURCES.md` caveat). The ICC and ESPNcricinfo fetchers in `pipeline/sources` must never run in CI. Rankings are removed.
12. **R12: partial career coverage.** Ball-by-ball data starts in about 2001 to 2005 for men; women's start is unverified. Mitigation: "since <first date>" on every career view.
13. **R13: slug churn.** A2 splits merged players, so some v1 slugs disappear. There is no redirect table; acceptable before launch.

**Not verified in this session:**
- Postgres byte sizes (modelled, not measured; Postgres couldn't be run without creating files).
- Neon plan details, and Vercel's handling of a pre-gzipped response.
- Cricsheet's gender-specific or "recently added" archive names (not used by this design).
- That Cricsheet match ids are unique across archives (A asserts it).
- How long the full two-gender build and the four model fits take in Actions (measure in D1 and D3, timeout 90 minutes).
- Whether the upstream player-metadata table with `cricsheet_id` is available to regenerate `data/player_styles.csv`.
- Whether an accessibility tool and a local Postgres are available in the sandbox.
