"""Team analysis (ARCHITECTURE.md §1.7 and the definitions in §1.10)."""
from __future__ import annotations

import unittest

from pipeline.build import Builder
from pipeline.corpus import Corpus
from pipeline.teams import finish_record, new_record
from pipeline.venues import venue_type
from tests.fixtures import relabel, simple_t20


def match(outcome: dict, *, date: str, venue="Wankhede Stadium", city="Mumbai",
          toss=("Australia", "field")) -> dict:
    raw = relabel(simple_t20(), date=date)
    raw["info"].update(outcome=outcome, venue=venue, city=city,
                       toss={"winner": toss[0], "decision": toss[1]})
    return raw


def build(matches) -> dict:
    corpus = Corpus()
    for i, raw in enumerate(matches):
        corpus.add("t20i", str(i), raw)
    builder = Builder(corpus)
    for i, raw in enumerate(matches):
        builder.add("t20i", str(i), raw)
    for agg in builder.aggregators.values():
        agg.finalise()
    _index, files = builder.teams.files(builder.aggregators, {}, builder.venues)
    return files


class RecordTests(unittest.TestCase):
    def test_win_pct_counts_ties_and_draws_but_not_no_results(self):
        record = {**new_record(), "matches": 6, "won": 2, "lost": 1, "tied": 1, "drawn": 0,
                  "noResult": 2}
        self.assertEqual(finish_record(record)["winPct"], 50.0)
        self.assertIsNone(finish_record({**new_record(), "matches": 1, "noResult": 1})["winPct"])


class VenueTypeTests(unittest.TestCase):
    def test_home_away_neutral(self):
        self.assertEqual(venue_type("India", "Australia", "India"), "home")
        self.assertEqual(venue_type("Australia", "India", "India"), "away")
        self.assertEqual(venue_type("India", "Australia", "United Arab Emirates"), "neutral")

    def test_a_home_can_span_countries(self):
        self.assertEqual(venue_type("England", "India", "Wales"), "home")
        self.assertEqual(venue_type("India", "England", "Wales"), "away")

    def test_never_guessed(self):
        self.assertEqual(venue_type("India", "Australia", ""), "unknown")
        self.assertEqual(venue_type("Vanuatu", "Fiji", "Vanuatu"), "unknown")
        # Outside India and the opponent's home unknown: away or neutral?
        self.assertEqual(venue_type("India", "Vanuatu", "England"), "unknown")


class TeamFileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = build([
            match({"winner": "Australia", "by": {"wickets": 8}}, date="2023-01-01"),
            match({"winner": "India", "by": {"runs": 5}}, date="2023-02-01",
                  toss=("India", "bat")),
            match({"result": "tie", "eliminator": "India"}, date="2024-03-01",
                  venue="Melbourne Cricket Ground", city="Melbourne"),
            match({"result": "no result"}, date="2024-04-01",
                  venue="Dubai International Cricket Stadium", city="Dubai"),
        ])
        cls.india = cls.files["india-m"]["formats"]["t20i"]
        cls.australia = cls.files["australia-m"]["formats"]["t20i"]

    def test_record(self):
        self.assertEqual(self.india["record"], {"matches": 4, "won": 1, "lost": 1, "tied": 1,
                                                "drawn": 0, "noResult": 1, "winPct": 33.33})
        self.assertEqual(self.australia["record"]["won"], 1)
        self.assertEqual([y["year"] for y in self.india["byYear"]], ["2023", "2024"])
        self.assertEqual(self.files["india-m"]["label"], "India")

    def test_head_to_head(self):
        h2h = self.india["headToHead"]
        self.assertEqual(len(h2h), 1)
        self.assertEqual((h2h[0]["opponentId"], h2h[0]["matches"], h2h[0]["lastMatchId"],
                          h2h[0]["lastDate"]), ("australia-m", 4, "3", "2024-04-01"))

    def test_venue_type(self):
        vt = self.india["venueType"]
        self.assertEqual((vt["home"]["matches"], vt["away"]["matches"],
                          vt["neutral"]["matches"]), (2, 1, 1))
        self.assertEqual(self.australia["venueType"]["home"]["matches"], 1)

    def test_batting_first_and_chasing(self):
        # India bat first in every fixture match.
        self.assertEqual(self.india["batFirstChase"]["battingFirst"]["matches"], 4)
        self.assertEqual(self.australia["batFirstChase"]["chasing"]["matches"], 4)

    def test_toss(self):
        toss = self.india["toss"]
        self.assertEqual((toss["won"], toss["lost"]), (1, 3))
        self.assertEqual(toss["winPctWonToss"], 100.0)
        self.assertEqual(toss["decisions"]["bat"]["matches"], 1)
        self.assertEqual(self.australia["toss"]["decisions"]["field"]["matches"], 3)

    def test_venues(self):
        venues = {v["venueKey"]: v for v in self.india["venues"]}
        wankhede = venues["Wankhede Stadium"]
        self.assertEqual((wankhede["record"]["matches"], wankhede["city"], wankhede["country"]),
                         (2, "Mumbai", "India"))
        # Two overs out of twenty: no first innings ran its course.
        self.assertEqual(wankhede["firstInnings"], {"n": 0, "avg": None})
        self.assertEqual(wankhede["teamFirstInnings"], {"n": 0, "avg": None})

    def test_phase_totals_include_extras(self):
        (bat,) = self.india["phases"]["batting"]
        # Per match: 20 runs incl. a wide, 12 legal balls, 1 wicket, 5 dots, 2 fours, 1 six.
        self.assertEqual(bat, {"phase": "powerplay", "label": "Powerplay (1-6)", "innings": 4,
                               "balls": 48, "runs": 80, "wickets": 4, "dots": 20,
                               "fours": 8, "sixes": 4})
        (bowl,) = self.australia["phases"]["bowling"]
        self.assertEqual({k: bowl[k] for k in ("balls", "runs", "wickets")},
                         {"balls": 48, "runs": 80, "wickets": 4})
        self.assertEqual(self.india["phases"]["bowling"], [])

    def test_top_players_are_this_teams_only(self):
        batters = self.india["topBatters"]
        self.assertEqual([b["name"] for b in batters], ["V Kohli", "RG Sharma"])
        self.assertEqual((batters[0]["runs"], batters[0]["innings"], batters[0]["outs"],
                          batters[0]["highest"], batters[0]["slug"]), (44, 4, 4, 11, None))
        self.assertEqual(self.india["topBowlers"], [])
        bowlers = self.australia["topBowlers"]
        self.assertEqual(bowlers[0]["name"], "MA Starc")
        self.assertEqual((bowlers[0]["wickets"], bowlers[0]["runsConceded"], bowlers[0]["balls"]),
                         (4, 48, 24))
        self.assertEqual(self.australia["topBatters"], [])

    def test_recent_matches_newest_first(self):
        self.assertEqual(self.india["recentMatchIds"], ["3", "2", "1", "0"])

    def test_womens_team_is_separate(self):
        women = relabel(match({"winner": "India", "by": {"runs": 1}}, date="2024-05-01"),
                        gender="female",
                        players={n: (n + " (W)", f"{i:08x}") for i, n in enumerate(
                            ["RG Sharma", "V Kohli", "MA Starc", "A Zampa"])})
        files = build([match({"winner": "India", "by": {"runs": 1}}, date="2024-05-01"), women])
        self.assertEqual(set(files), {"india-m", "australia-m", "india-w", "australia-w"})
        self.assertEqual(files["india-w"]["label"], "India Women")
        self.assertEqual(files["india-w"]["formats"]["t20i"]["formatKey"], "t20i-w")
        self.assertEqual(files["india-w"]["formats"]["t20i"]["record"]["matches"], 1)


if __name__ == "__main__":
    unittest.main()
