"""Player photos: freely licensed images from Wikimedia Commons.

Optional enrichment for the player header (docs/ARCHITECTURE.md §1.4). Never
Cricsheet data, and never scraped: every image is a Commons file whose licence
lets anyone reuse it with credit.

How a photo finds its player (all by id, never by name):

1. Cricsheet's people register (``register/people.csv``, which ``fetch``
   downloads) gives each person id their ESPNcricinfo ids (``key_cricinfo``,
   ``key_cricinfo_2``). This is :func:`sources.cricsheet.load_register`
   reversed, so an ESPNcricinfo id the register gives to two people is
   already left out.
2. One SPARQL query to the Wikidata Query Service lists every item with an
   ESPNcricinfo player id (P2697) and its image (P18), if it has one. The
   same query returns P2697's formatter URL, and the join is refused unless
   it points at espncricinfo.com, so a wrong property id can never attach
   strangers' photos.
3. Commons API calls, 50 files each, give a 480px thumbnail, the author and
   the licence of every matched image.

Nothing is guessed. An ESPNcricinfo id claimed by two Wikidata items is
skipped, and so is a player whose ids lead to two items and an item that two
players lead to. Only CC0, public domain, CC BY and CC BY-SA images are kept
(any version); everything else is dropped and counted by licence.

Fail safe: photos never block a build. Results are cached in
``.cache/photos/photos.json`` (kept between CI runs by actions/cache) and
reused for :data:`MAX_AGE`. When Wikidata or Commons is down or slow, the
step uses whatever is cached, however old, or goes without; it stops making
requests once :data:`BUDGET_SECONDS` is spent.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import urllib.parse
from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

from . import net
from .config import CACHE_DIR

log = logging.getLogger(__name__)

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
#: Wikidata's "ESPNcricinfo.com player ID". Checked at query time through
#: its formatter URL (P1630), which must contain FORMATTER_HOST.
CRICINFO_PROPERTY = "P2697"
FORMATTER_HOST = "espncricinfo.com"

#: Wikimedia's User-Agent policy asks for a client name and a way to reach
#: the operator; the repository is the contact.
USER_AGENT = (f"criclysis-photos/1.0 (https://github.com/atharva9806/criclysis) "
              f"python-urllib/{sys.version_info.major}.{sys.version_info.minor}")

CACHE_FILE = CACHE_DIR / "photos" / "photos.json"
CACHE_VERSION = 1
#: Cached answers younger than this are reused without asking again. Below a
#: week, so the first run after the weekly cache key rotates refreshes them.
MAX_AGE = timedelta(days=6)
#: Wall-clock budget for all requests; after it, cached values or nothing.
BUDGET_SECONDS = 300
COMMONS_BATCH = 50
#: Keep each Commons GET comfortably below URL length limits.
MAX_URL_LENGTH = 6000
THUMB_WIDTH = 480
#: Consecutive failed Commons calls after which the step stops asking.
MAX_FAILURES = 2
SPARQL_TIMEOUT, COMMONS_TIMEOUT = 75, 30
RETRIES = 2

QUERY = f"""SELECT ?item ?id ?image ?formatter WHERE {{
  {{ wd:{CRICINFO_PROPERTY} wdt:P1630 ?formatter . }}
  UNION
  {{ ?item wdt:{CRICINFO_PROPERTY} ?id . OPTIONAL {{ ?item wdt:P18 ?image . }} }}
}}"""


class PhotoSourceError(RuntimeError):
    """Wikidata or Commons gave no usable answer."""


# ---------------------------------------------------------------------------
# Licences and credits
# ---------------------------------------------------------------------------
_CC0 = re.compile(r"(cc0|cc zero)( \d+(\.\d+)?)?( universal)?")
_PD = re.compile(r"(public domain|pd|pdm)( .*)?")
_CC_BY = re.compile(r"cc by( sa)?( \d+(\.\d+)?)?( [a-z]+)*")


def licence_accepted(short_name: str) -> bool:
    """CC0, public domain, CC BY or CC BY-SA, any version or port.

    ``short_name`` is Commons' ``LicenseShortName`` ("CC BY-SA 4.0",
    "Public domain", "CC0"). NonCommercial and NoDerivatives variants, GFDL,
    FAL and every other licence are refused.
    """
    norm = " ".join(re.sub(r"[-_]", " ", short_name.lower()).split())
    if not norm or {"nc", "nd"} & set(norm.split()):
        return False
    return any(p.fullmatch(norm) for p in (_CC0, _PD, _CC_BY))


class _Text(HTMLParser):
    """Text content of an HTML fragment (script and style dropped)."""

    BREAKS = {"br", "p", "div", "li", "tr"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in self.BREAKS:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def plain_text(html: str) -> str:
    """``<a href="…">Jane&nbsp;Doe</a>`` -> ``Jane Doe``, whitespace collapsed."""
    parser = _Text()
    parser.feed(html or "")
    parser.close()
    return " ".join("".join(parser.parts).split())


def _https(url: str) -> str:
    return "https:" + url if url.startswith("//") else url


def to_photo(info: dict) -> tuple[dict | None, str | None]:
    """(photo, None) for an acceptable Commons file, else (None, why not)."""
    if info.get("missing"):
        return None, "file missing on Commons"
    licence = plain_text(info.get("license", ""))
    if not licence_accepted(licence):
        return None, licence or "no licence given"
    thumb = _https(info.get("thumbUrl", ""))
    page = _https(info.get("pageUrl", ""))
    if not thumb.startswith("https://upload.wikimedia.org/") or \
            not page.startswith("https://commons.wikimedia.org/"):
        return None, "no thumbnail"
    licence_url = _https(plain_text(info.get("licenseUrl", "")))
    return {
        "thumbUrl": thumb,
        "pageUrl": page,
        "author": plain_text(info.get("artist", "")) or "Unknown author",
        "license": licence,
        "licenseUrl": licence_url if licence_url.startswith(("https://", "http://")) else None,
    }, None


# ---------------------------------------------------------------------------
# Wikidata
# ---------------------------------------------------------------------------
def _file_name(image_url: str) -> str:
    """http://commons.wikimedia.org/wiki/Special:FilePath/A%20b.jpg -> 'A b.jpg'."""
    return urllib.parse.unquote(image_url.rsplit("/", 1)[-1]).replace("_", " ")


