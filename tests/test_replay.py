"""Replays (ARCHITECTURE.md §1.9): every match, gzipped, plus the featured index."""
from __future__ import annotations

import gzip
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline.replay import (FEATURED, ball_extras, ball_wickets, bowling_figures, build_replay,
                             export_replays, featured_ranks, replay_items, replay_states,
                             team_wickets, verify_replays)
from tests.contract import BALL, REPLAY, REPLAY_INDEX, check, replay_totals
from tests.fixtures import relabel, simple_t20, simulated_matches, write_archive


def final(name: str) -> dict:
    return {"name": name, "stage": "Final"}


class FeaturedRuleTests(unittest.TestCase):
    def test_curated_first_then_finals_newest_first(self):
        curated = [mid for _fmt, mid in FEATURED]
        matches = [
            ("9001", "2018-03-08", final("ICC Women's World Cup")),
            ("9002", "2024-06-01", final("ICC Men's T20 World Cup")),
            ("9003", "2025-01-01", {"name": "ICC Men's T20 World Cup", "stage": "Semi Final"}),
            ("9004", "2025-02-01", final("Some Tri-Series")),
            ("9005", "2025-03-09", final("ICC Champions Trophy")),
            (curated[1], "2019-07-14", final("World Cup")),
            (curated[0], "2023-11-19", final("ICC Cricket World Cup")),
        ]
        ranks = featured_ranks(matches)
        self.assertEqual(sorted(ranks, key=ranks.get),
                         [curated[0], curated[1], "9005", "9002", "9001"])
        self.assertEqual(ranks[curated[0]], 1)

    def test_qualifier_and_regional_finals_are_not_featured(self):
        matches = [
            ("9101", "2024-08-28", final("ICC Men's T20 World Cup Sub Regional Europe Qualifier")),
            ("9102", "2025-10-04", final("ICC Men's T20 World Cup Africa Region Final")),
            ("9103", "2023-07-09", final("ICC Cricket World Cup Qualifier")),
            ("9104", "2025-07-26", final("Asia Pacific Cricket Champions Trophy")),
            ("9105", "2026-03-08", final("ICC Men's T20 World Cup")),
            ("9106", "2025-10-05", final("ICC Women's Cricket World Cup")),
        ]
        ranks = featured_ranks(matches)
        self.assertEqual(sorted(ranks, key=ranks.get), ["9105", "9106"])

    def test_nothing_featured(self):
        self.assertEqual(featured_ranks([("1", "2020-01-01", {})]), {})


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        raw = simple_t20()
        raw["info"]["event"] = final("ICC Men's T20 World Cup")
        raw["innings"][0]["penalty_runs"] = {"post": 5}
        raw["innings"][0]["target"] = {"runs": 150, "overs": 20}
        self.items = [("t20i", "1415755", raw),
                      ("t20i", "2", relabel(simple_t20(), gender="female"))]

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def export(self, out: Path):
        return export_replays(self.items, out, venue_key=lambda venue, city: f"{venue}|x",
                              styles={"p-starc": "lf"}, hands={"p-kohli": "right"})

    def test_files_conform_and_are_deterministic(self):
        index = self.export(self.dir)
        first = (self.dir / "replays" / "1415755.json.gz").read_bytes()
        again = Path(tempfile.mkdtemp())
        try:
            self.export(again)
            self.assertEqual(first, (again / "replays" / "1415755.json.gz").read_bytes())
        finally:
            shutil.rmtree(again, ignore_errors=True)
        self.assertEqual(check(REPLAY_INDEX, index, "index"), [])
        self.assertEqual([r["id"] for r in index], ["1415755"])
        for mid in ("1415755", "2"):
            replay = json.loads(gzip.decompress(
                (self.dir / "replays" / f"{mid}.json.gz").read_bytes()))
            self.assertEqual([e for e in check(REPLAY, replay, mid) if "id:" not in e], [])
        on_disk = json.loads((self.dir / "replays" / "index.json").read_text())
        self.assertEqual(on_disk, index)

    def test_v2_fields(self):
        self.export(self.dir)
        replay = json.loads(gzip.decompress(
            (self.dir / "replays" / "1415755.json.gz").read_bytes()))
        self.assertEqual((replay["schemaVersion"], replay["formatKey"], replay["gender"]),
                         (2, "t20i-m", "male"))
        self.assertEqual(replay["venueKey"], "Wankhede Stadium|x")
        self.assertEqual((replay["scheduledOvers"], replay["method"]), (20, None))
        inn = replay["innings"][0]
        self.assertEqual(inn["penaltyRuns"], {"pre": 0, "post": 5})
        self.assertEqual((inn["target"], inn["targetOvers"]), (150, 20))
        people = {p["name"]: p for p in replay["people"]}
        self.assertEqual(people["MA Starc"]["bt"], "lf")
        self.assertEqual(people["V Kohli"]["bh"], "right")
        self.assertNotIn("bt", people["A Zampa"])
        # 20 runs off the balls plus 5 penalty runs, as matches.json counts them.
        self.assertEqual(replay_totals(replay), [(25, 1, 12)])
        women = json.loads(gzip.decompress((self.dir / "replays" / "2.json.gz").read_bytes()))
        self.assertEqual(women["formatKey"], "t20i-w")

    def test_toss_keeps_only_winner_and_decision(self):
        raw = simple_t20()
        raw["info"]["toss"]["uncontested"] = True
        self.assertEqual(build_replay(raw, "1", "t20i")["toss"],
                         {"winner": "Australia", "decision": "field"})


