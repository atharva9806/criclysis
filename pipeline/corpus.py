"""One cheap pass over every archive, for facts that need the whole corpus.

Two things cannot be decided match by match:

* whether a ground's name needs its city appended to make a VenueKey, which
  depends on every city the name occurs in (:class:`venues.VenueIndex`);
* whether a player's name is unique, which decides whether name-keyed
  metadata can be trusted for them (:mod:`pipeline.identity`).

Every command scans all three international archives and both genders,
whatever it is about to build, so that build, winprob and replays agree on
every key.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .config import FORMATS
from .sources.cricsheet import archive_path, iter_raw
from .venues import VenueIndex

log = logging.getLogger(__name__)


@dataclass
class Corpus:
    venues: VenueIndex = field(default_factory=VenueIndex)
    #: match id -> format; a match id must be unique across archives
    match_format: dict[str, str] = field(default_factory=dict)
    #: player name -> every Cricsheet person id it is used for
    name_ids: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    #: person id -> (date, name) of their most recent match
    id_name: dict[str, tuple[str, str]] = field(default_factory=dict)
    #: person id -> genders they appear under (one, unless the data is wrong)
    id_genders: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))

    def add(self, fmt: str, match_id: str, raw: dict) -> None:
        if match_id in self.match_format:
            raise ValueError(
                f"match id {match_id} is in both the {self.match_format[match_id]} "
                f"and the {fmt} archive; Cricsheet ids are assumed unique")
        self.match_format[match_id] = fmt
        info = raw.get("info", {})
        self.venues.add(info.get("venue", ""), info.get("city"))

        registry = (info.get("registry") or {}).get("people") or {}
        date = (info.get("dates") or [""])[-1]
        gender = info.get("gender", "male")
        # Players only: the registry also lists umpires and referees, who
        # never bat or bowl, so a name shared with an official is no risk.
        names = {n for squad in (info.get("players") or {}).values() for n in squad}
        for inn in raw.get("innings", []):
            for over in inn.get("overs", []):
                for d in over.get("deliveries", []):
                    names.update((d.get("batter"), d.get("bowler"), d.get("non_striker")))
        for name in names:
            pid = registry.get(name or "")
            if not pid:
                continue
            self.name_ids[name].add(pid)
            self.id_genders[pid].add(gender)
            if pid not in self.id_name or date >= self.id_name[pid][0]:
                self.id_name[pid] = (date, name)

    def ambiguous_names(self) -> dict[str, set[str]]:
        """Names used for more than one person."""
        return {n: ids for n, ids in self.name_ids.items() if len(ids) > 1}

    def name_of(self, person_id: str) -> str:
        return self.id_name.get(person_id, ("", ""))[1]


def scan(formats=tuple(FORMATS), archives: dict[str, Path] | None = None) -> Corpus:
    """Scan every available archive (both genders) into a :class:`Corpus`."""
    corpus = Corpus()
    for fmt in formats:
        path = (archives or {}).get(fmt) or archive_path(fmt)
        if not path.exists():
            log.warning("%s missing; its grounds and players are not in the corpus", path)
            continue
        for match_id, raw in iter_raw(fmt, gender=None, path=path):
            corpus.add(fmt, match_id, raw)
    log.info("corpus: %d matches, %d players, %d ambiguous names",
             len(corpus.match_format), len(corpus.id_name), len(corpus.ambiguous_names()))
    return corpus
