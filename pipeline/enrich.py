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

Players are identified by Cricsheet person id. A row with a ``cricsheet_id``
applies to that person. A row without one applies by name, and only when the
name belongs to exactly one person in the corpus: two different players called
"Rashid Khan" must not both inherit one Rashid Khan's leg spin. Rows for such
ambiguous names are skipped and counted.
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
    """Read a styles CSV, keyed on the Cricsheet player name.

    A row with a ``cricsheet_id`` is keyed on that id instead, so two rows for
    two different people of the same name both survive.
    """
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
            out[(row.get("cricsheet_id") or "").strip() or name] = {
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


#: Metadata fields copied from a styles row onto a player.
FIELDS = ("bowlingType", "battingHand", "role", "country", "cricinfoId", "fullName")


def resolve(corpus, *, extra_file: Path | None = None) -> tuple[dict[str, dict], dict]:
    """person id -> metadata for every player in ``corpus`` that has any.

    Layers are applied in rising precedence (generated, ``extra_file``,
    curated); within a layer a row keyed by id beats a row keyed by name. The
    winning row supplies all of a player's metadata.
    """
    layers = [load_csv(GENERATED)]
    if extra_file:
        layers.append(load_csv(extra_file))
    layers.append(load_csv(CURATED))
    # (rows pinned to a person id, rows keyed by name only) per layer
    indexed = [({r["cricsheetId"]: r for r in layer.values() if r["cricsheetId"]},
                {n: r for n, r in layer.items() if not r["cricsheetId"]})
               for layer in layers]

    resolved: dict[str, dict] = {}
    via_id: set[str] = set()
    skipped: set[str] = set()
    for pid, names in corpus.id_names.items():
        for pinned, named in indexed:
            record = pinned.get(pid)
            if record is not None:
                via_id.add(pid)
            else:
                for name in sorted(n for n in names if n in named):
                    if len(corpus.name_ids.get(name, ())) > 1:
                        skipped.add(pid)
                        continue
                    record = named[name]
                    via_id.discard(pid)
                    break
            if record is not None:
                resolved[pid] = {k: record.get(k, "") for k in FIELDS}

    stats = {
        "players": len(corpus.id_names),
        "resolvedById": len(via_id),
        "resolvedByName": len(resolved) - len(via_id),
        "withStyle": sum(1 for r in resolved.values() if r.get("bowlingType")),
        "withHand": sum(1 for r in resolved.values() if r.get("battingHand")),
        "skippedAmbiguous": len(skipped - set(resolved)),
    }
    return resolved, stats


def split_maps(records: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """Convenience: (key -> bowling type, key -> batting hand)."""
    styles = {n: r["bowlingType"] for n, r in records.items() if r.get("bowlingType")}
    hands = {n: r["battingHand"] for n, r in records.items() if r.get("battingHand")}
    return styles, hands
