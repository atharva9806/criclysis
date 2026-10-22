"""Who is out, who batted, and every wicket on a ball (audit items 1, 2, 7).

Hand-built deliveries with answers worked out on paper:

* retiring hurt or retiring not out is not a dismissal;
* a ball can carry two wickets, and both count (and the bowler gets the one
  that is theirs);
* a batter who is not out without facing a ball still batted;
* batting position is the order of arrival at the crease.
"""
from __future__ import annotations

import unittest

from pipeline.aggregate import Aggregator
from pipeline.export import _career_milestones
from pipeline.matches import build_match_row
from pipeline.metrics.player import BattingInnings
from pipeline.sources.cricsheet import parse_match

PEOPLE = {"A": "a0000001", "B": "b0000002", "C": "c0000003", "D": "d0000004",
          "X": "e0000005", "Y": "f0000006"}


def ball(batter, non_striker, runs=0, *wickets, bowler="X", extras=None):
    """One delivery; ``wickets`` are (kind, player out) pairs."""
    d = {"batter": batter, "non_striker": non_striker, "bowler": bowler,
         "runs": {"batter": runs, "extras": sum((extras or {}).values()),
                  "total": runs + sum((extras or {}).values())}}
    if extras:
        d["extras"] = extras
    if wickets:
        d["wickets"] = [{"kind": k, "player_out": p} for k, p in wickets]
    return d


