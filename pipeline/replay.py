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

Files are written as ``replays/<matchId>.json.gz``: gzip of the compact JSON,
with the gzip timestamp fixed so that identical input gives identical bytes.
"""
from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path

from .config import SCHEMA_VERSION, WEB_DATA_DIR, format_key
from .matches import result_text
from .sources.cricsheet import iter_raw
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

EXTRA_KEYS = ("wides", "noballs", "byes", "legbyes", "penalty")


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
                extras = d.get("extras") or {}
                extra_type = next((k for k in EXTRA_KEYS if k in extras), None)
                wk = (d.get("wickets") or [None])[0] or {}
                balls.append([
                    over.get("over", 0),
                    person(d.get("batter"), bat_team),
                    person(d.get("bowler"), bowl_team),
                    person(d.get("non_striker"), bat_team),
                    (d.get("runs") or {}).get("batter", 0),
                    (d.get("runs") or {}).get("extras", 0),
                    extra_type,
                    wk.get("kind"),
                    person(wk.get("player_out"), bat_team) if wk else None,
                ])
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


def featured_ranks(match_ids) -> dict[str, int]:
    """Rank (1 = first) of every featured match among ``match_ids``."""
    present = set(match_ids)
    ranked = [mid for _fmt, mid in FEATURED if mid in present]
    return {mid: i + 1 for i, mid in enumerate(ranked)}


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
    total = 0
    for fmt, match_id, raw in items:
        info = raw.get("info", {})
        key = venue_key(info.get("venue", ""), info.get("city")) if venue_key else None
        replay = build_replay(raw, match_id, fmt, venue_key=key, styles=styles, hands=hands)
        total += write_replay(out_dir, replay)
        rows[match_id] = {k: replay[k] for k in INDEX_FIELDS}
    ranks = featured_ranks(rows)
    index = [rows[mid] for mid in sorted(ranks, key=ranks.get)]
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":"),
                                                   ensure_ascii=False))
    log.info("wrote %d replays (%.1f MB gzipped), %d featured, to %s",
             len(rows), total / 1e6, len(index), out_dir)
    return index


def featured_items(formats, genders, archives=None):
    """(format, match id, document) for every featured match in the archives."""
    wanted = {mid for _fmt, mid in FEATURED}
    for fmt in formats:
        path = (archives or {}).get(fmt)
        for match_id, raw in iter_raw(fmt, gender=genders, path=path):
            if match_id in wanted:
                yield fmt, match_id, raw


def replay_states(replay: dict, max_balls: int):
    """Yield (innings_no, balls_left, wickets, runs, target, ball_index) after
    every legal delivery, mirroring what a live feed would report."""
    for n, inn in enumerate(replay["innings"][:2], start=1):
        legal = wickets = runs = 0
        target = inn.get("target")
        for i, b in enumerate(inn["balls"]):
            runs += b[4] + b[5]
            if b[7] and b[7] not in ("retired hurt", "retired not out"):
                wickets += 1
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
