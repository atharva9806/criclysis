"""Venue and city to country mapping, and the VenueKey that names a ground.

Cricsheet records a venue name and usually a city, but no country. Home/away
splits and "how does this batter travel" questions need one, so we carry a
lookup for the grounds that host international cricket. Anything unmatched is
left blank and simply drops out of the home/away split rather than being
guessed at.
"""
from __future__ import annotations

from collections import Counter, defaultdict

CITY_COUNTRY: dict[str, str] = {
    # India
    "Mumbai": "India", "Delhi": "India", "Kolkata": "India", "Chennai": "India",
    "Bengaluru": "India", "Bangalore": "India", "Hyderabad": "India",
    "Ahmedabad": "India", "Mohali": "India", "Chandigarh": "India",
    "Nagpur": "India", "Pune": "India", "Rajkot": "India", "Indore": "India",
    "Ranchi": "India", "Visakhapatnam": "India", "Dharamsala": "India",
    "Guwahati": "India", "Lucknow": "India", "Kanpur": "India", "Jaipur": "India",
    "Cuttack": "India", "Kochi": "India", "Thiruvananthapuram": "India",
    "Dehradun": "India", "Raipur": "India", "Vadodara": "India", "Jamtha": "India",
    # Australia
    "Melbourne": "Australia", "Sydney": "Australia", "Adelaide": "Australia",
    "Perth": "Australia", "Brisbane": "Australia", "Hobart": "Australia",
    "Canberra": "Australia", "Geelong": "Australia", "Cairns": "Australia",
    "Townsville": "Australia", "Darwin": "Australia", "Launceston": "Australia",
    "Alice Springs": "Australia",
    # England
    "London": "England", "Manchester": "England", "Birmingham": "England",
    "Leeds": "England", "Nottingham": "England", "Southampton": "England",
    "Cardiff": "England", "Bristol": "England", "Chester-le-Street": "England",
    "Durham": "England", "Taunton": "England", "Hove": "England",
    "Chelmsford": "England", "Northampton": "England", "Leicester": "England",
    "Derby": "England", "Worcester": "England", "Canterbury": "England",
    # Pakistan / UAE
    "Karachi": "Pakistan", "Lahore": "Pakistan", "Rawalpindi": "Pakistan",
    "Multan": "Pakistan", "Faisalabad": "Pakistan", "Peshawar": "Pakistan",
    "Sialkot": "Pakistan", "Quetta": "Pakistan", "Gujranwala": "Pakistan",
    "Dubai": "United Arab Emirates", "Abu Dhabi": "United Arab Emirates",
    "Sharjah": "United Arab Emirates",
    # South Africa
    "Johannesburg": "South Africa", "Cape Town": "South Africa",
    "Durban": "South Africa", "Centurion": "South Africa",
    "Port Elizabeth": "South Africa", "Gqeberha": "South Africa",
    "Bloemfontein": "South Africa", "Paarl": "South Africa",
    "Potchefstroom": "South Africa", "East London": "South Africa",
    "Kimberley": "South Africa", "Benoni": "South Africa",
    # New Zealand
    "Auckland": "New Zealand", "Wellington": "New Zealand",
    "Christchurch": "New Zealand", "Hamilton": "New Zealand",
    "Napier": "New Zealand", "Dunedin": "New Zealand", "Nelson": "New Zealand",
    "Mount Maunganui": "New Zealand", "Queenstown": "New Zealand",
    "Whangarei": "New Zealand", "Tauranga": "New Zealand", "Lincoln": "New Zealand",
    # West Indies
    "Bridgetown": "West Indies", "Kingston": "West Indies",
    "Port of Spain": "West Indies", "Gros Islet": "West Indies",
    "St George's": "West Indies", "Providence": "West Indies",
    "North Sound": "West Indies", "Basseterre": "West Indies",
    "Kingstown": "West Indies", "Roseau": "West Indies", "Georgetown": "West Indies",
    "Lauderhill": "West Indies", "Tarouba": "West Indies",
    # Sri Lanka
    "Colombo": "Sri Lanka", "Kandy": "Sri Lanka", "Galle": "Sri Lanka",
    "Dambulla": "Sri Lanka", "Pallekele": "Sri Lanka", "Hambantota": "Sri Lanka",
    "Moratuwa": "Sri Lanka", "Katunayake": "Sri Lanka",
    # Bangladesh
    "Dhaka": "Bangladesh", "Chattogram": "Bangladesh", "Chittagong": "Bangladesh",
    "Khulna": "Bangladesh", "Sylhet": "Bangladesh", "Fatullah": "Bangladesh",
    "Bogra": "Bangladesh", "Mirpur": "Bangladesh",
    # Zimbabwe / Ireland / Scotland / Afghanistan / others
    "Harare": "Zimbabwe", "Bulawayo": "Zimbabwe", "Kwekwe": "Zimbabwe",
    "Dublin": "Ireland", "Belfast": "Ireland", "Bready": "Ireland",
    "Malahide": "Ireland", "Edinburgh": "Scotland", "Aberdeen": "Scotland",
    "Glasgow": "Scotland", "Amstelveen": "Netherlands", "Rotterdam": "Netherlands",
    "The Hague": "Netherlands", "Deventer": "Netherlands",
    "Kabul": "Afghanistan", "Greater Noida": "India", "Dehradun ": "India",
    "Windhoek": "Namibia", "Kampala": "Uganda", "Nairobi": "Kenya",
    "Muscat": "Oman", "Al Amerat": "Oman", "Kirtipur": "Nepal",
    "Kathmandu": "Nepal", "Singapore": "Singapore", "Kuala Lumpur": "Malaysia",
    "Hong Kong": "Hong Kong", "Doha": "Qatar", "Al Khobar": "Saudi Arabia",
}

