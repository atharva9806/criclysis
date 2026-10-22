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

Nothing is fetched here. Whatever is still unresolved simply stays blank:
those deliveries drop out of the bowling-type splits and are reported in the
build summary, rather than being guessed at.

How a row finds its player
--------------------------
Players are Cricsheet person ids, and attaching one person's metadata to
another is worse than attaching none. So a row applies to a player:

* **by id** when the row carries a ``cricsheet_id``, or when its
  ``cricinfo_id`` maps to a Cricsheet id through Cricsheet's people register
  (``register/people.csv``, used when it has been downloaded);
* **by name** only when all three hold: the name belongs to exactly one
  person in the corpus (both genders), the name is on exactly one row of the
  file, and the row's country is a team the person played for.

Otherwise the player gets no metadata. Name matches that fail a rule are
counted as rejected, by reason. Without the register, the women's corpus or
the country check, a men's "SR Taylor" (USA) took the West Indies women's
Stafanie Taylor's name and off spin.
"""
from __future__ import annotations

import csv
import logging
from collections import Counter, defaultdict
from pathlib import Path

from .config import ROOT
from .styles import normalise_batting_style, normalise_bowling_style

log = logging.getLogger(__name__)

CURATED = ROOT / "data" / "styles.csv"
# Generated from a published player-metadata table (see sources/playermeta.py).
# Read before the curated file so hand-checked corrections still win.
GENERATED = ROOT / "data" / "player_styles.csv"

#: Metadata fields copied from a styles row onto a player.
FIELDS = ("bowlingType", "battingHand", "role", "country", "cricinfoId", "fullName")

#: Countries in the metadata that a Cricsheet team stands for, where the
#: names differ. Any other country must equal a team name.
_WEST_INDIES = ("Antigua and Barbuda", "Barbados", "Dominica", "Grenada", "Guyana",
                "Jamaica", "St Kitts and Nevis", "Saint Kitts and Nevis", "St Lucia",
                "Saint Lucia", "St Vincent and the Grenadines",
                "Saint Vincent and the Grenadines", "Trinidad and Tobago", "Trinidad & Tobago")
COUNTRY_TEAMS: dict[str, frozenset[str]] = {
    **{nation: frozenset({"West Indies"}) for nation in _WEST_INDIES},
    "Wales": frozenset({"England"}),
    "Northern Ireland": frozenset({"Ireland"}),
    "UAE": frozenset({"United Arab Emirates"}),
    "U.A.E.": frozenset({"United Arab Emirates"}),
    "USA": frozenset({"United States of America"}),
    "U.S.A.": frozenset({"United States of America"}),
    "United States": frozenset({"United States of America"}),
}


def country_matches(country: str, teams: set[str]) -> bool:
    """Is a metadata ``country`` one of the teams a player played for?"""
    country = (country or "").strip()
    if not country:
        return False
    return bool(COUNTRY_TEAMS.get(country, frozenset({country})) & teams)


def load_rows(path: Path) -> list[dict]:
    """Every row of a styles CSV, in file order (duplicates kept)."""
    if not path.exists():
        return []
    out: list[dict] = []
    with path.open(newline="", encoding="utf-8") as fh:
        # Strip the explanatory header. csv.DictReader would otherwise take the
        # first comment line as the field names and silently read nothing.
        rows = (line for line in fh if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            out.append({
                "name": name,
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
            })
    return out


def load_csv(path: Path) -> dict[str, dict]:
    """A styles CSV keyed on the player name (for inspecting a file; the
    build uses :func:`resolve`, which keeps rows that share a name apart)."""
    return {row["name"]: row for row in load_rows(path)}


def resolve(corpus, *, extra_file: Path | None = None,
            register: dict[str, str] | None = None) -> tuple[dict[str, dict], dict]:
    """person id -> metadata for every player in ``corpus`` that has any.

    ``register`` maps ESPNcricinfo ids to Cricsheet ids (Cricsheet's people
    register); without it, rows can only match by name. Layers apply in
    rising precedence (generated, ``extra_file``, curated), and within a
    layer an id match beats a name match.
    """
    register = register or {}
    layers = [load_rows(GENERATED)]
    if extra_file:
        layers.append(load_rows(extra_file))
    layers.append(load_rows(CURATED))

    resolved: dict[str, dict] = {}
    how: dict[str, str] = {}
    rejected: dict[str, set[str]] = defaultdict(set)
    for rows in layers:
        pinned: dict[str, dict] = {}
        named: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            pid = row["cricsheetId"] or register.get(row["cricinfoId"], "")
            if pid:
                pinned.setdefault(pid, row)
            else:
                named[row["name"]].append(row)
        rows_per_name = Counter(row["name"] for row in rows)

        for pid, names in corpus.id_names.items():
            record, via = pinned.get(pid), "id"
            if record is None:
                via = "name"
                for name in sorted(names):
                    if name not in named:
                        continue
                    if len(corpus.name_ids.get(name, ())) > 1:
                        rejected[pid].add("ambiguousName")
                    elif rows_per_name[name] > 1:
                        rejected[pid].add("duplicateRows")
                    elif not country_matches(named[name][0]["country"],
                                             corpus.id_teams.get(pid, set())):
                        rejected[pid].add("countryMismatch")
                    else:
                        record = named[name][0]
                        break
            if record is not None:
                resolved[pid] = {k: record.get(k, "") for k in FIELDS}
                how[pid] = via

    unresolved = {pid: reasons for pid, reasons in rejected.items() if pid not in resolved}
    stats = {
        "players": len(corpus.id_names),
        "register": bool(register),
        "resolvedById": sum(1 for v in how.values() if v == "id"),
        "resolvedByName": sum(1 for v in how.values() if v == "name"),
        "rejected": len(unresolved),
        "rejectedAmbiguousName": sum(1 for r in unresolved.values() if "ambiguousName" in r),
        "rejectedDuplicateRows": sum(1 for r in unresolved.values() if "duplicateRows" in r),
        "rejectedCountryMismatch": sum(1 for r in unresolved.values() if "countryMismatch" in r),
        "withStyle": sum(1 for r in resolved.values() if r.get("bowlingType")),
        "withHand": sum(1 for r in resolved.values() if r.get("battingHand")),
    }
    return resolved, stats


def split_maps(records: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """Convenience: (key -> bowling type, key -> batting hand)."""
    styles = {n: r["bowlingType"] for n, r in records.items() if r.get("bowlingType")}
    hands = {n: r["battingHand"] for n, r in records.items() if r.get("battingHand")}
    return styles, hands
