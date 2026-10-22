import Link from "next/link";
import type { LeaderRow } from "@/lib/contract/db";
import { formatKey, type Fmt } from "@/lib/contract/pipeline";
import { getDatasetMeta, getLatestResults, getLeaders, listReplayable } from "@/lib/data";
import { FORMAT_LABEL, date, formatKeyLabel, genderWord, int } from "@/lib/format";
import { fmtParam, genderParam, genderSlug, qs, type SearchParams } from "@/lib/params";
import { MatchGrid, Muted, Section } from "@/components/data";
import { DataCredit } from "@/components/DataCredit";

function Leaders({ title, rows, unit }: { title: string; rows: LeaderRow[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {rows.length ? (
        <ol className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <li key={r.slug}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/players/${r.slug}`} className="font-medium hover:text-[#0071e3]">
                  <span className="mr-2 text-[#6e6e73]">{i + 1}</span>
                  {r.name}
                </Link>
                <span className="tabular-nums">
                  {int(r.value)} {unit}
                  <span className="ml-1 text-xs text-[#6e6e73]">({int(r.innings)} inns)</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-black/5" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-[#0071e3]" style={{ width: `${(100 * r.value) / max}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-[#6e6e73]">No players in this format yet.</p>
      )}
    </div>
  );
}

const tab = "rounded-full px-4 py-1.5 font-medium text-[#1d1d1f]/70 data-[active=true]:bg-white data-[active=true]:text-[#1d1d1f] data-[active=true]:shadow-sm";

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const gender = genderParam(sp.g) ?? "male";
  const meta = await getDatasetMeta();
  const available = Object.values(meta?.formats ?? {});
  const fmts = (["test", "odi", "t20i"] as Fmt[]).filter((f) => available.some((x) => x.format === f && x.gender === gender));
  const wanted = fmtParam(sp.f);
  const fmt = wanted && fmts.includes(wanted) ? wanted : fmts.includes("odi") ? "odi" : fmts[0];
  const fk = fmt ? formatKey(fmt, gender) : null;
  const [latest, featured, runs, wickets] = await Promise.all([
    getLatestResults({ limit: 8 }),
    listReplayable({ featured: true, limit: 6 }),
    fk ? getLeaders(fk, "runs", 8) : Promise.resolve([]),
    fk ? getLeaders(fk, "wickets", 8) : Promise.resolve([]),
  ]);
  const genders = [...new Set(available.map((f) => f.gender))];
  const href = (g: string, f?: string) => `/${qs({ g, f })}`;

  return (
    <>
      <section className="gradient-mesh">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-16 md:px-6 md:pt-24">
          <p className="text-sm font-semibold text-[#0071e3]">Criclysis</p>
          <h1 className="headline mt-3 max-w-4xl text-4xl md:text-6xl">International cricket, measured ball by ball.</h1>
          <p className="mt-5 max-w-2xl text-lg text-[#6e6e73]">
            Career records, strengths and weaknesses against comparable players, team records and every result, computed from Cricsheet&apos;s
            ball-by-ball data.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/players" className="btn-primary">Explore players</Link>
            <Link href="/teams" className="btn-ghost">Teams</Link>
            <Link href="/matches" className="btn-ghost">All matches</Link>
          </div>
          <DataCredit className="mt-6" />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <Section title="Coverage" sub="Ball-by-ball records start in the early 2000s for most teams, so earlier careers are only partly covered.">
          {available.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((f) => (
                <li key={f.formatKey} className="card p-5">
                  <p className="font-semibold">{formatKeyLabel(f.formatKey)}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{int(f.matches)} matches</p>
                  <p className="text-sm text-[#6e6e73]">
                    {int(f.players)} players · {date(f.firstDate)} to {date(f.lastDate)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No data has been imported yet.</Muted>
          )}
        </Section>

        <Section title="Latest results" sub={meta ? `From the daily Cricsheet import; matches up to ${date(meta.dataAsOf)}.` : undefined}>
          <MatchGrid matches={latest} empty="No match results in this build yet." />
          {latest.length ? (
            <p className="mt-4 text-sm">
              <Link href="/matches" className="text-[#0071e3] hover:underline">Every match →</Link>
            </p>
          ) : null}
        </Section>

        <Section title="Featured replays" sub="Finals replayed ball by ball, with win probability where the model applies.">
          {featured.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((m) => (
                <li key={m.id}>
                  <Link href={`/live/${m.id}`} className="card card-hover block p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
                      {[m.eventName, m.eventStage].filter(Boolean).join(", ")} · {date(m.endDate)}
                    </p>
                    <p className="mt-2 font-semibold">
                      {m.team1} v {m.team2}
                    </p>
                    <p className="mt-1 text-sm text-[#6e6e73]">{m.result.text}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No replays are stored in this build yet.</Muted>
          )}
        </Section>

        <Section title="Leaders" sub={fk ? `${formatKeyLabel(fk)} career totals within Cricsheet's coverage.` : undefined}>
          <div className="flex flex-wrap gap-3">
            {genders.length > 1 ? (
              <nav className="segment" aria-label="Gender">
                {genders.map((g) => (
                  <Link key={g} href={href(genderSlug(g), fmt)} data-active={g === gender} className={tab}>
                    {genderWord(g)}
                  </Link>
                ))}
              </nav>
            ) : null}
            {fmts.length > 1 ? (
              <nav className="segment" aria-label="Format">
                {fmts.map((f) => (
                  <Link key={f} href={href(genderSlug(gender), f)} data-active={f === fmt} className={tab}>
                    {FORMAT_LABEL[f]}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Leaders title="Most runs" rows={runs} unit="runs" />
            <Leaders title="Most wickets" rows={wickets} unit="wkts" />
          </div>
        </Section>
      </div>
    </>
  );
}