# Venues whose city is absent or ambiguous in the source data.
VENUE_COUNTRY: dict[str, str] = {
    "Lord's": "England",
    "The Rose Bowl": "England",
    "Kennington Oval": "England",
    "Riverside Ground": "England",
    "Sophia Gardens": "Wales",
    "Edgbaston": "England",
    "Trent Bridge": "England",
    "Headingley": "England",
    "Old Trafford": "England",
    "Melbourne Cricket Ground": "Australia",
    "Sydney Cricket Ground": "Australia",
    "Adelaide Oval": "Australia",
    "W.A.C.A. Ground": "Australia",
    "Perth Stadium": "Australia",
    "Brisbane Cricket Ground": "Australia",
    "Bellerive Oval": "Australia",
    "Manuka Oval": "Australia",
    "Eden Gardens": "India",
    "Wankhede Stadium": "India",
    "M Chinnaswamy Stadium": "India",
    "MA Chidambaram Stadium": "India",
    "Feroz Shah Kotla": "India",
    "Arun Jaitley Stadium": "India",
    "Narendra Modi Stadium": "India",
    "Sardar Patel Stadium": "India",
    "Rajiv Gandhi International Stadium": "India",
    "Newlands": "South Africa",
    "The Wanderers Stadium": "South Africa",
    "Kingsmead": "South Africa",
    "SuperSport Park": "South Africa",
    "St George's Park": "South Africa",
    "Eden Park": "New Zealand",
    "Basin Reserve": "New Zealand",
    "Hagley Oval": "New Zealand",
    "Seddon Park": "New Zealand",
    "Bay Oval": "New Zealand",
    "Sharjah Cricket Stadium": "United Arab Emirates",
    "Dubai International Cricket Stadium": "United Arab Emirates",
    "Sheikh Zayed Stadium": "United Arab Emirates",
    "Gaddafi Stadium": "Pakistan",
    "National Stadium": "Pakistan",
    "Rawalpindi Cricket Stadium": "Pakistan",
    "Galle International Stadium": "Sri Lanka",
    "R Premadasa Stadium": "Sri Lanka",
    "Sinhalese Sports Club Ground": "Sri Lanka",
    "Pallekele International Cricket Stadium": "Sri Lanka",
    "Shere Bangla National Stadium": "Bangladesh",
    "Zahur Ahmed Chowdhury Stadium": "Bangladesh",
    "Kensington Oval": "West Indies",
    "Sabina Park": "West Indies",
    "Queen's Park Oval": "West Indies",
    "Darren Sammy National Cricket Stadium": "West Indies",
    "Sir Vivian Richards Stadium": "West Indies",
    "Harare Sports Club": "Zimbabwe",
    "Queens Sports Club": "Zimbabwe",
    "Civil Service Cricket Club": "Ireland",
    "The Village": "Ireland",
}

