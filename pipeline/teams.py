"""Team analysis: ``teams/index.json`` and ``teams/<teamId>.json`` (§1.7).

A team is a Cricsheet team name plus a gender, so India's men and India's
women are different teams ("india-m", "india-w"). Every figure comes from the
match rows in ``matches.json`` and the ball-by-ball deliveries.
"""
from __future__ import annotations

from .config import FORMATS, format_key
from .ids import team_label

OUTCOMES = ("won", "lost", "tied", "drawn", "noResult")


def new_record() -> dict:
    return {"matches": 0, "won": 0, "lost": 0, "tied": 0, "drawn": 0, "noResult": 0}


def outcome_for(row: dict, team: str) -> str:
    result = row["result"]
    if result["type"] == "win":
        return "won" if result["winner"] == team else "lost"
    return {"tie": "tied", "draw": "drawn"}.get(result["type"], "noResult")


def add_outcome(record: dict, outcome: str) -> None:
    record["matches"] += 1
    record[outcome] += 1


def win_pct(won: int, decided: int) -> float | None:
    return round(100.0 * won / decided, 2) if decided else None


def finish_record(record: dict) -> dict:
    """Add winPct = 100·won/(won+lost+tied+drawn); no-results don't count."""
    decided = record["won"] + record["lost"] + record["tied"] + record["drawn"]
    return {**record, "winPct": win_pct(record["won"], decided)}


class _TeamFormat:
    def __init__(self) -> None:
        self.record = new_record()
        self.by_year: dict[str, dict] = {}
        self.h2h: dict[str, dict] = {}
        self.matches: list[tuple[str, str]] = []      # (endDate, id)
        self.first = ""
        self.last = ""


class TeamBook:
    """Accumulates every team's record, one match row at a time."""

    def __init__(self) -> None:
        # team id -> {"name", "gender", "formats": {fmt: _TeamFormat}}
        self.teams: dict[str, dict] = {}

    def add(self, row: dict, deliveries=None) -> None:
        teams = row["teams"]
        for i, team in enumerate(teams):
            entry = self.teams.setdefault(team["id"], {
                "name": team["name"], "gender": row["gender"], "formats": {}})
            tf = entry["formats"].setdefault(row["format"], _TeamFormat())
            outcome = outcome_for(row, team["name"])
            add_outcome(tf.record, outcome)
            year = row["startDate"][:4]
            add_outcome(tf.by_year.setdefault(year, new_record()), outcome)
            if len(teams) == 2:
                opp = teams[1 - i]
                h2h = tf.h2h.setdefault(opp["id"], {"opponent": opp["name"], "last": ("", ""),
                                                     **new_record()})
                add_outcome(h2h, outcome)
                h2h["last"] = max(h2h["last"], (row["endDate"], row["id"]))
            tf.matches.append((row["endDate"], row["id"]))
            if not tf.first or row["startDate"] < tf.first:
                tf.first = row["startDate"]
            tf.last = max(tf.last, row["endDate"])

    # ------------------------------------------------------------------
    def _format_payload(self, gender: str, fmt: str, tf: _TeamFormat) -> dict:
        h2h = sorted(tf.h2h.items(), key=lambda kv: (-kv[1]["matches"], kv[0]))
        zero = finish_record(new_record())
        return {
            "formatKey": format_key(fmt, gender),
            "span": {"first": tf.first, "last": tf.last},
            "record": finish_record(tf.record),
            "byYear": [{"year": y, **finish_record(r)} for y, r in sorted(tf.by_year.items())],
            "headToHead": [
                {"opponentId": opp_id, "opponent": h["opponent"],
                 "lastMatchId": h["last"][1], "lastDate": h["last"][0],
                 **finish_record({k: h[k] for k in new_record()})}
                for opp_id, h in h2h],
            "venueType": {k: dict(zero) for k in ("home", "away", "neutral", "unknown")},
            "batFirstChase": {"battingFirst": dict(zero), "chasing": dict(zero)},
            "toss": {"won": 0, "lost": 0, "winPctWonToss": None, "winPctLostToss": None,
                     "decisions": {"bat": dict(zero), "field": dict(zero)}},
            "venues": [],
            "phases": {"batting": [], "bowling": []},
            "topBatters": [],
            "topBowlers": [],
            "recentMatchIds": [mid for _d, mid in sorted(tf.matches, reverse=True)[:10]],
        }

    def files(self) -> tuple[dict, dict[str, dict]]:
        """(teams/index.json, {team id: teams/<id>.json})."""
        index = []
        files: dict[str, dict] = {}
        for tid in sorted(self.teams):
            entry = self.teams[tid]
            gender = entry["gender"]
            formats = {fmt: self._format_payload(gender, fmt, entry["formats"][fmt])
                       for fmt in FORMATS if fmt in entry["formats"]}
            label = team_label(entry["name"], gender)
            files[tid] = {"schemaVersion": 2, "id": tid, "name": entry["name"],
                          "gender": gender, "label": label, "formats": formats}
            index.append({
                "id": tid, "name": entry["name"], "gender": gender, "label": label,
                "formats": {fmt: {**p["record"], "first": p["span"]["first"],
                                  "last": p["span"]["last"]}
                            for fmt, p in formats.items()},
            })
        return {"schemaVersion": 2, "teams": index}, files
