"""Players are people, keyed by Cricsheet person id, never by name.

The real data has 41 names shared by different players (A Mishra plays for
India and for Ghana; three different Rashid Khans play T20Is). Keyed by name,
their careers merge and the wrong bowling style is applied to some of them.
"""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline import enrich
from pipeline.aggregate import Aggregator
from pipeline.build import Builder
from pipeline.corpus import Corpus
from pipeline.fingerprint import fingerprint
from pipeline.sources.cricsheet import parse_match
from tests.contract import validate_dir
from tests.fixtures import HEX_IDS, relabel, same_name_pair, simple_t20


def corpus_of(matches) -> Corpus:
    corpus = Corpus()
    for match_id, raw in matches:
        corpus.add("t20i", match_id, raw)
    return corpus


class SameNameTests(unittest.TestCase):
    def test_aggregator_keeps_two_people_apart(self):
        agg = Aggregator("t20i")
        for match_id, raw in same_name_pair():
            match, deliveries = parse_match(raw, match_id, "t20i")
            agg.add_match(match, deliveries)
        agg.finalise()
        first, second = agg.players["aaaa0001"], agg.players["bbbb0002"]
        self.assertEqual((first.name, second.name), ("A Mishra", "A Mishra"))
        self.assertEqual(first.teams, {"Australia"})
        self.assertEqual(second.teams, {"Ghana"})
        self.assertEqual(first.bowl_overall.balls, 6)
        self.assertEqual(second.bowl_overall.balls, 6)
        # The batter's head-to-heads are two contests, not one.
        kohli = agg.players["ba607b88"]
        self.assertEqual(kohli.vs_bowler["aaaa0001"].balls, 4)
        self.assertEqual(kohli.vs_bowler["bbbb0002"].balls, 4)

    def test_export_writes_two_players_with_their_own_records(self):
        matches = same_name_pair(copies=50)
        builder = Builder(corpus_of(matches))
        for match_id, raw in matches:
            builder.add("t20i", match_id, raw)
        out = Path(tempfile.mkdtemp())
        try:
            builder.write(out, metadata={}, provenance={
                "sources": [], "enrichment": {}, "dataset": "demo",
                "identity": {"ambiguousNames": 1, "stylesSkippedAmbiguous": 0}},
                fingerprint_payload=fingerprint({}), generated="2023-01-01T00:00:00+00:00",
                build_id="2023-01-01T00:00:00+00:00-local")
            index = json.loads((out / "players.json").read_text())["players"]
            mishras = {r["id"]: r for r in index if r["name"] == "A Mishra"}
            self.assertEqual(set(mishras), {"aaaa0001", "bbbb0002"})
            self.assertEqual(mishras["aaaa0001"]["teams"], ["Australia"])
            self.assertEqual(mishras["bbbb0002"]["teams"], ["Ghana"])
            self.assertNotEqual(mishras["aaaa0001"]["slug"], mishras["bbbb0002"]["slug"])
            for row in mishras.values():
                self.assertEqual(row["formats"]["t20i"]["bowl"]["balls"], 300)

            kohli = json.loads((out / "players" / "v-kohli-ba607b88.json").read_text())
            vs = kohli["formats"]["t20i"]["batting"]["vsBowler"]
            self.assertEqual(vs["aaaa0001"]["name"], "A Mishra")
            self.assertEqual(vs["bbbb0002"]["name"], "A Mishra")
            self.assertEqual(vs["aaaa0001"]["balls"], 200)
            self.assertEqual(validate_dir(out, replays=False, winprob=False), [])
        finally:
            shutil.rmtree(out, ignore_errors=True)

    def test_dismissal_names_the_bowler_by_id(self):
        raw = relabel(simple_t20(), players={"MA Starc": ("MA Starc", "3fb19989")})
        match, deliveries = parse_match(raw, "m1", "t20i")
        agg = Aggregator("t20i")
        agg.add_match(match, deliveries)
        inn = agg.players["p-kohli"].bat_innings[0]
        self.assertEqual((inn.dismissed_by, inn.dismissed_by_id), ("MA Starc", "3fb19989"))
        self.assertEqual(inn.to_dict()["byId"], "3fb19989")

    def test_display_name_is_the_latest(self):
        old = relabel(simple_t20(), date="2020-01-01")
        new = relabel(simple_t20(), players={"V Kohli": ("Virat Kohli", "p-kohli")},
                      date="2024-01-01")
        agg = Aggregator("t20i")
        for match_id, raw in (("m2", new), ("m1", old)):
            agg.add_match(*parse_match(raw, match_id, "t20i"))
        agg.finalise()
        self.assertEqual(agg.players["p-kohli"].name, "Virat Kohli")


