"""Ball-by-ball replays of real matches.

The live page needs something real to show when no match is being played, so
instead of inventing matches it replays historical ones from Cricsheet, ball by
ball, with the same win-probability and matchup analysis a live match gets.

Each replay is a compact JSON file:

    {
      "id": "1384439", "format": "odi", "title": "India v Australia",
      "event": "ICC Cricket World Cup", "stage": "Final", "date": "2023-11-19",
      "venue": "...", "result": "Australia won by 6 wickets",
      "teams": ["India", "Australia"],
      "people": [{"id": "ba607b88", "name": "V Kohli", "team": "India"}, ...],
      "innings": [
        {"team": "India", "target": null,
         "balls": [[over, batter, bowler, nonStriker, runsBat, extras, extraType,
                    wicketKind, playerOut], ...]}
      ]
    }

Player fields are indexes into ``people``; ``id`` is the Cricsheet person id,
which is also the player id in the analytics dataset, so a replay links
straight to player profiles.

A ball has two optional trailing elements (docs/ARCHITECTURE.md §1.9),
written only when the first nine cannot describe the delivery, so most balls
stay nine long:

* ``[9]`` extras by kind: Cricsheet's ``extras`` object, when it has more than
  one kind, any penalty, or a value other than ``runs.extras``
  (``{"noballs": 1, "byes": 4}``); ``null`` when only ``[10]`` is needed;
* ``[10]`` every wicket after the first: ``[[kind, playerOut], ...]``.

:func:`ball_extras` and :func:`ball_wickets` read every ball, old or new.

Files are written as ``replays/<matchId>.json.gz``: gzip of the compact JSON,
with the gzip timestamp fixed so that identical input gives identical bytes.
"""
from __future__ import annotations

import gzip
import json
import logging
import re
import zlib
from collections import defaultdict
from pathlib import Path

from .config import SCHEMA_VERSION, WEB_DATA_DIR, format_key
from .ids import team_id
from .matches import result_text
from .sources.cricsheet import NON_BOWLER_DISMISSALS, NOT_DISMISSALS, iter_raw
from .venues import canonical_venue

log = logging.getLogger(__name__)

#: Curated finals: (format, Cricsheet match id).
FEATURED = [
    ("odi", "1384439"),   # 2023 World Cup final, Australia v India
    ("odi", "1144530"),   # 2019 World Cup final, England v New Zealand (tied)
    ("odi", "433606"),    # 2011 World Cup final, India v Sri Lanka
    ("odi", "656495"),    # 2015 World Cup final, Australia v New Zealand
    ("t20i", "1415755"),  # 2024 T20 World Cup final, India v South Africa
    ("t20i", "1298179"),  # 2022 T20 World Cup final, England v Pakistan
    ("t20i", "1273756"),  # 2021 T20 World Cup final, Australia v New Zealand
    ("t20i", "951373"),   # 2016 World T20 final, West Indies v England
    ("t20i", "287879"),   # 2007 World T20 final, India v Pakistan
]

#: After the curated list, every final of these events is featured too, newest
#: first, so new finals (men's or women's) appear without a code change.
FEATURED_EVENTS = re.compile(r"World Cup|World T20|T20 World Cup|Champions Trophy")
#: ...except the finals of qualifying and regional events, and the Asia
#: Pacific Cricket Champions Trophy, which the names above also match.
NOT_FEATURED_EVENTS = re.compile(r"Qualifier|Region|Asia Pacific")

EXTRA_KEYS = ("wides", "noballs", "byes", "legbyes", "penalty")
#: The extras a bowler is charged with (with the runs off the bat).
BOWLER_EXTRAS = ("wides", "noballs")


def encode_ball(over: int, batter, bowler, non_striker, runs: dict, extras: dict,
                wickets: list) -> list:
    """One delivery as a replay ball.

    ``runs`` and ``extras`` are the delivery's Cricsheet objects; ``wickets``
    holds a (kind, player-out index) pair for each of its wickets, in order.
    The first nine elements mean what they always have; ``[9]`` and ``[10]``
    are appended only when they are needed (see the module docstring).
    """
    runs_extras = runs.get("extras", 0)
    kinds = [k for k in EXTRA_KEYS if k in extras]
    first = wickets[0] if wickets else (None, None)
    ball = [over, batter, bowler, non_striker, runs.get("batter", 0), runs_extras,
            kinds[0] if kinds else None, first[0], first[1]]
    by_kind = None
    if len(kinds) > 1 or "penalty" in extras or (kinds and extras[kinds[0]] != runs_extras):
        by_kind = {k: int(extras[k]) for k in kinds}
    if len(wickets) > 1:
        ball += [by_kind, [list(w) for w in wickets[1:]]]
    elif by_kind is not None:
        ball.append(by_kind)
    return ball


