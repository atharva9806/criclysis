"""Build the dataset: every file in docs/ARCHITECTURE.md §1.2 except the
win-probability models (``winprob``) and the replays (``replays``).

One streaming pass over the archives feeds four books at once:

* an :class:`Aggregator` per formatKey (players, cohorts),
* the match rows (``matches.json``),
* the ground book (``venues.json``),
* the team book (``teams/``).

A cheaper pass before it (:func:`corpus.scan`) settles what needs the whole
corpus: VenueKeys and which player names are ambiguous.
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path

from . import corpus as corpus_mod
from .aggregate import Aggregator
from .config import (BOWLING_TYPES, FORMATS, GENDERS, PHASES, ROOT, SCHEMA_VERSION,
                     SOURCES, THRESHOLDS, format_key)
from .enrich import resolve, split_maps
from .export import export_players, write_json
from .fingerprint import fingerprint, generated_at
from .matches import build_match_row, sort_key
from .replay import featured_ranks
from .sources.cricsheet import archive_path, iter_raw, parse_match
from .teams import TeamBook
from .venues import VenueBook

log = logging.getLogger(__name__)

T = THRESHOLDS

#: formatKey order used for every keyed object in the output.
FORMAT_KEYS = [format_key(fmt, g) for g in GENDERS for fmt in FORMATS]


def git_sha7() -> str:
    """The commit being built, for manifest.buildId ('local' if unknown)."""
    sha = os.environ.get("GITHUB_SHA", "")
    if not sha:
        try:
            sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                                 text=True, timeout=10, check=True).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            sha = ""
    return sha[:7] or "local"


class Builder:
    """Feeds matches into every book; then writes the files."""

    def __init__(self, corpus, *, styles: dict | None = None, hands: dict | None = None) -> None:
        """``styles`` and ``hands`` map person ids to bowling type and batting hand."""
        self.corpus = corpus
        self.styles = styles or {}
        self.hands = hands or {}
        self.aggregators: dict[str, Aggregator] = {}
        self.matches: list[dict] = []
        self.venues = VenueBook(corpus.venues)
        self.teams = TeamBook()

    def aggregator(self, fmt: str, gender: str) -> Aggregator:
        fk = format_key(fmt, gender)
        agg = self.aggregators.get(fk)
        if agg is None:
            agg = Aggregator(fmt, styles=self.styles, hands=self.hands, gender=gender)
            self.aggregators[fk] = agg
        return agg

    def add(self, fmt: str, match_id: str, raw: dict) -> None:
        info = raw.get("info", {})
        gender = info.get("gender", "male")
        key = self.corpus.venues.key(info.get("venue", ""), info.get("city"))
        match, deliveries = parse_match(raw, match_id, fmt, venue_key=key)
        self.aggregator(fmt, gender).add_match(match, deliveries)
        row = build_match_row(raw, match_id, fmt, venue_key=key, country=match.country)
        self.matches.append(row)
        self.venues.add(row)
        self.teams.add(row, deliveries)

    # ------------------------------------------------------------------
    def write(self, out_dir: Path, *, metadata: dict, provenance: dict, fingerprint_payload: dict,
              generated: str, build_id: str, pretty: bool = False) -> dict:
        out_dir.mkdir(parents=True, exist_ok=True)
        self.aggregators = {fk: self.aggregators[fk] for fk in FORMAT_KEYS
                            if fk in self.aggregators}
        for agg in self.aggregators.values():
            agg.finalise()

        players = export_players(self.aggregators, metadata, out_dir, pretty=pretty)

        ranks = featured_ranks(row["id"] for row in self.matches)
        for row in self.matches:
            row["featuredRank"] = ranks.get(row["id"])
        self.matches.sort(key=sort_key, reverse=True)
        write_json(out_dir / "matches.json",
                   {"schemaVersion": SCHEMA_VERSION, "matches": self.matches}, pretty=pretty)

        write_json(out_dir / "venues.json", self.venues.to_json(FORMAT_KEYS), pretty=pretty)

        teams_dir = out_dir / "teams"
        teams_dir.mkdir(parents=True, exist_ok=True)
        for stale in teams_dir.glob("*.json"):
            stale.unlink()
        index, files = self.teams.files(self.aggregators, players["slugs"], self.venues)
        write_json(teams_dir / "index.json", index, pretty=pretty)
        for tid, payload in files.items():
            write_json(teams_dir / f"{tid}.json", payload, pretty=pretty)

        write_json(out_dir / "fingerprint.json", fingerprint_payload, pretty=True)
        manifest = self.manifest(player_count=len(players["index"]), provenance=provenance,
                                 fingerprint_payload=fingerprint_payload,
                                 generated=generated, build_id=build_id)
        write_json(out_dir / "manifest.json", manifest, pretty=True)
        return {"players": len(players["index"]), "matches": len(self.matches),
                "teams": len(files), "venues": len(self.venues.stats),
                "playerFileBytes": players["bytes"]}

    def manifest(self, *, player_count: int, provenance: dict, fingerprint_payload: dict,
                 generated: str, build_id: str) -> dict:
        formats = {}
        for fk, agg in self.aggregators.items():
            spec = FORMATS[agg.fmt]
            summary = agg.summary()
            formats[fk] = {
                "formatKey": fk, "format": agg.fmt, "gender": agg.gender,
                "label": spec["label"], "archive": spec["archive"],
                "innings_limit": spec["innings_limit"],
                "balls_per_innings": spec["balls_per_innings"],
                "white_ball": spec["white_ball"],
                **{k: summary[k] for k in ("matches", "deliveries", "players", "venues",
                                           "bowlersMissingStyle", "firstDate", "lastDate")},
            }
        return {
            "schemaVersion": SCHEMA_VERSION,
            "buildId": build_id,
            "generated": generated,
            "fingerprint": fingerprint_payload["combined"],
            "playerCount": player_count,
            "matchCount": len(self.matches),
            "formats": formats,
            "phases": {fmt: [{"key": k, "from": s, "to": e, "label": lbl}
                             for k, s, e, lbl in PHASES[fmt]] for fmt in FORMATS},
            "bowlingTypes": BOWLING_TYPES,
            "thresholds": {
                "minBallsSplit": T.min_balls_split,
                "minBallsClaim": T.min_balls_claim,
                "minBallsCohort": T.min_balls_cohort,
                "minBallsBowledSplit": T.min_balls_bowled_split,
                "minBallsBowledClaim": T.min_balls_bowled_claim,
                "minBallsBowledCohort": T.min_balls_bowled_cohort,
                "strengthPercentile": T.strength_pct,
                "weaknessPercentile": T.weakness_pct,
                "teamMinMatches": T.team_min_matches,
                "venueMinInnings": T.venue_min_innings,
            },
            "sources": SOURCES,
            "provenance": provenance,
        }


def archive_paths(formats, archives: dict[str, Path] | None = None) -> dict[str, Path]:
    return {fmt: (archives or {}).get(fmt) or archive_path(fmt) for fmt in formats}


def build_dataset(out_dir: Path, *, formats=tuple(FORMATS), genders=tuple(GENDERS),
                  archives: dict[str, Path] | None = None, styles_file: Path | None = None,
                  limit_matches: int | None = None, only_ids: set[str] | None = None,
                  corpus=None, extra_sources: list[dict] | None = None,
                  sha: str | None = None, pretty: bool = False) -> dict:
    """Build every players/matches/teams/venues file into ``out_dir``."""
    started = time.time()
    paths = archive_paths(formats, archives)
    for fmt, path in paths.items():
        if not path.exists():
            raise FileNotFoundError(
                f"{path} not found - run `python -m pipeline fetch --formats {fmt}` first")
    if corpus is None:
        # Scan every archive, whatever is being built, so VenueKeys and
        # name ambiguity match the other commands; when the caller names the
        # archives, those are the corpus.
        scan_paths = archives if archives else archive_paths(FORMATS)
        corpus = corpus_mod.scan(formats=tuple(scan_paths), archives=scan_paths)

    # Metadata by person id, over the whole corpus (both genders).
    metadata, stats = resolve(corpus, extra_file=styles_file)
    styles, hands = split_maps(metadata)
    log.info("styles: %s", stats)

    builder = Builder(corpus, styles=styles, hands=hands)
    for fmt in formats:
        log.info("building %s (%s)", fmt, ", ".join(genders))
        count = 0
        for match_id, raw in iter_raw(fmt, limit=limit_matches, gender=genders, path=paths[fmt]):
            if only_ids is not None and match_id not in only_ids:
                continue
            builder.add(fmt, match_id, raw)
            count += 1
            if count % 1000 == 0:
                log.info("  %s: %d matches", fmt, count)

    provenance = {
        "sources": [
            {"id": "cricsheet", "used": True,
             "note": "Ball-by-ball data for every split on the site (CC BY 4.0)"},
            {"id": "playermeta", "used": bool(styles),
             "note": "Bowling styles and batting hands from data/player_styles.csv "
                     "and data/styles.csv; nothing fetched"},
            *(extra_sources or []),
        ],
        "enrichment": stats,
        "dataset": "live",
        "identity": {"ambiguousNames": len(corpus.ambiguous_names()),
                     "stylesSkippedAmbiguous": stats["skippedAmbiguous"]},
    }
    fp = fingerprint({p.name: p for p in paths.values()})
    generated = generated_at(list(paths.values()))
    build_id = f"{generated}-{sha or git_sha7()}"
    summary = builder.write(out_dir, metadata=metadata, provenance=provenance,
                            fingerprint_payload=fp, generated=generated,
                            build_id=build_id, pretty=pretty)
    for agg in builder.aggregators.values():
        log.info("  %s", agg.summary())
    log.info("wrote %s to %s in %.1fs", summary, out_dir, time.time() - started)
    return summary
