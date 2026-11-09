"""Player photos (pipeline/photos.py), with every HTTP call mocked.

The join is by id only (Cricsheet person id -> ESPNcricinfo id -> Wikidata
item -> Commons file); anything ambiguous is skipped; only CC0, public domain,
CC BY and CC BY-SA files are kept; and an outage falls back to the cache, or
to no photos, without failing the build.
"""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from pipeline import net, photos
from tests.contract import PHOTO, check, validate_dir
from tests.fixtures import simulated_matches, write_archive

NOW = datetime(2026, 11, 9, 4, 30, tzinfo=timezone.utc)
FILE_PATH = "http://commons.wikimedia.org/wiki/Special:FilePath/"
FORMATTER = "https://www.espncricinfo.com/ci/content/player/$1.html"


def sparql(claims: list[tuple[str, str, str | None]], formatter: str = FORMATTER) -> str:
    """A SPARQL JSON answer: the formatter row plus (item, cricinfo id, file) rows."""
    rows = [{"formatter": {"type": "literal", "value": formatter}}]
    for qid, cid, image in claims:
        row = {"item": {"type": "uri", "value": f"http://www.wikidata.org/entity/{qid}"},
               "id": {"type": "literal", "value": cid}}
        if image:
            row["image"] = {"type": "uri", "value": FILE_PATH + urllib.parse.quote(image)}
        rows.append(row)
    return json.dumps({"head": {"vars": ["item", "id", "image", "formatter"]},
                       "results": {"bindings": rows}})


def page(name: str, licence: str, artist: str = "Jane Doe",
         licence_url: str = "https://creativecommons.org/licenses/by-sa/4.0") -> dict:
    slug = urllib.parse.quote(name.replace(" ", "_"))
    meta = {"Artist": {"value": artist}, "LicenseShortName": {"value": licence}}
    if licence_url:
        meta["LicenseUrl"] = {"value": licence_url}
    return {"ns": 6, "title": f"File:{name}", "imageinfo": [{
        "thumburl": f"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/{slug}/480px-{slug}",
        "thumbwidth": 480,
        "url": f"https://upload.wikimedia.org/wikipedia/commons/a/ab/{slug}",
        "descriptionurl": f"https://commons.wikimedia.org/wiki/File:{slug}",
        "extmetadata": meta}]}


class FakeWikimedia:
    """Answers net.get for the two APIs; records every call."""

    def __init__(self, claims, pages, *, wikidata_down=False, commons_down=False):
        self.claims, self.pages = claims, pages
        self.wikidata_down, self.commons_down = wikidata_down, commons_down
        self.calls: list[str] = []

    def __call__(self, url, **kwargs):
        self.calls.append(url)
        headers = kwargs.get("headers") or {}
        assert "github.com/atharva9806/criclysis" in headers.get("User-Agent", ""), headers
        assert kwargs.get("use_cache") is False
        if url.startswith(photos.WIKIDATA_SPARQL):
            if self.wikidata_down:
                raise net.FetchError(f"could not fetch {url}: timed out")
            return self.claims if isinstance(self.claims, str) else sparql(self.claims)
        if url.startswith(photos.COMMONS_API):
            if self.commons_down:
                raise net.FetchError(f"{url} returned HTTP 503")
            params = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            assert params["maxlag"] == ["5"] and params["iiurlwidth"] == ["480"], params
            titles = params["titles"][0].split("|")
            assert len(titles) <= photos.COMMONS_BATCH
            pages = [self.pages.get(t[len("File:"):], {"ns": 6, "title": t, "missing": True})
                     for t in titles]
            return json.dumps({"batchcomplete": True, "query": {"pages": pages}})
        raise AssertionError(f"unexpected URL {url}")

    def count(self, api: str) -> int:
        return sum(1 for c in self.calls if c.startswith(api))


class PhotoTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.cache = self.dir / "photos.json"

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def resolve(self, fake, people, register, now=NOW, **kwargs):
        with mock.patch.object(net, "get", fake), self.assertLogs("pipeline.photos", "INFO") as logs:
            result, stats = photos.resolve_photos(people, register, cache_file=self.cache,
                                                  now=now, **kwargs)
        self.logs = "\n".join(logs.output)
        return result, stats


class JoinTests(PhotoTestCase):
    def test_joins_register_wikidata_and_commons(self):
        fake = FakeWikimedia(
            [("Q1", "253802", "Virat Kohli.jpg"), ("Q2", "34102", "Rohit Sharma.jpg"),
             ("Q3", "99", None)],
            {"Virat Kohli.jpg": page("Virat Kohli.jpg", "CC BY-SA 4.0"),
             "Rohit Sharma.jpg": page("Rohit Sharma.jpg", "CC BY 2.0", artist="Ann",
                                      licence_url="https://creativecommons.org/licenses/by/2.0")})
        # aaaa0002's second ESPNcricinfo id (key_cricinfo_2) is the one on Wikidata.
        register = {"253802": "aaaa0001", "1": "aaaa0002", "34102": "aaaa0002", "99": "aaaa0003",
                    "555": "aaaa0004", "777": "ffff0000"}
        got, stats = self.resolve(fake, {"aaaa0001", "aaaa0002", "aaaa0003", "aaaa0004", "aaaa0005"},
                                  register)
        self.assertEqual(set(got), {"aaaa0001", "aaaa0002"})
        kohli = got["aaaa0001"]
        self.assertEqual(check(PHOTO, kohli, "photo"), [])
        self.assertEqual(kohli["author"], "Jane Doe")
        self.assertEqual(kohli["license"], "CC BY-SA 4.0")
        self.assertEqual(kohli["pageUrl"], "https://commons.wikimedia.org/wiki/File:Virat_Kohli.jpg")
        self.assertTrue(kohli["thumbUrl"].startswith("https://upload.wikimedia.org/"))
        self.assertEqual(got["aaaa0002"]["licenseUrl"], "https://creativecommons.org/licenses/by/2.0")
        self.assertEqual((stats["withCricinfoId"], stats["matched"], stats["withImage"],
                          stats["accepted"], stats["rejected"]), (4, 3, 2, 2, 0))
        # ffff0000 is not in the build, so its id is not counted.
        self.assertIn("photos: 4 players with a cricinfo id, 3 matched on Wikidata, 2 with an "
                      "image, 2 accepted (licences: CC BY 2.0 1, CC BY-SA 4.0 1), 0 rejected",
                      self.logs)
        self.assertEqual((fake.count(photos.WIKIDATA_SPARQL), fake.count(photos.COMMONS_API)), (1, 1))

    def test_ambiguous_ids_are_skipped_not_guessed(self):
        fake = FakeWikimedia(
            [("Q1", "100", "One.jpg"), ("Q2", "100", "Two.jpg"),       # one id, two items
             ("Q3", "200", "Three.jpg"), ("Q4", "201", "Four.jpg"),   # one person, two items
             ("Q5", "300", "Five.jpg"), ("Q5", "301", "Five.jpg"),    # one item, two people
             ("Q6", "400", "Six.jpg"), ("Q6", "401", "Six.jpg")],     # one item, one person: fine
            {n: page(n, "CC0") for n in ("One.jpg", "Two.jpg", "Three.jpg", "Four.jpg",
                                         "Five.jpg", "Six.jpg")})
        register = {"100": "aaaa0001", "200": "aaaa0002", "201": "aaaa0002",
                    "300": "aaaa0003", "301": "aaaa0004", "400": "aaaa0005", "401": "aaaa0005"}
        got, stats = self.resolve(fake, set(register.values()), register)
        self.assertEqual(set(got), {"aaaa0005"})
        self.assertEqual(stats["skipped"], {
            "cricinfo id on two or more Wikidata items": 1,
            "player's ids lead to different Wikidata items": 1,
            "Wikidata item leads to two or more players": 2,
        })

    def test_several_images_on_one_item_pick_the_first_by_name(self):
        claims = photos.parse_claims(json.loads(sparql([("Q1", "1", "b.jpg"), ("Q1", "1", "a.jpg"),
                                                        ("Q2", "2", None)])))
        self.assertEqual(claims, {"1": {"Q1": "a.jpg"}, "2": {"Q2": None}})

    def test_a_property_that_is_not_espncricinfo_is_refused(self):
        fake = FakeWikimedia(sparql([("Q1", "1", "a.jpg")], formatter="https://example.org/$1"),
                             {"a.jpg": page("a.jpg", "CC0")})
        with mock.patch.object(net, "get", fake), self.assertLogs("pipeline.photos", "WARNING") as logs:
            got, _ = photos.resolve_photos({"aaaa0001"}, {"1": "aaaa0001"}, cache_file=self.cache,
                                           now=NOW)
        self.assertEqual(got, {})
        self.assertIn("not espncricinfo.com", "\n".join(logs.output))

    def test_commons_calls_take_fifty_files_each(self):
        names = [f"Player {i:03d}.jpg" for i in range(120)]
        fake = FakeWikimedia([(f"Q{i}", str(i), n) for i, n in enumerate(names)],
                             {n: page(n, "CC BY-SA 3.0") for n in names})
        register = {str(i): f"{i:08x}" for i in range(120)}
        got, stats = self.resolve(fake, set(register.values()), register)
        self.assertEqual(len(got), 120)
        self.assertEqual(stats["commonsCalls"], 3)

    def test_no_register_means_no_requests(self):
        fake = FakeWikimedia([], {})
        with mock.patch.object(net, "get", fake), self.assertLogs("pipeline.photos", "WARNING"):
            got, _ = photos.resolve_photos({"aaaa0001"}, {}, cache_file=self.cache, now=NOW)
        self.assertEqual((got, fake.calls), ({}, []))