def ball_extras(ball) -> dict[str, int]:
    """Runs of each extra kind on a replay ball, with every kind as a key.

    A nine-element ball has at most one kind, ``ball[6]``, which carries all
    of ``ball[5]``; a longer one may break the extras down in ``ball[9]``.
    """
    out = dict.fromkeys(EXTRA_KEYS, 0)
    by_kind = ball[9] if len(ball) > 9 else None
    if by_kind is not None:
        for kind, runs in by_kind.items():
            out[kind] += runs
    elif ball[6]:
        out[ball[6]] += ball[5]
    return out


def ball_wickets(ball) -> list[tuple[str, int | None]]:
    """Every (kind, player-out index) on a replay ball, in Cricsheet's order."""
    out = [(ball[7], ball[8])] if ball[7] else []
    if len(ball) > 10:
        out += [(kind, who) for kind, who in ball[10]]
    return out


def team_wickets(ball) -> int:
    """Wickets the batting side lost on a replay ball. Retiring hurt or not
    out never costs one, whichever position it is recorded in."""
    return sum(1 for kind, _who in ball_wickets(ball) if kind not in NOT_DISMISSALS)


def build_replay(raw: dict, match_id: str, fmt: str, *, venue_key: str | None = None,
                 styles: dict[str, str] | None = None,
                 hands: dict[str, str] | None = None) -> dict:
    """The replay document for one match.

    ``styles`` and ``hands`` map person ids to bowling type and batting hand;
    a player's ``bt``/``bh`` is left out when it is not known.
    """
    info = raw.get("info", {})
    registry = (info.get("registry") or {}).get("people") or {}
    teams = list(info.get("teams", []))
    styles = styles or {}
    hands = hands or {}

    people: list[dict] = []
    index: dict[str, int] = {}

    def person(name: str | None, team: str) -> int | None:
        if not name:
            return None
        if name not in index:
            index[name] = len(people)
            pid = registry.get(name, "")
            entry = {"id": pid, "name": name, "team": team}
            if styles.get(pid):
                entry["bt"] = styles[pid]
            if hands.get(pid) in ("right", "left"):
                entry["bh"] = hands[pid]
            people.append(entry)
        return index[name]

    # Seed people in batting order per team so squads read naturally.
    for team, names in (info.get("players") or {}).items():
        for n in names:
            person(n, team)

    innings_out = []
    for inn in raw.get("innings", []):
        if inn.get("super_over"):
            continue
        bat_team = inn.get("team", "")
        bowl_team = next((t for t in teams if t != bat_team), "")
        balls = []
        for over in inn.get("overs", []):
            for d in over.get("deliveries", []):
                # People are numbered in order of appearance, so the batters
                # and bowler are looked up before anyone dismissed.
                batter = person(d.get("batter"), bat_team)
                bowler = person(d.get("bowler"), bowl_team)
                non_striker = person(d.get("non_striker"), bat_team)
                wickets = [(w.get("kind"), person(w.get("player_out"), bat_team))
                           for w in d.get("wickets") or []]
                balls.append(encode_ball(over.get("over", 0), batter, bowler, non_striker,
                                         d.get("runs") or {}, d.get("extras") or {}, wickets))
        target = inn.get("target") or {}
        penalty = inn.get("penalty_runs") or {}
        innings_out.append({
            "team": bat_team,
            "target": target.get("runs"),
            "targetOvers": target.get("overs"),
            "penaltyRuns": {"pre": int(penalty.get("pre", 0)), "post": int(penalty.get("post", 0))},
            "balls": balls,
        })

    event = info.get("event") or {}
    title = " v ".join(innings.get("team", "") for innings in innings_out[:2]) or " v ".join(teams)
    gender = info.get("gender", "male")
    toss = info.get("toss") or {}
    outcome = info.get("outcome") or {}
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": match_id,
        "format": fmt,
        "formatKey": format_key(fmt, gender),
        "gender": gender,
        "title": title,
        "event": event.get("name", ""),
        "stage": event.get("stage") or (f"Match {event['match_number']}" if event.get("match_number") else ""),
        "date": (info.get("dates") or [""])[0],
        "venue": info.get("venue", ""),
        "venueKey": venue_key if venue_key is not None else canonical_venue(info.get("venue", "")),
        "city": info.get("city", ""),
        "teams": teams,
        "toss": {k: toss[k] for k in ("winner", "decision") if k in toss},
        "result": result_text(info),
        "winner": outcome.get("winner"),
        "scheduledOvers": info.get("overs"),
        "method": outcome.get("method"),
        "people": people,
        "innings": innings_out,
        "credit": "Ball-by-ball data from Cricsheet (cricsheet.org), CC BY 4.0",
    }