def parse_claims(payload: dict) -> dict[str, dict[str, str | None]]:
    """SPARQL JSON -> {cricinfo id: {Wikidata item: image file or None}}.

    Raises :class:`PhotoSourceError` unless the property's formatter URL
    points at ESPNcricinfo. An item with several images keeps the first by
    name, so the choice is stable between runs.
    """
    rows = payload.get("results", {}).get("bindings", [])
    formatters = [r["formatter"]["value"] for r in rows if "formatter" in r]
    if not any(FORMATTER_HOST in f.lower() for f in formatters):
        raise PhotoSourceError(
            f"Wikidata {CRICINFO_PROPERTY} has formatter URL(s) {formatters or 'none'}, not "
            f"{FORMATTER_HOST}: refusing to join on it")
    claims: dict[str, dict[str, str | None]] = defaultdict(dict)
    for r in rows:
        if "item" not in r or "id" not in r:
            continue
        cid = r["id"]["value"].strip()
        qid = r["item"]["value"].rsplit("/", 1)[-1]
        image = _file_name(r["image"]["value"]) if "image" in r else None
        known = claims[cid].get(qid)
        if qid not in claims[cid] or (image is not None and (known is None or image < known)):
            claims[cid][qid] = image
    return dict(claims)


def fetch_claims() -> dict[str, dict[str, str | None]]:
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({"query": QUERY, "format": "json"})
    text = net.get(url, use_cache=False, timeout=SPARQL_TIMEOUT, retries=RETRIES,
                   headers={"User-Agent": USER_AGENT,
                            "Accept": "application/sparql-results+json"})
    try:
        payload = json.loads(text)
    except ValueError as exc:
        raise PhotoSourceError(f"Wikidata answered with something other than JSON ({exc})") from exc
    return parse_claims(payload)


