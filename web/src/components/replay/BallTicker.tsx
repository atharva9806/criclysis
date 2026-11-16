import type { Replay } from "@/lib/contract/pipeline";
import { ballLabel, type BallTone, type Timeline } from "@/lib/replay/engine";

/** Ball chips. Every chip carries its text (•, 1, 4, 6, W, 1wd), so colour is never the only cue. */
const TONE: Record<BallTone | "four" | "six", string> = {
  dot: "bg-surface-2 text-muted ring-1 ring-inset ring-line-strong",
  run: "bg-surface-3 text-fg",
  boundary: "bg-surface-3 text-fg",
  four: "bg-[var(--chart-1)] text-bg",
  six: "bg-accent text-on-accent",
  wicket: "bg-negative text-bg",
  extra: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/40",
};

const KEY: [keyof typeof TONE, string, string][] = [
  ["four", "4", "four"],
  ["six", "6", "six"],
  ["wicket", "W", "wicket"],
  ["extra", "1wd", "extra"],
];

/** The last few overs of the innings in progress, newest first. */
export default function BallTicker({ replay, timeline, cursor, overs = 3 }: { replay: Replay; timeline: Timeline; cursor: number; overs?: number }) {
  const last = cursor > 0 ? timeline.deliveries[cursor - 1] : null;
  const groups: { over: number; balls: typeof timeline.deliveries; runs: number; wickets: number }[] = [];
  if (last) {
    const inn = timeline.innings[last.innings];
    for (let i = cursor - 1; i >= inn.start; i--) {
      const d = timeline.deliveries[i];
      let g = groups[groups.length - 1];
      if (!g || g.over !== d.over) {
        if (groups.length === overs) break;
        g = { over: d.over, balls: [], runs: 0, wickets: 0 };
        groups.push(g);
      }
      g.balls.unshift(d);
      g.runs += d.ball[4] + d.ball[5];
      if (ballLabel(d.ball).tone === "wicket") g.wickets += 1;
    }
  }
  const name = (i: number) => replay.people[i]?.name ?? "";

  return (
    <section aria-labelledby="ticker-title" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="ticker-title" className="card-title">
          Ball by ball
        </h2>
        <ul aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {KEY.map(([tone, text, label]) => (
            <li key={tone} className="inline-flex items-center gap-1.5">
              <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 font-display text-[11px] font-bold ${TONE[tone]}`}>{text}</span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted">The first ball has not been bowled yet. Press play or step forward.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {groups.map((g, gi) => (
            <li
              key={`${last!.innings}-${g.over}`}
              className={`flex flex-col gap-2 rounded-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 ${gi === 0 ? "bg-surface-2 ring-1 ring-inset ring-line-strong" : ""}`}
            >
              <span className="flex shrink-0 items-baseline gap-2 sm:w-36 sm:flex-col sm:gap-0">
                <span className="font-display text-base font-bold uppercase tracking-[0.04em]">
                  {gi === 0 ? "This over" : `Over ${g.over + 1}`}
                  {gi === 0 ? <span className="ml-1 text-muted">({g.over + 1})</span> : null}
                </span>
                <span className="truncate text-[11px] text-muted tabular-nums">
                  {g.runs} run{g.runs === 1 ? "" : "s"}
                  {g.wickets ? `, ${g.wickets} wkt${g.wickets === 1 ? "" : "s"}` : ""} · {name(g.balls[0].ball[2])}
                </span>
              </span>
              <ol className="flex flex-wrap gap-1.5">
                {g.balls.map((d) => {
                  const l = ballLabel(d.ball);
                  const latest = gi === 0 && d.seq === cursor - 1;
                  const tone = l.tone === "boundary" ? (l.text === "6" ? "six" : "four") : l.tone;
                  return (
                    <li
                      key={d.seq}
                      className={`grid h-9 min-w-9 place-items-center rounded-full px-1.5 font-display text-base font-bold tabular-nums ${TONE[tone]} ${latest ? "pop ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}
                      aria-label={`${d.label}: ${name(d.ball[2])} to ${name(d.ball[1])}, ${l.description}`}
                      title={`${d.label} ${name(d.ball[2])} to ${name(d.ball[1])}: ${l.description}`}
                    >
                      {l.text}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