INDEX_FIELDS = ("id", "format", "formatKey", "gender", "title", "event", "stage",
                "date", "venue", "result")


def is_featured_final(event: dict | None) -> bool:
    event = event or {}
    name = event.get("name") or ""
    return (event.get("stage") == "Final" and bool(FEATURED_EVENTS.search(name))
            and not NOT_FEATURED_EVENTS.search(name))


def featured_ranks(matches) -> dict[str, int]:
    """Rank (1 = first) of every featured match among ``matches``.

    ``matches`` holds (match id, start date, event) for every match in the
    build. Featured matches are the curated list, in its order, followed by
    every final of the events in :data:`FEATURED_EVENTS`, newest first.
    """
    matches = list(matches)
    present = {mid for mid, _date, _event in matches}
    curated = [mid for _fmt, mid in FEATURED if mid in present]
    finals = sorted(((date, mid) for mid, date, event in matches
                     if mid not in curated and is_featured_final(event)), reverse=True)
    return {mid: i + 1 for i, mid in enumerate(curated + [mid for _d, mid in finals])}


def write_replay(out_dir: Path, replay: dict) -> int:
    """Write one replay as gzip; returns the compressed size."""
    data = json.dumps(replay, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    blob = gzip.compress(data, compresslevel=9, mtime=0)
    (out_dir / f"{replay['id']}.json.gz").write_bytes(blob)
    return len(blob)


def export_replays(items, out_dir: Path | None = None, *, venue_key=None,
                   styles: dict | None = None, hands: dict | None = None) -> list[dict]:
    """Write a replay for every (format, match id, document) in ``items``,
    plus ``replays/index.json`` listing the featured ones in rank order.

    ``venue_key`` maps (venue, city) to a VenueKey; ``styles`` and ``hands``
    map person ids to bowling type and batting hand.
    """
    out_dir = (out_dir or WEB_DATA_DIR) / "replays"
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.json.gz"):
        stale.unlink()

    rows: dict[str, dict] = {}
    events: list[tuple[str, str, dict]] = []
    total = 0
    for fmt, match_id, raw in items:
        info = raw.get("info", {})
        key = venue_key(info.get("venue", ""), info.get("city")) if venue_key else None
        replay = build_replay(raw, match_id, fmt, venue_key=key, styles=styles, hands=hands)
        total += write_replay(out_dir, replay)
        rows[match_id] = {k: replay[k] for k in INDEX_FIELDS}
        events.append((match_id, replay["date"], info.get("event") or {}))
    ranks = featured_ranks(events)
    index = [rows[mid] for mid in sorted(ranks, key=ranks.get)]
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":"),
                                                   ensure_ascii=False))
    log.info("wrote %d replays (%.1f MB gzipped), %d featured, to %s",
             len(rows), total / 1e6, len(index), out_dir)
    return index


def replay_items(formats, genders, *, all_matches: bool = False, archives=None):
    """(format, match id, document) for every match to replay: all of them
    with ``all_matches``, otherwise only the candidates for featuring."""
    curated = {mid for _fmt, mid in FEATURED}
    for fmt in formats:
        path = (archives or {}).get(fmt)
        for match_id, raw in iter_raw(fmt, gender=genders, path=path):
            if all_matches or match_id in curated or \
                    is_featured_final(raw.get("info", {}).get("event")):
                yield fmt, match_id, raw


