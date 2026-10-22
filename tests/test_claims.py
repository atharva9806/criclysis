"""Claims compare like with like and say what was ranked (audit items 4, 5)."""
from __future__ import annotations

import re
import unittest

from pipeline.aggregate import Aggregator
from pipeline.analyze import Cohort, Dimension, _baseline, _claim_text, analyse_player
from pipeline.sources.cricsheet import parse_match
from tests.test_dismissals import PEOPLE, ball, match


def test_match(innings_balls):
    """A Test with one innings per list in ``innings_balls``."""
    raw = match(innings_balls[0])
    raw["innings"] = []
    for i, balls in enumerate(innings_balls):
        overs = [{"over": j // 6, "deliveries": balls[j:j + 6]} for j in range(0, len(balls), 6)]
        raw["innings"].append({"team": "Home" if i % 2 == 0 else "Away", "overs": overs})
    raw["info"].pop("overs")
    raw["info"]["outcome"] = {"result": "draw"}
    return raw


class TestChaseTests(unittest.TestCase):
    """No Test innings has a target, so the old 'Batting first' split covered
    every ball of a Test career and its claims compared a record with itself."""

    def setUp(self):
        home = [ball("A", "B", 1), ball("B", "A", 2)]
        away = [ball("X", "Y", 1, bowler="C"), ball("Y", "X", 0, bowler="C")]
        self.raw = test_match([home, away, home, away])

    def test_only_the_fourth_innings_chases(self):
        _m, deliveries = parse_match(self.raw, "t1", "test")
        self.assertEqual({d.innings: d.chasing for d in deliveries},
                         {1: False, 2: False, 3: False, 4: True})

    def test_limited_overs_chase_comes_from_the_target(self):
        raw = match([ball("A", "B", 1)])
        raw["innings"].append({"team": "Away", "target": {"runs": 2, "overs": 20},
                               "overs": [{"over": 0, "deliveries": [ball("X", "Y", 2, bowler="C")]}]})
        _m, deliveries = parse_match(raw, "m1", "t20i")
        self.assertEqual([d.chasing for d in deliveries], [False, True])

    def test_tests_have_no_chase_split(self):
        agg = Aggregator("test")
        agg.add_match(*parse_match(self.raw, "t1", "test"))
        x = agg.players[PEOPLE["X"]]
        self.assertEqual(dict(x.bat_by_chase), {})
        # The innings log still marks the fourth innings as the chase.
        self.assertEqual([(i.innings_no, i.chasing) for i in x.bat_innings], [(2, False), (4, True)])
        t20 = Aggregator("t20i")
        t20.add_match(*parse_match(match([ball("A", "B", 1)]), "m1", "t20i"))
        self.assertEqual(set(t20.players[PEOPLE["A"]].bat_by_chase), {"setting"})


class LikeForLikeBaselineTests(unittest.TestCase):
    """A split only holds dismissals that happened while facing, so the
    baseline it is compared with must be counted the same way."""

    def test_baseline_excludes_dismissals_at_the_other_end(self):
        agg = Aggregator("t20i")
        agg.add_match(*parse_match(match([
            ball("A", "B", 4), ball("A", "B", 0, ("caught", "A")),
            ball("C", "B", 6), ball("C", "B", 0, ("run out", "B")),   # B out backing up
            ball("C", "D", 10)]), "m1", "t20i"))
        c = agg.players[PEOPLE["C"]]
        b = agg.players[PEOPLE["B"]]
        self.assertEqual((b.bat_overall.outs, b.bat_per_ball.outs), (1, 0))
        dim = Dimension("phase_avg", "Match phase", "bat_by_phase", "batting", "average",
                        "average", True)
        # C: 16 runs, never out -> no average either way.
        self.assertIsNone(_baseline(c, dim))
        a = agg.players[PEOPLE["A"]]
        self.assertEqual(_baseline(a, dim), 4.0)
        # Splits and the per-ball baseline count the same dismissals.
        for record in agg.players.values():
            self.assertEqual(sum(s.outs for s in record.bat_by_phase.values()),
                             record.bat_per_ball.outs)


class ClaimTextTests(unittest.TestCase):
    def test_text_reports_the_change_that_was_ranked(self):
        dim = Dimension("phase_avg", "Match phase", "bat_by_phase", "batting", "average",
                        "average", True)
        text = _claim_text(dim, "Death (16-20)", 34.1, 58.5, 0.8, -0.08, 120, "batting")
        self.assertEqual(
            text, "Death (16-20): average of 34.1, 24.4 below their average of 58.5 on all "
                  "balls faced (-42%) — allowing for sample size, that change is in the bottom "
                  "1% of comparable players (their median change: -8%) — 120 balls faced.")

    def test_lower_is_better_metrics(self):
        dim = Dimension("phase", "Match phase", "bowl_by_phase", "bowling", "economy",
                        "economy", False)
        text = _claim_text(dim, "Death (41-50)", 7.1, 5.9, 4.2, 0.12, 400, "bowling")
        self.assertIn("1.20 above their economy of 5.90 on all balls bowled (+20%)", text)
        self.assertIn("bottom 4%", text)
        self.assertIn("400 balls bowled", text)

    def test_claims_on_a_simulated_corpus_are_consistent(self):
        """Every claim's numbers agree with its text and with each other."""
        from tests.test_pipeline import build_corpus
        agg, _roster = build_corpus(matches=140)
        cohort = Cohort("t20i", agg.players)
        seen = 0
        for record in agg.players.values():
            result = analyse_player(record, cohort, "t20i")
            for claim in result["strengths"] + result["weaknesses"]:
                seen += 1
                if claim["discipline"] == "batting":
                    per_ball = record.bat_per_ball
                    expected = {"average": per_ball.average, "strike_rate": per_ball.strike_rate,
                                "balls_per_dismissal": per_ball.balls_per_dismissal}[claim["metric"]]
                    self.assertAlmostEqual(claim["baseline"], round(expected, 2), places=6)
                change = re.search(r"\(([+-]\d+)%\) —", claim["text"])
                self.assertIsNotNone(change, claim["text"])
                sign = (claim["value"] > claim["baseline"]) - (claim["value"] < claim["baseline"])
                self.assertEqual(sign, (int(change.group(1)) > 0) - (int(change.group(1)) < 0),
                                 claim["text"])
                self.assertNotIn("cohort median", claim["text"])
        self.assertGreater(seen, 0)


if __name__ == "__main__":
    unittest.main()