# Which country each international team calls home, for the home/away split.
TEAM_HOME: dict[str, str] = {
    "India": "India", "Australia": "Australia", "England": "England",
    "Pakistan": "Pakistan", "South Africa": "South Africa",
    "New Zealand": "New Zealand", "Sri Lanka": "Sri Lanka",
    "Bangladesh": "Bangladesh", "West Indies": "West Indies",
    "Afghanistan": "Afghanistan", "Zimbabwe": "Zimbabwe", "Ireland": "Ireland",
    "Scotland": "Scotland", "Netherlands": "Netherlands", "Nepal": "Nepal",
    "Oman": "Oman", "United Arab Emirates": "United Arab Emirates",
    "Namibia": "Namibia", "Kenya": "Kenya", "Canada": "Canada",
    "United States of America": "United States of America",
    "Papua New Guinea": "Papua New Guinea", "Hong Kong": "Hong Kong",
}


def country_for(venue: str, city: str) -> str:
    if venue in VENUE_COUNTRY:
        return VENUE_COUNTRY[venue]
    if city in CITY_COUNTRY:
        return CITY_COUNTRY[city]
    for name, country in VENUE_COUNTRY.items():
        if name in venue:
            return country
    return ""


# ---------------------------------------------------------------------------
# VenueKey (docs/ARCHITECTURE.md §1.10)
# ---------------------------------------------------------------------------
# Cricsheet writes the same ground as "Wankhede Stadium" and "Wankhede Stadium,
# Mumbai", so the part before the first comma names the ground. That alone
# merges distinct grounds that share a name (County Ground in Bristol, Taunton
# and Chelmsford; National Stadium in Karachi and Hamilton), so a name that
# occurs in more than one city gets "|<city>" appended. The city has to be
# normalised first, or one ground recorded under two spellings of its city
# would be split in two.

#: Spelling variants and renamed cities, folded onto one name.
CITY_ALIASES: dict[str, str] = {
    "Bangalore": "Bengaluru",
    "Chittagong": "Chattogram",
    "Port Elizabeth": "Gqeberha",
    "Mirpur": "Dhaka",
    "Dharmasala": "Dharamsala",
    "Pallekele": "Kandy",
}

#: A city recorded loosely for one particular ground: (ground, city) -> city.
VENUE_CITY_ALIASES: dict[tuple[str, str], str] = {
    ("Bready Cricket Club", "Londonderry"): "Bready",
    ("Maple Leaf North-West Ground", "Toronto"): "King City",
}

#: Islands and territories Cricsheet sometimes gives in place of the city
#: ("Kensington Oval, Barbados"). They say nothing about which city a ground
#: is in, so they count as an unknown city: the ground takes the one real city
#: it is recorded under elsewhere, and is never split because of them.
REGIONS: frozenset[str] = frozenset({
    "Antigua", "Barbados", "Dominica", "Grenada", "Guyana", "Jamaica", "Nevis",
    "St Kitts", "St Lucia", "St Vincent", "Tobago", "Trinidad", "Hong Kong",
})


def canonical_venue(name: str) -> str:
    """The ground name: everything before the first comma."""
    return (name or "").split(",")[0].strip()


def normalise_city(ground: str, city: str | None) -> str:
    """The city a ground is in, normalised; '' when unknown or only a region."""
    city = (city or "").strip()
    city = VENUE_CITY_ALIASES.get((ground, city), city)
    city = CITY_ALIASES.get(city, city)
    return "" if city in REGIONS else city


