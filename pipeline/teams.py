"""Team analysis: ``teams/index.json`` and ``teams/<teamId>.json`` (§1.7).

A team is a Cricsheet team name plus a gender, so India's men and India's
women are different teams ("india-m", "india-w"). Every figure comes from the
match rows in ``matches.json``, the ball-by-ball deliveries and the players'
innings logs; the definitions are in docs/ARCHITECTURE.md §1.10.
"""
from __future__ import annotations

from collections import defaultdict

from .config import FORMATS, PHASES, format_key
from .ids import team_label
from .matches import first_innings_total
from .venues import venue_type

TOP_VENUES = 40
TOP_PLAYERS = 15
RECENT = 10


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
    return {**{k: record[k] for k in new_record()}, "winPct": win_pct(record["won"], decided)}


def _phase_row() -> dict:
    return {"innings": 0, "balls": 0, "runs": 0, "wickets": 0, "dots": 0, "fours": 0, "sixes": 0}


class _TeamFormat:
    def __init__(self) -> None:
        self.record = new_record()
        self.by_year: dict[str, dict] = defaultdict(new_record)
        self.h2h: dict[str, dict] = {}
        self.venue_type: dict[str, dict] = {k: new_record()
                                            for k in ("home", "away", "neutral", "unknown")}
        self.bat_first_chase = {"battingFirst": new_record(), "chasing": new_record()}
        self.toss = {"won": new_record(), "lost": new_record()}
        self.decisions = {"bat": new_record(), "field": new_record()}
        self.venues: dict[str, dict] = {}
        self.phases = {"batting": defaultdict(_phase_row), "bowling": defaultdict(_phase_row)}
        self.matches: list[tuple[str, str]] = []      # (endDate, id)
        self.first = ""
        self.last = ""


