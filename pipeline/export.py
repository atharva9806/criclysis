"""Write the player aggregates out as the JSON the importer reads.

Layout (docs/ARCHITECTURE.md §1.4 and §1.5)
------
players.json          lightweight index: everything search and leaderboards need
players/<slug>.json   the full record for one player, fetched on demand
cohorts.json          cohort quartiles per formatKey, for distribution context

Splitting the per-player detail into its own file keeps the index small even
with thousands of players.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from .analyze import Cohort, analyse_player, cohort_reference
from .config import ALL_FORMATS, BOWLING_TYPES, FORMATS, THRESHOLDS
from .ids import slugify, team_id
from .metrics.base import dict_of_splits

log = logging.getLogger(__name__)

T = THRESHOLDS

# Splits below the display thresholds are dropped from the export entirely:
# the site would hide them anyway, and shipping them only inflates the payload
# and the database. byYear is the exception: a career by year needs every year.
EXPORT_MIN_BALLS = T.min_balls_split
EXPORT_MIN_BALLS_BOWL = T.min_balls_bowled_split
# Head-to-heads: the most-contested 40, each above the same gate.
H2H_MAX = 40


def write_json(path: Path, payload, *, pretty: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":"),
                      ensure_ascii=False, sort_keys=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def _top_h2h(splits, person, min_balls: int, limit: int = H2H_MAX) -> dict:
    """The most-contested head-to-heads, keyed by person id, each with a name.

    ``person`` maps a split key to (person id, name).
    """
    ranked = sorted(
        ((k, v) for k, v in splits.items() if v.balls >= min_balls),
        key=lambda kv: (-kv[1].balls, kv[0]))[:limit]
    out = {}
    for key, split in ranked:
        pid, name = person(key)
        out[pid] = {**split.to_dict(), "name": name}
    return out


def _career_milestones(innings: list) -> dict:
    """Fifties, hundreds, highest score and the not-out count."""
    fifties = hundreds = one_fifties = doubles = not_outs = 0
    highest = 0
    highest_not_out = False
    for inn in innings:
        runs = inn.runs
        if runs >= 200:
            doubles += 1
        if runs >= 150:
            one_fifties += 1
        if runs >= 100:
            hundreds += 1
        elif runs >= 50:
            fifties += 1
        if not inn.out:
            not_outs += 1
        if runs > highest:
            highest, highest_not_out = runs, not inn.out
    return {
        "fifties": fifties, "hundreds": hundreds,
        "oneFifties": one_fifties, "doubleHundreds": doubles,
        "notOuts": not_outs, "highest": highest, "highestNotOut": highest_not_out,
    }


def _bowling_best(innings: list) -> dict:
    # A bowler with no wickets has no "best figures"; reporting 0/0 is worse
    # than reporting nothing, because it looks like a real result.
    best = {"wickets": 0, "runs": 0}
    five_fors = four_fors = 0
    for inn in innings:
        if inn.wickets >= 5:
            five_fors += 1
        elif inn.wickets >= 4:
            four_fors += 1
        if (inn.wickets > best["wickets"] or
                (inn.wickets == best["wickets"] and inn.runs < best["runs"])):
            best = {"wickets": inn.wickets, "runs": inn.runs}
    return {
        "best": best if best["wickets"] > 0 else None,
        "fiveWickets": five_fors, "fourWickets": four_fors,
    }


def build_player_record(record, analysis: dict, agg, person) -> dict:
    """Full detail for one player in one formatKey.

    ``person`` maps a head-to-head key to (person id, name).
    """
    fmt = agg.fmt
    bat = record.bat_overall
    bowl = record.bowl_overall
    innings = sorted(record.bat_innings, key=lambda i: (i.date, i.match_id, i.innings_no))
    bowl_innings = sorted(record.bowl_innings, key=lambda i: (i.date, i.match_id))

    payload: dict = {
        "format": fmt,
        "formatLabel": ALL_FORMATS[fmt]["label"],
        "formatKey": agg.format_key,
        "gender": agg.gender,
        "matches": record.matches,
        "strengths": analysis["strengths"],
        "weaknesses": analysis["weaknesses"],
        "profile": analysis["profile"],
    }

    if record.has_batting():
        payload["batting"] = {
            "overall": bat.to_dict(),
            "milestones": _career_milestones(innings),
            "byType": dict_of_splits(record.bat_by_type, EXPORT_MIN_BALLS),
            "byFamily": dict_of_splits(record.bat_by_family, EXPORT_MIN_BALLS),
            "byPhase": dict_of_splits(record.bat_by_phase, EXPORT_MIN_BALLS),
            "byEntry": dict_of_splits(record.bat_by_entry, EXPORT_MIN_BALLS),
            "byTypePhase": dict_of_splits(record.bat_by_type_phase, EXPORT_MIN_BALLS),
            "byOpposition": dict_of_splits(record.bat_by_opposition, EXPORT_MIN_BALLS),
            "byCountry": dict_of_splits(record.bat_by_country, EXPORT_MIN_BALLS),
            "byVenue": dict_of_splits(record.bat_by_venue, EXPORT_MIN_BALLS),
            "byHome": dict_of_splits(record.bat_by_home, EXPORT_MIN_BALLS),
            "byInningsNo": dict_of_splits(record.bat_by_innings_no, EXPORT_MIN_BALLS),
            "byChase": dict_of_splits(record.bat_by_chase, EXPORT_MIN_BALLS),
            "byPosition": dict_of_splits(record.bat_by_position, EXPORT_MIN_BALLS),
            "byYear": dict_of_splits(record.bat_by_year, 0),
            "dismissals": dict(sorted(record.dismissals.items())),
            "dismissedByType": dict(sorted(record.dismissed_by_type.items())),
            "vsBowler": _top_h2h(record.vs_bowler, person, EXPORT_MIN_BALLS),
            "innings": [i.to_dict() for i in innings],
        }

    if record.has_bowling():
        payload["bowling"] = {
            "overall": bowl.to_dict(),
            "milestones": _bowling_best(bowl_innings),
            "byHand": dict_of_splits(record.bowl_by_hand, EXPORT_MIN_BALLS_BOWL),
            "byPhase": dict_of_splits(record.bowl_by_phase, EXPORT_MIN_BALLS_BOWL),
            "byOpposition": dict_of_splits(record.bowl_by_opposition, EXPORT_MIN_BALLS_BOWL),
            "byCountry": dict_of_splits(record.bowl_by_country, EXPORT_MIN_BALLS_BOWL),
            "byHome": dict_of_splits(record.bowl_by_home, EXPORT_MIN_BALLS_BOWL),
            "byInningsNo": dict_of_splits(record.bowl_by_innings_no, EXPORT_MIN_BALLS_BOWL),
            "byYear": dict_of_splits(record.bowl_by_year, 0),
            "wicketKinds": dict(sorted(record.wicket_kinds.items())),
            "vsBatter": _top_h2h(record.vs_batter, person, EXPORT_MIN_BALLS_BOWL),
            "innings": [i.to_dict() for i in bowl_innings],
        }

    return payload


def index_entry(player: dict, per_format: dict[str, dict]) -> dict:
    """One row in players.json - small enough to ship thousands of them."""
    meta = player["meta"]
    formats = {}
    for fmt, payload in per_format.items():
        row: dict = {"matches": payload["matches"]}
        if "batting" in payload:
            b = payload["batting"]["overall"]
            row["bat"] = {
                "inns": b["innings"], "runs": b["runs"], "balls": b["balls"],
                "avg": b["avg"], "sr": b["sr"],
                "hs": payload["batting"]["milestones"]["highest"],
                "100s": payload["batting"]["milestones"]["hundreds"],
                "50s": payload["batting"]["milestones"]["fifties"],
            }
        if "bowling" in payload:
            w = payload["bowling"]["overall"]
            row["bowl"] = {
                "inns": w["innings"], "wkts": w["wickets"], "balls": w["balls"],
                "runs": w["runs"], "avg": w["avg"], "econ": w["econ"], "sr": w["sr"],
                "5w": payload["bowling"]["milestones"]["fiveWickets"],
            }
        row["strengths"] = len(payload.get("strengths", []))
        row["weaknesses"] = len(payload.get("weaknesses", []))
        formats[fmt] = row

    return {
        "id": player["id"],
        "slug": player["slug"],
        "name": player["name"],
        "fullName": meta["fullName"],
        "gender": player["gender"],
        "teams": meta["teams"],
        "teamIds": meta["teamIds"],
        "country": meta["country"],
        "role": meta["role"],
        "battingHand": meta["battingHand"],
        "bowlingType": meta["bowlingType"],
        "bowlingLabel": BOWLING_TYPES.get(meta["bowlingType"], {}).get("label", ""),
        "born": meta["born"],
        "debut": meta["debut"],
        "lastPlayed": meta["lastPlayed"],
        "cricinfoId": meta["cricinfoId"],
        "sampleBalls": player["sampleBalls"],
        "formats": formats,
    }


def _gender_of(player_id: str, by_key: dict[str, tuple]) -> str:
    """A person has one gender. Should the data ever file one person id under
    both, keep the gender with more of their balls rather than writing two
    players with the same slug."""
    balls: dict[str, int] = {}
    for agg, record in by_key.values():
        balls[agg.gender] = balls.get(agg.gender, 0) + \
            record.bat_overall.balls + record.bowl_overall.balls
    if len(balls) > 1:
        log.warning("person %s appears as both %s; keeping the larger record",
                    player_id, " and ".join(sorted(balls)))
    return max(sorted(balls), key=lambda g: balls[g])


def cohorts_by_key(aggregators: dict) -> dict[str, Cohort]:
    """One cohort per formatKey: women are only compared with women."""
    return {fk: Cohort(agg.fmt, agg.players) for fk, agg in aggregators.items()}


def export_players(aggregators: dict, metadata: dict, out_dir: Path,
                   *, pretty: bool = False) -> dict:
    """Write players/, players.json and cohorts.json.

    ``aggregators`` is keyed by formatKey. Returns the index rows and the slug
    of every exported player, keyed by person id.
    """
    players_dir = out_dir / "players"
    players_dir.mkdir(parents=True, exist_ok=True)
    for stale in players_dir.glob("*.json"):
        stale.unlink()

    cohorts = cohorts_by_key(aggregators)
    order = {fmt: i for i, fmt in enumerate(FORMATS)}

    # person id -> {formatKey: (aggregator, record)}
    records: dict[str, dict[str, tuple]] = {}
    for fk, agg in aggregators.items():
        for pid, record in agg.players.items():
            records.setdefault(pid, {})[fk] = (agg, record)

    index: list[dict] = []
    slugs: dict[str, str] = {}
    total_bytes = 0
    for player_id, by_key in records.items():
        gender = _gender_of(player_id, by_key)
        per_fmt = {agg.fmt: (agg, record) for agg, record in by_key.values()
                   if agg.gender == gender}
        per_fmt = dict(sorted(per_fmt.items(), key=lambda kv: order.get(kv[0], 99)))
        payloads: dict[str, dict] = {}
        for fmt, (agg, record) in per_fmt.items():
            if not (record.has_batting() or record.has_bowling()):
                continue
            analysis = analyse_player(record, cohorts[agg.format_key], fmt)
            payloads[fmt] = build_player_record(
                record, analysis, agg, lambda pid, agg=agg: (pid, agg.name_of(pid)))
        if not payloads:
            continue

        # The name in the player's latest match, in any format.
        name = max(agg.names.get(player_id, ("", record.name))
                   for agg, record in per_fmt.values())[1]
        spans = [r.career_span() for _a, r in per_fmt.values()]
        starts = [s for s, _e in spans if s]
        ends = [e for _s, e in spans if e]
        teams = sorted({t for _a, r in per_fmt.values() for t in r.teams if t})
        known = metadata.get(player_id, {})
        meta = {
            "bowlingType": known.get("bowlingType", ""),
            "battingHand": known.get("battingHand", ""),
            "role": known.get("role", ""),
            "country": known.get("country", ""),
            "cricinfoId": known.get("cricinfoId", ""),
            "fullName": known.get("fullName") or name,
            "born": known.get("born", ""),
            "teams": teams,
            "teamIds": [team_id(t, gender) for t in teams],
            "debut": min(starts) if starts else "",
            "lastPlayed": max(ends) if ends else "",
            "gender": gender,
        }
        slug = slugify(name, player_id)
        slugs[player_id] = slug
        player = {
            "id": player_id, "slug": slug, "name": name, "gender": gender,
            "meta": meta,
            "sampleBalls": sum(r.bat_overall.balls + r.bowl_overall.balls
                               for _a, r in per_fmt.values()),
        }
        total_bytes += write_json(players_dir / f"{slug}.json", {
            "id": player_id, "slug": slug, "name": name, "gender": gender,
            "meta": meta, "formats": payloads,
        }, pretty=pretty)
        index.append(index_entry(player, payloads))

    index.sort(key=lambda r: (-max((f.get("bat", {}).get("runs", 0)
                                    for f in r["formats"].values()), default=0),
                              r["name"], r["id"]))
    write_json(out_dir / "players.json", {"players": index}, pretty=pretty)
    write_json(out_dir / "cohorts.json",
               {fk: cohort_reference(c) for fk, c in cohorts.items()}, pretty=pretty)
    return {"index": index, "slugs": slugs, "bytes": total_bytes}
