"""matches.json rows (ARCHITECTURE.md §1.6), checked against hand-built matches."""
from __future__ import annotations

import copy
import unittest

from pipeline.matches import (build_match_row, first_innings_total, missing_fields,
                              overs_text, result_text)
from tests.fixtures import simple_t20


def outcome(**out) -> dict:
    return {"outcome": out}


class ResultTextTests(unittest.TestCase):
    def test_innings_win(self):
        # Cricsheet: by = {innings: 1, runs: 273}. It used to read "won by 273 runs".
        self.assertEqual(result_text(outcome(winner="South Africa", by={"innings": 1, "runs": 273})),
                         "South Africa won by an innings and 273 runs")
        self.assertEqual(result_text(outcome(winner="India", by={"innings": 1, "runs": 1})),
                         "India won by an innings and 1 run")

    def test_draw(self):
        # It used to be an empty string.
        self.assertEqual(result_text(outcome(result="draw")), "Match drawn")

    def test_runs_and_wickets_with_singulars(self):
        self.assertEqual(result_text(outcome(winner="A", by={"runs": 6})), "A won by 6 runs")
        self.assertEqual(result_text(outcome(winner="A", by={"runs": 1})), "A won by 1 run")
        self.assertEqual(result_text(outcome(winner="B", by={"wickets": 6})), "B won by 6 wickets")
        self.assertEqual(result_text(outcome(winner="B", by={"wickets": 1})), "B won by 1 wicket")

    def test_awarded(self):
        self.assertEqual(result_text(outcome(winner="England", method="Awarded")),
                         "England won (awarded)")

    def test_rain_rule(self):
        self.assertEqual(result_text(outcome(winner="A", by={"runs": 25}, method="D/L")),
                         "A won by 25 runs (D/L method)")

    def test_ties(self):
        self.assertEqual(result_text(outcome(result="tie")), "Match tied")
        self.assertEqual(result_text(outcome(result="tie", eliminator="England")),
                         "Match tied (England won the Super Over)")
        self.assertEqual(result_text(outcome(result="tie", bowl_out="India")),
                         "Match tied (India won the bowl-out)")
        self.assertEqual(result_text(outcome(result="tie", method="D/L")),
                         "Match tied (D/L method)")

    def test_no_result(self):
        self.assertEqual(result_text(outcome(result="no result")), "No result")


def row_for(raw, fmt="t20i"):
    return build_match_row(raw, "m1", fmt, venue_key="Wankhede Stadium", country="India")


class MatchRowTests(unittest.TestCase):
    def test_totals_from_the_deliveries(self):
        row = row_for(simple_t20())
        inn = row["innings"][0]
        # 4+0+1+6+1(wide)+0+0 + 2+1+0+4+0+1
        self.assertEqual((inn["runs"], inn["wickets"], inn["balls"]), (20, 1, 12))
        self.assertEqual(inn["overs"], "2.0")
        self.assertEqual((inn["teamId"], inn["penaltyRuns"], inn["declared"]), ("india-m", 0, False))

    def test_penalty_runs_are_in_the_total(self):
        raw = simple_t20()
        raw["innings"][0]["penalty_runs"] = {"pre": 5}
        raw["innings"].append(copy.deepcopy(raw["innings"][0]))
        raw["innings"][1].update(team="Australia", penalty_runs={"post": 5})
        rows = row_for(raw)["innings"]
        self.assertEqual((rows[0]["runs"], rows[0]["penaltyRuns"]), (25, 5))
        self.assertEqual((rows[1]["runs"], rows[1]["penaltyRuns"]), (25, 5))

    def test_retirements_are_not_wickets_but_every_dismissal_is(self):
        raw = simple_t20()
        ball = raw["innings"][0]["overs"][1]["deliveries"][0]
        ball["wickets"] = [{"player_out": "RG Sharma", "kind": "run out"},
                           {"player_out": "V Kohli", "kind": "retired out"}]
        raw["innings"][0]["overs"][1]["deliveries"][1]["wickets"] = [
            {"player_out": "RG Sharma", "kind": "retired hurt"}]
        self.assertEqual(row_for(raw)["innings"][0]["wickets"], 3)

    def test_super_overs_are_excluded(self):
        raw = simple_t20()
        so = copy.deepcopy(raw["innings"][0])
        so["super_over"] = True
        raw["innings"].append(so)
        self.assertEqual(len(row_for(raw)["innings"]), 1)

    def test_result_and_identity_fields(self):
        raw = simple_t20()
        raw["info"]["player_of_match"] = ["MA Starc"]
        raw["info"]["event"] = {"name": "Cup", "match_number": 3, "group": 2}
        row = row_for(raw)
        self.assertEqual(row["result"]["type"], "win")
        self.assertEqual(row["result"]["winnerId"], "australia-m")
        self.assertEqual(row["playerOfMatch"], [{"id": "p-starc", "name": "MA Starc"}])
        self.assertEqual(row["event"], {"name": "Cup", "stage": None, "matchNumber": 3,
                                        "group": "2"})
        self.assertEqual(row["teams"], [{"id": "india-m", "name": "India"},
                                        {"id": "australia-m", "name": "Australia"}])
        self.assertEqual((row["formatKey"], row["scheduledOvers"], row["hasReplay"]),
                         ("t20i-m", 20, True))

    def test_draw_and_awarded_types(self):
        raw = simple_t20()
        raw["info"]["outcome"] = {"result": "draw"}
        self.assertEqual(row_for(raw, "test")["result"]["type"], "draw")
        raw["info"]["outcome"] = {"winner": "India", "method": "Awarded"}
        result = row_for(raw)["result"]
        self.assertEqual((result["type"], result["method"], result["by"]), ("win", "Awarded", {}))
        raw["info"]["outcome"] = {"result": "tie", "bowl_out": "India"}
        self.assertEqual(row_for(raw)["result"]["eliminator"], "India")

    def test_missing_is_a_list_of_names(self):
        self.assertEqual(missing_fields(["player_of_match", {"powerplays": {"2": ["fielding"]}},
                                        "umpires", {"powerplays": {"1": ["batting"]}}]),
                         ["player_of_match", "powerplays", "umpires"])
        self.assertEqual(missing_fields(None), [])

    def test_overs_text(self):
        self.assertEqual(overs_text(262), "43.4")
        self.assertEqual(overs_text(300), "50.0")


class FirstInningsTests(unittest.TestCase):
    """§1.10: which first innings count towards a ground's average."""

    def row(self, fmt, overs, wickets, balls):
        return {"format": fmt, "scheduledOvers": overs,
                "innings": [{"runs": 250, "wickets": wickets, "balls": balls}]}

    def test_limited_overs_innings_must_run_its_course(self):
        self.assertEqual(first_innings_total(self.row("odi", 50, 10, 200)), 250)   # all out
        self.assertEqual(first_innings_total(self.row("odi", 50, 6, 300)), 250)    # overs used
        self.assertIsNone(first_innings_total(self.row("odi", 50, 6, 200)))        # cut short
        self.assertIsNone(first_innings_total(self.row("odi", 40, 10, 200)))       # shortened match

    def test_every_test_first_innings_counts(self):
        self.assertEqual(first_innings_total(self.row("test", None, 3, 500)), 250)

    def test_no_innings(self):
        self.assertIsNone(first_innings_total({"format": "odi", "scheduledOvers": 50,
                                               "innings": []}))


if __name__ == "__main__":
    unittest.main()