class LicenceTests(PhotoTestCase):
    def test_only_cc0_public_domain_cc_by_and_cc_by_sa(self):
        for name in ("CC0", "CC0 1.0", "Public domain", "PD", "PD-US", "CC BY 2.0", "CC BY 4.0",
                     "CC BY-SA 4.0", "CC-BY-SA-3.0", "CC BY-SA 3.0 de", "CC BY-SA 2.5 in",
                     "CC BY-SA 3.0 IGO", "cc by"):
            self.assertTrue(photos.licence_accepted(name), name)
        for name in ("", "GFDL", "CC BY-NC 2.0", "CC BY-NC-SA 2.0", "CC BY-ND 4.0", "CC BY-NC",
                     "FAL", "Attribution", "Copyrighted free use", "OGL v3", "GODL-India",
                     "All rights reserved", "pdf"):
            self.assertFalse(photos.licence_accepted(name), name)

    def test_rejected_files_are_dropped_and_counted_by_licence(self):
        files = {"a.jpg": "CC BY-SA 4.0", "b.jpg": "GFDL", "c.jpg": "CC BY-NC 2.0",
                 "d.jpg": "Public domain", "e.jpg": "GFDL"}
        fake = FakeWikimedia([(f"Q{i}", str(i), n) for i, n in enumerate(sorted(files))],
                             {n: page(n, lic, licence_url="" if lic == "Public domain" else
                                      "https://creativecommons.org/licenses/by-sa/4.0")
                              for n, lic in files.items()})
        register = {str(i): f"aaaa000{i}" for i in range(5)}
        got, stats = self.resolve(fake, set(register.values()), register)
        self.assertEqual({p["license"] for p in got.values()}, {"CC BY-SA 4.0", "Public domain"})
        self.assertIsNone(got["aaaa0003"]["licenseUrl"])  # public domain: no licence page
        self.assertEqual((stats["accepted"], stats["rejected"]), (2, 3))
        self.assertIn("3 rejected (GFDL 2, CC BY-NC 2.0 1)", self.logs)

    def test_missing_files_are_rejected(self):
        fake = FakeWikimedia([("Q1", "1", "Gone.jpg")], {})
        got, stats = self.resolve(fake, {"aaaa0001"}, {"1": "aaaa0001"})
        self.assertEqual((got, stats["rejected"]), ({}, 1))
        self.assertIn("file missing on Commons 1", self.logs)


