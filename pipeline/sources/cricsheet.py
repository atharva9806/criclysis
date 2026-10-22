"""Cricsheet adapter.

Cricsheet publishes ball-by-ball data for essentially every men's and women's
international since the mid-2000s, plus the major franchise leagues, under
CC BY 4.0. It is the primary source for this project: aggregate scorecards
(Statsguru, ICC) can tell you a batter averages 48, but only ball-by-ball data
can tell you they average 21 against left-arm wrist spin in the middle overs,
which is the kind of statement this site exists to make.

Attribution requirement (CC BY 4.0): any deployment must credit Cricsheet. The
generated ``manifest.json`` carries that credit and the Method page renders it.
"""
from __future__ import annotations

import json
import logging
import zipfile
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path

from ..config import ALL_FORMATS, PHASES, RAW_DIR, SOURCES
from .. import net

log = logging.getLogger(__name__)

BASE = SOURCES["cricsheet"]["base"]

# Cricsheet filters automated traffic, which means a download can fail from a
# CI runner, a cloud VM or a corporate egress range while working fine from a
# laptop. Several projects therefore mirror the archives as GitHub Release
# assets. We try Cricsheet first - it is the source, and it is always current -
# and fall back to a mirror rather than failing the build outright.
#
# Mirrors carry the same CC BY 4.0 Cricsheet data; the attribution obligation is
# unchanged and travels with it.
MIRRORS = [
    {
        "name": "pitchnama data-mirror",
        "base": "https://github.com/himmatsgrewal/pitchnama/releases/download/data-mirror",
        "files": {
            "test": "test_male_json.zip",
            "odi": "odi_male_json.zip",
            "t20i": "t20i_male_json.zip",
            "ipl": "ipl_male_json.zip",
            "bbl": "bbl_male_json.zip",
            "psl": "psl_male_json.zip",
        },
    },
]


def mirror_urls(fmt: str) -> list[tuple[str, str]]:
    """(mirror name, url) for every mirror that carries this format."""
    out = []
    for mirror in MIRRORS:
        filename = mirror["files"].get(fmt)
        if filename:
            out.append((mirror["name"], f"{mirror['base']}/{filename}"))
    return out


# ---------------------------------------------------------------------------
# Normalised records
# ---------------------------------------------------------------------------
# Dismissals that are not credited to the bowler.
NON_BOWLER_DISMISSALS = {
    "run out", "retired hurt", "retired out", "retired not out",
    "obstructing the field", "handled the ball", "timed out",
}

# Cricsheet records these in ``wickets`` too, but the batter is not out:
# they neither count as a dismissal nor cost the batting side a wicket.
NOT_DISMISSALS = {"retired hurt", "retired not out"}


@dataclass(slots=True, frozen=True)
class Wicket:
    """One entry of a delivery's ``wickets`` list."""
    kind: str
    player_out: str
    player_out_id: str

    @property
    def is_dismissal(self) -> bool:
        return self.kind not in NOT_DISMISSALS

    @property
    def bowler_credited(self) -> bool:
        return self.kind not in NON_BOWLER_DISMISSALS


@dataclass(slots=True)
class Delivery:
    """One delivery, flattened into the shape every metric module consumes."""
    match_id: str
    fmt: str
    date: str
    season: str
    venue: str
    venue_key: str
    city: str
    country: str
    gender: str
    innings: int
    batting_team: str
    bowling_team: str
    over: int
    ball_in_over: int
    ball_no: int              # legal balls bowled in this innings before + 1
    batter: str
    non_striker: str
    bowler: str
    # Cricsheet person ids (info.registry). Names are only labels: two
    # different players can share one, so everything is keyed by these.
    batter_id: str
    non_striker_id: str
    bowler_id: str
    runs_batter: int
    runs_extras: int
    runs_total: int
    wides: int
    noballs: int
    byes: int
    legbyes: int
    is_legal: bool            # counts towards the over
    is_batter_ball: bool      # counts as a ball faced by the batter
    # Every wicket on the ball, in Cricsheet's order. Usually none or one,
    # but a ball can carry two (a catch and a timed out; a run out at each
    # end of a retirement).
    wickets: tuple[Wicket, ...]
    phase: str
    chasing: bool             # batting second in a limited-overs match, or
                              # fourth in a Test
    target: int | None        # limited overs only: Cricsheet has no Test targets
    score_before: int
    wickets_before: int

    @property
    def is_boundary_four(self) -> bool:
        return self.runs_batter == 4

    @property
    def is_boundary_six(self) -> bool:
        return self.runs_batter == 6

    @property
    def is_dot(self) -> bool:
        # A dot for the batter: no run off the bat and no run taken.
        return self.is_batter_ball and self.runs_batter == 0 and self.runs_total == 0

    @property
    def team_wickets(self) -> int:
        """Wickets the batting side lost on this ball."""
        return sum(1 for w in self.wickets if w.is_dismissal)

    @property
    def credited_wicket(self) -> Wicket | None:
        """The bowler's wicket on this ball, if any (there is at most one)."""
        return next((w for w in self.wickets if w.bowler_credited), None)

    def dismissal_of(self, person_id: str) -> Wicket | None:
        """The wicket that dismissed this person on this ball, if any."""
        return next((w for w in self.wickets
                     if w.player_out_id == person_id and w.is_dismissal), None)


