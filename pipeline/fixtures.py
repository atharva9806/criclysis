"""A small, deterministic, real dataset for the other streams to build against.

``python -m pipeline fixtures --out fixtures/data-out`` writes every file in
docs/ARCHITECTURE.md §1.2 for 110 men's matches: the most recent matches
between four teams, so that the same players recur often enough for cohorts,
strengths and weaknesses to exist, plus a few matches chosen for their results
(a tie decided by a super over, an awarded Test, penalty runs). The counts per format are
what fits the fixture in 3 MB: a player file carries a full innings log and
up to 24 claims, so 60 matches of every format came to almost 5 MB. Everything is
real Cricsheet data, run through the same build as the full dataset;
``manifest.provenance.sources`` says it is a subset.

``winprob.json`` is the full model, fitted on every match, because a model
fitted on 60 matches would be useless to test against. The fixture also holds
``replays/1384439.wincurve.json``: ``[innings, ballIndex, p]`` after every
delivery of the 2023 World Cup final, from the model as reloaded from that
``winprob.json``, for the replay engine's end-to-end test.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from . import corpus as corpus_mod
from . import replay, winprob
from .build import archive_paths, build_dataset
from .config import FORMATS
from .sources.cricsheet import iter_raw

log = logging.getLogger(__name__)

TEAMS = frozenset({"India", "Australia", "England", "South Africa"})
#: Matches per format; Tests are the heaviest (four innings, long careers).
PER_FORMAT = {"test": 20, "odi": 40, "t20i": 50}
#: Always included, whatever else is selected.
REQUIRED = {
    "test": ["225258",                # England v Pakistan 2006: awarded
             "1389401"],              # England v India 2024: 5 penalty runs
    "odi": ["1384439", "1144530"],    # 2023 World Cup final; 2019 final (super over)
    "t20i": ["1415755"],              # 2024 T20 World Cup final
}
WINCURVE_MATCH = "1384439"


def _multi_wicket(raw: dict) -> bool:
    """A delivery with two wickets, which the replay ball tuple cannot hold."""
    return any(len(d.get("wickets") or []) > 1
               for inn in raw.get("innings", [])
               for over in inn.get("overs", [])
               for d in over.get("deliveries", []))


def select(archives: dict[str, Path] | None = None) -> dict[str, list[str]]:
    """The fixture's match ids per format."""
    chosen: dict[str, list[str]] = {}
    for fmt in FORMATS:
        required = REQUIRED.get(fmt, [])
        candidates = []
        for match_id, raw in iter_raw(fmt, gender="male", path=(archives or {}).get(fmt)):
            info = raw.get("info", {})
            if match_id in required or not set(info.get("teams", [])) <= TEAMS:
                continue
            if _multi_wicket(raw):
                continue
            candidates.append(((info.get("dates") or [""])[-1], match_id))
        candidates.sort(reverse=True)
        picked = required + [mid for _d, mid in candidates[:PER_FORMAT[fmt] - len(required)]]
        chosen[fmt] = sorted(picked)
    return chosen


def build_fixtures(out_dir: Path, archives: dict[str, Path] | None = None) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = archive_paths(FORMATS, archives)
    corpus = corpus_mod.scan(archives=paths)
    chosen = select(paths)
    ids = {mid for mids in chosen.values() for mid in mids}
    note = (f"Fixture subset: {', '.join(f'{len(v)} {k}' for k, v in chosen.items())} men's "
            f"matches between {', '.join(sorted(TEAMS))}, plus "
            f"{', '.join(m for ms in REQUIRED.values() for m in ms)}. "
            "winprob.json is fitted on every match.")
    summary = build_dataset(out_dir, archives=paths, only_ids=ids, corpus=corpus, sha="local",
                            extra_sources=[{"id": "fixture", "used": True, "note": note}])

    winprob.build(out_dir=out_dir, archives=paths, genders=("male",),
                  venue_key=corpus.venues.key)

    items = ((fmt, mid, raw) for fmt in FORMATS
             for mid, raw in iter_raw(fmt, gender="male", path=paths[fmt]) if mid in ids)
    replay.export_replays(items, out_dir=out_dir, venue_key=corpus.venues.key)

    models = json.loads((out_dir / "winprob.json").read_text())["formats"]
    model = winprob.model_from_json(models["odi-m"])
    for mid, raw in iter_raw("odi", gender="male", path=paths["odi"]):
        if mid == WINCURVE_MATCH:
            curve = replay.win_curve(replay.build_replay(raw, mid, "odi"), model)
            (out_dir / "replays" / f"{mid}.wincurve.json").write_text(
                json.dumps([list(row) for row in curve], separators=(",", ":")))
            break
    size = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file())
    log.info("fixtures: %s, %.2f MB in %s", summary, size / 1e6, out_dir)
    return {**summary, "bytes": size}