class VenueIndex:
    """VenueKeys for a corpus.

    Whether a ground name needs its city appended depends on every match in
    the corpus, so the index is filled with every (venue, city) first and only
    then asked for keys. Build it over all archives, whatever is being built,
    so that every command agrees on every key.
    """

    def __init__(self) -> None:
        self._cities: dict[str, Counter] = defaultdict(Counter)
        self._raw_cities: dict[str, Counter] = defaultdict(Counter)

    def add(self, venue: str, city: str | None) -> None:
        ground = canonical_venue(venue)
        if not ground:
            return
        normal = normalise_city(ground, city)
        if normal:
            self._cities[ground][normal] += 1
        elif city:
            self._raw_cities[ground][city.strip()] += 1

    def ambiguous(self, ground: str) -> bool:
        return len(self._cities.get(ground, ())) > 1

    def key(self, venue: str, city: str | None) -> str:
        ground = canonical_venue(venue)
        if not self.ambiguous(ground):
            return ground
        normal = normalise_city(ground, city)
        # A match with no usable city at an ambiguous ground keeps the bare
        # name, which no other match of that name uses, rather than being
        # guessed into one of the cities.
        return f"{ground}|{normal}" if normal else ground

    def city(self, key: str) -> str:
        """The city to show for a VenueKey ('' when the data never says)."""
        ground, _, city = key.partition("|")
        if city:
            return city
        # The bare name of an ambiguous ground holds only matches with no
        # usable city, so it must not borrow one of the real cities.
        if not self.ambiguous(ground) and self._cities.get(ground):
            return _most_common(self._cities[ground])
        if self._raw_cities.get(ground):
            return _most_common(self._raw_cities[ground])
        return ""


def _most_common(counts: Counter) -> str:
    """Most frequent entry, ties broken alphabetically so builds are stable."""
    return min(counts, key=lambda c: (-counts[c], c))


class VenueBook:
    """Ground context for ``venues.json``, per VenueKey and formatKey."""

    def __init__(self, index: VenueIndex) -> None:
        self.index = index
        self.stats: dict[str, dict[str, dict]] = {}
        self.countries: dict[str, Counter] = defaultdict(Counter)

    def add(self, row: dict) -> None:
        """Add one matches.json row."""
        from .matches import first_innings_total

        key = row["venueKey"]
        if not key:
            return
        s = self.stats.setdefault(key, {}).setdefault(row["formatKey"], {
            "matches": 0, "runs": 0, "balls": 0, "wickets": 0, "firstN": 0, "firstRuns": 0})
        s["matches"] += 1
        for inn in row["innings"]:
            s["runs"] += inn["runs"] - inn["penaltyRuns"]
            s["balls"] += inn["balls"]
            s["wickets"] += inn["wickets"]
        total = first_innings_total(row)
        if total is not None:
            s["firstN"] += 1
            s["firstRuns"] += total
        if row["country"]:
            self.countries[key][row["country"]] += 1

    def first_innings(self, key: str, fk: str) -> dict:
        s = self.stats.get(key, {}).get(fk)
        if not s or not s["firstN"]:
            return {"n": 0, "avg": None}
        return {"n": s["firstN"], "avg": round(s["firstRuns"] / s["firstN"], 1)}

    def country(self, key: str) -> str:
        counts = self.countries.get(key)
        return _most_common(counts) if counts else ""

    def to_json(self, format_keys: list[str]) -> dict:
        order = {fk: i for i, fk in enumerate(format_keys)}
        venues = {}
        for key in sorted(self.stats):
            formats = {}
            for fk in sorted(self.stats[key], key=lambda f: order.get(f, len(order))):
                s = self.stats[key][fk]
                balls = s["balls"]
                formats[fk] = {
                    "matches": s["matches"],
                    "runsPerOver": round(6.0 * s["runs"] / balls, 2) if balls else 0.0,
                    "ballsPerWicket": round(balls / s["wickets"], 1) if s["wickets"] else None,
                    "firstInnings": self.first_innings(key, fk),
                }
            venues[key] = {"key": key, "name": canonical_venue(key.partition("|")[0]),
                           "city": self.index.city(key), "country": self.country(key),
                           "formats": formats}
        return {"venues": venues}
