import Link from "next/link";
import type { SplitRow, TraitRow } from "@/lib/contract/db";
import { buildMatchupPlan, buildPlayerDossier, getDatasetMeta, listPlayers, listTeams } from "@/lib/data";
import { fmtOfKey } from "@/lib/data/rows";
import { FORMAT_LABEL, formatKeyLabel, int, plural, splitLabel, type LabelContext } from "@/lib/format";
import { fmtParam, qs, str, type SearchParams } from "@/lib/params";
import { MatchGrid, Muted, PageHeader, Section, Select, SplitTable } from "@/components/data";

function Evidence({ title, claims, empty }: { title: string; claims: TraitRow[]; empty: string }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      {claims.length ? (
        <ul className="mt-3 space-y-3 text-sm">
          {claims.map((c) => (
            <li key={`${c.kind}-${c.rank}`}>
              <p>{c.text}</p>
              <p className="text-xs text-[#6e6e73]">
                Sample: {plural(c.balls, "ball")} · {c.confidence} confidence
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#6e6e73]">{empty}</p>
      )}
    </div>
  );
}

function KeyPlayers({ title, f, players }: { title: string; f: string; players: { playerId: string; name: string; slug: string | null; stat: string; traits: TraitRow[] }[] }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      {players.length ? (
        <ul className="mt-3 space-y-3 text-sm">
          {players.map((p) => (
            <li key={p.playerId}>
              {p.slug ? (
                <Link href={`/players/${p.slug}${qs({ f })}`} className="font-medium hover:text-[#0071e3]">{p.name}</Link>
              ) : (
                <span className="font-medium">{p.name}</span>
              )}
              <span className="text-[#6e6e73]"> · {p.stat}</span>
              {p.traits.map((t) => (
                <p key={t.rank} className="mt-1 text-xs text-[#6e6e73]">{t.text}</p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#6e6e73]">No player records for this team.</p>
      )}
    </div>
  );
}

const tab = "rounded-full px-4 py-1.5 font-medium text-[#1d1d1f]/70 data-[active=true]:bg-white data-[active=true]:text-[#1d1d1f] data-[active=true]:shadow-sm";

export default async function StrategyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const mode = str(sp.mode) === "team" ? "team" : "player";
  const fmt = fmtParam(sp.f);
  const meta = await getDatasetMeta();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <PageHeader
        eyebrow="Strategy"
        title="Plans built only from the evidence."
        sub="Every line below is a measured split or record from the data, with the sample behind it. Nothing here is a prediction."
      />
      <nav className="segment" aria-label="Mode">
        <Link href="/strategy?mode=player" data-active={mode === "player"} className={tab}>Player dossier</Link>
        <Link href="/strategy?mode=team" data-active={mode === "team"} className={tab}>Team fixture</Link>
      </nav>
      {mode === "player" ? <PlayerMode p={str(sp.p)} fmt={fmt} meta={meta} /> : <TeamMode team={str(sp.team)} opp={str(sp.opp)} fmt={fmt} minMatches={meta?.thresholds.teamMinMatches ?? 5} />}
    </div>
  );
}

async function PlayerMode({ p, fmt, meta }: { p?: string; fmt?: ReturnType<typeof fmtParam>; meta: Awaited<ReturnType<typeof getDatasetMeta>> }) {
  let slug = p;
  let suggestions: { slug: string; name: string; teams: string[] }[] = [];
  let dossier = slug ? await buildPlayerDossier(slug, fmt) : null;
  if (slug && !dossier) {
    const found = await listPlayers({ search: slug, pageSize: 8 });
    if (found.rows.length === 1) {
      slug = found.rows[0].slug;
      dossier = await buildPlayerDossier(slug, fmt);
    } else suggestions = found.rows;
  }
  const f = dossier ? fmtOfKey(dossier.formatKey) : null;
  const ctx: LabelContext = { bowlingTypes: meta?.bowlingTypes ?? {}, phases: f ? (meta?.phases[f] ?? []) : [] };
  const lab = (r: SplitRow) => splitLabel(r.dimension, r.subject, r.label, ctx);
  const batEmpty = `Not enough balls: splits are shown from ${meta?.thresholds.minBallsSplit ?? 60} balls faced.`;
  const bowlEmpty = `Not enough balls: splits are shown from ${meta?.thresholds.minBallsBowledSplit ?? 90} balls bowled.`;

  return (
    <>
      <form method="get" action="/strategy" className="card mt-6 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="mode" value="player" />
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-[#6e6e73]">
          Player
          <input name="p" defaultValue={slug ?? ""} placeholder="Name or profile id" className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm text-[#1d1d1f]" />
        </label>
        <Select name="f" label="Format" value={fmt} options={[["", "Main format"], ["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
        <button type="submit" className="btn-primary">Build dossier</button>
      </form>

      {!slug ? (
        <div className="mt-6"><Muted>Choose a player to see where the evidence says to attack them and what to avoid.</Muted></div>
      ) : !dossier ? (
        <div className="mt-6">
          {suggestions.length ? (
            <div className="card p-5 text-sm">
              <p className="text-[#6e6e73]">Did you mean:</p>
              <ul className="mt-1 space-y-1">
                {suggestions.map((r) => (
                  <li key={r.slug}>
                    <Link className="text-[#0071e3] hover:underline" href={`/strategy${qs({ mode: "player", p: r.slug, f: fmt })}`}>{r.name}</Link>{" "}
                    <span className="text-[#6e6e73]">{r.teams.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Muted>No player matches “{slug}”.</Muted>
          )}
        </div>
      ) : (
        <>
          <Section title={`${dossier.player.name}, ${formatKeyLabel(dossier.formatKey)}`} sub={<Link href={`/players/${dossier.player.slug}${qs({ f })}`} className="text-[#0071e3] hover:underline">Full profile →</Link>}>
            {dossier.batting ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Evidence title="Bowling to them: where to attack" claims={dossier.batting.attack} empty="No batting weakness clears the thresholds in this format." />
                <Evidence title="Bowling to them: what to avoid" claims={dossier.batting.avoid} empty="No batting strength clears the thresholds in this format." />
              </div>
            ) : null}
            {dossier.bowling ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Evidence title="Batting against them: where they leak" claims={dossier.bowling.weaknesses} empty="No bowling weakness clears the thresholds in this format." />
                <Evidence title="Batting against them: where they are strongest" claims={dossier.bowling.strengths} empty="No bowling strength clears the thresholds in this format." />
              </div>
            ) : null}
          </Section>
          {dossier.batting ? (
            <Section title="Their batting against each bowling type and phase">
              <div className="space-y-6">
                <SplitTable rows={dossier.batting.vsType} label={lab} subjectHeader="Bowling type" empty={batEmpty} />
                <SplitTable rows={dossier.batting.byPhase} label={lab} subjectHeader="Phase" empty={batEmpty} />
              </div>
            </Section>
          ) : null}
          {dossier.bowling ? (
            <Section title="Their bowling by batter hand and phase">
              <div className="space-y-6">
                <SplitTable rows={dossier.bowling.byHand} label={lab} subjectHeader="Batter" empty={bowlEmpty} />
                <SplitTable rows={dossier.bowling.byPhase} label={lab} subjectHeader="Phase" empty={bowlEmpty} />
              </div>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

async function TeamMode({ team, opp, fmt, minMatches }: { team?: string; opp?: string; fmt?: ReturnType<typeof fmtParam>; minMatches: number }) {
  const teams = await listTeams();
  if (!teams.length) {
    return <div className="mt-6"><Muted>Team records are not in this build yet.</Muted></div>;
  }
  const f = fmt ?? "odi";
  const plan = team && opp && team !== opp ? await buildMatchupPlan(team, opp, f) : null;
  const options = teams.map((t) => [t.id, t.label] as [string, string]);

  return (
    <>
      <form method="get" action="/strategy" className="card mt-6 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="mode" value="team" />
        <Select name="team" label="Team" value={team} options={[["", "Choose a team"], ...options]} />
        <Select name="opp" label="Opponent" value={opp} options={[["", "Choose an opponent"], ...options]} />
        <Select name="f" label="Format" value={f} options={[["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
        <button type="submit" className="btn-primary">Build plan</button>
      </form>
      {!team || !opp ? (
        <div className="mt-6"><Muted>Choose two teams of the same gender to see their records against each other and the opponent&apos;s patterns.</Muted></div>
      ) : !plan ? (
        <div className="mt-6"><Muted>No {FORMAT_LABEL[f]} records for both of these teams.</Muted></div>
      ) : (
        <>
          <Section title={`${plan.team.label} v ${plan.opponent.label}, ${formatKeyLabel(plan.formatKey)}`} sub={`Win percentages are shown from ${minMatches} matches.`}>
            <div className="grid gap-4 md:grid-cols-2">
              {plan.lines.map((g) => (
                <div key={g.heading} className="card p-5">
                  <h3 className="font-semibold">{g.heading}</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {g.items.map((l, i) => (
                      <li key={i}>
                        {l.text} <span className="text-xs text-[#6e6e73]">({l.sample})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
          <Section title={`${plan.opponent.label}'s leading players`} sub="Their two most significant weaknesses in this format, where they have a profile.">
            <div className="grid gap-4 md:grid-cols-2">
              <KeyPlayers title="Batters" f={f} players={plan.opponentBatters.map((b) => ({ ...b, stat: `${int(b.runs)} runs in ${plural(b.innings, "innings", "innings")}` }))} />
              <KeyPlayers title="Bowlers" f={f} players={plan.opponentBowlers.map((b) => ({ ...b, stat: `${int(b.wickets)} wickets in ${plural(b.innings, "innings", "innings")}` }))} />
            </div>
          </Section>
          <Section title="Recent meetings">
            <MatchGrid matches={plan.recent} empty="These teams have not met in this format in the data." />
            <p className="mt-4 text-sm">
              <Link href={`/teams/${plan.team.id}/vs/${plan.opponent.id}${qs({ f })}`} className="text-[#0071e3] hover:underline">Full head to head →</Link>
            </p>
          </Section>
        </>
      )}
    </>
  );
}
