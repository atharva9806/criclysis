"""Hand-built Cricsheet-shaped fixtures with known, checkable answers."""
from __future__ import annotations


def simple_t20() -> dict:
    """A two-over innings whose totals can be worked out on paper.

    Over 1 (Starc, left-arm fast) to Rohit:
        4, 0, 1(to Kohli), then Kohli: 6, wide+0, 0, out caught
    Over 2 (Zampa, leg break) to Kohli/Rohit:
        Rohit: 2, 1 ; Kohli: 0, 4, 0, 1
    """
    return {
        "meta": {"data_version": "1.1.0"},
        "info": {
            "balls_per_over": 6,
            "city": "Mumbai",
            "dates": ["2023-11-19"],
            "gender": "male",
            "match_type": "T20",
            "overs": 20,
            "teams": ["India", "Australia"],
            "venue": "Wankhede Stadium",
            "season": "2023/24",
            "toss": {"winner": "Australia", "decision": "field"},
            "outcome": {"winner": "Australia"},
            "players": {
                "India": ["RG Sharma", "V Kohli"],
                "Australia": ["MA Starc", "A Zampa"],
            },
            "registry": {"people": {
                "RG Sharma": "p-rohit", "V Kohli": "p-kohli",
                "MA Starc": "p-starc", "A Zampa": "p-zampa",
            }},
        },
        "innings": [{
            "team": "India",
            "overs": [
                {"over": 0, "deliveries": [
                    {"batter": "RG Sharma", "bowler": "MA Starc",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 4, "extras": 0, "total": 4}},
                    {"batter": "RG Sharma", "bowler": "MA Starc",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "RG Sharma", "bowler": "MA Starc",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 1, "extras": 0, "total": 1}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 6, "extras": 0, "total": 6}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "extras": {"wides": 1},
                     "runs": {"batter": 0, "extras": 1, "total": 1}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0},
                     "wickets": [{"player_out": "V Kohli", "kind": "caught",
                                  "fielders": [{"name": "A Zampa"}]}]},
                ]},
                {"over": 1, "deliveries": [
                    {"batter": "RG Sharma", "bowler": "A Zampa",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 2, "extras": 0, "total": 2}},
                    {"batter": "RG Sharma", "bowler": "A Zampa",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 1, "extras": 0, "total": 1}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 4, "extras": 0, "total": 4}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 1, "extras": 0, "total": 1}},
                ]},
            ],
        }],
    }


def maiden_over_match() -> dict:
    """One wicket-maiden plus a run-out, to check maiden and credit logic."""
    base = simple_t20()
    base["innings"] = [{
        "team": "India",
        "overs": [
            {"over": 0, "deliveries": [
                {"batter": "RG Sharma", "bowler": "MA Starc",
                 "non_striker": "V Kohli",
                 "runs": {"batter": 0, "extras": 0, "total": 0}}
                for _ in range(5)
            ] + [
                {"batter": "RG Sharma", "bowler": "MA Starc",
                 "non_striker": "V Kohli",
                 "runs": {"batter": 0, "extras": 0, "total": 0},
                 "wickets": [{"player_out": "V Kohli", "kind": "run out",
                              "fielders": [{"name": "A Zampa"}]}]},
            ]},
        ],
    }]
    return base


# Keyed by Cricsheet person id, as the aggregator expects.
STYLES = {"p-starc": "lf", "p-zampa": "lb"}
HANDS = {"p-rohit": "right", "p-kohli": "right"}


def relabel(raw: dict, *, players: dict[str, tuple[str, str]] | None = None,
            teams: dict[str, str] | None = None, gender: str | None = None,
            date: str | None = None) -> dict:
    """A copy of a match with players, teams, gender or date swapped.

    ``players`` maps an old name to (new name, new person id); players not
    named keep their name and id.
    """
    import json
    players = players or {}
    text = json.dumps(raw)
    for old, (new, _pid) in players.items():
        text = text.replace(json.dumps(old), json.dumps(new))
    for old, new in (teams or {}).items():
        text = text.replace(json.dumps(old), json.dumps(new))
    out = json.loads(text)
    registry = {}
    for name, pid in raw["info"]["registry"]["people"].items():
        new_name, new_id = players.get(name, (name, pid))
        registry[new_name] = new_id
    out["info"]["registry"]["people"] = registry
    if gender:
        out["info"]["gender"] = gender
    if date:
        out["info"]["dates"] = [date]
    return out


#: simple_t20's people with hex ids, the shape of real Cricsheet ids.
HEX_IDS = {"RG Sharma": ("RG Sharma", "740742ef"), "V Kohli": ("V Kohli", "ba607b88"),
           "MA Starc": ("MA Starc", "3fb19989"), "A Zampa": ("A Zampa", "14f96089")}


def same_name_pair(copies: int = 1) -> list[tuple[str, dict]]:
    """Two different bowlers both called "A Mishra" (as in the real data).

    One bowls for Australia, the other for Ghana; the same India batters face
    both. ``copies`` repeats each match (on successive days) so the players
    clear the export gates.
    """
    out = []
    for i in range(copies):
        day = f"2023-{1 + i // 28:02d}-{1 + i % 28:02d}"
        first = relabel(simple_t20(), players={**HEX_IDS, "A Zampa": ("A Mishra", "aaaa0001")},
                        date=day)
        second = relabel(simple_t20(), players={**HEX_IDS, "A Zampa": ("A Mishra", "bbbb0002"),
                                                "MA Starc": ("K Mensah", "cccc0003")},
                         teams={"Australia": "Ghana"}, date=day)
        out += [(f"{9000 + 2 * i}", first), (f"{9001 + 2 * i}", second)]
    return out
