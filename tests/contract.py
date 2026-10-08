"""A validator for the pipeline output contract (docs/ARCHITECTURE.md §1).

The specs below transcribe the TypeScript shapes in §1 (and
web/src/lib/contract/pipeline.ts). ``validate_dir`` checks every file in an
output directory against them, plus the cross-file promises the importer
relies on, and returns a list of problems (empty when the output conforms).
"""
from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

PERSON_ID = r"[0-9a-f]{8}"
FORMAT_KEY = r"(test|odi|t20i)-(m|w)"
TEAM_ID = r"[a-z0-9]+(-[a-z0-9]+)*-(m|w)"
DATE = r"\d{4}-\d{2}-\d{2}"
TIMESTAMP = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00"


# ---------------------------------------------------------------------------
# A tiny schema language
# ---------------------------------------------------------------------------
class Spec:
    def check(self, value, path: str, errors: list[str]) -> None:  # pragma: no cover
        raise NotImplementedError


class Str(Spec):
    def __init__(self, pattern: str | None = None):
        self.pattern = re.compile(pattern) if pattern else None

    def check(self, value, path, errors):
        if not isinstance(value, str):
            errors.append(f"{path}: expected string, got {type(value).__name__}")
        elif self.pattern and not self.pattern.fullmatch(value):
            errors.append(f"{path}: {value!r} does not match {self.pattern.pattern}")


class Int(Spec):
    def __init__(self, minimum: int | None = 0):
        self.minimum = minimum

    def check(self, value, path, errors):
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append(f"{path}: expected integer, got {value!r}")
        elif self.minimum is not None and value < self.minimum:
            errors.append(f"{path}: {value} < {self.minimum}")


class Num(Spec):
    def __init__(self, minimum: float | None = None, maximum: float | None = None):
        self.minimum, self.maximum = minimum, maximum

    def check(self, value, path, errors):
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            errors.append(f"{path}: expected number, got {value!r}")
        elif value != value or value in (float("inf"), float("-inf")):
            errors.append(f"{path}: not a finite number")
        elif self.minimum is not None and value < self.minimum:
            errors.append(f"{path}: {value} < {self.minimum}")
        elif self.maximum is not None and value > self.maximum:
            errors.append(f"{path}: {value} > {self.maximum}")


class Bool(Spec):
    def check(self, value, path, errors):
        if not isinstance(value, bool):
            errors.append(f"{path}: expected boolean, got {value!r}")


class Lit(Spec):
    def __init__(self, *values):
        self.values = values

    def check(self, value, path, errors):
        # Compare types too, so that True never passes for 1 or 1 for True.
        if not any(type(v) is type(value) and v == value for v in self.values):
            errors.append(f"{path}: {value!r} not one of {self.values}")


class Null(Spec):
    def __init__(self, spec: Spec):
        self.spec = spec

    def check(self, value, path, errors):
        if value is not None:
            self.spec.check(value, path, errors)


class Arr(Spec):
    def __init__(self, item: Spec, length: int | None = None, max_len: int | None = None):
        self.item, self.length, self.max_len = item, length, max_len

    def check(self, value, path, errors):
        if not isinstance(value, list):
            errors.append(f"{path}: expected array, got {type(value).__name__}")
            return
        if self.length is not None and len(value) != self.length:
            errors.append(f"{path}: expected {self.length} items, got {len(value)}")
        if self.max_len is not None and len(value) > self.max_len:
            errors.append(f"{path}: more than {self.max_len} items ({len(value)})")
        for i, item in enumerate(value):
            self.item.check(item, f"{path}[{i}]", errors)


class Tup(Spec):
    def __init__(self, *items: Spec):
        self.items = items

    def check(self, value, path, errors):
        if not isinstance(value, list) or len(value) != len(self.items):
            errors.append(f"{path}: expected a {len(self.items)}-tuple, got {value!r}")
            return
        for i, (spec, item) in enumerate(zip(self.items, value)):
            spec.check(item, f"{path}[{i}]", errors)


