import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, getLatestResults, listReplayable } from "@/lib/data";
import { FORMAT_LABEL, date } from "@/lib/format";
import { fmtParam, genderParam, type SearchParams } from "@/lib/params";
import { GenderToggle, MatchGrid, NoGenderData, PageHeader, ReplayGrid, Section, genderHref } from "@/components/data";
import { CardGridSkeleton } from "@/components/Loading";
import { EmptyState, SegmentedLinks } from "@/components/ui";

export const metadata: Metadata = {
  title: "Latest results and replays · Criclysis",
  description: "The latest international results from Cricsheet's daily files, and real matches replayed ball by ball with win probability.",
};

const FORMATS: { value?: Fmt; label: string }[] = [{ label: "All formats" }, { value: "test", label: "Tests" }, { value: "odi", label: "ODIs" }, { value: "t20i", label: "T20Is" }];

async function Results({ gender, format }: { gender: Gender; format?: Fmt }) {
  const results = await getLatestResults({ gender, format, limit: 12 });
  if (results.length) return <MatchGrid matches={results} empty="" />;
  if (!format) return <NoGenderData gender={gender} what="results" menHref="/live" />;
  return (
    <EmptyState
      title={`No ${gender === "female" ? "women's" : "men's"} ${FORMAT_LABEL[format]} results in this build`}
      action={
        <Link href={genderHref("/live", gender)} className="btn-secondary">
          Show every format
        </Link>
      }
    />
  );
}

async function Replays({ gender }: { gender: Gender }) {
  const [featured, recentOdi, recentT20i] = await Promise.all([
    listReplayable({ featured: true, gender, limit: 12 }),
    listReplayable({ format: "odi", gender, limit: 6 }),
    listReplayable({ format: "t20i", gender, limit: 6 }),
  ]);
  const featuredIds = new Set(featured.map((m) => m.id));
  const recent = [...recentOdi, ...recentT20i]
    .filter((m) => !featuredIds.has(m.id))
    .sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : a.id.localeCompare(b.id)))
    .slice(0, 8);
  if (featured.length + recent.length === 0) return <NoGenderData gender={gender} what="replays" menHref="/live" />;
  return (
    <div className="space-y-8">
      {featured.length > 0 ? (
        <div>
          <h3 className="label mb-3">Finals</h3>
          <ReplayGrid matches={featured} />
        </div>
      ) : null}
      {recent.length > 0 ? (
        <div>
          <h3 className="label mb-3">Recent ODIs and T20Is</h3>
          <ReplayGrid matches={recent} cols={4} />
        </div>
      ) : null}
    </div>
  );
}

export default async function LivePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const gender = genderParam(sp.gender) ?? "male";
  const format = fmtParam(sp.format);
  const meta = await getDatasetMeta();
  const word = gender === "female" ? "women's" : "men's";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Live"
        title="Latest results, and real matches replayed"
        sub="There is no live-score feed here. New internationals arrive from Cricsheet's public files, refreshed once a day, and any match with ball-by-ball data can be replayed."
        actions={<GenderToggle gender={gender} href={(g) => genderHref("/live", g, { format })} />}
      />

      <Section
        id="results"
        title={`Latest ${word} ${format ? `${FORMAT_LABEL[format]} ` : ""}results`}
        sub={meta ? `The data runs to ${date(meta.dataAsOf)}.` : "No dataset has been imported yet."}
        actions={
          <SegmentedLinks
            label="Format"
            items={FORMATS.map((o) => ({ key: o.label, href: genderHref("/live", gender, { format: o.value }), label: o.label, active: o.value === format }))}
          />
        }
      >
        <Suspense key={`${gender}-${format ?? "all"}`} fallback={<CardGridSkeleton label="Loading results" />}>
          <Results gender={gender} format={format} />
        </Suspense>
      </Section>

      <Section
        id="replays"
        title="Replay a match"
        sub="Every replay is a real match, played back ball by ball from its Cricsheet record, with the scoreboard, win probability, projected and par scores, and each batter's record against the bowling."
      >
        <Suspense key={gender} fallback={<CardGridSkeleton label="Loading replays" count={3} height="h-44" />}>
          <Replays gender={gender} />
        </Suspense>
      </Section>

      <section aria-labelledby="how-title" className="card mt-12 p-5 sm:p-6">
        <h2 id="how-title" className="text-heading">
          What &ldquo;live&rdquo; means here
        </h2>
        <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-muted">
          <p>
            Criclysis uses no live-score service and scrapes no websites. A scheduled job downloads Cricsheet&apos;s public match files every day and
            refreshes the database, so a finished international usually appears within about a day.
          </p>
          <p>
            Replays step through a real match one delivery at a time. Win probability, projected score and par come from a model fitted to Cricsheet
            history, and are shown only for full-length ODIs and T20Is not decided by a rain rule.
          </p>
        </div>
        <p className="mt-3 text-sm">
          <Link href="/method#live" className="link">
            How the refresh and the model work
          </Link>
        </p>
      </section>
    </div>
  );
}