# ---------------------------------------------------------------------------
# Commons
# ---------------------------------------------------------------------------
def commons_url(files: list[str], extra: dict | None = None) -> str:
    params = {
        "action": "query", "format": "json", "formatversion": "2", "maxlag": "5",
        "redirects": "1", "prop": "imageinfo", "iiprop": "url|extmetadata",
        "iiurlwidth": str(THUMB_WIDTH),
        "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl",
        "titles": "|".join(f"File:{f}" for f in files),
        **(extra or {}),
    }
    return COMMONS_API + "?" + urllib.parse.urlencode(params)


def batches(files: list[str]) -> list[list[str]]:
    """At most COMMONS_BATCH files per call, and URLs below MAX_URL_LENGTH."""
    out: list[list[str]] = []
    for f in files:
        if out and len(out[-1]) < COMMONS_BATCH and len(commons_url(out[-1] + [f])) <= MAX_URL_LENGTH:
            out[-1].append(f)
        else:
            out.append([f])
    return out


def parse_imageinfo(payload: dict) -> dict[str, dict]:
    """Commons query JSON (formatversion 2) -> {file name: info}."""
    if "error" in payload:
        err = payload["error"]
        raise PhotoSourceError(f"Commons error {err.get('code')}: {err.get('info', '')}".strip())
    query = payload.get("query", {})
    # Back from the page Commons answered with to the title we asked for:
    # through a redirect (a renamed file), then title normalisation.
    asked = {n["to"]: n["from"] for key in ("normalized", "redirects") for n in query.get(key, [])}
    out: dict[str, dict] = {}
    for page in query.get("pages", []):
        title, seen = page.get("title", ""), set()
        while title in asked and title not in seen:
            seen.add(title)
            title = asked[title]
        name = title.split(":", 1)[-1].replace("_", " ")
        if page.get("missing") or page.get("invalid"):
            out[name] = {"missing": True}
            continue
        info = (page.get("imageinfo") or [None])[0]
        if not info:
            continue  # held back by a continuation; asked for again
        meta = info.get("extmetadata") or {}
        value = lambda key: str((meta.get(key) or {}).get("value") or "")  # noqa: E731
        out[name] = {"thumbUrl": info.get("thumburl") or "", "pageUrl": info.get("descriptionurl") or "",
                     "artist": value("Artist"), "license": value("LicenseShortName"),
                     "licenseUrl": value("LicenseUrl")}
    return out


def fetch_commons_batch(files: list[str]) -> dict[str, dict]:
    """One batch, following continuations and waiting out maxlag (twice at most)."""
    out: dict[str, dict] = {}
    extra: dict = {}
    for _ in range(4):
        text = net.get(commons_url(files, extra), use_cache=False, timeout=COMMONS_TIMEOUT,
                       retries=RETRIES, headers={"User-Agent": USER_AGENT})
        try:
            payload = json.loads(text)
        except ValueError as exc:
            raise PhotoSourceError(f"Commons answered with something other than JSON ({exc})") from exc
        if payload.get("error", {}).get("code") == "maxlag":
            time.sleep(min(30, float(payload["error"].get("lag") or 5)))
            continue
        out.update(parse_imageinfo(payload))
        if "continue" not in payload:
            break
        extra = {k: str(v) for k, v in payload["continue"].items()}
    return out


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
def load_cache(path: Path) -> dict:
    try:
        cache = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        log.warning("photos: cache %s is unreadable (%s); starting without it", path, exc)
        return {}
    return cache if isinstance(cache, dict) and cache.get("version") == CACHE_VERSION else {}