class CreditTests(unittest.TestCase):
    def test_author_html_becomes_plain_text(self):
        self.assertEqual(photos.plain_text(
            '<a href="//commons.wikimedia.org/wiki/User:JD" title="User:JD">Jane&nbsp;Doe</a>'
            ' (<span class="x">talk</span>)'), "Jane Doe (talk)")
        self.assertEqual(photos.plain_text("Photo by <b>A</b><br/>Uploaded by\n\n<i>B</i>"),
                         "Photo by A Uploaded by B")
        self.assertEqual(photos.plain_text("<style>.x{}</style>Ann &amp; Bob"), "Ann & Bob")

    def test_missing_author_falls_back(self):
        info = photos.parse_imageinfo({"query": {"pages": [page("x.jpg", "CC0", artist="")]}})["x.jpg"]
        photo, why = photos.to_photo(info)
        self.assertIsNone(why)
        self.assertEqual(photo["author"], "Unknown author")
        photo, _ = photos.to_photo({**info, "artist": '<span><a href="/x">Mo</a></span>'})
        self.assertEqual(photo["author"], "Mo")

    def test_normalised_and_renamed_titles_map_back_to_the_request(self):
        payload = {"query": {"normalized": [{"from": "File:A_b.jpg", "to": "File:A b.jpg"}],
                             "redirects": [{"from": "File:A b.jpg", "to": "File:C d.jpg"}],
                             "pages": [page("C d.jpg", "CC0")]}}
        self.assertEqual(list(photos.parse_imageinfo(payload)), ["A b.jpg"])