class Map(Spec):
    """Record<K, V>; ``keys`` restricts the key pattern."""

    def __init__(self, value: Spec, keys: str | None = None, allowed: tuple | None = None):
        self.value = value
        self.keys = re.compile(keys) if keys else None
        self.allowed = allowed

    def check(self, value, path, errors):
        if not isinstance(value, dict):
            errors.append(f"{path}: expected object, got {type(value).__name__}")
            return
        for k, v in value.items():
            if self.keys and not self.keys.fullmatch(k):
                errors.append(f"{path}: key {k!r} does not match {self.keys.pattern}")
            if self.allowed is not None and k not in self.allowed:
                errors.append(f"{path}: unexpected key {k!r}")
            self.value.check(v, f"{path}.{k}", errors)


class Obj(Spec):
    """An object with exactly these fields; a key ending in '?' is optional."""

    def __init__(self, fields: dict[str, Spec], extra: bool = False):
        self.required = {k: v for k, v in fields.items() if not k.endswith("?")}
        self.optional = {k[:-1]: v for k, v in fields.items() if k.endswith("?")}
        self.extra = extra

    def check(self, value, path, errors):
        if not isinstance(value, dict):
            errors.append(f"{path}: expected object, got {type(value).__name__}")
            return
        for k, spec in self.required.items():
            if k not in value:
                errors.append(f"{path}: missing {k!r}")
            else:
                spec.check(value[k], f"{path}.{k}", errors)
        for k, spec in self.optional.items():
            if k in value:
                spec.check(value[k], f"{path}.{k}", errors)
        if not self.extra:
            for k in value:
                if k not in self.required and k not in self.optional:
                    errors.append(f"{path}: unexpected key {k!r}")


class Any(Spec):
    def check(self, value, path, errors):
        pass


# ---------------------------------------------------------------------------
# §1 shapes
# ---------------------------------------------------------------------------
GENDER = Lit("male", "female")
FMT = Lit("test", "odi", "t20i")
FK = Str(FORMAT_KEY)
NUM = Num()
NNUM = Null(Num())
PCT = Num(0, 100)

FORMAT_SUMMARY = Obj({
    "formatKey": FK, "format": FMT, "gender": GENDER, "label": Str(), "archive": Str(),
    "innings_limit": Int(), "balls_per_innings": Null(Int()), "white_ball": Bool(),
    "matches": Int(), "deliveries": Int(), "players": Int(), "venues": Int(),
    "bowlersMissingStyle": Int(), "firstDate": Str(DATE), "lastDate": Str(DATE),
})
PHASE = Obj({"key": Str(), "from": Int(), "to": Int(), "label": Str()})
MANIFEST = Obj({
    "schemaVersion": Lit(2),
    "buildId": Str(TIMESTAMP + r"-([0-9a-f]{7}|local)"),
    "generated": Str(TIMESTAMP),
    "fingerprint": Str(r"sha256:[0-9a-f]{64}"),
    "playerCount": Int(), "matchCount": Int(),
    "formats": Map(FORMAT_SUMMARY, keys=FORMAT_KEY),
    "phases": Map(Arr(PHASE), allowed=("test", "odi", "t20i")),
    "bowlingTypes": Map(Obj({"label": Str(), "family": Lit("pace", "spin"), "arm": Str(),
                             "swing?": Str(), "turn?": Str()})),
    "thresholds": Obj({k: NUM for k in (
        "minBallsSplit", "minBallsClaim", "minBallsCohort", "minBallsBowledSplit",
        "minBallsBowledClaim", "minBallsBowledCohort", "strengthPercentile",
        "weaknessPercentile", "teamMinMatches", "venueMinInnings")}),
    "sources": Map(Obj({"name": Str(), "base": Str(), "licence": Str(), "role": Str(),
                        "bulk": Bool()})),
    "provenance": Obj({
        "sources": Arr(Obj({"id": Str(), "used": Bool(), "note": Str()})),
        "enrichment": Map(Any()),
        "dataset": Lit("live", "demo"),
        "identity": Obj({"ambiguousNames": Int(), "stylesSkippedAmbiguous": Int()}),
    }),
})
FINGERPRINT = Obj({
    "archives": Map(Obj({"files": Int(), "sha256": Str(r"[0-9a-f]{64}")})),
    "combined": Str(r"sha256:[0-9a-f]{64}"),
})

