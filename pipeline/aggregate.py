"""Stream ball-by-ball matches into per-player aggregates.

The whole point of this module is that it never holds more than one match of
deliveries in memory. A full men's international corpus is ~10 million balls;
building a dataframe of that on a laptop is unpleasant, whereas a single
streaming pass with counters finishes in a couple of minutes.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from .config import ALL_FORMATS, format_key
from .metrics.player import BattingInnings, BowlingInnings, PlayerFormat
from .sources.cricsheet import NOT_DISMISSALS
from .styles import family as style_family
from .venues import TEAM_HOME

log = logging.getLogger(__name__)

# How far into their own innings a batter is still "new at the crease".
NEW_BATTER_BALLS = 15
SET_BATTER_BALLS = 40


def entry_phase(balls_faced: int) -> str:
    if balls_faced < NEW_BATTER_BALLS:
        return "new"
    if balls_faced < SET_BATTER_BALLS:
        return "settling"
    return "set"


class Aggregator:
    """Accumulates one formatKey's worth of matches (one format, one gender)."""

    def __init__(self, fmt: str, styles: dict[str, str] | None = None,
                 hands: dict[str, str] | None = None, gender: str = "male"):
        self.fmt = fmt
        self.gender = gender
        self.format_key = format_key(fmt, gender)
        self.spec = ALL_FORMATS[fmt]
        # person id -> bowling type key / batting hand, supplied by enrichment.
        self.styles = styles or {}
        self.hands = hands or {}
        # Keyed by Cricsheet person id, never by name: names are not unique
        # (two different "Rashid Khan"s play T20Is).
        self.players: dict[str, PlayerFormat] = {}
        # person id -> (date, name) of their latest match, for display
        self.names: dict[str, tuple[str, str]] = {}
        self.team_of: dict[str, set[str]] = defaultdict(set)
        self.matches = 0
        self.deliveries = 0
        self.first_date = ""
        self.last_date = ""
        self.venues: set[str] = set()
        self.unknown_styles: set[str] = set()

    # ------------------------------------------------------------------
    def player(self, person_id: str, name: str = "") -> PlayerFormat:
        record = self.players.get(person_id)
        if record is None:
            record = PlayerFormat(player_id=person_id, name=name, fmt=self.fmt)
            self.players[person_id] = record
        return record

    def name_of(self, person_id: str) -> str:
        return self.names.get(person_id, ("", person_id))[1]

    def _home_flag(self, team: str, country: str) -> str:
        if not country:
            return ""
        home = TEAM_HOME.get(team)
        if home is None:
            return ""
        return "home" if country in home else "away"

    # ------------------------------------------------------------------
    def add_match(self, match, deliveries: list) -> None:
        if not deliveries:
            return
        self.matches += 1
        self.deliveries += len(deliveries)
        if match.date:
            if not self.first_date or match.date < self.first_date:
                self.first_date = match.date
            if match.date > self.last_date:
                self.last_date = match.date
        for team, squad in match.players.items():
            for name in squad:
                pid = match.registry.get(name) or f"~{name}"
                self.team_of[pid].add(team)
                self.player(pid, name).matches += 1
        if match.venue_key:
            self.venues.add(match.venue_key)

        year = (match.date or "")[:4]

        # --- per-innings state -------------------------------------------
        # batting position is the order in which batters arrive at the crease
        order: dict[tuple[int, str], int] = {}
        next_position: dict[int, int] = defaultdict(lambda: 1)
        bat_innings: dict[tuple[int, str], BattingInnings] = {}
        bowl_innings: dict[tuple[int, str], BowlingInnings] = {}
        balls_faced: dict[tuple[int, str], int] = defaultdict(int)
        # maiden tracking: (innings, bowler, over) -> runs conceded
        over_runs: dict[tuple[int, str, int], int] = defaultdict(int)
        over_balls: dict[tuple[int, str, int], int] = defaultdict(int)

        for d in deliveries:
            self._add_delivery(d, match, year, order, next_position,
                               bat_innings, bowl_innings, balls_faced,
                               over_runs, over_balls)

        # --- close out innings -------------------------------------------
        maidens: dict[tuple[int, str], int] = defaultdict(int)
        for (inn_no, bowler, _over), runs in over_runs.items():
            if runs == 0 and over_balls[(inn_no, bowler, _over)] >= 6:
                maidens[(inn_no, bowler)] += 1

        for key, inn in bat_innings.items():
            self.player(key[1]).add_batting_innings(inn)
        for key, inn in bowl_innings.items():
            inn.maidens = maidens.get(key, 0)
            self.player(key[1]).add_bowling_innings(inn)

        # A player's display name is the one in their latest match.
        for name, pid in match.registry.items():
            if pid in self.players and match.date >= self.names.get(pid, ("",))[0]:
                self.names[pid] = (match.date, name)

    # ------------------------------------------------------------------
    def _batting_innings(self, d, person_id: str, name: str, order, next_position,
                         bat_innings) -> BattingInnings:
        """The innings of a batter at the crease (or dismissed) on this ball,
        opened on their first appearance - facing, at the non-striker's end,
        or out without facing (timed out) - which fixes their position."""
        key = (d.innings, person_id)
        inn = bat_innings.get(key)
        if inn is None:
            order[key] = next_position[d.innings]
            next_position[d.innings] += 1
            inn = BattingInnings(
                match_id=d.match_id, date=d.date, opposition=d.bowling_team,
                venue=d.venue, country=d.country, position=order[key],
                innings_no=d.innings, chasing=d.chasing, team=d.batting_team)
            bat_innings[key] = inn
            player = self.player(person_id, name)
            player.teams.add(d.batting_team)
        elif not inn.out and inn.dismissal in NOT_DISMISSALS:
            # Back at the crease after retiring hurt: the retirement no
            # longer describes how the innings ended.
            inn.dismissal = ""
        return inn

    def _add_delivery(self, d, match, year, order, next_position,
                      bat_innings, bowl_innings, balls_faced,
                      over_runs, over_balls) -> None:
        bat_key = (d.innings, d.batter_id)
        bowl_key = (d.innings, d.bowler_id)

        # Both batters at the crease have an innings, in order of arrival,
        # including one who is not out without ever facing a ball.
        inn = self._batting_innings(d, d.batter_id, d.batter, order, next_position, bat_innings)
        if d.non_striker_id:
            self._batting_innings(d, d.non_striker_id, d.non_striker, order, next_position,
                                  bat_innings)
        position = order[bat_key]

        bowler_type = self.styles.get(d.bowler_id, "")
        if not bowler_type and d.bowler_id:
            self.unknown_styles.add(d.bowler_id)
        bowler_family = style_family(bowler_type)
        batter_hand = self.hands.get(d.batter_id, "")

        bat_home = self._home_flag(d.batting_team, d.country)
        bowl_home = self._home_flag(d.bowling_team, d.country)

        # Retiring hurt (or not out) is not a dismissal: the batter is not out.
        striker_out = d.dismissal_of(d.batter_id)
        out_here = striker_out is not None
        credited = d.credited_wicket
        wicket_credited = credited is not None

        # --- batter ------------------------------------------------------
        batter = self.player(d.batter_id, d.batter)
        batter.add_batting_ball(
            d, bowler_type=bowler_type, bowler_family=bowler_family,
            home=bat_home, position=position, year=year, out=out_here)
        batter.add_entry_phase(entry_phase(balls_faced[bat_key]),
                               d.runs_batter, d.is_batter_ball, out_here, d.is_dot)
        if d.is_batter_ball:
            balls_faced[bat_key] += 1
        if out_here and bowler_type:
            batter.dismissed_by_type[bowler_type] += 1

        inn.runs += d.runs_batter
        if d.is_batter_ball:
            inn.balls += 1
        if d.runs_batter == 4:
            inn.fours += 1
        elif d.runs_batter == 6:
            inn.sixes += 1

        # --- every wicket on the ball ------------------------------------
        # A batter dismissed without facing it - run out at the other end,
        # timed out - is out all the same and counts against their average.
        # We record it in the overall figures and the innings log, but
        # deliberately keep it out of the per-ball splits: being run out
        # backing up says nothing about how the batter plays leg spin.
        for w in d.wickets:
            if not w.player_out_id:
                continue
            winn = self._batting_innings(d, w.player_out_id, w.player_out, order,
                                         next_position, bat_innings)
            if not w.is_dismissal:
                if not winn.out:
                    winn.dismissal = w.kind      # "retired hurt": shown, not out
                continue
            winn.out = True
            winn.dismissal = w.kind
            winn.dismissed_by = d.bowler if w.bowler_credited else ""
            winn.dismissed_by_id = d.bowler_id if w.bowler_credited else ""
            if w.player_out_id != d.batter_id:
                self.player(w.player_out_id, w.player_out).bat_overall.outs += 1

        # --- bowler ------------------------------------------------------
        if d.bowler_id:
            bowler = self.player(d.bowler_id, d.bowler)
            bowler.teams.add(d.bowling_team)
            bowler.add_bowling_ball(d, batter_hand=batter_hand, home=bowl_home,
                                    year=year, wicket=wicket_credited)
            binn = bowl_innings.get(bowl_key)
            if binn is None:
                binn = BowlingInnings(
                    match_id=d.match_id, date=d.date, opposition=d.batting_team,
                    venue=d.venue, country=d.country, team=d.bowling_team)
                bowl_innings[bowl_key] = binn
            conceded = d.runs_batter + d.wides + d.noballs
            binn.runs += conceded
            if d.is_legal:
                binn.balls += 1
                over_balls[(d.innings, d.bowler_id, d.over)] += 1
            binn.wickets += 1 if wicket_credited else 0
            over_runs[(d.innings, d.bowler_id, d.over)] += conceded

    # ------------------------------------------------------------------
    def finalise(self) -> None:
        """Settle each player's display name (their latest) and their teams."""
        for pid, record in self.players.items():
            record.name = self.name_of(pid) if pid in self.names else record.name
            record.teams |= self.team_of.get(pid, set())

    def summary(self) -> dict:
        return {
            "formatKey": self.format_key,
            "format": self.fmt,
            "gender": self.gender,
            "matches": self.matches,
            "deliveries": self.deliveries,
            "players": len(self.players),
            "venues": len(self.venues),
            "bowlersMissingStyle": len(self.unknown_styles),
            "firstDate": self.first_date,
            "lastDate": self.last_date,
        }
