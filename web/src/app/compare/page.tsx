import Link from "next/link";
import type { CareerRow, PlayerListRow, PlayerSummary } from "@/lib/contract/db";
import { formatKey, type Fmt } from "@/lib/contract/pipeline";
import { getLeaders, getPlayerSummary, listPlayers } from "@/lib/data";
import { FORMAT_LABEL, formatKeyLabel, genderWord, int, num } from "@/lib/format";
import { fmtParam, qs, str, type SearchParams } from "@/lib/params";
import { Muted, PageHeader, Section, Select, TableWrap } from "@/components/data";
import { AttributeRadar } from "@/components/charts/Charts";

type Side = { query: string | undefined; summary: PlayerSummary | null; suggestions: PlayerListRow[] };

/** Resolve a URL value that is either a player slug or a name to search for. */
async function resolve(value: string | undefined, fmt: Fmt | undefined): Promise<Side> {
  if (!value) return { query: value, summary: null, suggestions: [] };
  const summary = await getPlayerSummary(value, fmt);
  if (summary) return { query: value, summary, suggestions: [] };
  const found = await listPlayers({ search: value, sort: "runs", pageSize: 8 });
  if (found.rows.length === 1) return { query: value, summary: await getPlayerSummary(found.rows[0].slug, fmt), suggestions: [] };
  return { query: value, summary: null, suggestions: found.rows };
}