BAT_SPLIT_FIELDS = {
    "balls": Int(), "runs": Int(), "outs": Int(), "fours": Int(), "sixes": Int(),
    "dots": Int(), "innings": Int(), "avg": NNUM, "sr": NUM, "bpd": NNUM,
    "dotPct": PCT, "bdryPct": PCT, "bdryRunsPct": PCT,
}
BOWL_SPLIT_FIELDS = {
    "balls": Int(), "runs": Int(), "wickets": Int(), "dots": Int(), "fours": Int(),
    "sixes": Int(), "innings": Int(), "overs": NUM, "econ": NUM, "avg": NNUM,
    "sr": NNUM, "dotPct": PCT, "bdryPct": PCT,
}
BAT_SPLIT = Obj(BAT_SPLIT_FIELDS)
BOWL_SPLIT = Obj(BOWL_SPLIT_FIELDS)
CLAIM = Obj({
    "id": Str(), "kind": Lit("strength", "weakness"), "discipline": Lit("batting", "bowling"),
    "dimension": Str(), "dimensionKey": Str(), "subject": Str(), "subjectKey": Str(),
    "metric": Str(), "metricLabel": Str(), "value": NUM, "baseline": NNUM,
    "cohortMedian": NUM, "percentile": PCT, "balls": Int(), "sampleNote": Str(),
    "confidence": Lit("high", "medium", "low"), "text": Str(), "higherIsBetter": Bool(),
})
PROFILE_AXIS = Obj({"label": Str(), "value": NUM, "percentile": PCT,
                    "discipline": Lit("batting", "bowling"), "balls": Int()})
BAT_INNINGS = Obj({
    "m": Str(), "d": Str(DATE), "vs": Str(), "g": Str(), "c": Str(), "r": Int(), "b": Int(),
    "f4": Int(), "f6": Int(), "out": Bool(), "pos": Int(), "inn": Int(), "chase": Bool(),
    "how": Str(), "by": Str(), "byId": Str(f"({PERSON_ID})?"),
})
BOWL_INNINGS = Obj({
    "m": Str(), "d": Str(DATE), "vs": Str(), "g": Str(), "c": Str(), "b": Int(), "r": Int(),
    "w": Int(), "md": Int(),
})
BATTING = Obj({
    "overall": BAT_SPLIT,
    "milestones": Obj({"fifties": Int(), "hundreds": Int(), "oneFifties": Int(),
                       "doubleHundreds": Int(), "notOuts": Int(), "highest": Int(),
                       "highestNotOut": Bool()}),
    **{k: Map(BAT_SPLIT) for k in (
        "byType", "byFamily", "byPhase", "byEntry", "byTypePhase", "byOpposition", "byCountry",
        "byVenue", "byHome", "byInningsNo", "byChase", "byPosition", "byYear")},
    "dismissals": Map(Int()), "dismissedByType": Map(Int()),
    "vsBowler": Map(Obj({**BAT_SPLIT_FIELDS, "name": Str()}), keys=PERSON_ID),
    "innings": Arr(BAT_INNINGS),
})
BOWLING = Obj({
    "overall": BOWL_SPLIT,
    "milestones": Obj({"best": Null(Obj({"wickets": Int(), "runs": Int()})),
                       "fiveWickets": Int(), "fourWickets": Int()}),
    **{k: Map(BOWL_SPLIT) for k in (
        "byHand", "byPhase", "byOpposition", "byCountry", "byHome", "byInningsNo", "byYear")},
    "wicketKinds": Map(Int()),
    "vsBatter": Map(Obj({**BOWL_SPLIT_FIELDS, "name": Str()}), keys=PERSON_ID),
    "innings": Arr(BOWL_INNINGS),
})
FORMAT_PAYLOAD = Obj({
    "format": FMT, "formatLabel": Str(), "formatKey": FK, "gender": GENDER, "matches": Int(),
    "strengths": Arr(CLAIM, max_len=12), "weaknesses": Arr(CLAIM, max_len=12),
    "profile": Map(PROFILE_AXIS),
    "batting?": BATTING, "bowling?": BOWLING,
})
PLAYER_META = Obj({
    "bowlingType": Str(), "battingHand": Str(), "role": Str(), "country": Str(),
    "cricinfoId": Str(), "fullName": Str(), "born": Str(), "teams": Arr(Str()),
    "teamIds": Arr(Str(TEAM_ID)), "debut": Str(f"({DATE})?"), "lastPlayed": Str(f"({DATE})?"),
    "gender": GENDER,
})
PLAYER_FILE = Obj({
    "id": Str(PERSON_ID), "slug": Str(), "name": Str(), "gender": GENDER, "meta": PLAYER_META,
    "formats": Map(FORMAT_PAYLOAD, allowed=("test", "odi", "t20i")),
})
PLAYERS_INDEX = Obj({"players": Arr(Obj({
    "id": Str(PERSON_ID), "slug": Str(), "name": Str(), "fullName": Str(), "gender": GENDER,
    "teams": Arr(Str()), "teamIds": Arr(Str(TEAM_ID)), "country": Str(), "role": Str(),
    "battingHand": Str(), "bowlingType": Str(), "bowlingLabel": Str(), "born": Str(),
    "debut": Str(f"({DATE})?"), "lastPlayed": Str(f"({DATE})?"), "cricinfoId": Str(),
    "sampleBalls": Int(),
    "formats": Map(Obj({
        "matches": Int(),
        "bat?": Obj({"inns": Int(), "runs": Int(), "balls": Int(), "avg": NNUM, "sr": NUM,
                     "hs": Int(), "100s": Int(), "50s": Int()}),
        "bowl?": Obj({"inns": Int(), "wkts": Int(), "balls": Int(), "runs": Int(), "avg": NNUM,
                      "econ": NUM, "sr": NNUM, "5w": Int()}),
        "strengths": Int(), "weaknesses": Int(),
    }), allowed=("test", "odi", "t20i")),
}))})