def replay_states(replay: dict, max_balls: int):
    """Yield (innings_no, balls_left, wickets, runs, target, ball_index) after
    every delivery, mirroring what a live feed would report.

    Penalty runs awarded before the innings (``penaltyRuns.pre``) are on the
    board from its first ball, as the replay engine counts them. Every wicket
    on a ball counts, except retirements hurt or not out.
    """
    for n, inn in enumerate(replay["innings"][:2], start=1):
        legal = wickets = 0
        runs = (inn.get("penaltyRuns") or {}).get("pre", 0)
        target = inn.get("target")
        for i, b in enumerate(inn["balls"]):
            runs += b[4] + b[5]
            wickets += team_wickets(b)
            if b[6] not in ("wides", "noballs"):
                legal += 1
            yield n, max_balls - legal, wickets, runs, target, i


def win_curve(replay: dict, model) -> list[tuple[int, int, float]]:
    """P(side batting first wins) after every delivery: (innings, index, p)."""
    out = []
    for n, u, w, r, target, i in replay_states(replay, model.max_balls):
        if n == 1:
            p = model.batting_first(u, w, r)
        else:
            p = 1 - model.chase(u, w, (target or 0) - r)
        out.append((n, i, p))
    return out


# ---------------------------------------------------------------------------
# Checking replays against the rest of a build
# ---------------------------------------------------------------------------
def bowling_figures(replay: dict) -> list[tuple[int, str, int, list[int]]]:
    """(innings index, bowling team, bowler index, [balls, runs, wickets,
    maidens]) for every bowler in every innings of a replay.

    The figures are counted as aggregate.py counts them: legal balls; runs off
    the bat plus wides and no-balls, never byes, leg byes or penalty runs; one
    wicket for a ball with any dismissal credited to the bowler; and a maiden
    for each over in which the bowler bowled six legal balls and conceded
    nothing.
    """
    out = []
    teams = replay.get("teams") or []
    for n, inn in enumerate(replay["innings"]):
        bowling_team = next((t for t in teams if t != inn["team"]), "")
        figures: dict[int, list[int]] = {}
        overs: dict[tuple[int, int], list[int]] = {}
        for b in inn["balls"]:
            extras = ball_extras(b)
            conceded = b[4] + sum(extras[k] for k in BOWLER_EXTRAS)
            legal = int(b[6] not in ("wides", "noballs"))
            f = figures.setdefault(b[2], [0, 0, 0, 0])
            f[0] += legal
            f[1] += conceded
            f[2] += any(kind not in NON_BOWLER_DISMISSALS for kind, _who in ball_wickets(b))
            o = overs.setdefault((b[2], b[0]), [0, 0])
            o[0] += conceded
            o[1] += legal
        for (bowler, _over), (runs, legal) in overs.items():
            if runs == 0 and legal >= 6:
                figures[bowler][3] += 1
        out += [(n, bowling_team, bowler, f) for bowler, f in figures.items()]
    return out


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _person_key(person: dict) -> str:
    # aggregate.py files a name missing from the registry under "~<name>".
    return person.get("id") or f"~{person.get('name', '')}"


def _check_replay(replay: dict, match: dict | None, bowled: dict, has_bowling: set,
                  team_figures: dict) -> list[str]:
    """Problems with one replay; adds its bowlers to ``team_figures``."""
    mid = replay["id"]
    if match is None:
        return [f"{mid}: the replay has no row in matches.json"]
    errors = []
    got = []
    for inn in replay["innings"]:
        penalty = inn["penaltyRuns"]["pre"] + inn["penaltyRuns"]["post"]
        got.append((inn["team"], sum(b[4] + b[5] for b in inn["balls"]) + penalty,
                    sum(team_wickets(b) for b in inn["balls"]),
                    sum(1 for b in inn["balls"] if b[6] not in ("wides", "noballs")), penalty))
    want = [(i["team"], i["runs"], i["wickets"], i["balls"], i["penaltyRuns"])
            for i in match["innings"]]
    if got != want:
        errors.append(f"{mid}: innings (team, runs, wickets, legal balls, penalty runs) are "
                      f"{got} in the replay but {want} in matches.json")
    # The scorecard adds extras up by kind and the total from ball[5], so the
    # two must agree (the TypeScript check fails on the same balls).
    for n, inn in enumerate(replay["innings"]):
        bad = [i for i, b in enumerate(inn["balls"]) if sum(ball_extras(b).values()) != b[5]]
        if bad:
            errors.append(f"{mid}: innings {n + 1} has {len(bad)} balls whose extras by kind do "
                          f"not add up to their extras (first: ball {bad[0]}), so its scorecard "
                          f"would not add up to its total")

    people = replay["people"]
    figures: dict[str, list[tuple]] = defaultdict(list)
    for _n, team, bowler, f in bowling_figures(replay):
        pid = _person_key(people[bowler])
        figures[pid].append(tuple(f))
        t = team_figures[(team_id(team, replay["gender"]), replay["format"], pid)]
        for i, v in enumerate((1, f[0], f[1], f[2], int(f[2] >= 5))):
            t[i] += v
    names = {_person_key(p): p["name"] for p in people}
    for pid in sorted(set(figures) | set(bowled)):
        # Only bowlers with an exported bowling record can be compared; a
        # person filed under the other gender (build.py warns) has none here.
        if pid not in bowled and (pid, replay["formatKey"]) not in has_bowling:
            continue
        got_f, want_f = sorted(figures.get(pid, [])), sorted(bowled.get(pid, []))
        if got_f != want_f:
            errors.append(f"{mid}: {names.get(pid, pid)} ({pid}) bowled (balls, runs, wickets, "
                          f"maidens) {got_f} in the replay but {want_f} in their player file")
    return errors


