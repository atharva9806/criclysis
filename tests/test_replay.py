"""Replays (ARCHITECTURE.md §1.9): every match, gzipped, plus the featured index."""
from __future__ import annotations

import gzip
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline.replay import (FEATURED, build_replay, export_replays, featured_ranks,
                             replay_items)
from tests.contract import REPLAY, REPLAY_INDEX, check, replay_totals
from tests.fixtures import relabel, simple_t20, write_archive


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


if __name__ == "__main__":
    unittest.main()