def save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                   encoding="utf-8")
    os.replace(tmp, path)


def _age(entry: dict | None, now: datetime) -> timedelta | None:
    try:
        return now - datetime.fromisoformat(entry["fetched"])  # type: ignore[index]
    except (TypeError, KeyError, ValueError):
        return None


def _fresh(entry: dict | None, now: datetime) -> bool:
    age = _age(entry, now)
    return age is not None and age < MAX_AGE


# ---------------------------------------------------------------------------
# The join
# ---------------------------------------------------------------------------
def cricinfo_ids(register: dict[str, str]) -> dict[str, list[str]]:
    """Cricsheet person id -> ESPNcricinfo ids, from load_register()'s map."""
    out: dict[str, list[str]] = defaultdict(list)
    for cid, pid in register.items():
        out[pid].append(cid)
    return {pid: sorted(ids) for pid, ids in out.items()}


def match_people(ids: dict[str, list[str]], claims: dict[str, dict[str, str | None]]) -> tuple[dict, Counter]:
    """{person id: (Wikidata item, image file or None)} and what was skipped."""
    skipped: Counter = Counter()
    items: dict[str, tuple[str, str | None]] = {}
    duplicate_ids: set[str] = set()
    for pid, cids in ids.items():
        found: dict[str, str | None] = {}
        for cid in cids:
            claim = claims.get(cid)
            if not claim:
                continue
            if len(claim) > 1:
                duplicate_ids.add(cid)
                continue
            (qid, image), = claim.items()
            found[qid] = image
        if len(found) > 1:
            skipped["player's ids lead to different Wikidata items"] += 1
        elif found:
            items[pid] = next(iter(found.items()))
    if duplicate_ids:
        skipped["cricinfo id on two or more Wikidata items"] = len(duplicate_ids)
    people = Counter(qid for qid, _image in items.values())
    shared = {pid for pid, (qid, _image) in items.items() if people[qid] > 1}
    if shared:
        skipped["Wikidata item leads to two or more players"] = len(shared)
    return {pid: v for pid, v in items.items() if pid not in shared}, skipped


def _counts(counter: Counter) -> str:
    return ", ".join(f"{k} {n}" for k, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0])))