class TeamBook:
    """Accumulates every team's record, one match at a time."""

    def __init__(self) -> None:
        # team id -> {"name", "gender", "formats": {fmt: _TeamFormat}}
        self.teams: dict[str, dict] = {}

    def _format(self, team: dict, row: dict) -> _TeamFormat:
        entry = self.teams.setdefault(team["id"], {
            "name": team["name"], "gender": row["gender"], "formats": {}})
        return entry["formats"].setdefault(row["format"], _TeamFormat())

    def add(self, row: dict, deliveries=()) -> None:
        """Add one matches.json row and the match's parsed deliveries."""
        teams = row["teams"]
        batting_first = row["innings"][0]["team"] if row["innings"] else None
        first_total = first_innings_total(row)
        for i, team in enumerate(teams):
            name = team["name"]
            opponent = teams[1 - i] if len(teams) == 2 else None
            tf = self._format(team, row)
            outcome = outcome_for(row, name)
            add_outcome(tf.record, outcome)
            add_outcome(tf.by_year[row["startDate"][:4]], outcome)
            add_outcome(tf.venue_type[venue_type(name, opponent["name"] if opponent else "",
                                                 row["country"])], outcome)
            if opponent:
                h2h = tf.h2h.setdefault(opponent["id"], {
                    "opponent": opponent["name"], "last": ("", ""), **new_record()})
                add_outcome(h2h, outcome)
                h2h["last"] = max(h2h["last"], (row["endDate"], row["id"]))
            if batting_first:
                key = "battingFirst" if batting_first == name else "chasing"
                add_outcome(tf.bat_first_chase[key], outcome)
            toss = row["toss"]
            if toss["winner"]:
                add_outcome(tf.toss["won" if toss["winner"] == name else "lost"], outcome)
                if toss["winner"] == name and toss["decision"] in tf.decisions:
                    add_outcome(tf.decisions[toss["decision"]], outcome)

            venue = tf.venues.setdefault(row["venueKey"], {
                "record": new_record(), "firstN": 0, "firstRuns": 0})
            add_outcome(venue["record"], outcome)
            if first_total is not None and batting_first == name:
                venue["firstN"] += 1
                venue["firstRuns"] += first_total

            tf.matches.append((row["endDate"], row["id"]))
            if not tf.first or row["startDate"] < tf.first:
                tf.first = row["startDate"]
            tf.last = max(tf.last, row["endDate"])

        self._add_phases(row, deliveries)

    def _add_phases(self, row: dict, deliveries) -> None:
        """Team totals by phase, extras included (§1.10 'Phase rows')."""
        by_name = {t["name"]: t for t in row["teams"]}
        seen: set[tuple[str, str, int, str]] = set()
        for d in deliveries:
            for side, team in (("batting", d.batting_team), ("bowling", d.bowling_team)):
                if team not in by_name:
                    continue
                tf = self._format(by_name[team], row)
                ph = tf.phases[side][d.phase]
                key = (side, team, d.innings, d.phase)
                if key not in seen:
                    seen.add(key)
                    ph["innings"] += 1
                ph["runs"] += d.runs_total
                ph["wickets"] += d.team_wickets
                if d.is_legal:
                    ph["balls"] += 1
                    if d.runs_total == 0:
                        ph["dots"] += 1
                if d.runs_batter == 4:
                    ph["fours"] += 1
                elif d.runs_batter == 6:
                    ph["sixes"] += 1

    # ------------------------------------------------------------------
    @staticmethod
    def _players(aggregator, team: str, slugs: dict[str, str]) -> tuple[list, list]:
        """(top batters, top bowlers) for one team, from its players' innings."""
        batters, bowlers = [], []
        if aggregator is None:
            return batters, bowlers
        for pid, record in aggregator.players.items():
            bat = [i for i in record.bat_innings if i.team == team]
            if bat:
                batters.append({
                    "playerId": pid, "name": record.name, "slug": slugs.get(pid),
                    "innings": len(bat), "runs": sum(i.runs for i in bat),
                    "balls": sum(i.balls for i in bat), "outs": sum(1 for i in bat if i.out),
                    "hundreds": sum(1 for i in bat if i.runs >= 100),
                    "fifties": sum(1 for i in bat if 50 <= i.runs < 100),
                    "highest": max(i.runs for i in bat),
                })
            bowl = [i for i in record.bowl_innings if i.team == team]
            if bowl:
                bowlers.append({
                    "playerId": pid, "name": record.name, "slug": slugs.get(pid),
                    "innings": len(bowl), "balls": sum(i.balls for i in bowl),
                    "runsConceded": sum(i.runs for i in bowl),
                    "wickets": sum(i.wickets for i in bowl),
                    "fiveWickets": sum(1 for i in bowl if i.wickets >= 5),
                })
        batters.sort(key=lambda r: (-r["runs"], r["balls"], r["playerId"]))
        bowlers.sort(key=lambda r: (-r["wickets"], r["runsConceded"], r["playerId"]))
        return batters[:TOP_PLAYERS], bowlers[:TOP_PLAYERS]

    def _format_payload(self, name: str, gender: str, fmt: str, tf: _TeamFormat,
                        aggregator, slugs: dict, venue_book) -> dict:
        fk = format_key(fmt, gender)
        h2h = sorted(tf.h2h.items(), key=lambda kv: (-kv[1]["matches"], kv[0]))
        toss_won, toss_lost = tf.toss["won"], tf.toss["lost"]
        venues = sorted(tf.venues.items(), key=lambda kv: (-kv[1]["record"]["matches"], kv[0]))
        top_batters, top_bowlers = self._players(aggregator, name, slugs)
        labels = {k: lbl for k, _s, _e, lbl in PHASES[fmt]}
        order = [k for k, _s, _e, _l in PHASES[fmt]]
        return {
            "formatKey": fk,
            "span": {"first": tf.first, "last": tf.last},
            "record": finish_record(tf.record),
            "byYear": [{"year": y, **finish_record(r)} for y, r in sorted(tf.by_year.items())],
            "headToHead": [
                {"opponentId": opp_id, "opponent": h["opponent"],
                 "lastMatchId": h["last"][1], "lastDate": h["last"][0], **finish_record(h)}
                for opp_id, h in h2h],
            "venueType": {k: finish_record(r) for k, r in tf.venue_type.items()},
            "batFirstChase": {k: finish_record(r) for k, r in tf.bat_first_chase.items()},
            "toss": {
                "won": toss_won["matches"], "lost": toss_lost["matches"],
                "winPctWonToss": finish_record(toss_won)["winPct"],
                "winPctLostToss": finish_record(toss_lost)["winPct"],
                "decisions": {k: finish_record(r) for k, r in tf.decisions.items()},
            },
            "venues": [{
                "venueKey": key,
                "name": key.partition("|")[0],
                "city": venue_book.index.city(key) if venue_book else "",
                "country": venue_book.country(key) if venue_book else "",
                "firstInnings": venue_book.first_innings(key, fk) if venue_book
                else {"n": 0, "avg": None},
                "teamFirstInnings": {"n": v["firstN"],
                                     "avg": round(v["firstRuns"] / v["firstN"], 1)
                                     if v["firstN"] else None},
                "record": finish_record(v["record"]),
            } for key, v in venues[:TOP_VENUES]],
            "phases": {side: [{"phase": p, "label": labels[p], **tf.phases[side][p]}
                              for p in order if p in tf.phases[side]]
                       for side in ("batting", "bowling")},
            "topBatters": top_batters,
            "topBowlers": top_bowlers,
            "recentMatchIds": [mid for _d, mid in sorted(tf.matches, reverse=True)[:RECENT]],
        }

    def files(self, aggregators: dict | None = None, slugs: dict | None = None,
              venue_book=None) -> tuple[dict, dict[str, dict]]:
        """(teams/index.json, {team id: teams/<id>.json}).

        ``aggregators`` (by formatKey) supply the top batters and bowlers,
        ``slugs`` (by person id) their pages, ``venue_book`` the ground context.
        """
        aggregators = aggregators or {}
        index = []
        files: dict[str, dict] = {}
        for tid in sorted(self.teams):
            entry = self.teams[tid]
            name, gender = entry["name"], entry["gender"]
            formats = {
                fmt: self._format_payload(name, gender, fmt, entry["formats"][fmt],
                                          aggregators.get(format_key(fmt, gender)),
                                          slugs or {}, venue_book)
                for fmt in FORMATS if fmt in entry["formats"]}
            label = team_label(name, gender)
            files[tid] = {"schemaVersion": 2, "id": tid, "name": name,
                          "gender": gender, "label": label, "formats": formats}
            index.append({
                "id": tid, "name": name, "gender": gender, "label": label,
                "formats": {fmt: {**p["record"], "first": p["span"]["first"],
                                  "last": p["span"]["last"]}
                            for fmt, p in formats.items()},
            })
        return {"schemaVersion": 2, "teams": index}, files
