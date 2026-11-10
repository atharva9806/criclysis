import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FORMAT_KEYS, type FormatKey, type ScoreSummary, type Thresholds } from "@/lib/contract/pipeline";
import { getDatasetMeta, listWinModels, type WinModelSummary } from "@/lib/data";
import { date, formatKeyLabel, int, num, pct } from "@/lib/format";
import { PageHeader, Section, TableWrap } from "@/components/data";
import CalibrationChart, { type CalibrationPoint } from "@/components/charts/Calibration";
import { ChartFrame } from "@/components/charts/Charts";
import { EmptyState, Stat } from "@/components/ui";

export const metadata: Metadata = {
  title: "Method and data · Criclysis",
  description: "Where Criclysis's numbers come from: Cricsheet data and licence, the daily refresh, how strengths and weaknesses are measured, and how the win-probability model is validated.",
};

// Rendered per request (data cached under the dataset tag), so the build never needs the database.
export const dynamic = "force-dynamic";

const TOC: [string, string][] = [
  ["data", "Data and licence"],
  ["live", "Daily refresh and “live”"],
  ["traits", "Strengths and weaknesses"],
  ["winprob", "Win probability"],
];

const THRESHOLDS: { key: keyof Thresholds; label: string; unit: string; note: string }[] = [
  { key: "minBallsSplit", label: "Batting split shown", unit: "balls faced", note: "A batting split (against a bowling type, in a phase, at a venue) is shown from this sample; below it the page says “not enough balls”." },
  { key: "minBallsBowledSplit", label: "Bowling split shown", unit: "balls bowled", note: "The same rule for bowling splits." },
  { key: "minBallsClaim", label: "Batting claim", unit: "balls faced", note: "A split needs this sample before it can become a strength or weakness." },
  { key: "minBallsBowledClaim", label: "Bowling claim", unit: "balls bowled", note: "The same rule for bowling claims." },
  { key: "minBallsCohort", label: "Batting cohort", unit: "balls faced", note: "Players with at least this many balls in the format form the batting comparison group." },
  { key: "minBallsBowledCohort", label: "Bowling cohort", unit: "balls bowled", note: "The same rule for the bowling comparison group." },
  { key: "strengthPercentile", label: "Strength", unit: "percentile or above", note: "Where a split must rank among comparable players to be called a strength." },
  { key: "weaknessPercentile", label: "Weakness", unit: "percentile or below", note: "Where a split must rank to be called a weakness." },
  { key: "teamMinMatches", label: "Team win %", unit: "decided matches", note: "A team's win percentage is shown from this many won, lost, tied or drawn matches." },
  { key: "venueMinInnings", label: "Venue average", unit: "innings", note: "A ground's first-innings average is shown from this many innings." },
];

function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-prose space-y-3 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-fg">{children}</div>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="card flex gap-4 p-4 sm:p-5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

const brier = (v: number | null | undefined) => num(v, 3);
const skill = (v: number | null | undefined) => (v == null ? "–" : pct(v * 100, 0));

/** Calibration bins with a prediction and an outcome; empty bins are dropped, never drawn at zero. */
function points(s: ScoreSummary): CalibrationPoint[] {
  return (s.calibration ?? []).flatMap((c) => (c.predicted == null || c.observed == null || !c.states ? [] : [{ bin: c.bin, states: c.states, predicted: c.predicted, observed: c.observed }]));
}