def resolve_photos(person_ids: Iterable[str], register: dict[str, str], *,
                   cache_file: Path | None = None, now: datetime | None = None,
                   budget: float = BUDGET_SECONDS) -> tuple[dict[str, dict], dict]:
    """Photos for the given Cricsheet person ids, and counts for the log.

    Network faults are logged and fall back to the cache; this only raises on
    a programming error (and :func:`photos_for_build` catches even those).
    """
    now = now or datetime.now(timezone.utc)
    cache_file = cache_file or CACHE_FILE
    deadline = time.monotonic() + budget
    wanted = set(person_ids)
    ids = {pid: cids for pid, cids in cricinfo_ids(register).items() if pid in wanted}
    stats: dict = {"players": len(wanted), "withCricinfoId": len(ids), "matched": 0, "withImage": 0,
                   "accepted": 0, "rejected": 0, "unavailable": 0, "wikidata": "", "commonsCalls": 0,
                   "commonsFailed": 0}
    if not register:
        log.warning("photos: no people register (run `python -m pipeline fetch`), so no player has "
                    "an ESPNcricinfo id; building without photos")
        stats["wikidata"] = "skipped"
        return {}, stats

    cache = load_cache(cache_file)
    wikidata = cache.get("wikidata")
    if _fresh(wikidata, now):
        stats["wikidata"] = f"cached from {wikidata['fetched'][:10]}"
    else:
        try:
            claims = fetch_claims()
            wikidata = {"fetched": now.isoformat(timespec="seconds"), "claims": claims}
            stats["wikidata"] = f"queried, {len(claims)} ESPNcricinfo ids"
        except (net.Blocked, net.FetchError, PhotoSourceError, OSError) as exc:
            if wikidata:
                fallback = f"using the cached snapshot from {wikidata['fetched'][:10]}"
            else:
                fallback = "no cached snapshot, so no photos in this build"
            stats["wikidata"] = f"unavailable ({fallback})"
            log.warning("photos: Wikidata query failed (%s); %s", exc, fallback)
    claims = (wikidata or {}).get("claims", {})
    matched, skipped = match_people(ids, claims)
    with_image = {pid: image for pid, (_qid, image) in matched.items() if image}
    stats["matched"], stats["withImage"] = len(matched), len(with_image)

    commons: dict[str, dict] = cache.get("commons", {})
    files = sorted(set(with_image.values()))
    stale = [f for f in files if not _fresh(commons.get(f), now)]
    failures = 0
    pending = batches(stale)
    for i, batch in enumerate(pending):
        why = (f"the {budget:.0f}s budget is spent" if time.monotonic() > deadline else
               f"{failures} Commons calls failed in a row" if failures >= MAX_FAILURES else "")
        if why:
            log.warning("photos: %s; %d files keep their cached Commons metadata or go without",
                        why, sum(len(b) for b in pending[i:]))
            break
        stats["commonsCalls"] += 1
        try:
            got = fetch_commons_batch(batch)
        except (net.Blocked, net.FetchError, PhotoSourceError, OSError) as exc:
            failures += 1
            stats["commonsFailed"] += 1
            log.warning("photos: Commons call for %d files failed (%s)", len(batch), exc)
            continue
        failures = 0
        stamp = now.isoformat(timespec="seconds")
        for name, info in got.items():
            commons[name] = {**info, "fetched": stamp}

    photos: dict[str, dict] = {}
    licences: Counter = Counter()
    rejected: Counter = Counter()
    for pid in sorted(with_image):
        info = commons.get(with_image[pid])
        if info is None:
            stats["unavailable"] += 1
            continue
        photo, reason = to_photo(info)
        if photo:
            photos[pid] = photo
            licences[photo["license"]] += 1
        else:
            rejected[reason] += 1
    stats["accepted"], stats["rejected"] = len(photos), sum(rejected.values())

    if wikidata:
        try:
            save_cache(cache_file, {"version": CACHE_VERSION, "wikidata": wikidata,
                                    "commons": {f: commons[f] for f in files if f in commons}})
        except OSError as exc:
            log.warning("photos: could not write the cache %s (%s)", cache_file, exc)

    line = (f"photos: {stats['withCricinfoId']} players with a cricinfo id, {stats['matched']} matched "
            f"on Wikidata, {stats['withImage']} with an image, {stats['accepted']} accepted "
            f"(licences: {_counts(licences) or 'none'}), {stats['rejected']} rejected"
            + (f" ({_counts(rejected)})" if rejected else ""))
    if stats["unavailable"]:
        line += f", {stats['unavailable']} without Commons metadata"
    log.info("%s", line)
    log.info("photos: wikidata %s; commons %d calls, %d failed, %d of %d files from the cache%s",
             stats["wikidata"], stats["commonsCalls"], stats["commonsFailed"],
             len(files) - len(stale), len(files),
             f"; skipped: {_counts(skipped)}" if skipped else "")
    stats["licences"] = dict(licences)
    stats["skipped"] = dict(skipped)
    return photos, stats


def photos_for_build(person_ids: Iterable[str], register: dict[str, str], **kwargs) -> tuple[dict, dict | None]:
    """:func:`resolve_photos`, but an unexpected error means no photos, never a failed build."""
    try:
        return resolve_photos(person_ids, register, **kwargs)
    except Exception:  # noqa: BLE001 - photos are optional; the build must go on
        log.exception("photos: failed unexpectedly; building without photos")
        return {}, None