class CorpusTests(unittest.TestCase):
    def test_ambiguous_names_count_players_not_officials(self):
        raw = relabel(simple_t20(), players=HEX_IDS)
        # An umpire who shares a player's name (K Mensah plays for Ghana in
        # same_name_pair) is no risk: umpires never bat or bowl.
        raw["info"]["registry"]["people"]["K Mensah"] = "ffff0006"
        raw["info"]["officials"] = {"umpires": ["K Mensah"]}
        corpus = corpus_of([("1", raw)] + same_name_pair())
        self.assertEqual(set(corpus.ambiguous_names()), {"A Mishra"})

    def test_duplicate_match_ids_are_refused(self):
        corpus = Corpus()
        corpus.add("odi", "1", simple_t20())
        with self.assertRaises(ValueError):
            corpus.add("t20i", "1", simple_t20())


class StyleResolutionTests(unittest.TestCase):
    """Metadata applies by id, or by name only when the name is unique."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.saved = enrich.GENERATED, enrich.CURATED
        enrich.GENERATED = self.dir / "generated.csv"
        enrich.CURATED = self.dir / "curated.csv"
        enrich.CURATED.write_text("name,bowling_type,batting_hand,source\n")

    def tearDown(self):
        enrich.GENERATED, enrich.CURATED = self.saved
        shutil.rmtree(self.dir, ignore_errors=True)

    def resolve(self, rows: str, matches):
        enrich.GENERATED.write_text(
            "# a comment line\nname,cricsheet_id,bowling_type,batting_hand,country,source\n" + rows)
        return enrich.resolve(corpus_of(matches))

    def test_unique_name_gets_its_style(self):
        resolved, stats = self.resolve("MA Starc,,lf,left,Australia,player-meta\n",
                                       [("1", relabel(simple_t20(), players=dict(
                                           {"MA Starc": ("MA Starc", "3fb19989")})))])
        self.assertEqual(resolved["3fb19989"]["bowlingType"], "lf")
        self.assertEqual(stats["resolvedByName"], 1)

    def test_ambiguous_name_gets_no_style_and_is_counted(self):
        resolved, stats = self.resolve("A Mishra,,lb,right,India,player-meta\n",
                                       same_name_pair())
        self.assertNotIn("aaaa0001", resolved)
        self.assertNotIn("bbbb0002", resolved)
        self.assertEqual(stats["skippedAmbiguous"], 2)

    def test_a_row_pinned_to_an_id_applies_to_that_person_only(self):
        resolved, stats = self.resolve("A Mishra,bbbb0002,ob,right,Ghana,player-meta\n"
                                       "A Mishra,aaaa0001,lb,right,India,player-meta\n",
                                       same_name_pair())
        self.assertEqual(resolved["aaaa0001"]["bowlingType"], "lb")
        self.assertEqual(resolved["bbbb0002"]["bowlingType"], "ob")
        self.assertEqual(stats["resolvedById"], 2)
        self.assertEqual(stats["skippedAmbiguous"], 0)

    def test_womens_players_are_resolved_too(self):
        """Styles come from a corpus of both genders, so a women's bowler who
        never plays a men's match still gets hers."""
        women = relabel(simple_t20(), players={"A Zampa": ("S Ecclestone", "eeee0005")},
                        gender="female")
        resolved, _stats = self.resolve("S Ecclestone,,sla,right,England,player-meta\n",
                                        [("w1", women)])
        self.assertEqual(resolved["eeee0005"]["bowlingType"], "sla")

    def test_curated_row_wins_over_generated(self):
        enrich.CURATED.write_text("name,bowling_type,batting_hand,source\n"
                                  "MA Starc,lfm,left,curated\n")
        resolved, _ = self.resolve("MA Starc,,lf,left,Australia,player-meta\n",
                                   [("1", simple_t20())])
        self.assertEqual(resolved["p-starc"]["bowlingType"], "lfm")


if __name__ == "__main__":
    unittest.main()
