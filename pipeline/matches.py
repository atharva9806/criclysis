"""One row per international match: ``matches.json`` (docs/ARCHITECTURE.md §1.6).

Everything here is read straight off the Cricsheet document: teams, toss,
result, player of the match and innings totals. Nothing is inferred.
"""
from __future__ import annotations

from .config import FORMATS, format_key
from .ids import team_id

#: Dismissals that do not cost the batting side a wicket.
NOT_WICKETS = {"retired hurt", "retired not out"}


def overs_text(balls: int, balls_per_over: int = 6) -> str:
    """Legal balls as cricket overs: 262 -> '43.4'."""
    return f"{balls // balls_per_over}.{balls % balls_per_over}"


def result_text(info: dict) -> str:
    out = info.get("outcome") or {}
    if out.get("result") == "tie":
        eliminator = out.get("eliminator")
        return f"Match tied ({eliminator} won the Super Over)" if eliminator else "Match tied"
    if out.get("result") == "no result":
        return "No result"
    winner = out.get("winner")
    by = out.get("by") or {}
    if winner and "runs" in by:
        return f"{winner} won by {by['runs']} runs"
    if winner and "wickets" in by:
        return f"{winner} won by {by['wickets']} wickets"
    return f"{winner} won" if winner else ""


def build_result(info: dict, gender: str) -> dict:
    out = info.get("outcome") or {}
    winner = out.get("winner")
    if winner:
        kind = "win"
    elif out.get("result") == "tie":
        kind = "tie"
    elif out.get("result") == "draw":
        kind = "draw"
    else:
        kind = "noResult"
    return {
        "type": kind,
        "winner": winner,
        "winnerId": team_id(winner, gender) if winner else None,
        "by": dict(out.get("by") or {}),
        "method": out.get("method"),
        "eliminator": out.get("eliminator") or out.get("bowl_out"),
        "text": result_text(info),
    }


def innings_rows(raw: dict, gender: str) -> list[dict]:
    """Totals for each innings, super overs excluded."""
    balls_per_over = int(raw.get("info", {}).get("balls_per_over") or 6)
    rows = []
    for inn in raw.get("innings", []):
        if inn.get("super_over"):
            continue
        runs = wickets = balls = 0
        for over in inn.get("overs", []):
            for d in over.get("deliveries", []):
                runs += int((d.get("runs") or {}).get("total", 0))
                extras = d.get("extras") or {}
                if "wides" not in extras and "noballs" not in extras:
                    balls += 1
                for w in d.get("wickets") or []:
                    if w.get("kind") not in NOT_WICKETS:
                        wickets += 1
        target = inn.get("target")
        team = inn.get("team", "")
        rows.append({
            "team": team,
            "teamId": team_id(team, gender),
            "runs": runs,
            "wickets": wickets,
            "balls": balls,
            "overs": overs_text(balls, balls_per_over),
            "declared": bool(inn.get("declared")),
            "target": ({"runs": int(target.get("runs", 0)), "overs": target.get("overs")}
                       if target else None),
            "penaltyRuns": 0,
        })
    return rows


def has_deliveries(raw: dict) -> bool:
    return any(over.get("deliveries")
               for inn in raw.get("innings", []) if not inn.get("super_over")
               for over in inn.get("overs", []))


def build_match_row(raw: dict, match_id: str, fmt: str, *, venue_key: str,
                    country: str) -> dict:
    """The matches.json row for one Cricsheet match document."""
    info = raw.get("info", {})
    gender = info.get("gender", "male")
    dates = info.get("dates") or [""]
    event = info.get("event") or {}
    teams = list(info.get("teams", []))
    toss = info.get("toss") or {}
    registry = (info.get("registry") or {}).get("people") or {}
    group = event.get("group")
    return {
        "id": match_id,
        "gender": gender,
        "format": fmt,
        "formatKey": format_key(fmt, gender),
        "matchTypeNumber": info.get("match_type_number"),
        "startDate": dates[0],
        "endDate": dates[-1],
        "season": str(info.get("season", "")),
        "event": {
            "name": event.get("name"),
            "stage": event.get("stage"),
            "matchNumber": event.get("match_number"),
            "group": str(group) if group is not None else None,
        },
        "venue": info.get("venue", ""),
        "venueKey": venue_key,
        "city": info.get("city") or None,
        "country": country or None,
        "teams": [{"id": team_id(t, gender), "name": t} for t in teams],
        "toss": {"winner": toss.get("winner"), "decision": toss.get("decision")},
        "result": build_result(info, gender),
        "playerOfMatch": [{"id": registry.get(name), "name": name}
                          for name in info.get("player_of_match") or []],
        "scheduledOvers": info.get("overs"),
        "innings": innings_rows(raw, gender),
        "missing": [m for m in info.get("missing") or [] if isinstance(m, str)],
        "hasReplay": has_deliveries(raw),
        "featuredRank": None,
    }


def first_innings_total(row: dict) -> int | None:
    """The first-innings total, if it counts towards a ground's average.

    Tests: every first innings. Limited overs: only a first innings that ran
    its course (all out or every over bowled) in a match with the standard
    number of overs - a shortened innings says nothing about a ground.
    """
    if not row["innings"]:
        return None
    first = row["innings"][0]
    if row["format"] == "test":
        return first["runs"]
    balls = FORMATS[row["format"]]["balls_per_innings"]
    if row["scheduledOvers"] != balls // 6:
        return None
    if first["wickets"] >= 10 or first["balls"] >= balls:
        return first["runs"]
    return None


def sort_key(row: dict) -> tuple[str, str]:
    """matches.json is ordered by end date, then id, both descending."""
    return row["endDate"], row["id"]