function CalibrationTable({ m }: { m: WinModelSummary }) {
  const bins = [...new Set([...(m.chase.calibration ?? []), ...(m.firstInnings.calibration ?? [])].map((c) => c.bin))];
  const find = (s: ScoreSummary, bin: string) => s.calibration?.find((c) => c.bin === bin);
  const cell = (v: number | null | undefined) => (v == null ? "–" : pct(v * 100, 0));
  return (
    <TableWrap caption={`${formatKeyLabel(m.formatKey)} calibration by predicted-probability bin`}>
      <thead>
        <tr>
          <th scope="col" rowSpan={2} className="align-bottom">
            Predicted bin
          </th>
          <th scope="colgroup" colSpan={3} className="!border-b-0 !pb-0 text-center">
            Chase
          </th>
          <th scope="colgroup" colSpan={3} className="!border-b-0 !pb-0 text-center">
            First innings
          </th>
        </tr>
        <tr>
          <th scope="col" className="num">States</th>
          <th scope="col" className="num">Predicted</th>
          <th scope="col" className="num">Won</th>
          <th scope="col" className="num">States</th>
          <th scope="col" className="num">Predicted</th>
          <th scope="col" className="num">Won</th>
        </tr>
      </thead>
      <tbody>
        {bins.map((b) => {
          const c = find(m.chase, b);
          const f = find(m.firstInnings, b);
          return (
            <tr key={b}>
              <th scope="row">{b}</th>
              <td className="num">{int(c?.states)}</td>
              <td className="num">{cell(c?.predicted)}</td>
              <td className="num font-semibold">{cell(c?.observed)}</td>
              <td className="num">{int(f?.states)}</td>
              <td className="num">{cell(f?.predicted)}</td>
              <td className="num font-semibold">{cell(f?.observed)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

function ModelCard({ m }: { m: WinModelSummary }) {
  const chase = points(m.chase);
  const first = points(m.firstInnings);
  const label = formatKeyLabel(m.formatKey);
  return (
    <article aria-labelledby={`model-${m.formatKey}`} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`model-${m.formatKey}`} className="text-heading">
          {label}
        </h3>
        <p className="text-xs text-muted">
          {int(m.testMatches)} holdout matches{m.holdoutFrom ? ` from ${date(m.holdoutFrom)}` : ""} · trained on {int(m.trainMatches)}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
        <Stat label="Chase Brier" value={brier(m.chase.brier)} sample={`vs ${brier(m.chase.baselineBrier)} baseline (skill ${skill(m.chase.skill)}) · ${int(m.chase.states)} ball states`} />
        <Stat label="First-innings Brier" value={brier(m.firstInnings.brier)} sample={`vs ${brier(m.firstInnings.baselineBrier)} baseline (skill ${skill(m.firstInnings.skill)}) · ${int(m.firstInnings.states)} ball states (every 6th)`} />
        <Stat label="Par" value={int(m.par)} unit="runs" sample={`format par; model fitted on ${int(m.matches)} matches`} />
        <Stat label="Recency half-life" value={m.halfLifeYears == null ? "None" : num(m.halfLifeYears, 0)} unit={m.halfLifeYears == null ? undefined : "years"} sample={m.halfLifeYears == null ? "every match weighted equally; the search found no gain from favouring recent ones" : "how fast older matches lose weight"} />
      </dl>
      <div className="mt-6">
        <p className="label">Calibration on the holdout</p>
        <p className="mb-2 mt-1 text-xs text-muted">
          Across: the model&apos;s predicted chance, in 10% bins. Up: how often that side actually won. On the dashed line, predictions match outcomes.
        </p>
        {chase.length || first.length ? (
          <ChartFrame
            className="h-72"
            label={`Calibration chart for the ${label} model: predicted win probability against how often that side won, for chase and first-innings states in the holdout. Points near the dashed diagonal are well calibrated.`}
            table={<CalibrationTable m={m} />}
          >
            <CalibrationChart chase={chase} firstInnings={first} />
          </ChartFrame>
        ) : (
          <p className="text-sm text-muted">This model was stored without calibration bins.</p>
        )}
      </div>
    </article>
  );
}

export default async function MethodPage() {
  const [meta, models] = await Promise.all([getDatasetMeta(), listWinModels()]);
  const t = meta?.thresholds;
  const coverage = FORMAT_KEYS.flatMap((fk) => (meta?.formats[fk] ? [meta.formats[fk]] : []));
  const cohortKeys = FORMAT_KEYS.filter((fk) => meta?.cohorts?.[fk]);
  const identity = meta?.provenance?.identity;
  const sources = Object.entries(meta?.sources ?? {});
  const holdouts = [...new Set(models.map((m) => m.holdoutFrom).filter(Boolean))] as string[];
  const has = (fk: FormatKey) => models.some((m) => m.formatKey === fk);
  const missingWomen = !has("odi-w") && !has("t20i-w");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Method"
        title="How the numbers are made"
        sub="Every figure on Criclysis is computed from Cricsheet's ball-by-ball records. This page explains where the data comes from, how often it changes, how strengths and weaknesses are found, and how well the win-probability model does on matches it never saw. Every number below is read from the current build."
      />

      <nav aria-label="On this page" className="mb-10">
        <ul className="flex flex-wrap gap-2">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="btn-secondary">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="data" title="Data and licence">
        <Prose>
          <p>
            Every delivery comes from{" "}
            <a href="https://cricsheet.org" className="link">
              Cricsheet
            </a>
            : the batter, bowler, runs, extras and dismissal for every ball of every international in its archive. Cricsheet publishes it under the{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="link">
              Creative Commons Attribution 4.0 licence (CC BY 4.0)
            </a>
            , which is why every data view on this site credits it.
          </p>
          <p>
            <strong>Ball-by-ball coverage does not reach back to the start of international cricket.</strong> A career that began before coverage starts is
            counted only from that point, so some totals here are partial and will not match a player&apos;s full career record.
          </p>
          <p>
            Players are keyed by Cricsheet&apos;s person id, never by name, so two cricketers with the same name stay separate.
            {identity ? (
              <>
                {" "}
                In this build, {int(identity.ambiguousNames)} names belong to more than one person; bowling styles are not matched by name for{" "}
                {int(identity.stylesSkippedAmbiguous)} players with such names, so they appear without a style rather than with a guessed one.
              </>
            ) : null}
          </p>
          <p>
            <strong>Photo credits.</strong> Player photos are not Cricsheet data. They come from{" "}
            <a href="https://commons.wikimedia.org" className="link">
              Wikimedia Commons
            </a>
            , matched by id: Cricsheet&apos;s people register gives each player&apos;s ESPNcricinfo id, and{" "}
            <a href="https://www.wikidata.org" className="link">
              Wikidata
            </a>{" "}
            links that id to the player&apos;s image. Only images released under CC0, into the public domain, or under CC BY, CC BY-SA or the Government Open Data Licence – India are used, and each
            is shown with its author and licence, linked to the file&apos;s page on Commons. An id that leads to more than one Wikidata entry gets no photo
            rather than a guessed one, and a player without a usable image is shown with their initials.
          </p>
        </Prose>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div>
            <h3 className="mb-3 font-semibold">Coverage in this build</h3>
            {coverage.length ? (
              <TableWrap caption="Coverage by format">
                <thead>
                  <tr>
                    <th scope="col">Format</th>
                    <th scope="col" className="num">Matches</th>
                    <th scope="col" className="num">Players</th>
                    <th scope="col" className="num">Deliveries</th>
                    <th scope="col" className="num">First</th>
                    <th scope="col" className="num">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((f) => (
                    <tr key={f.formatKey}>
                      <th scope="row">{formatKeyLabel(f.formatKey)}</th>
                      <td className="num font-semibold">{int(f.matches)}</td>
                      <td className="num">{int(f.players)}</td>
                      <td className="num">{int(f.deliveries)}</td>
                      <td className="num">{date(f.firstDate)}</td>
                      <td className="num">{date(f.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <EmptyState title="No data has been imported yet" />
            )}
            {coverage.length && !coverage.some((f) => f.gender === "female") ? (
              <p className="mt-2 text-sm text-muted">This build has no women&apos;s internationals; they appear after a refresh that imports them.</p>
            ) : null}
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Sources</h3>
            {sources.length ? (
              <ul className="space-y-3">
                {sources.map(([id, s]) => (
                  <li key={id} className="card p-4 text-sm">
                    <p className="font-semibold">
                      {s.base.startsWith("http") ? (
                        <a href={s.base} className="link">
                          {s.name}
                        </a>
                      ) : (
                        s.name
                      )}
                    </p>
                    <p className="mt-1 leading-relaxed text-muted">{s.role}</p>
                    <p className="mt-2 text-xs text-muted">
                      <span className="font-semibold text-fg">Licence:</span> {s.licence}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">The build did not record its sources.</p>
            )}
          </div>
        </div>
      </Section>

      <Section id="live" title="Daily refresh and what &ldquo;live&rdquo; means">
        <Prose>
          <p>
            Criclysis has <strong>no live-score API</strong>, uses no API keys and scrapes no websites. &ldquo;Live&rdquo; means two things:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>A daily refresh.</strong> A scheduled GitHub Action downloads Cricsheet&apos;s public daily files, rebuilds every aggregate and the
              win-probability models, and updates the database in small, hash-checked steps. A finished international usually appears within about a day.
              If any step fails, the site keeps serving the previous build.
            </li>
            <li>
              <strong>Replays.</strong> Any match with ball-by-ball data can be played back one delivery at a time, with the scoreboard, win probability,
              projected and par scores, and each batter&apos;s record against the bowling. Replays are real matches; nothing is simulated.
            </li>
          </ol>
          <p>
            Player context in a replay (strengths, weaknesses and matchups) uses career figures as of the build date, so for older matches it includes
            what happened afterwards.
          </p>
        </Prose>
        {meta ? (
          <dl className="card mt-6 grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-3">
            <Stat label="Data runs to" value={<time dateTime={meta.dataAsOf}>{date(meta.dataAsOf)}</time>} sample="the latest match in this build" />
            <Stat label="Built" value={<time dateTime={meta.generatedAt}>{date(meta.generatedAt)}</time>} sample={`build ${meta.buildId}`} />
            <Stat label="Imported" value={meta.importedAt ? <time dateTime={meta.importedAt}>{date(meta.importedAt)}</time> : "–"} sample="into the database" />
          </dl>
        ) : null}
      </Section>

      <Section
        id="traits"
        title="Strengths and weaknesses"
        sub="A raw split is not a finding. A batter's average against one bowling type means little until you know what they average overall, and how other players of the same standing fare against the same bowling."
      >
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Step n={1} title="Split every ball">
            Each player&apos;s balls are split by bowling type and family, phase of the innings, time at the crease, opposition, venue, home or away,
            chasing or setting, batting position, and the individual bowlers or batters faced.
            {t ? ` Batting splits are shown from ${int(t.minBallsSplit)} balls faced and bowling splits from ${int(t.minBallsBowledSplit)} balls bowled.` : ""}
          </Step>
          <Step n={2} title="Choose a comparable cohort">
            Players are compared only with players of the same gender in the same format, never across men&apos;s and women&apos;s cricket.
            {t ? ` The cohort is everyone with at least ${int(t.minBallsCohort)} balls faced (batting) or ${int(t.minBallsBowledCohort)} balls bowled (bowling).` : ""}
          </Step>
          <Step n={3} title="Shrink small samples">
            Each split is pulled towards the player&apos;s own overall figure in proportion to how few balls it rests on, so a short spell against one type of
            bowling cannot produce an extreme claim.
          </Step>
          <Step n={4} title="Rank the change, not the raw number">
            The ranking is of the change from the player&apos;s own baseline, against how much the rest of the cohort changes in the same split. That asks
            the useful question: relative to how good this player is, are they better or worse against this?
          </Step>
          <Step n={5} title="Apply the thresholds">
            {t
              ? `A claim needs ${int(t.minBallsClaim)} balls faced or ${int(t.minBallsBowledClaim)} bowled, a clear change from the player's baseline, and a rank at or above the ${num(t.strengthPercentile, 0)}th percentile (strength) or at or below the ${num(t.weaknessPercentile, 0)}th (weakness).`
              : "A claim needs a minimum sample, a clear change from the player's baseline, and a rank in the tail of the cohort."}{" "}
            Too-small cohorts produce no claim at all.
          </Step>
          <Step n={6} title="Show the evidence">
            Every claim carries its value, the player&apos;s baseline, the cohort median, the percentile and the balls behind it. Confidence rises with the
            sample relative to the claim threshold.
          </Step>
        </ol>

        {t ? (
          <div className="mt-8">
            <h3 className="mb-3 font-semibold">Sample thresholds in this build</h3>
            <TableWrap caption="Sample thresholds">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col" className="num">Value</th>
                  <th scope="col">Unit</th>
                  <th scope="col" className="min-w-72">What it does</th>
                </tr>
              </thead>
              <tbody>
                {THRESHOLDS.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td className="num font-semibold">{num(t[r.key], 0)}</td>
                    <td className="whitespace-nowrap text-muted">{r.unit}</td>
                    <td className="text-muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : null}

        {cohortKeys.length ? (
          <div className="mt-8">
            <h3 className="mb-3 font-semibold">Cohort sizes</h3>
            <TableWrap caption="Cohort sizes by format">
              <thead>
                <tr>
                  <th scope="col">Format</th>
                  <th scope="col" className="num">Batters</th>
                  <th scope="col" className="num">Bowlers</th>
                  <th scope="col" className="num">Median batting avg</th>
                  <th scope="col" className="num">Median economy</th>
                </tr>
              </thead>
              <tbody>
                {cohortKeys.map((fk) => {
                  const c = meta!.cohorts![fk]!;
                  return (
                    <tr key={fk}>
                      <th scope="row">{formatKeyLabel(fk)}</th>
                      <td className="num font-semibold">{int(c["batting.average"]?.n)}</td>
                      <td className="num font-semibold">{int(c["bowling.economy"]?.n)}</td>
                      <td className="num">{num(c["batting.average"]?.p50)}</td>
                      <td className="num">{num(c["bowling.economy"]?.p50)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <p className="mt-2 text-sm text-muted">
              The players who meet the cohort thresholds above, per format; medians are of those players&apos; career figures. A dash means no cohort
              for that discipline in this build.
            </p>
          </div>
        ) : null}
      </Section>

      <Section id="winprob" title="Win probability, projected score and par">
        <Prose>
          <p>
            The model is learned from Cricsheet history; nothing in it is tuned by hand. It knows only the state of the match (runs, balls and wickets),
            not team strength, conditions or the players at the crease.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Resources.</strong> For a side with a given number of legal balls left and wickets down, how many more runs do teams usually score? A
              Duckworth-Lewis-style curve is fitted for each wicket count from every completed first innings. It gives the projected score, and the spread of
              real outcomes around it gives the range shown with the projection.
            </li>
            <li>
              <strong>The chase.</strong> A logistic regression on how much of the remaining resources the target still demands (the log of runs needed over
              expected runs), with terms for the share of the innings left and wickets lost.
            </li>
            <li>
              <strong>The first innings.</strong> There is no target yet, so the model takes the spread of possible final totals from the resources curve and
              asks the chase model how often each would be defended.
            </li>
            <li>
              <strong>Par</strong> is the first-innings total that gives the side batting first an even chance. A ground&apos;s par shifts by how much more or
              less teams score there, shrunk towards the format par where a ground has few matches.
            </li>
          </ol>
          <p>
            Win probability, projected score and par are shown only for ODIs and T20Is played over their full scheduled overs and not decided by a rain
            rule; otherwise the page says why they are missing.
          </p>
        </Prose>

        <h3 className="mb-2 mt-8 font-semibold">Validation on matches the model never saw</h3>
        <Prose>
          <p>
            Each model is trained on matches before {holdouts.length === 1 ? date(holdouts[0]) : "its holdout date"} and scored on the
            later matches: every ball state of each chase, and every sixth ball state of each first innings. The <strong>Brier score</strong> is the mean squared error of the probability, so lower is better. The <strong>baseline</strong> is
            a constant forecast: how often the side batting first, or chasing, won in the training matches. <strong>Skill</strong> is 1 &minus; Brier &divide;
            baseline. The published model is then refitted on every match, including the holdout.
          </p>
          <p>
            Ball states within one match are strongly related, so the effective sample is closer to the number of holdout matches than to the number of
            states. First-innings skill is lower for a real reason: at the halfway point nobody knows how the chase will go.
          </p>
        </Prose>

        {models.length ? (
          <>
            <div className="mt-5">
              <TableWrap caption="Win-probability validation by format">
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    <th scope="col" className="num">Holdout matches</th>
                    <th scope="col" className="num">Chase Brier</th>
                    <th scope="col" className="num">Baseline</th>
                    <th scope="col" className="num">Skill</th>
                    <th scope="col" className="num">1st-inns Brier</th>
                    <th scope="col" className="num">Baseline</th>
                    <th scope="col" className="num">Skill</th>
                    <th scope="col" className="num">Par</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.formatKey}>
                      <th scope="row">
                        {formatKeyLabel(m.formatKey)}
                        {m.holdoutFrom ? <span className="block text-xs font-normal text-muted">from {date(m.holdoutFrom)}</span> : null}
                      </th>
                      <td className="num">{int(m.testMatches)}</td>
                      <td className="num font-semibold">{brier(m.chase.brier)}</td>
                      <td className="num text-muted">{brier(m.chase.baselineBrier)}</td>
                      <td className="num">{skill(m.chase.skill)}</td>
                      <td className="num font-semibold">{brier(m.firstInnings.brier)}</td>
                      <td className="num text-muted">{brier(m.firstInnings.baselineBrier)}</td>
                      <td className="num">{skill(m.firstInnings.skill)}</td>
                      <td className="num">{int(m.par)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              {missingWomen ? <p className="mt-2 text-sm text-muted">This build has no women&apos;s win models; they are fitted when women&apos;s matches are imported.</p> : null}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              {models.map((m) => (
                <ModelCard key={m.formatKey} m={m} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5">
            <EmptyState title="No win-probability models in this build">Models are fitted when ODI or T20I matches are imported.</EmptyState>
          </div>
        )}
      </Section>

      <p className="mt-12 text-sm text-muted">
        Questions about a number?{" "}
        <Link href="/matches" className="link">
          Every match
        </Link>{" "}
        links to its full scorecard, built from the same records.
      </p>
    </div>
  );
}