def match(balls, fmt="t20i"):
    overs = [{"over": i // 6, "deliveries": balls[i:i + 6]} for i in range(0, len(balls), 6)]
    return {"info": {"dates": ["2024-01-01"], "gender": "male", "teams": ["Home", "Away"],
                     "venue": "Ground", "city": "Town", "overs": 20,
                     "outcome": {"winner": "Away", "by": {"runs": 1}},
                     "players": {"Home": ["A", "B", "C", "D"], "Away": ["X", "Y"]},
                     "registry": {"people": dict(PEOPLE)}},
            "innings": [{"team": "Home", "overs": overs}]}


def aggregate(raw, fmt="t20i") -> Aggregator:
    agg = Aggregator(fmt)
    agg.add_match(*parse_match(raw, "m1", fmt))
    agg.finalise()
    return agg


def innings_of(agg, name) -> BattingInnings:
    (inn,) = agg.players[PEOPLE[name]].bat_innings
    return inn


class RetirementTests(unittest.TestCase):
    def test_retired_hurt_is_not_out(self):
        agg = aggregate(match([ball("A", "B", 4), ball("A", "B", 6),
                               ball("A", "B", 0, ("retired hurt", "A")),
                               ball("C", "B", 1)]))
        a = agg.players[PEOPLE["A"]]
        inn = innings_of(agg, "A")
        self.assertEqual((inn.runs, inn.out, inn.dismissal), (10, False, "retired hurt"))
        self.assertEqual(a.bat_overall.outs, 0)
        self.assertEqual(a.bat_overall.to_dict()["avg"], None)
        self.assertEqual(sum(s.outs for s in a.bat_by_phase.values()), 0)
        self.assertEqual(dict(a.dismissals), {})
        self.assertEqual(agg.players[PEOPLE["X"]].bowl_overall.wickets, 0)
        self.assertTrue(_career_milestones(a.bat_innings)["highestNotOut"])
        row = build_match_row(match([ball("A", "B", 0, ("retired hurt", "A"))]), "m1", "t20i",
                              venue_key="Ground", country="")
        self.assertEqual(row["innings"][0]["wickets"], 0)

    def test_retired_not_out_is_not_out(self):
        agg = aggregate(match([ball("A", "B", 2, ("retired not out", "A"))]))
        self.assertFalse(innings_of(agg, "A").out)
        self.assertEqual(agg.players[PEOPLE["A"]].bat_overall.outs, 0)

    def test_returning_after_retiring_hurt(self):
        caught = aggregate(match([ball("A", "B", 1, ("retired hurt", "A")), ball("C", "B", 0),
                                  ball("A", "B", 4), ball("A", "B", 0, ("caught", "A"))]))
        inn = innings_of(caught, "A")
        self.assertEqual((inn.runs, inn.out, inn.dismissal, inn.dismissed_by_id),
                         (5, True, "caught", PEOPLE["X"]))
        self.assertEqual(caught.players[PEOPLE["A"]].bat_overall.outs, 1)
        not_out = aggregate(match([ball("A", "B", 1, ("retired hurt", "A")), ball("C", "B", 0),
                                   ball("A", "B", 4)]))
        inn = innings_of(not_out, "A")
        self.assertEqual((inn.out, inn.dismissal), (False, ""))

    def test_retired_out_is_a_dismissal_but_not_the_bowlers(self):
        agg = aggregate(match([ball("A", "B", 3, ("retired out", "A"))]))
        self.assertTrue(innings_of(agg, "A").out)
        self.assertEqual(agg.players[PEOPLE["A"]].bat_overall.outs, 1)
        self.assertEqual(agg.players[PEOPLE["X"]].bowl_overall.wickets, 0)

    def test_non_striker_retiring_hurt(self):
        agg = aggregate(match([ball("A", "B", 1), ball("B", "A", 0, ("retired hurt", "A"))]))
        inn = innings_of(agg, "A")
        self.assertEqual((inn.out, inn.dismissal), (False, "retired hurt"))
        self.assertEqual(agg.players[PEOPLE["A"]].bat_overall.outs, 0)


class TwoWicketsOnABallTests(unittest.TestCase):
    def test_caught_and_timed_out(self):
        """1384429: Samarawickrama caught, Mathews timed out, on one ball."""
        agg = aggregate(match([ball("A", "B", 0, ("caught", "A"), ("timed out", "C")),
                               ball("D", "B", 1)]))
        a, c = innings_of(agg, "A"), innings_of(agg, "C")
        self.assertEqual((a.out, a.dismissal, a.dismissed_by_id), (True, "caught", PEOPLE["X"]))
        self.assertEqual((c.out, c.dismissal, c.balls, c.dismissed_by_id),
                         (True, "timed out", 0, ""))
        self.assertEqual(agg.players[PEOPLE["C"]].bat_overall.outs, 1)
        self.assertEqual((a.position, c.position, innings_of(agg, "D").position), (1, 3, 4))
        bowler = agg.players[PEOPLE["X"]]
        self.assertEqual((bowler.bowl_overall.wickets, dict(bowler.wicket_kinds)),
                         (1, {"caught": 1}))

    def test_bowler_gets_the_stumping_after_a_retirement(self):
        """1534056: R Mazumder retired out, then AA Senn stumped, one ball."""
        agg = aggregate(match([ball("A", "B", 0, ("retired out", "B"), ("stumped", "A"))]))
        self.assertTrue(innings_of(agg, "A").out)
        self.assertTrue(innings_of(agg, "B").out)
        bowler = agg.players[PEOPLE["X"]]
        self.assertEqual((bowler.bowl_overall.wickets, dict(bowler.wicket_kinds)),
                         (1, {"stumped": 1}))
        self.assertEqual(bowler.bowl_innings[0].wickets, 1)
        self.assertEqual(innings_of(agg, "A").dismissed_by_id, PEOPLE["X"])

    def test_bowled_and_run_out_at_the_other_end(self):
        """1535418: A Turay bowled, EM Turay run out at the non-striker's end."""
        agg = aggregate(match([ball("A", "B", 0, ("bowled", "A"), ("run out", "B"))]))
        b = agg.players[PEOPLE["B"]]
        self.assertTrue(innings_of(agg, "B").out)
        self.assertEqual(b.bat_overall.outs, 1)
        # Not facing the ball, the run out stays out of the per-ball splits.
        self.assertEqual(sum(s.outs for s in b.bat_by_phase.values()), 0)
        self.assertEqual(agg.players[PEOPLE["X"]].bowl_overall.wickets, 1)

    def test_run_out_and_retired_out(self):
        """1459387: I Danladi run out, Selim Salau retired out, one ball."""
        agg = aggregate(match([ball("A", "B", 1, ("run out", "B"), ("retired out", "A"))]))
        self.assertTrue(innings_of(agg, "A").out)
        self.assertTrue(innings_of(agg, "B").out)
        self.assertEqual(agg.players[PEOPLE["A"]].bat_overall.outs, 1)
        self.assertEqual(agg.players[PEOPLE["B"]].bat_overall.outs, 1)
        self.assertEqual(agg.players[PEOPLE["X"]].bowl_overall.wickets, 0)

    def test_every_wicket_reaches_the_team_total(self):
        row = build_match_row(match([ball("A", "B", 0, ("bowled", "A"), ("run out", "B"))]),
                              "m1", "t20i", venue_key="Ground", country="")
        self.assertEqual(row["innings"][0]["wickets"], 2)


class InningsCountTests(unittest.TestCase):
    def test_not_out_without_facing_is_an_innings(self):
        agg = aggregate(match([ball("A", "B", 1), ball("A", "B", 0, ("bowled", "A")),
                               ball("C", "B", 0)]))
        b = agg.players[PEOPLE["B"]]
        inn = innings_of(agg, "B")
        self.assertEqual((inn.runs, inn.balls, inn.out), (0, 0, False))
        self.assertEqual(b.bat_overall.innings, 1)
        self.assertEqual(_career_milestones(b.bat_innings)["notOuts"], 1)

    def test_position_is_the_order_of_arrival(self):
        # B opens at the non-striker's end and never faces; A is out and C
        # faces next. B batted at 2, C at 3.
        agg = aggregate(match([ball("A", "B", 0), ball("A", "B", 0, ("bowled", "A")),
                               ball("C", "B", 2)]))
        self.assertEqual([innings_of(agg, n).position for n in "ABC"], [1, 2, 3])


class HighestScoreTests(unittest.TestCase):
    def test_a_tied_highest_is_shown_not_out(self):
        out = BattingInnings("m1", "2024-01-01", "X", "G", "C", runs=50, out=True)
        not_out = BattingInnings("m2", "2024-02-01", "X", "G", "C", runs=50, out=False)
        for order in ([out, not_out], [not_out, out]):
            m = _career_milestones(order)
            self.assertEqual((m["highest"], m["highestNotOut"]), (50, True))
        self.assertFalse(_career_milestones([out])["highestNotOut"])


if __name__ == "__main__":
    unittest.main()
