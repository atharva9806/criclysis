"""Identifier helpers shared by every writer (docs/ARCHITECTURE.md §1.1)."""
from __future__ import annotations

import re

from .config import GENDERS

SLUG_RE = re.compile(r"[^a-z0-9]+")


def slug_text(text: str) -> str:
    """'United States of America' -> 'united-states-of-america'."""
    return SLUG_RE.sub("-", (text or "").lower()).strip("-")


def slugify(name: str, player_id: str) -> str:
    """A player's URL slug: their name plus their person id."""
    base = slug_text(name)
    return f"{base}-{player_id[:8]}" if base else player_id


def team_id(name: str, gender: str) -> str:
    """'India' + 'female' -> 'india-w'."""
    return f"{slug_text(name)}-{GENDERS[gender]}"


def team_label(name: str, gender: str) -> str:
    """'India' + 'female' -> 'India Women'."""
    return f"{name} Women" if gender == "female" else name