@dataclass(slots=True)
class MatchInfo:
    match_id: str
    fmt: str
    date: str
    season: str
    venue: str
    venue_key: str
    city: str
    country: str
    gender: str
    teams: list[str]
    winner: str | None
    toss_winner: str | None
    toss_decision: str | None
    players: dict[str, list[str]] = field(default_factory=dict)
    registry: dict[str, str] = field(default_factory=dict)


def archive_path(fmt: str) -> Path:
    return RAW_DIR / "cricsheet" / ALL_FORMATS[fmt]["archive"]


def download_archive(fmt: str, *, use_cache: bool = True,
                     allow_mirror: bool = True) -> Path:
    """Fetch the bulk JSON archive for one format.

    Tries Cricsheet, then any configured mirror. Which source actually served
    the file is logged, because it belongs in the build's provenance.
    """
    spec = ALL_FORMATS[fmt]
    dest = archive_path(fmt)
    if use_cache and dest.exists() and dest.stat().st_size > 0:
        log.info("using cached %s", dest.name)
        return dest

    attempts: list[tuple[str, str]] = [
        ("cricsheet.org", f"{BASE}/downloads/{spec['archive']}")]
    if allow_mirror:
        attempts += mirror_urls(fmt)

    errors: list[str] = []
    for source, url in attempts:
        try:
            log.info("fetching %s from %s", fmt, source)
            path = net.download(url, dest, use_cache=False)
            log.info("  got %s (%.1f MB) from %s", dest.name,
                     path.stat().st_size / 1e6, source)
            return path
        except (net.Blocked, net.FetchError) as exc:
            log.warning("  %s did not serve %s: %s", source, fmt, exc)
            errors.append(f"{source}: {exc}")

    raise net.FetchError(
        f"could not download the {fmt} archive from any source.\n  "
        + "\n  ".join(errors))


def phase_for(fmt: str, over: int) -> str:
    for key, start, end, _label in PHASES.get(fmt, PHASES["odi"]):
        if start <= over < end:
            return key
    return PHASES.get(fmt, PHASES["odi"])[-1][0]