QUARTILES = Obj({"n": Int(), "p10": NUM, "p25": NUM, "p50": NUM, "p75": NUM, "p90": NUM})
COHORTS = Map(Map(QUARTILES, allowed=(
    "batting.average", "batting.strike_rate", "batting.dot_pct", "batting.boundary_pct",
    "batting.balls_per_dismissal", "bowling.average", "bowling.economy",
    "bowling.strike_rate", "bowling.dot_pct")), keys=FORMAT_KEY)
FIRST_INNINGS = Obj({"n": Int(), "avg": NNUM})
VENUES = Obj({"venues": Map(Obj({
    "key": Str(), "name": Str(), "city": Str(), "country": Str(),
    "formats": Map(Obj({"matches": Int(), "runsPerOver": NUM, "ballsPerWicket": NNUM,
                        "firstInnings": FIRST_INNINGS}), keys=FORMAT_KEY),
}))})

TEAM_REF = Obj({"id": Str(TEAM_ID), "name": Str()})
MATCH = Obj({
    "id": Str(r"[\w-]+"), "gender": GENDER, "format": FMT, "formatKey": FK,
    "matchTypeNumber": Null(Int()),
    "startDate": Str(DATE), "endDate": Str(DATE), "season": Str(),
    "event": Obj({"name": Null(Str()), "stage": Null(Str()), "matchNumber": Null(Int()),
                  "group": Null(Str())}),
    "venue": Str(), "venueKey": Str(), "city": Null(Str()), "country": Null(Str()),
    "teams": Tup(TEAM_REF, TEAM_REF),
    "toss": Obj({"winner": Null(Str()), "decision": Null(Lit("bat", "field"))}),
    "result": Obj({
        "type": Lit("win", "tie", "draw", "noResult"),
        "winner": Null(Str()), "winnerId": Null(Str(TEAM_ID)),
        "by": Obj({"runs?": Int(), "wickets?": Int(), "innings?": Int()}),
        "method": Null(Str()), "eliminator": Null(Str()), "text": Str(),
    }),
    "playerOfMatch": Arr(Obj({"id": Null(Str(PERSON_ID)), "name": Str()})),
    "scheduledOvers": Null(Int()),
    "innings": Arr(Obj({
        "team": Str(), "teamId": Str(TEAM_ID), "runs": Int(), "wickets": Int(0),
        "balls": Int(), "overs": Str(r"\d+\.[0-5]"), "declared": Bool(),
        "target": Null(Obj({"runs": Int(), "overs": Null(NUM)})), "penaltyRuns": Int(),
    })),
    "missing": Arr(Str()),
    "hasReplay": Bool(), "featuredRank": Null(Int(1)),
})
MATCHES = Obj({"schemaVersion": Lit(2), "matches": Arr(MATCH)})

