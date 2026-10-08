"use client";

import type { KeyboardEvent, ReactNode } from "react";

export const SPEEDS = [1, 5, 20] as const;
export type Speed = (typeof SPEEDS)[number];

function IconButton({ label, onClick, disabled, children, keys }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; keys?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts={keys}
      title={keys ? `${label} (${keys.replace(/\+/g, " + ")})` : label}
      className="grid h-10 w-10 place-items-center rounded-full text-[#1d1d1f] transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;

export default function Controls({
  playing,
  speed,
  cursor,
  total,
  position,
  onToggle,
  onStep,
  onOver,
  onSeek,
  onSpeed,
}: {
  playing: boolean;
  speed: Speed;
  cursor: number;
  total: number;
  /** Spoken value of the scrubber, e.g. "Innings 2, over 14.5: Australia 77 for 3". */
  position: string;
  onToggle: () => void;
  onStep: (dir: 1 | -1) => void;
  onOver: (dir: 1 | -1) => void;
  onSeek: (cursor: number) => void;
  onSpeed: (speed: Speed) => void;
}) {
  const atStart = cursor <= 0;
  const atEnd = cursor >= total;

  // Arrow keys move the native slider one ball; Page Up/Down move an over.
  const onScrubKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      onOver(e.key === "PageUp" ? 1 : -1);
    }
  };

  return (
    <section aria-label="Replay controls" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Previous over" onClick={() => onOver(-1)} disabled={atStart} keys="Shift+ArrowLeft">
            <svg {...svg}>
              <path d="M11 6v12L3 12l8-6zm10 0v12l-8-6 8-6z" />
            </svg>
          </IconButton>
          <IconButton label="Previous ball" onClick={() => onStep(-1)} disabled={atStart} keys="ArrowLeft">
            <svg {...svg}>
              <path d="M7 6h2v12H7zM20 6v12l-9-6 9-6z" />
            </svg>
          </IconButton>
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? "Pause" : atEnd ? "Replay from the start" : "Play"}
            aria-keyshortcuts="Space K"
            className="mx-1 grid h-12 w-12 place-items-center rounded-full bg-[#0071e3] text-white transition-colors hover:bg-[#0077ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
          >
            {playing ? (
              <svg {...svg} width={22} height={22}>
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
              </svg>
            ) : atEnd ? (
              <svg {...svg} width={22} height={22}>
                <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />
              </svg>
            ) : (
              <svg {...svg} width={22} height={22}>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <IconButton label="Next ball" onClick={() => onStep(1)} disabled={atEnd} keys="ArrowRight">
            <svg {...svg}>
              <path d="M15 6h2v12h-2zM4 6l9 6-9 6V6z" />
            </svg>
          </IconButton>
          <IconButton label="Next over" onClick={() => onOver(1)} disabled={atEnd} keys="Shift+ArrowRight">
            <svg {...svg}>
              <path d="M13 6v12l8-6-8-6zM3 6v12l8-6-8-6z" />
            </svg>
          </IconButton>
        </div>

        <div role="group" aria-label="Playback speed" className="segment">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              data-active={speed === s}
              onClick={() => onSpeed(s)}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
            >
              {s}×<span className="sr-only"> speed</span>
            </button>
          ))}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Position in the match</span>
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={cursor}
          onChange={(e) => onSeek(Number(e.target.value))}
          onKeyDown={onScrubKey}
          aria-valuetext={position}
          className="w-full cursor-pointer accent-[#0071e3]"
        />
      </label>
      <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[#6e6e73]">
        <span aria-hidden>{position}</span>
        <span className="hidden sm:inline">Space play or pause · ← → ball · Shift + ← → over</span>
      </p>
    </section>
  );
}