def parse_match(raw: dict, match_id: str, fmt: str,
                venue_key: str | None = None) -> tuple[MatchInfo, list[Delivery]]:
    """Turn one Cricsheet match document into a MatchInfo plus flat deliveries.

    ``venue_key`` is the ground's VenueKey (see :mod:`pipeline.venues`), which
    needs the whole corpus to compute; without it the plain ground name is used.
    """
    from ..venues import canonical_venue, country_for

    info = raw.get("info", {})
    dates = info.get("dates") or [""]
    venue = info.get("venue", "")
    city = info.get("city", "")
    teams = info.get("teams", [])
    outcome = info.get("outcome", {})
    country = country_for(venue, city)
    if venue_key is None:
        venue_key = canonical_venue(venue)

    match = MatchInfo(
        match_id=match_id,
        fmt=fmt,
        date=dates[0],
        season=str(info.get("season", "")),
        venue=venue,
        venue_key=venue_key,
        city=city,
        country=country,
        gender=info.get("gender", "male"),
        teams=list(teams),
        winner=outcome.get("winner"),
        toss_winner=(info.get("toss") or {}).get("winner"),
        toss_decision=(info.get("toss") or {}).get("decision"),
        players=info.get("players", {}) or {},
        registry=((info.get("registry") or {}).get("people") or {}),
    )

    def person_id(name: str) -> str:
        """The player's Cricsheet id. Every name in a Cricsheet file is in its
        registry; should one ever be missing, the name stands in, marked with
        a '~' so it can never collide with a real id."""
        if not name:
            return ""
        return match.registry.get(name) or f"~{name}"

    deliveries: list[Delivery] = []
    innings_seen = 0
    for idx, inn in enumerate(raw.get("innings", [])):
        if inn.get("super_over"):
            continue
        innings_seen += 1
        batting_team = inn.get("team", "")
        bowling_team = next((t for t in teams if t != batting_team), "")
        target = (inn.get("target") or {}).get("runs")
        # Limited overs: the second innings carries its target. Cricsheet gives
        # Tests no target, but the fourth innings is the only chase there is.
        chasing = innings_seen == 4 if fmt == "test" else target is not None
        ball_no = 0
        score = 0
        wickets = 0

        for over_block in inn.get("overs", []):
            over = int(over_block.get("over", 0))
            for pos, d in enumerate(over_block.get("deliveries", [])):
                runs = d.get("runs", {})
                extras = d.get("extras", {}) or {}
                wides = int(extras.get("wides", 0))
                noballs = int(extras.get("noballs", 0))
                byes = int(extras.get("byes", 0))
                legbyes = int(extras.get("legbyes", 0))
                is_legal = wides == 0 and noballs == 0
                # A wide is not a ball faced; a no-ball is.
                is_batter_ball = wides == 0

                if is_legal:
                    ball_no += 1

                wickets_here = tuple(
                    Wicket(kind=w.get("kind", ""), player_out=w.get("player_out", ""),
                           player_out_id=person_id(w.get("player_out", "")))
                    for w in d.get("wickets") or [])

                deliveries.append(Delivery(
                    match_id=match_id,
                    fmt=fmt,
                    date=match.date,
                    season=match.season,
                    venue=venue,
                    venue_key=venue_key,
                    city=city,
                    country=country,
                    gender=match.gender,
                    innings=idx + 1,
                    batting_team=batting_team,
                    bowling_team=bowling_team,
                    over=over,
                    ball_in_over=pos + 1,
                    ball_no=ball_no,
                    batter=d.get("batter", ""),
                    non_striker=d.get("non_striker", ""),
                    bowler=d.get("bowler", ""),
                    batter_id=person_id(d.get("batter", "")),
                    non_striker_id=person_id(d.get("non_striker", "")),
                    bowler_id=person_id(d.get("bowler", "")),
                    runs_batter=int(runs.get("batter", 0)),
                    runs_extras=int(runs.get("extras", 0)),
                    runs_total=int(runs.get("total", 0)),
                    wides=wides,
                    noballs=noballs,
                    byes=byes,
                    legbyes=legbyes,
                    is_legal=is_legal,
                    is_batter_ball=is_batter_ball,
                    wickets=wickets_here,
                    phase=phase_for(fmt, over),
                    chasing=chasing,
                    target=target,
                    score_before=score,
                    wickets_before=wickets,
                ))
                score += int(runs.get("total", 0))
                wickets += sum(1 for w in wickets_here if w.is_dismissal)

    return match, deliveries


def _gender_filter(gender: str | Iterable[str] | None) -> frozenset[str] | None:
    if gender is None:
        return None
    if isinstance(gender, str):
        return frozenset([gender])
    return frozenset(gender)


def iter_raw(fmt: str, *, limit: int | None = None,
             gender: str | Iterable[str] | None = "male",
             path: Path | None = None) -> Iterator[tuple[str, dict]]:
    """Stream (match id, Cricsheet document) for every match in an archive.

    Files are read in sorted order so that every pass over an archive, and
    therefore every build, sees the matches in the same order. ``gender`` is
    one gender, several, or None for all; ``limit`` counts matches after the
    gender filter.
    """
    archive = path or archive_path(fmt)
    if not archive.exists():
        raise FileNotFoundError(
            f"{archive} not found - run `python -m pipeline fetch --formats {fmt}` first"
        )
    genders = _gender_filter(gender)
    count = 0
    with zipfile.ZipFile(archive) as zf:
        names = sorted(n for n in zf.namelist() if n.endswith(".json") and "README" not in n)
        for name in names:
            if limit is not None and count >= limit:
                return
            try:
                raw = json.loads(zf.read(name))
            except (json.JSONDecodeError, KeyError) as exc:
                log.warning("skipping unreadable %s: %s", name, exc)
                continue
            if genders is not None and raw.get("info", {}).get("gender") not in genders:
                continue
            count += 1
            yield Path(name).stem, raw


def iter_matches(fmt: str, *, limit: int | None = None,
                 gender: str | Iterable[str] | None = "male",
                 path: Path | None = None,
                 venue_key=None) -> Iterator[tuple[MatchInfo, list[Delivery]]]:
    """Stream every match in a format's archive, parsed.

    Yields one match at a time so that a full pass over ~20k matches never needs
    more than one match in memory. ``venue_key`` maps (venue, city) to a
    VenueKey.
    """
    for match_id, raw in iter_raw(fmt, limit=limit, gender=gender, path=path):
        info = raw.get("info", {})
        key = venue_key(info.get("venue", ""), info.get("city", "")) if venue_key else None
        try:
            yield parse_match(raw, match_id, fmt, venue_key=key)
        except Exception as exc:  # noqa: BLE001 - one bad file must not kill a run
            log.warning("skipping %s: %s", match_id, exc)
            continue