RECORD5_FIELDS = {"matches": Int(), "won": Int(), "lost": Int(), "tied": Int(), "drawn": Int(),
                  "noResult": Int(), "winPct": Null(PCT)}
RECORD5 = Obj(RECORD5_FIELDS)
PHASE_ROW = Obj({"phase": Str(), "label": Str(), "innings": Int(), "balls": Int(),
                 "runs": Int(), "wickets": Int(), "dots": Int(), "fours": Int(), "sixes": Int()})
TEAM_FORMAT = Obj({
    "formatKey": FK,
    "span": Obj({"first": Str(DATE), "last": Str(DATE)}),
    "record": RECORD5,
    "byYear": Arr(Obj({"year": Str(r"\d{4}"), **RECORD5_FIELDS})),
    "headToHead": Arr(Obj({"opponentId": Str(TEAM_ID), "opponent": Str(), "lastMatchId": Str(),
                           "lastDate": Str(DATE), **RECORD5_FIELDS})),
    "venueType": Obj({k: RECORD5 for k in ("home", "away", "neutral", "unknown")}),
    "batFirstChase": Obj({"battingFirst": RECORD5, "chasing": RECORD5}),
    "toss": Obj({"won": Int(), "lost": Int(), "winPctWonToss": Null(PCT),
                 "winPctLostToss": Null(PCT),
                 "decisions": Obj({"bat": RECORD5, "field": RECORD5})}),
    "venues": Arr(Obj({"venueKey": Str(), "name": Str(), "city": Str(), "country": Str(),
                       "firstInnings": FIRST_INNINGS, "teamFirstInnings": FIRST_INNINGS,
                       "record": RECORD5}), max_len=40),
    "phases": Obj({"batting": Arr(PHASE_ROW), "bowling": Arr(PHASE_ROW)}),
    "topBatters": Arr(Obj({"playerId": Str(PERSON_ID), "name": Str(), "slug": Null(Str()),
                           "innings": Int(), "runs": Int(), "balls": Int(), "outs": Int(),
                           "hundreds": Int(), "fifties": Int(), "highest": Int()}), max_len=15),
    "topBowlers": Arr(Obj({"playerId": Str(PERSON_ID), "name": Str(), "slug": Null(Str()),
                           "innings": Int(), "balls": Int(), "runsConceded": Int(),
                           "wickets": Int(), "fiveWickets": Int()}), max_len=15),
    "recentMatchIds": Arr(Str(), max_len=10),
})
TEAMS_INDEX = Obj({"schemaVersion": Lit(2), "teams": Arr(Obj({
    "id": Str(TEAM_ID), "name": Str(), "gender": GENDER, "label": Str(),
    "formats": Map(Obj({**RECORD5_FIELDS, "first": Str(DATE), "last": Str(DATE)}),
                   allowed=("test", "odi", "t20i")),
}))})
TEAM_FILE = Obj({"schemaVersion": Lit(2), "id": Str(TEAM_ID), "name": Str(), "gender": GENDER,
                 "label": Str(), "formats": Map(TEAM_FORMAT, allowed=("test", "odi", "t20i"))})

