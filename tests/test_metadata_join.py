"""Player metadata attaches to the right person or to nobody (audit item 3).

data/player_styles.csv has no Cricsheet ids, so it was joined by name, and
men's players took women's metadata: "SR Taylor" (USA) got Stafanie Taylor's
name, ESPNcricinfo id and off spin. A row now applies by id (its own
cricsheet_id, or its ESPNcricinfo id through Cricsheet's people register),
or by name only when the name is unique, on one row, and the row's country
is a team the player played for.
"""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline import enrich
from pipeline.corpus import Corpus
from pipeline.sources.cricsheet import load_register
from tests.fixtures import relabel, simple_t20, write_archive

HEADER = "name,cricsheet_id,bowling_type,batting_hand,country,full_name,cricinfo_id,source\n"


def corpus_of(*matches) -> Corpus:
    corpus = Corpus()
    for i, raw in enumerate(matches):
        corpus.add("t20i", str(i), raw)
    return corpus


def usa_match(name="SR Taylor", pid="aaaa0001"):
    """``name`` bowls for the United States of America."""
    return relabel(simple_t20(), players={"A Zampa": (name, pid)},
                   teams={"Australia": "United States of America"})


class MetadataJoinTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.saved = enrich.GENERATED, enrich.CURATED
        enrich.GENERATED = self.dir / "generated.csv"
        enrich.CURATED = self.dir / "curated.csv"
        enrich.CURATED.write_text(HEADER)

    def tearDown(self):
        enrich.GENERATED, enrich.CURATED = self.saved
        shutil.rmtree(self.dir, ignore_errors=True)

    def resolve(self, rows: str, *matches, register=None):
        enrich.GENERATED.write_text(HEADER + rows)
        return enrich.resolve(corpus_of(*matches), register=register)

    def test_another_countrys_player_of_the_same_name_gets_nothing(self):
        resolved, stats = self.resolve(
            "SR Taylor,,ob,left,West Indies,Stafanie Roxann Taylor,53906,player-meta\n",
            usa_match())
        self.assertNotIn("aaaa0001", resolved)
        self.assertEqual((stats["rejected"], stats["rejectedCountryMismatch"]), (1, 1))

    def test_a_name_on_two_rows_matches_nobody(self):
        """Hassan Nawaz has two rows; the last one used to win."""
        resolved, stats = self.resolve(
            "Hassan Nawaz,,rm,right,United States of America,Hassan Nawaz,1,player-meta\n"
            "Hassan Nawaz,,ob,right,United States of America,Hassan Nawaz,2,player-meta\n",
            usa_match("Hassan Nawaz"))
        self.assertNotIn("aaaa0001", resolved)
        self.assertEqual(stats["rejectedDuplicateRows"], 1)

    def test_unique_name_and_matching_country(self):
        resolved, stats = self.resolve(
            "SR Taylor,,rfm,right,United States of America,Steven Taylor,9,player-meta\n",
            usa_match())
        self.assertEqual(resolved["aaaa0001"]["bowlingType"], "rfm")
        self.assertEqual(resolved["aaaa0001"]["fullName"], "Steven Taylor")
        self.assertEqual((stats["resolvedByName"], stats["rejected"]), (1, 0))

    def test_country_aliases(self):
        self.assertTrue(enrich.country_matches("Jamaica", {"West Indies"}))
        self.assertTrue(enrich.country_matches("Wales", {"England"}))
        self.assertTrue(enrich.country_matches("USA", {"United States of America"}))
        self.assertFalse(enrich.country_matches("West Indies", {"United States of America"}))
        self.assertFalse(enrich.country_matches("", {"India"}))
        self.assertFalse(enrich.country_matches("Afghanistan", {"ICC World XI"}))

    def test_a_row_without_a_country_is_not_trusted_by_name(self):
        resolved, stats = self.resolve("SR Taylor,,rfm,right,,Steven Taylor,9,player-meta\n",
                                       usa_match())
        self.assertNotIn("aaaa0001", resolved)
        self.assertEqual(stats["rejectedCountryMismatch"], 1)

    def test_the_register_joins_by_id(self):
        """Through the register the row reaches its own person, whatever
        the names and countries say."""
        women = relabel(simple_t20(), players={"A Zampa": ("SR Taylor", "bbbb0002")},
                        teams={"Australia": "West Indies"}, gender="female")
        rows = "SR Taylor,,ob,left,West Indies,Stafanie Roxann Taylor,53906,player-meta\n"
        resolved, stats = self.resolve(rows, usa_match(), women,
                                       register={"53906": "bbbb0002"})
        self.assertEqual(resolved["bbbb0002"]["fullName"], "Stafanie Roxann Taylor")
        self.assertNotIn("aaaa0001", resolved)
        self.assertEqual((stats["resolvedById"], stats["resolvedByName"], stats["register"]),
                         (1, 0, True))

    def test_load_register(self):
        path = self.dir / "people.csv"
        path.write_text("identifier,name,unique_name,key_cricinfo,key_cricinfo_2\n"
                        "bbbb0002,SR Taylor,SR Taylor,53906,\n"
                        "cccc0003,X,X,111,222\n"
                        "dddd0004,Y,Y,111,\n")
        self.assertEqual(load_register(path), {"53906": "bbbb0002", "222": "cccc0003"})
        self.assertEqual(load_register(self.dir / "missing.csv"), {})


class ProvenanceTests(unittest.TestCase):
    def test_counts_reach_the_manifest(self):
        from pipeline.build import build_dataset
        tmp = Path(tempfile.mkdtemp())
        saved = enrich.GENERATED, enrich.CURATED
        try:
            enrich.GENERATED = tmp / "generated.csv"
            enrich.CURATED = tmp / "curated.csv"
            enrich.GENERATED.write_text(
                HEADER + "SR Taylor,,ob,left,West Indies,Stafanie Roxann Taylor,53906,pm\n"
                         "MA Starc,,lf,left,Australia,Mitchell Starc,311592,pm\n")
            enrich.CURATED.write_text(HEADER)
            archive = tmp / "t20s_json.zip"
            write_archive(archive, [("1", usa_match()), ("2", simple_t20())])
            build_dataset(tmp / "out", formats=("t20i",), archives={"t20i": archive},
                          sha="local", register={})
            identity = json.loads((tmp / "out" / "manifest.json").read_text())["provenance"]["identity"]
            self.assertEqual((identity["resolvedById"], identity["resolvedByName"],
                              identity["rejected"]), (0, 1, 1))
        finally:
            enrich.GENERATED, enrich.CURATED = saved
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
