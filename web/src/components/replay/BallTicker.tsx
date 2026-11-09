import type { Replay } from "@/lib/contract/pipeline";
import { ballLabel, type BallTone, type Timeline } from "@/lib/replay/engine";

const TONE: Record<BallTone, string> = {
  dot: "bg-surface-2 text-muted ring-1 ring-inset ring-line",
  run: "bg-surface-3 text-fg",
  boundary: "bg-accent text-on-accent",
  wicket: "bg-negative text-bg",
  extra: "bg-warning-soft text-warning",
};

/** The last few overs of the innings in progress, newest first. */
export default function BallTicker({ replay, timeline, cursor, overs = 3 }: { replay: Replay; timeline: Timeline; cursor: number; overs?: number }) {
  const last = cursor > 0 ? timeline.deliveries[cursor - 1] : null;
  const groups: { over: number; balls: typeof timeline.deliveries; runs: number }[] = [];
  if (last) {
    const inn = timeline.innings[last.innings];
    for (let i = cursor - 1; i >= inn.start; i--) {
      const d = timeline.deliveries[i];
      let g = groups[groups.length - 1];
      if (!g || g.over !== d.over) {
        if (groups.length === overs) break;
        g = { over: d.over, balls: [], runs: 0 };
        groups.push(g);
      }
      g.balls.unshift(d);
      g.runs += d.ball[4] + d.ball[5];
    }
  }
  const name = (i: number) => replay.people[i]?.name ?? "";

  return (
    <section aria-labelledby="ticker-title" className="card p-5">
      <h2 id="ticker-title" className="card-title">
        Recent balls
      </h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted">The first ball has not been bowled yet. Press play or step forward.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {groups.map((g, gi) => (
            <li key={`${last!.innings}-${g.over}`} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="w-24 shrink-0 text-xs text-muted">
                Over {g.over + 1}
                <span className="block text-[11px] tabular-nums">
                  {g.runs} run{g.runs === 1 ? "" : "s"} · {name(g.balls[0].ball[2])}
                </span>
              </span>
              <ol className="flex flex-wrap gap-1.5">
                {g.balls.map((d) => {
                  const l = ballLabel(d.ball);
                  const latest = gi === 0 && d.seq === cursor - 1;
                  return (
                    <li
                      key={d.seq}
                      className={`grid h-8 min-w-8 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${TONE[l.tone]} ${latest ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}
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
