"""The committed fixtures conform to the output contract (ARCHITECTURE.md §1).

Other streams build and test against ``fixtures/data-out``, so it must match
§1 exactly. Regenerate it with ``python -m pipeline fixtures --out
fixtures/data-out`` (needs the Cricsheet archives).
"""
from __future__ import annotations

import unittest
from pathlib import Path

from tests.contract import validate_dir

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "data-out"


class FixtureContractTests(unittest.TestCase):
    def test_fixtures_exist(self):
        self.assertTrue((FIXTURES / "manifest.json").exists(),
                        "run `python -m pipeline fixtures --out fixtures/data-out`")

    def test_every_file_conforms(self):
        errors = validate_dir(FIXTURES)
        self.assertEqual(errors[:20], [], f"{len(errors)} contract violations")

    def test_fixture_is_small(self):
        size = sum(p.stat().st_size for p in FIXTURES.rglob("*") if p.is_file())
        self.assertLess(size, 3_000_000)

    def test_fixture_is_live_data(self):
        import json
        manifest = json.loads((FIXTURES / "manifest.json").read_text())
        self.assertEqual(manifest["provenance"]["dataset"], "live")


if __name__ == "__main__":
    unittest.main()
