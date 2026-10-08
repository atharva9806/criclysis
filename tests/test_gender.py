"""Men's and women's cricket are built side by side and never mixed.

There is no women's data in the development sandbox, so these tests build
Cricsheet-shaped archives holding both genders (fictional players from the
demo simulator) and run the real build over them.
"""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline.analyze import Cohort
from pipeline.build import build_dataset
from pipeline.cli import build_parser, parse_args
from tests.contract import validate_dir
from tests.fixtures import simulated_matches, write_archive

MEN = simulated_matches("t20i", 80, gender="male", seed=1)
WOMEN = simulated_matches("t20i", 80, gender="female", seed=2, suffix=" (W)")


def women_styles_csv(path: Path) -> None:
    """A styles file for the women only, as a licensed feed might supply."""
    from pipeline.simulate import make_roster
    import random
    rows = ["name,bowling_type,batting_hand,source"]
    for p in make_roster(random.Random(2)):
        rows.append(f"{p.name} (W),{p.bowling_type},{p.batting_hand},test")
    path.write_text("\n".join(rows) + "\n")


class BothGendersBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        archive = cls.tmp / "t20s_json.zip"
        write_archive(archive, MEN + WOMEN)
        styles = cls.tmp / "styles.csv"
        women_styles_csv(styles)
        cls.out = cls.tmp / "out"
        build_dataset(cls.out, formats=("t20i",), genders=("male", "female"),
                      archives={"t20i": archive}, styles_file=styles, sha="local")
        cls.manifest = json.loads((cls.out / "manifest.json").read_text())
        cls.players = json.loads((cls.out / "players.json").read_text())["players"]
        cls.women_ids = {raw["info"]["registry"]["people"][n]
                         for _m, raw in WOMEN for n in raw["info"]["registry"]["people"]}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_output_conforms_to_the_contract(self):
        self.assertEqual(validate_dir(self.out, replays=False, winprob=False)[:10], [])

    def test_both_format_keys_are_built(self):
        self.assertEqual(set(self.manifest["formats"]), {"t20i-m", "t20i-w"})
        self.assertEqual(self.manifest["formats"]["t20i-w"]["gender"], "female")
        self.assertEqual(self.manifest["formats"]["t20i-w"]["matches"], 80)

    def test_every_player_has_the_gender_of_their_matches(self):
        for row in self.players:
            expected = "female" if row["id"] in self.women_ids else "male"
            self.assertEqual(row["gender"], expected, row["name"])
            self.assertTrue(all(t.endswith("-w" if expected == "female" else "-m")
                                for t in row["teamIds"]))
        self.assertTrue(any(r["gender"] == "female" for r in self.players))

    def test_cohorts_never_mix_genders(self):
        cohorts = json.loads((self.out / "cohorts.json").read_text())
        self.assertEqual(set(cohorts), {"t20i-m", "t20i-w"})
        for fk, gender in (("t20i-m", "male"), ("t20i-w", "female")):
            qualified = [r for r in self.players if r["gender"] == gender
                         and r["formats"].get("t20i", {}).get("bat", {}).get("balls", 0) >= 600
                         and r["formats"]["t20i"]["bat"]["avg"] is not None]
            self.assertGreaterEqual(len(qualified), 8)
            self.assertEqual(cohorts[fk]["batting.average"]["n"], len(qualified), fk)

    def test_claims_are_judged_against_the_players_own_gender(self):
        for row in self.players:
            if row["gender"] != "female":
                continue
            payload = json.loads((self.out / "players" / f"{row['slug']}.json").read_text())
            fp = payload["formats"]["t20i"]
            self.assertEqual((fp["formatKey"], fp["gender"]), ("t20i-w", "female"))

    def test_women_get_bowling_styles_and_type_splits(self):
        """A women-only bowler resolves her style, so batters facing her get
        bowling-type splits (the bug D found: names came from men's matches only)."""
        women = [r for r in self.players if r["gender"] == "female"]
        self.assertTrue(any(r["bowlingType"] for r in women))
        with_type_splits = 0
        for row in women:
            payload = json.loads((self.out / "players" / f"{row['slug']}.json").read_text())
            if payload["formats"]["t20i"].get("batting", {}).get("byType"):
                with_type_splits += 1
        self.assertGreater(with_type_splits, 0)

    def test_matches_and_teams_carry_the_gender(self):
        rows = json.loads((self.out / "matches.json").read_text())["matches"]
        self.assertEqual({r["formatKey"] for r in rows}, {"t20i-m", "t20i-w"})
        for r in rows:
            g = "w" if r["gender"] == "female" else "m"
            self.assertTrue(all(t["id"].endswith(f"-{g}") for t in r["teams"]))
        teams = json.loads((self.out / "teams" / "index.json").read_text())["teams"]
        labels = {t["id"]: t["label"] for t in teams}
        self.assertEqual(labels["northern-republic-w"], "Northern Republic Women")
        self.assertEqual(labels["northern-republic-m"], "Northern Republic")


class OneGenderBuild(unittest.TestCase):
    def test_genders_filter(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            archive = tmp / "t20s_json.zip"
            write_archive(archive, MEN[:6] + WOMEN[:6])
            build_dataset(tmp / "out", formats=("t20i",), genders=("female",),
                          archives={"t20i": archive}, sha="local")
            manifest = json.loads((tmp / "out" / "manifest.json").read_text())
            self.assertEqual(set(manifest["formats"]), {"t20i-w"})
            self.assertEqual(manifest["matchCount"], 6)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class CohortUnitTests(unittest.TestCase):
    def test_a_cohort_only_holds_its_own_aggregator(self):
        from pipeline.aggregate import Aggregator
        from pipeline.sources.cricsheet import parse_match
        aggs = {g: Aggregator("t20i", gender=g) for g in ("male", "female")}
        for match_id, raw in MEN + WOMEN:
            agg = aggs[raw["info"]["gender"]]
            agg.add_match(*parse_match(raw, match_id, "t20i"))
        cohort = Cohort("t20i", aggs["female"].players)
        self.assertTrue(cohort.bat_pool)
        women_ids = {pid for _m, raw in WOMEN for pid in raw["info"]["registry"]["people"].values()}
        self.assertTrue(all(r.player_id in women_ids for r in cohort.bat_pool + cohort.bowl_pool))


class CliTests(unittest.TestCase):
    def test_genders_option(self):
        args = build_parser().parse_args(["build", "--genders", "male", "female"])
        self.assertEqual(args.genders, ["male", "female"])
        self.assertEqual(build_parser().parse_args(["winprob"]).formats, ["odi", "t20i"])
        args = build_parser().parse_args(["replays", "--genders", "female"])
        self.assertEqual(args.genders, ["female"])

    def test_old_gender_option_still_works(self):
        self.assertEqual(parse_args(["build", "--gender", "female"]).genders, ["female"])
        self.assertEqual(parse_args(["build", "--gender", "any"]).genders, ["male", "female"])
        self.assertEqual(parse_args(["build"]).genders, ["male", "female"])


if __name__ == "__main__":
    unittest.main()