class CacheAndOutageTests(PhotoTestCase):
    CLAIMS = [("Q1", "1", "a.jpg")]
    PAGES = {"a.jpg": page("a.jpg", "CC BY-SA 4.0")}

    def test_a_fresh_cache_makes_no_requests(self):
        first, _ = self.resolve(FakeWikimedia(self.CLAIMS, self.PAGES), {"aaaa0001"}, {"1": "aaaa0001"})
        fake = FakeWikimedia(self.CLAIMS, self.PAGES)
        again, stats = self.resolve(fake, {"aaaa0001"}, {"1": "aaaa0001"}, now=NOW + timedelta(days=3))
        self.assertEqual((again, fake.calls), (first, []))
        self.assertEqual(stats["wikidata"], "cached from 2026-11-09")

    def test_a_stale_cache_is_refreshed(self):
        self.resolve(FakeWikimedia(self.CLAIMS, self.PAGES), {"aaaa0001"}, {"1": "aaaa0001"})
        fake = FakeWikimedia(self.CLAIMS, {"a.jpg": page("a.jpg", "CC BY-SA 4.0", artist="New name")})
        got, _ = self.resolve(fake, {"aaaa0001"}, {"1": "aaaa0001"}, now=NOW + timedelta(days=7))
        self.assertEqual((fake.count(photos.WIKIDATA_SPARQL), fake.count(photos.COMMONS_API)), (1, 1))
        self.assertEqual(got["aaaa0001"]["author"], "New name")

    def test_an_outage_keeps_the_cached_photos(self):
        first, _ = self.resolve(FakeWikimedia(self.CLAIMS, self.PAGES), {"aaaa0001"}, {"1": "aaaa0001"})
        down = FakeWikimedia(self.CLAIMS, self.PAGES, wikidata_down=True, commons_down=True)
        got, stats = self.resolve(down, {"aaaa0001"}, {"1": "aaaa0001"}, now=NOW + timedelta(days=30))
        self.assertEqual(got, first)
        self.assertIn("Wikidata query failed", self.logs)
        self.assertIn("using the cached snapshot from 2026-11-09", self.logs)
        self.assertIn("Commons call for 1 files failed", self.logs)
        self.assertEqual(stats["commonsFailed"], 1)

    def test_an_outage_without_a_cache_means_no_photos(self):
        down = FakeWikimedia(self.CLAIMS, self.PAGES, wikidata_down=True)
        got, stats = self.resolve(down, {"aaaa0001"}, {"1": "aaaa0001"})
        self.assertEqual(got, {})
        self.assertIn("no cached snapshot, so no photos in this build", self.logs)
        self.assertFalse(self.cache.exists())

    def test_commons_down_without_a_cache_leaves_players_without_photos(self):
        down = FakeWikimedia(self.CLAIMS, self.PAGES, commons_down=True)
        got, stats = self.resolve(down, {"aaaa0001"}, {"1": "aaaa0001"})
        self.assertEqual((got, stats["unavailable"]), ({}, 1))
        self.assertIn("1 without Commons metadata", self.logs)

    def test_repeated_commons_failures_stop_the_requests(self):
        names = [f"P{i:03d}.jpg" for i in range(200)]
        down = FakeWikimedia([(f"Q{i}", str(i), n) for i, n in enumerate(names)], {}, commons_down=True)
        register = {str(i): f"{i:08x}" for i in range(200)}
        _, stats = self.resolve(down, set(register.values()), register)
        self.assertEqual(stats["commonsCalls"], photos.MAX_FAILURES)
        self.assertIn("2 Commons calls failed in a row; 100 files keep", self.logs)

    def test_a_spent_budget_stops_the_requests_and_keeps_the_cache(self):
        first, _ = self.resolve(FakeWikimedia(self.CLAIMS, self.PAGES), {"aaaa0001"}, {"1": "aaaa0001"})
        fake = FakeWikimedia(self.CLAIMS, self.PAGES)
        later = NOW + timedelta(days=8)
        with mock.patch.object(photos, "fetch_claims", side_effect=photos.PhotoSourceError("slow")):
            got, stats = self.resolve(fake, {"aaaa0001"}, {"1": "aaaa0001"}, now=later, budget=-1)
        self.assertEqual((got, stats["commonsCalls"]), (first, 0))
        self.assertIn("budget is spent; 1 files keep their cached Commons metadata", self.logs)

    def test_unseen_files_are_fetched_before_stale_ones(self):
        names = [f"P{i:03d}.jpg" for i in range(60)]
        claims = [(f"Q{i}", str(i), n) for i, n in enumerate(names)]
        register = {str(i): f"{i:08x}" for i in range(60)}
        # The first run knows only the last ten files.
        self.resolve(FakeWikimedia(claims[50:], {n: page(n, "CC0") for n in names}),
                     set(register.values()), register)
        fake = FakeWikimedia(claims, {n: page(n, "CC0") for n in names})
        self.resolve(fake, set(register.values()), register, now=NOW + timedelta(days=7))
        first_batch = urllib.parse.parse_qs(urllib.parse.urlsplit(
            [c for c in fake.calls if c.startswith(photos.COMMONS_API)][0]).query)["titles"][0]
        self.assertEqual(first_batch.split("|"), [f"File:{n}" for n in names[:50]])

    def test_an_unexpected_error_never_fails_the_build(self):
        with mock.patch.object(photos, "resolve_photos", side_effect=KeyError("boom")), \
                self.assertLogs("pipeline.photos", "ERROR"):
            self.assertEqual(photos.photos_for_build({"aaaa0001"}, {"1": "aaaa0001"}), ({}, None))