class ReplayItemsTests(unittest.TestCase):
    def test_all_or_featured(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            featured = simple_t20()
            featured["info"]["event"] = final("ICC Women's T20 World Cup")
            featured["info"]["gender"] = "female"
            archive = tmp / "t20s_json.zip"
            write_archive(archive, [("1", simple_t20()), ("2", featured),
                                    ("3", relabel(simple_t20(), gender="female"))])
            items = lambda **kw: [mid for _f, mid, _r in replay_items(
                ["t20i"], ("male", "female"), archives={"t20i": archive}, **kw)]
            self.assertEqual(items(all_matches=True), ["1", "2", "3"])
            self.assertEqual(items(), ["2"])
            only_men = [mid for _f, mid, _r in replay_items(
                ["t20i"], ("male",), all_matches=True, archives={"t20i": archive})]
            self.assertEqual(only_men, ["1"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def delivery(extras: dict | None = None, bat: int = 0, wickets: list | None = None) -> dict:
    """A delivery from Starc to Rohit, Kohli at the other end."""
    extras = extras or {}
    out = {"batter": "RG Sharma", "bowler": "MA Starc", "non_striker": "V Kohli",
           "runs": {"batter": bat, "extras": sum(extras.values()),
                    "total": bat + sum(extras.values())}}
    if extras:
        out["extras"] = extras
    if wickets:
        out["wickets"] = [{"kind": kind, "player_out": who} for kind, who in wickets]
    return out


class BallEncodingTests(unittest.TestCase):
    """The optional [9] (extras by kind) and [10] (further wickets), §1.9.

    Every case replaces simple_t20's first ball and checks the replay against
    what the rest of the pipeline counts from the same document: the innings
    totals of matches.py and the bowling figures of aggregate.py.
    """

    def replay(self, d: dict) -> tuple[dict, list, dict[str, int]]:
        raw = simple_t20()
        raw["info"]["players"]["India"].append("HH Pandya")
        raw["info"]["registry"]["people"]["HH Pandya"] = "p-pandya"
        raw["innings"][0]["overs"][0]["deliveries"][0] = d
        replay = build_replay(raw, "1", "t20i")
        ball = replay["innings"][0]["balls"][0]
        self.assertEqual(check(BALL, ball, "ball"), [])
        self.assertEqual([e for e in check(REPLAY, replay, "r") if "id:" not in e], [])
        # The totals matches.json records, and the bowling figures of the
        # player files, both computed from the Cricsheet document.
        from pipeline.aggregate import Aggregator
        from pipeline.matches import innings_rows
        from pipeline.sources.cricsheet import parse_match
        self.assertEqual(replay_totals(replay),
                         [(i["runs"], i["wickets"], i["balls"]) for i in innings_rows(raw, "male")])
        agg = Aggregator("t20i")
        agg.add_match(*parse_match(raw, "1", "t20i"))
        want = {pid: [(i.balls, i.runs, i.wickets, i.maidens) for i in rec.bowl_innings]
                for pid, rec in agg.players.items() if rec.bowl_innings}
        got = {replay["people"][b]["id"]: [tuple(f)] for _n, _t, b, f in bowling_figures(replay)}
        self.assertEqual(got, want)
        return replay, ball, {p["name"]: i for i, p in enumerate(replay["people"])}

    def starc_runs(self, replay: dict) -> int:
        return next(f[1] for _n, _t, b, f in bowling_figures(replay)
                    if replay["people"][b]["name"] == "MA Starc")

    def test_no_ball_with_byes(self):
        replay, ball, who = self.replay(delivery({"noballs": 1, "byes": 4}))
        self.assertEqual(ball, [0, who["RG Sharma"], who["MA Starc"], who["V Kohli"], 0, 5,
                                "noballs", None, None, {"noballs": 1, "byes": 4}])
        self.assertEqual(ball_extras(ball),
                         {"wides": 0, "noballs": 1, "byes": 4, "legbyes": 0, "penalty": 0})
        # simple_t20's first over cost Starc 12; the four off the bat become
        # four byes, which are not his, plus the no-ball, which is.
        self.assertEqual(self.starc_runs(replay), 12 - 4 + 1)

    def test_no_ball_with_leg_byes(self):
        replay, ball, _who = self.replay(delivery({"noballs": 1, "legbyes": 2}))
        self.assertEqual(ball[5:], [3, "noballs", None, None, {"noballs": 1, "legbyes": 2}])
        self.assertEqual(self.starc_runs(replay), 12 - 4 + 1)

    def test_no_ball_off_the_bat_stays_nine_long(self):
        replay, ball, _who = self.replay(delivery({"noballs": 1}, bat=4))
        self.assertEqual(ball[4:], [4, 1, "noballs", None, None])
        self.assertEqual(self.starc_runs(replay), 12 + 1)

    def test_wide_with_extra_runs(self):
        # Cricsheet records a wide that runs away for four as five wides.
        replay, ball, _who = self.replay(delivery({"wides": 5}))
        self.assertEqual(ball[4:], [0, 5, "wides", None, None])
        self.assertEqual(ball_extras(ball)["wides"], 5)
        self.assertEqual(self.starc_runs(replay), 12 - 4 + 5)
        self.assertEqual(replay_totals(replay)[0][2], 12 - 1)   # one fewer legal ball

    def test_penalty_runs(self):
        replay, ball, _who = self.replay(delivery({"penalty": 5}))
        self.assertEqual(ball[4:], [0, 5, "penalty", None, None, {"penalty": 5}])
        self.assertEqual(self.starc_runs(replay), 12 - 4)
        replay, ball, _who = self.replay(delivery({"noballs": 1, "penalty": 5}, bat=2))
        self.assertEqual(ball[4:], [2, 6, "noballs", None, None, {"noballs": 1, "penalty": 5}])
        self.assertEqual(ball_extras(ball)["penalty"], 5)
        self.assertEqual(self.starc_runs(replay), 12 - 4 + 2 + 1)

    def test_two_wickets_on_one_ball(self):
        # Caught, then the next batter timed out (as in 1384429).
        replay, ball, who = self.replay(delivery(wickets=[("caught", "RG Sharma"),
                                                          ("timed out", "HH Pandya")]))
        self.assertEqual(ball[7:], ["caught", who["RG Sharma"], None,
                                    [["timed out", who["HH Pandya"]]]])
        self.assertEqual(ball_wickets(ball),
                         [("caught", who["RG Sharma"]), ("timed out", who["HH Pandya"])])
        self.assertEqual(team_wickets(ball), 2)
        self.assertEqual(replay_totals(replay)[0][1], 1 + 2)
        self.assertEqual(list(replay_states(replay, 120))[0][2], 2)

    def test_extras_and_two_wickets(self):
        replay, ball, who = self.replay(delivery(
            {"noballs": 1, "byes": 1}, wickets=[("run out", "V Kohli"),
                                                ("retired hurt", "RG Sharma")]))
        self.assertEqual(ball[5:], [2, "noballs", "run out", who["V Kohli"],
                                    {"noballs": 1, "byes": 1}, [["retired hurt", who["RG Sharma"]]]])

    def test_a_second_wicket_that_is_a_retirement_costs_nothing(self):
        _replay, ball, who = self.replay(delivery(wickets=[("caught", "RG Sharma"),
                                                           ("retired hurt", "V Kohli")]))
        self.assertEqual(ball[10], [["retired hurt", who["V Kohli"]]])
        self.assertEqual(team_wickets(ball), 1)
        # A retirement first and a dismissal second: the dismissal still counts,
        # and is still the bowler's.
        replay, ball, who = self.replay(delivery(wickets=[("retired not out", "V Kohli"),
                                                          ("caught", "RG Sharma")]))
        self.assertEqual(ball[7:], ["retired not out", who["V Kohli"], None,
                                    [["caught", who["RG Sharma"]]]])
        self.assertEqual(team_wickets(ball), 1)
        self.assertEqual([f[2] for _n, _t, b, f in bowling_figures(replay)
                          if replay["people"][b]["name"] == "MA Starc"], [2])

    def test_old_nine_element_balls_still_decode(self):
        nb = [0, 0, 1, 2, 4, 1, "noballs", None, None]
        out = [0, 0, 1, 2, 0, 0, None, "caught", 0]
        hurt = [0, 0, 1, 2, 0, 0, None, "retired hurt", 0]
        for ball in (nb, out, hurt):
            self.assertEqual(check(BALL, ball, "ball"), [])
        self.assertEqual(ball_extras(nb),
                         {"wides": 0, "noballs": 1, "byes": 0, "legbyes": 0, "penalty": 0})
        self.assertEqual((ball_wickets(nb), ball_wickets(out)), ([], [("caught", 0)]))
        self.assertEqual([team_wickets(b) for b in (nb, out, hurt)], [0, 1, 0])
        replay = {"teams": ["A", "B"],
                  "innings": [{"team": "A", "target": None, "balls": [nb, out, hurt]}]}
        self.assertEqual([s[1:4] for s in replay_states(replay, 120)],
                         [(120, 0, 5), (119, 1, 5), (118, 1, 5)])
        self.assertEqual([f for _n, _t, _b, f in bowling_figures(replay)], [[2, 5, 1, 0]])

    def test_the_contract_rejects_needless_or_malformed_trailing_elements(self):
        base = [0, 0, 1, 2, 0, 5, "noballs", None, None]
        bad = {
            "null [9] with nothing after it": base + [None],
            "[9] that says what [5] and [6] say": [*base[:5], 1, "noballs", None, None,
                                                   {"noballs": 1}],
            "kinds out of order": base + [{"byes": 4, "noballs": 1}],
            "[6] is not the first kind": [*base[:6], "byes", None, None,
                                          {"noballs": 1, "byes": 4}],
            "further wickets without a first": base + [{"noballs": 1, "byes": 4},
                                                       [["caught", 0]]],
            "an empty [10]": [*base[:7], "caught", 0, None, []],
            "twelve elements": [*base[:7], "caught", 0, None, [["run out", 1]], 0],
        }
        for why, ball in bad.items():
            self.assertNotEqual(check(BALL, ball, "ball"), [], why)


def with_tricky_deliveries(matches: list[tuple[str, dict]]) -> list[tuple[str, dict]]:
    """Simulated matches with the deliveries the nine-element ball got wrong:
    extras of two kinds, penalty runs and two wickets on one ball."""
    def plain(inn):
        return [d for o in inn["overs"] for d in o["deliveries"]
                if not d.get("extras") and not d.get("wickets")]

    def set_extras(d, extras, bat=0):
        d["extras"] = extras
        d["runs"] = {"batter": bat, "extras": sum(extras.values()),
                     "total": bat + sum(extras.values())}

    for i, (_mid, raw) in enumerate(matches[:4]):
        inn = raw["innings"][i % 2]
        balls = plain(inn)
        set_extras(balls[0], {"noballs": 1, "byes": 4})
        set_extras(balls[3], {"noballs": 1, "legbyes": 1})
        set_extras(balls[6], {"wides": 3})
        set_extras(balls[9], {"penalty": 5})
        set_extras(balls[12], {"noballs": 1, "penalty": 5}, bat=1)
        # The innings' last ball: the batter caught, and either the other
        # batter retiring hurt or the next one timed out.
        last = [d for o in inn["overs"] for d in o["deliveries"]][-1]
        if i % 2:
            second = ("retired hurt", last["non_striker"])
        else:
            batted = {d[k] for o in inn["overs"] for d in o["deliveries"]
                      for k in ("batter", "non_striker")}
            second = ("timed out",
                      next(n for n in raw["info"]["players"][inn["team"]] if n not in batted))
        last["wickets"] = [{"kind": "caught", "player_out": last["batter"]},
                           {"kind": second[0], "player_out": second[1]}]
    return matches


class VerifyReplaysTests(unittest.TestCase):
    """verify-replays on a real build of simulated, Cricsheet-shaped matches."""

    @classmethod
    def setUpClass(cls):
        from pipeline.build import build_dataset
        cls.tmp = Path(tempfile.mkdtemp())
        cls.matches = with_tricky_deliveries(simulated_matches("t20i", 40))
        archive = cls.tmp / "t20s_json.zip"
        write_archive(archive, cls.matches)
        cls.out = cls.tmp / "out"
        build_dataset(cls.out, formats=("t20i",), genders=("male",),
                      archives={"t20i": archive}, sha="local")
        export_replays((("t20i", mid, raw) for mid, raw in cls.matches), cls.out)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def copy(self) -> Path:
        dest = self.tmp / f"copy-{self._testMethodName}"
        shutil.copytree(self.out, dest)
        return dest

    def rewrite(self, root: Path, mid: str, change) -> None:
        from pipeline.replay import write_replay
        path = root / "replays" / f"{mid}.json.gz"
        replay = json.loads(gzip.decompress(path.read_bytes()))
        change(replay)
        write_replay(root / "replays", replay)

    def test_the_build_agrees_with_itself(self):
        errors, counts = verify_replays(self.out)
        self.assertEqual(errors, [])
        self.assertEqual(counts["replays"], 40)
        self.assertGreater(counts["bowlerInnings"], 100)
        self.assertGreater(counts["teamBowlers"], 10)
        # The tricky deliveries made it into the replays.
        lengths = {len(b) for mid, _raw in self.matches[:4]
                   for inn in json.loads(gzip.decompress(
                       (self.out / "replays" / f"{mid}.json.gz").read_bytes()))["innings"]
                   for b in inn["balls"]}
        self.assertEqual(lengths, {9, 10, 11})

    def test_nine_element_balls_lose_the_byes_and_the_second_wicket(self):
        # What the replay looked like before [9] and [10]: byes and leg byes
        # off a no-ball, and penalty runs with one, fell to the bowler, and
        # the second wicket was lost.
        root = self.copy()
        mid = self.matches[0][0]
        self.rewrite(root, mid, lambda r: [b.__delitem__(slice(9, None))
                                           for inn in r["innings"] for b in inn["balls"]])
        errors, _counts = verify_replays(root)
        self.assertTrue(errors)
        self.assertTrue(any(e.startswith(f"{mid}: innings") and "matches.json" in e
                            for e in errors), errors)
        self.assertTrue(any(e.startswith(f"{mid}: ") and "player file" in e for e in errors),
                        errors)
        self.assertTrue(any(e.startswith("teams/") for e in errors), errors)

    def test_a_missing_replay_and_a_wrong_wicket_are_reported(self):
        root = self.copy()
        gone, changed = self.matches[5][0], self.matches[6][0]
        (root / "replays" / f"{gone}.json.gz").unlink()

        def drop_a_wicket(r):
            b = next(b for inn in r["innings"] for b in inn["balls"]
                     if b[7] in ("caught", "bowled", "lbw", "stumped"))
            b[7] = b[8] = None
        self.rewrite(root, changed, drop_a_wicket)
        errors, counts = verify_replays(root)
        self.assertEqual(counts["replays"], 39)
        self.assertIn(f"{gone}: in matches.json but there is no replays/{gone}.json.gz", errors)
        self.assertTrue(any(e.startswith(f"{changed}: innings") for e in errors), errors)
        self.assertTrue(any(e.startswith(f"{changed}: ") and "player file" in e for e in errors),
                        errors)

    def test_cli_exit_code(self):
        from pipeline.cli import main
        with self.assertLogs("pipeline", level="INFO") as logs:
            self.assertEqual(main(["verify-replays", "--data", str(self.out)]), 0)
        self.assertTrue(any("every replay agrees" in line for line in logs.output))
        root = self.copy()
        (root / "replays" / f"{self.matches[0][0]}.json.gz").unlink()
        with self.assertLogs("pipeline", level="ERROR") as logs:
            self.assertEqual(main(["verify-replays", "--data", str(root), "--max-errors", "1"]), 1)
        self.assertIn("the first 1:", logs.output[0])
        self.assertEqual(len(logs.output), 2)
        self.assertIn("no replays/", logs.output[1])


if __name__ == "__main__":
    unittest.main()


class ReplayStatesTests(unittest.TestCase):
    def test_penalty_runs_before_the_innings_are_on_the_board(self):
        from pipeline.replay import replay_states
        replay = {"innings": [{"target": None, "penaltyRuns": {"pre": 5, "post": 0},
                               "balls": [[0, 0, 1, 2, 1, 0, None, None, None],
                                         [0, 0, 1, 2, 4, 0, None, None, None]]},
                              {"target": 16, "balls": [[0, 2, 3, 0, 6, 0, None, None, None]]}]}
        states = list(replay_states(replay, 120))
        self.assertEqual([s[3] for s in states], [6, 10, 6])
        # Replays written before penaltyRuns existed still work.
        self.assertEqual(states[2][1:4], (119, 0, 6))
