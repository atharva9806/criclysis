"""Resolve bowling styles and batting hands for the players in the corpus.

Cricsheet ball-by-ball data names the bowler but never says what kind of bowler
they are, and that single attribute is the hinge the whole matchup analysis
turns on. This module fills it in from local files only, in rising order of
precedence:

1. ``data/player_styles.csv`` - generated from a published player-metadata
   table (see ``sources/playermeta.py``).
2. ``--styles-file`` - your own CSV (a licensed feed, a club database).
3. ``data/styles.csv`` - a curated file and the place to put corrections. It
   is authoritative: nothing overwrites it.

Nothing is fetched. Whatever is still unresolved simply stays blank: those
deliveries drop out of the bowling-type splits and are reported in the build
summary, rather than being guessed at.
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path

from .config import ROOT
from .styles import normalise_batting_style, normalise_bowling_style

log = logging.getLogger(__name__)

CURATED = ROOT / "data" / "styles.csv"
# Generated from a published player-metadata table (see sources/playermeta.py).
# Read before the curated file so hand-checked corrections still win.
GENERATED = ROOT / "data" / "player_styles.csv"


def load_csv(path: Path) -> dict[str, dict]:
    """Read a styles CSV keyed on the Cricsheet player name."""
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        # Strip the explanatory header. csv.DictReader would otherwise take the
        # first comment line as the field names and silently read nothing.
        rows = (line for line in fh if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            out[name] = {
                "bowlingType": normalise_bowling_style(row.get("bowling_type", ""))
                               or (row.get("bowling_type") or "").strip(),
                "battingHand": normalise_batting_style(row.get("batting_hand", ""))
                               or (row.get("batting_hand") or "").strip(),
                "fullName": (row.get("full_name") or "").strip(),
                "role": (row.get("role") or "").strip(),
                "country": (row.get("country") or "").strip(),
                "cricinfoId": (row.get("cricinfo_id") or "").strip(),
                "cricsheetId": (row.get("cricsheet_id") or "").strip(),
                "source": (row.get("source") or path.name).strip(),
            }
    return out


def resolve(names: set[str], *, extra_file: Path | None = None) -> tuple[dict[str, dict], dict]:
    """Build a name -> attributes map covering as many of ``names`` as possible."""
    records: dict[str, dict] = {}
    records.update(load_csv(GENERATED))
    if extra_file:
        records.update(load_csv(extra_file))
    # The curated file wins over everything, so a hand-checked correction is
    # never silently undone.
    records.update(load_csv(CURATED))

    resolved = {n: records[n] for n in names if n in records}
    stats = {
        "requested": len(names),
        "resolved": len(resolved),
        "unresolved": sum(1 for n in names if not resolved.get(n, {}).get("bowlingType")),
    }
    return resolved, stats


def split_maps(records: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """Convenience: (key -> bowling type, key -> batting hand)."""
    styles = {n: r["bowlingType"] for n, r in records.items() if r.get("bowlingType")}
    hands = {n: r["battingHand"] for n, r in records.items() if r.get("battingHand")}
    return styles, hands
