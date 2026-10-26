"""Where a match was played (review finding 1).

A substring scan over ground names put Shere Bangla National Stadium (Dhaka)
and Bermuda's National Stadium in Pakistan, because "National Stadium" is
Karachi's ground. Countries now come from one function, by exact ground and
city.
"""
from __future__ import annotations

import collections
import unittest

from pipeline.sources.cricsheet import archive_path, iter_raw, parse_match
from pipeline.venues import (CITY_COUNTRY, GROUND_CITY_COUNTRY, VENUE_COUNTRY, VenueIndex,
                             canonical_venue, country_for, normalise_city)
from tests.fixtures import simple_t20

# (venue, city) as Cricsheet records them, with the country they are in.
REAL = [
    ("Shere Bangla National Stadium, Mirpur", "Dhaka", "Bangladesh"),
    ("Shere Bangla National Stadium", "Mirpur", "Bangladesh"),
    ("Bangabandhu National Stadium, Dhaka", "Dhaka", "Bangladesh"),
    ("National Stadium, Karachi", "Karachi", "Pakistan"),
    ("National Stadium", "Karachi", "Pakistan"),
    ("National Stadium, Hamilton", "Hamilton", "Bermuda"),
    ("Bermuda National Stadium", "Hamilton", "Bermuda"),
    ("White Hill Field, Sandys Parish", "Hamilton", "Bermuda"),
    ("Seddon Park, Hamilton", "Hamilton", "New Zealand"),
    ("Westpac Park, Hamilton", "Hamilton", "New Zealand"),
    ("Sophia Gardens, Cardiff", "Cardiff", "Wales"),
    ("Eden Gardens, Kolkata", "Kolkata", "India"),
    ("Kensington Oval, Bridgetown", "Barbados", "West Indies"),
    ("Bready Cricket Club, Magheramason", "Londonderry", "Ireland"),
]


class CountryTests(unittest.TestCase):
    def test_real_grounds(self):
        for venue, city, country in REAL:
            self.assertEqual(country_for(venue, city), country, venue)

    def test_venue_keys_carry_their_city(self):
        self.assertEqual(country_for("National Stadium|Karachi", None), "Pakistan")
        self.assertEqual(country_for("National Stadium|Hamilton", None), "Bermuda")

    def test_unknown_stays_unknown(self):
        self.assertEqual(country_for("Some Field", "Nowhere"), "")

    def test_a_ground_has_one_country_whatever_the_match_says(self):
        index = VenueIndex()
        for venue, city in (("Warner Park", "Basseterre"), ("Warner Park", "St Kitts"),
                            ("Sylhet International Cricket Stadium", "Sylhet"),
                            ("Sylhet International Cricket Stadium", None)):
            index.add(venue, city)
        self.assertEqual(index.country("Warner Park", "St Kitts"), "West Indies")
        self.assertEqual(index.country("Sylhet International Cricket Stadium", None),
                         "Bangladesh")
        self.assertEqual(index.country("Unknown Oval", None), "")

    def test_parsed_matches_use_the_same_function(self):
        raw = simple_t20()
        raw["info"].update(venue="Shere Bangla National Stadium, Mirpur", city="Dhaka")
        match, deliveries = parse_match(raw, "m1", "t20i")
        self.assertEqual((match.country, deliveries[0].country), ("Bangladesh", "Bangladesh"))

    def test_lookup_tables_agree_with_the_cities(self):
        """A ground's country must be its city's country, unless the pair is
        declared in GROUND_CITY_COUNTRY because the city name is ambiguous."""
        for venue, city, _country in REAL:
            ground = canonical_venue(venue)
            normal = normalise_city(ground, city)
            if ground in VENUE_COUNTRY and normal in CITY_COUNTRY \
                    and (ground, normal) not in GROUND_CITY_COUNTRY:
                self.assertEqual(VENUE_COUNTRY[ground], CITY_COUNTRY[normal], venue)


@unittest.skipUnless(all(archive_path(f).exists() for f in ("test", "odi", "t20i")),
                     "needs the Cricsheet archives (python -m pipeline fetch)")
class CorpusCountryTests(unittest.TestCase):
    """Every ground in the real archives is put in its city's country."""

    def test_every_real_venue_matches_its_city(self):
        pairs = collections.Counter()
        index = VenueIndex()
        for fmt in ("test", "odi", "t20i"):
            for _mid, raw in iter_raw(fmt, gender=None):
                info = raw["info"]
                pairs[(info.get("venue", ""), info.get("city") or "")] += 1
                index.add(info.get("venue", ""), info.get("city"))
        problems = []
        for (venue, city), n in pairs.items():
            ground = canonical_venue(venue)
            normal = normalise_city(ground, city)
            country = country_for(venue, city)
            if normal in CITY_COUNTRY and (ground, normal) not in GROUND_CITY_COUNTRY \
                    and country != CITY_COUNTRY[normal]:
                problems.append((venue, city, n, country, CITY_COUNTRY[normal]))
            # The VenueKey gives the same answer as the raw venue and city.
            if country_for(index.key(venue, city), city) != country:
                problems.append((venue, city, n, "key", index.key(venue, city)))
        self.assertEqual(problems, [])
        # And every ground has one country, whatever each match says.
        by_key = collections.defaultdict(set)
        for (venue, city) in pairs:
            by_key[index.key(venue, city)].add(index.country(venue, city))
        self.assertEqual({k: v for k, v in by_key.items() if len(v) > 1}, {})


if __name__ == "__main__":
    unittest.main()