const ROWS: { label: string; get: (c: CareerRow) => number | null; digits?: number; lowerIsBetter?: boolean }[] = [
  { label: "Matches", get: (c) => c.matches },
  { label: "Batting innings", get: (c) => c.batInnings },
  { label: "Runs", get: (c) => c.runs },
  { label: "Batting average", get: (c) => c.batAvg, digits: 2 },
  { label: "Strike rate", get: (c) => c.batSr, digits: 2 },
  { label: "Hundreds", get: (c) => c.hundreds },
  { label: "Fifties", get: (c) => c.fifties },
  { label: "Balls bowled", get: (c) => c.bowlBalls },
  { label: "Wickets", get: (c) => c.wickets },
  { label: "Bowling average", get: (c) => c.bowlAvg, digits: 2, lowerIsBetter: true },
  { label: "Economy", get: (c) => c.bowlEcon, digits: 2, lowerIsBetter: true },
  { label: "Balls per wicket", get: (c) => c.bowlSr, digits: 1, lowerIsBetter: true },
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const fmt = fmtParam(sp.f) ?? "odi";
  let a = str(sp.a);
  let b = str(sp.b);
  if (!a && !b) {
    // A starting pair: the two leading run scorers in men's ODIs in this build.
    const top = await getLeaders(formatKey(fmt, "male"), "runs", 2);
    a = top[0]?.slug;
    b = top[1]?.slug;
  }
  const [A, B] = await Promise.all([resolve(a, fmt), resolve(b, fmt)]);
  const ca = A.summary?.careers.find((c) => c.format === fmt) ?? null;
  const cb = B.summary?.careers.find((c) => c.format === fmt) ?? null;
  const both = A.summary && B.summary;
  // Profiles only line up when both are for the chosen format (a summary falls back to the player's main format).
  const inFmt = (s: Side) => s.summary?.formatKey?.startsWith(`${fmt}-`) ?? false;
  const axes = both && inFmt(A) && inFmt(B) ? A.summary!.profile.filter((x) => B.summary!.profile.some((y) => y.axis === x.axis)) : [];

  const sideForm = (s: Side, name: "a" | "b") => (
    <div className="card flex-1 p-5">
      <label className="flex flex-col gap-1 text-xs font-medium text-[#6e6e73]">
        Player {name.toUpperCase()}
        <input name={name} defaultValue={s.summary?.player.slug ?? s.query ?? ""} placeholder="Name or profile id" className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm text-[#1d1d1f]" />
      </label>
      {s.summary ? (
        <div className="mt-4">
          <Link href={`/players/${s.summary.player.slug}${qs({ f: fmt })}`} className="text-xl font-semibold hover:text-[#0071e3]">
            {s.summary.player.name}
          </Link>
          <p className="text-sm text-[#6e6e73]">
            {genderWord(s.summary.player.gender)} · {s.summary.player.teams.join(", ") || s.summary.player.country}
          </p>
        </div>
      ) : s.query ? (
        <div className="mt-4 text-sm">
          {s.suggestions.length ? (
            <>
              <p className="text-[#6e6e73]">Did you mean:</p>
              <ul className="mt-1 space-y-1">
                {s.suggestions.map((r) => (
                  <li key={r.slug}>
                    <Link className="text-[#0071e3] hover:underline" href={`/compare${qs({ a: name === "a" ? r.slug : a, b: name === "b" ? r.slug : b, f: fmt })}`}>
                      {r.name}
                    </Link>{" "}
                    <span className="text-[#6e6e73]">{r.teams.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[#6e6e73]">No player matches “{s.query}”.</p>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <PageHeader eyebrow="Compare" title="Two players, side by side." sub="Career records in one format, and where each ranks among comparable players." />
      <form method="get" action="/compare" className="flex flex-col gap-4 md:flex-row md:items-start">
        {sideForm(A, "a")}
        {sideForm(B, "b")}
        <div className="flex items-end gap-3 md:flex-col md:items-stretch">
          <Select name="f" label="Format" value={fmt} options={[["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
          <button type="submit" className="btn-primary justify-center">Compare</button>
        </div>
      </form>

      {both ? (
        <>
          {A.summary!.player.gender !== B.summary!.player.gender ? (
            <p className="mt-6 rounded-2xl bg-[#ff9500]/10 p-4 text-sm text-[#c93400]">
              These players are measured against different cohorts (men&apos;s and women&apos;s cricket), so their percentiles are not directly comparable.
            </p>
          ) : null}
          <Section title={`${FORMAT_LABEL[fmt]} careers`}>
            {ca || cb ? (
              <TableWrap caption="Career comparison">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col" className="text-right text-[#0071e3]">{A.summary!.player.name}</th>
                    <th scope="col" className="text-right text-[#ff375f]">{B.summary!.player.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => {
                    const va = ca ? r.get(ca) : null;
                    const vb = cb ? r.get(cb) : null;
                    const show = (v: number | null) => (r.digits ? num(v, r.digits) : int(v));
                    const better = (x: number | null, y: number | null) => x !== null && y !== null && (r.lowerIsBetter ? x < y : x > y);
                    return (
                      <tr key={r.label}>
                        <th scope="row" className="font-normal">{r.label}</th>
                        <td className={`text-right tabular-nums ${better(va, vb) ? "font-semibold" : ""}`}>{show(va)}</td>
                        <td className={`text-right tabular-nums ${better(vb, va) ? "font-semibold" : ""}`}>{show(vb)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            ) : (
              <Muted>Neither player has {FORMAT_LABEL[fmt]} records in the data.</Muted>
            )}
          </Section>
          <Section
            title="Percentile profiles"
            sub={A.summary!.formatKey && B.summary!.formatKey ? `${formatKeyLabel(A.summary!.formatKey)} and ${formatKeyLabel(B.summary!.formatKey)} cohorts.` : undefined}
          >
            {axes.length ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="card p-4">
                  <AttributeRadar
                    data={axes.map((x) => ({ attribute: x.label, a: x.percentile, b: B.summary!.profile.find((y) => y.axis === x.axis)!.percentile }))}
                    keys={[
                      { key: "a", name: A.summary!.player.name, color: "#0071e3" },
                      { key: "b", name: B.summary!.player.name, color: "#ff375f" },
                    ]}
                    height={340}
                  />
                </div>
                <TableWrap caption="Percentiles">
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col" className="text-right">{A.summary!.player.name}</th>
                      <th scope="col" className="text-right">{B.summary!.player.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {axes.map((x) => {
                      const y = B.summary!.profile.find((p) => p.axis === x.axis)!;
                      return (
                        <tr key={x.axis}>
                          <th scope="row" className="font-normal">{x.label}</th>
                          <td className="text-right tabular-nums">{num(x.percentile, 1)} <span className="text-xs text-[#6e6e73]">({int(x.balls)} b)</span></td>
                          <td className="text-right tabular-nums">{num(y.percentile, 1)} <span className="text-xs text-[#6e6e73]">({int(y.balls)} b)</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              </div>
            ) : (
              <Muted>The two players share no profile measure in {FORMAT_LABEL[fmt]}s.</Muted>
            )}
          </Section>
        </>
      ) : (
        <div className="mt-8">
          <Muted>Choose two players to compare. Type a name or paste the id from a profile address (for example v-kohli-ba607b88).</Muted>
        </div>
      )}
    </div>
  );
}