SCORE_SUMMARY = Obj({
    "states": Int(), "brier": NUM, "baselineBrier": NUM, "skill": NUM, "logLoss": NUM,
    "calibration": Arr(Obj({"bin": Str(), "states": Int(), "predicted": NNUM,
                            "observed": NNUM})),
})
WIN_MODEL = Obj({
    "formatKey": Str(r"(odi|t20i)-(m|w)"), "gender": GENDER, "format": Lit("odi", "t20i"),
    "maxBalls": Int(1), "theta": Arr(NUM, length=5),
    "features": Tup(Lit("1"), Lit("x"), Lit("x*f"), Lit("f"), Lit("x*w/10")),
    "resources": Arr(Arr(NUM), length=10), "dispersion": Arr(NUM, length=10),
    "resourceParams": Arr(Obj({"z": NUM, "b": NUM}), length=10),
    "firstInningsWin": Arr(Num(0, 1), length=601),
    "par": Int(), "matches": Int(), "halfLifeYears": NNUM,
    "validation": Obj({"trainMatches": Int(), "testMatches": Int(),
                       "halfLifeSelection": Arr(Any()),
                       "firstInnings": SCORE_SUMMARY, "chase": SCORE_SUMMARY}),
    "venues": Map(Obj({"matches": Int(), "averageFirstInnings": NUM, "par": Int()})),
    "golden": Arr(Obj({"ballsLeft": Int(), "wickets": Int(), "runs": Int(), "need": Int(),
                       "chase": Num(0, 1), "battingFirst": Num(0, 1),
                       "projected": Tup(NUM, NUM, NUM)})),
})
WINPROB = Obj({"schemaVersion": Lit(2), "generatedFrom": Str(), "holdoutFrom": Str(DATE),
               "formats": Map(WIN_MODEL, keys=r"(odi|t20i)-(m|w)")})

REPLAY_INDEX = Arr(Obj({
    "id": Str(), "format": FMT, "formatKey": FK, "gender": GENDER, "title": Str(),
    "event": Str(), "stage": Str(), "date": Str(DATE), "venue": Str(), "result": Str(),
}))
EXTRA = Null(Lit("wides", "noballs", "byes", "legbyes", "penalty"))
BALL = Tup(Int(), Int(), Int(), Int(), Int(), Int(), EXTRA, Null(Str()), Null(Int()))
REPLAY = Obj({
    "schemaVersion": Lit(2), "id": Str(), "format": FMT, "formatKey": FK, "gender": GENDER,
    "title": Str(), "event": Str(), "stage": Str(), "date": Str(DATE),
    "venue": Str(), "venueKey": Str(), "city": Str(),
    "teams": Arr(Str()),
    "toss": Obj({"winner?": Str(), "decision?": Str()}),
    "result": Str(), "winner": Null(Str()),
    "scheduledOvers": Null(Int()), "method": Null(Str()),
    "people": Arr(Obj({"id": Str(PERSON_ID), "name": Str(), "team": Str(),
                       "bt?": Str(), "bh?": Lit("right", "left")})),
    "innings": Arr(Obj({"team": Str(), "target": Null(Int()), "targetOvers": Null(NUM),
                        "penaltyRuns": Obj({"pre": Int(), "post": Int()}),
                        "balls": Arr(BALL)})),
    "credit": Str(),
})


# ---------------------------------------------------------------------------
def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def check(spec: Spec, value, path: str) -> list[str]:
    errors: list[str] = []
    spec.check(value, path, errors)
    return errors


def replay_totals(replay: dict) -> list[tuple[int, int, int]]:
    """(runs incl. penalty runs, wickets, legal balls) per replay innings."""
    out = []
    for inn in replay["innings"]:
        runs = sum(b[4] + b[5] for b in inn["balls"])
        runs += inn["penaltyRuns"]["pre"] + inn["penaltyRuns"]["post"]
        wickets = sum(1 for b in inn["balls"]
                      if b[7] and b[7] not in ("retired hurt", "retired not out"))
        legal = sum(1 for b in inn["balls"] if b[6] not in ("wides", "noballs"))
        out.append((runs, wickets, legal))
    return out