class BuildTests(PhotoTestCase):
    def build(self, fake):
        from pipeline.build import build_dataset
        archive = self.dir / "t20s_json.zip"
        matches = simulated_matches("t20i", 12)
        write_archive(archive, matches)
        out = self.dir / "out"
        with mock.patch.object(net, "get", fake), mock.patch.object(photos, "CACHE_FILE", self.cache), \
                self.assertLogs("pipeline.photos", "INFO"):
            build_dataset(out, formats=("t20i",), archives={"t20i": archive}, sha="local",
                          register={"253802": self.pid}, photos=True)
        return out

    def setUp(self):
        super().setUp()
        # Someone who is exported: the first batter of the first simulated match.
        from pipeline.build import build_dataset
        archive = self.dir / "probe.zip"
        write_archive(archive, simulated_matches("t20i", 12))
        build_dataset(self.dir / "probe", formats=("t20i",), archives={"t20i": archive}, sha="local",
                      register={})
        index = json.loads((self.dir / "probe" / "players.json").read_text())["players"]
        self.pid, self.other = index[0]["id"], index[1]["id"]

    def test_the_photo_reaches_players_json_and_the_player_file(self):
        out = self.build(FakeWikimedia([("Q1", "253802", "Virat Kohli.jpg")],
                                       {"Virat Kohli.jpg": page("Virat Kohli.jpg", "CC BY-SA 4.0")}))
        index = {p["id"]: p for p in json.loads((out / "players.json").read_text())["players"]}
        photo = index[self.pid]["photo"]
        self.assertEqual(check(PHOTO, photo, "photo"), [])
        player = json.loads((out / "players" / f"{index[self.pid]['slug']}.json").read_text())
        self.assertEqual(player["meta"]["photo"], photo)
        self.assertNotIn("photo", index[self.other])
        self.assertEqual(validate_dir(out, replays=False, winprob=False)[:5], [])
        sources = json.loads((out / "manifest.json").read_text())["provenance"]["sources"]
        self.assertIn({"id": "wikimedia", "used": True}, [{k: s[k] for k in ("id", "used")} for s in sources])

    def test_the_build_succeeds_when_wikimedia_is_down(self):
        out = self.build(FakeWikimedia([], {}, wikidata_down=True, commons_down=True))
        index = json.loads((out / "players.json").read_text())["players"]
        self.assertTrue(index)
        self.assertFalse(any("photo" in p for p in index))


class RobotsExemptionTests(unittest.TestCase):
    def test_only_the_two_api_endpoints_skip_robots(self):
        self.assertTrue(net.robots_exempt("https://query.wikidata.org/sparql?query=x"))
        self.assertTrue(net.robots_exempt("https://commons.wikimedia.org/w/api.php?action=query"))
        for url in ("https://commons.wikimedia.org/wiki/File:X.jpg",
                    "https://commons.wikimedia.org/w/index.php?title=X",
                    "http://commons.wikimedia.org/w/api.php",
                    "https://en.wikipedia.org/w/api.php",
                    "https://query.wikidata.org/bigdata/namespace/wdq/sparql",
                    "https://cricsheet.org/downloads/odis_json.zip"):
            self.assertFalse(net.robots_exempt(url), url)

    def test_exempt_urls_never_read_robots_txt(self):
        disallow_all = mock.Mock()
        disallow_all.can_fetch.return_value = False
        with mock.patch.object(net, "_robots_for", return_value=disallow_all) as robots:
            self.assertTrue(net.allowed("https://commons.wikimedia.org/w/api.php?action=query"))
            self.assertEqual(net.crawl_delay("https://query.wikidata.org/sparql"), net.NET.delay_seconds)
            robots.assert_not_called()
            self.assertFalse(net.allowed("https://commons.wikimedia.org/wiki/File:X.jpg"))


if __name__ == "__main__":
    unittest.main()