def verify_replays(root: Path) -> tuple[list[str], dict[str, int]]:
    """Check every replay in the build directory ``root`` against what the
    rest of the build records, and return (problems, counts of what was
    checked).

    * Each innings' team, total, wickets, legal balls and penalty runs (the
      only extras matches.json records by kind) against ``matches.json``.
    * Each bowler's balls, runs conceded, wickets and maidens in each innings
      against the ``bowling.innings`` of their player file, for every player
      exported with bowling figures in the replay's formatKey.
    * Each team's ``topBowlers`` (innings, balls, runs conceded, wickets and
      five-wicket hauls) against the same figures summed over the replays.
    """
    matches = {m["id"]: m for m in _read(root / "matches.json")["matches"]}
    # match id -> person id -> [(balls, runs, wickets, maidens)], and the
    # (person id, formatKey) of every exported bowling record.
    bowled: dict[str, dict[str, list[tuple]]] = defaultdict(lambda: defaultdict(list))
    has_bowling: set[tuple[str, str]] = set()
    for row in _read(root / "players.json")["players"]:
        payload = _read(root / "players" / f"{row['slug']}.json")
        for fp in payload["formats"].values():
            if fp.get("bowling"):
                has_bowling.add((row["id"], fp["formatKey"]))
                for i in fp["bowling"]["innings"]:
                    bowled[i["m"]][row["id"]].append((i["b"], i["r"], i["w"], i["md"]))

    errors: list[str] = []
    counts = {"replays": 0, "innings": 0, "bowlerInnings": 0, "teamBowlers": 0}
    team_figures: dict[tuple, list[int]] = defaultdict(lambda: [0, 0, 0, 0, 0])
    seen = set()
    for path in sorted((root / "replays").glob("*.json.gz")):
        mid = path.name[:-len(".json.gz")]
        seen.add(mid)
        try:
            replay = json.loads(gzip.decompress(path.read_bytes()))
            errors += _check_replay(replay, matches.get(mid), bowled.get(mid, {}), has_bowling,
                                    team_figures)
        except (OSError, EOFError, zlib.error, ValueError, KeyError, IndexError, TypeError,
                AttributeError) as exc:
            errors.append(f"{mid}: could not check the replay ({type(exc).__name__}: {exc})")
            continue
        counts["replays"] += 1
        counts["innings"] += len(replay["innings"])
        counts["bowlerInnings"] += sum(len(v) for v in bowled.get(mid, {}).values())
    errors += [f"{mid}: in matches.json but there is no replays/{mid}.json.gz"
               for mid in sorted(set(matches) - seen)]

    for team in _read(root / "teams" / "index.json")["teams"]:
        payload = _read(root / "teams" / f"{team['id']}.json")
        for fmt, tf in payload["formats"].items():
            for row in tf["topBowlers"]:
                counts["teamBowlers"] += 1
                got = team_figures.get((team["id"], fmt, row["playerId"]), [0, 0, 0, 0, 0])
                want = [row["innings"], row["balls"], row["runsConceded"], row["wickets"],
                        row["fiveWickets"]]
                if got != want:
                    errors.append(f"teams/{team['id']}.json {fmt}: {row['name']} "
                                  f"({row['playerId']}) has (innings, balls, runs, wickets, "
                                  f"five-fors) {want}, but the replays add up to {got}")
    return errors, counts