def validate_dir(root: Path, *, replays: bool = True, winprob: bool = True) -> list[str]:
    """Every problem with the output in ``root``; empty when it conforms to §1."""
    errors: list[str] = []
    manifest = _load(root / "manifest.json")
    errors += check(MANIFEST, manifest, "manifest")
    fingerprint = _load(root / "fingerprint.json")
    errors += check(FINGERPRINT, fingerprint, "fingerprint")
    if manifest.get("fingerprint") != fingerprint.get("combined"):
        errors.append("manifest.fingerprint differs from fingerprint.combined")

    index = _load(root / "players.json")
    errors += check(PLAYERS_INDEX, index, "players")
    players = index.get("players", [])
    if manifest.get("playerCount") != len(players):
        errors.append("manifest.playerCount differs from players.json")
    ids = [p["id"] for p in players]
    if len(ids) != len(set(ids)):
        errors.append("players.json repeats a person id")
    slugs = {p["slug"] for p in players}
    files = {p.stem for p in (root / "players").glob("*.json")}
    if slugs != files:
        errors.append(f"players/ and players.json disagree: {sorted(slugs ^ files)[:5]}")
    for row in players:
        path = root / "players" / f"{row['slug']}.json"
        if not path.exists():
            continue
        payload = _load(path)
        errors += check(PLAYER_FILE, payload, f"players/{row['slug']}")
        if payload.get("id") != row["id"] or payload.get("gender") != row["gender"]:
            errors.append(f"players/{row['slug']}: id or gender differs from the index")
        g = "w" if row["gender"] == "female" else "m"
        for fmt, fp in payload.get("formats", {}).items():
            if fp.get("formatKey") != f"{fmt}-{g}":
                errors.append(f"players/{row['slug']}.{fmt}: formatKey {fp.get('formatKey')}")

    errors += check(COHORTS, _load(root / "cohorts.json"), "cohorts")
    venues = _load(root / "venues.json")
    errors += check(VENUES, venues, "venues")
    for key, v in venues.get("venues", {}).items():
        if v.get("key") != key:
            errors.append(f"venues.{key}: key field differs")

    matches = _load(root / "matches.json")
    errors += check(MATCHES, matches, "matches")
    rows = matches.get("matches", [])
    if manifest.get("matchCount") != len(rows):
        errors.append("manifest.matchCount differs from matches.json")
    order = [(m["endDate"], m["id"]) for m in rows]
    if order != sorted(order, reverse=True):
        errors.append("matches.json is not sorted by endDate desc, id desc")
    for m in rows:
        if m["venueKey"] not in venues.get("venues", {}):
            errors.append(f"match {m['id']}: venueKey {m['venueKey']!r} not in venues.json")

    teams = _load(root / "teams" / "index.json")
    errors += check(TEAMS_INDEX, teams, "teams/index")
    team_ids = {t["id"] for t in teams.get("teams", [])}
    team_files = {p.stem for p in (root / "teams").glob("*.json")} - {"index"}
    if team_ids != team_files:
        errors.append(f"teams/ and teams/index.json disagree: {sorted(team_ids ^ team_files)[:5]}")
    for tid in sorted(team_files):
        errors += check(TEAM_FILE, _load(root / "teams" / f"{tid}.json"), f"teams/{tid}")
    for m in rows:
        for t in m["teams"]:
            if t["id"] not in team_ids:
                errors.append(f"match {m['id']}: team {t['id']} has no team file")

    if winprob:
        errors += check(WINPROB, _load(root / "winprob.json"), "winprob")

    if replays:
        featured = _load(root / "replays" / "index.json")
        errors += check(REPLAY_INDEX, featured, "replays/index")
        by_id = {m["id"]: m for m in rows}
        ranks = sorted((m["featuredRank"], m["id"]) for m in rows if m["featuredRank"])
        if [r["id"] for r in featured] != [mid for _r, mid in ranks]:
            errors.append("replays/index.json differs from matches.json featuredRank order")
        for m in rows:
            path = root / "replays" / f"{m['id']}.json.gz"
            if not path.exists():
                errors.append(f"replays/{m['id']}.json.gz is missing")
                continue
            replay = json.loads(gzip.decompress(path.read_bytes()))
            replay_errors = check(REPLAY, replay, f"replays/{m['id']}")
            errors += replay_errors
            if replay_errors:
                continue
            # The replay engine's totals must reproduce the scorecard.
            totals = [(i["runs"], i["wickets"], i["balls"]) for i in m["innings"]]
            if replay_totals(replay) != totals:
                errors.append(f"replays/{m['id']}: innings totals {replay_totals(replay)} "
                              f"differ from matches.json {totals}")
        extra = {p.name[:-len(".json.gz")] for p in (root / "replays").glob("*.json.gz")}
        if extra - set(by_id):
            errors.append(f"replays without a match: {sorted(extra - set(by_id))[:5]}")
    return errors
