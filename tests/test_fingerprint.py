"""The source fingerprint, the build id, and byte-identical builds."""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

from pipeline.build import build_dataset
from pipeline.fingerprint import archive_digest, fingerprint, generated_at
from tests.fixtures import simulated_matches, write_archive


def zip_members(path: Path, members: dict[str, str], *, when=(2024, 1, 2, 3, 4, 5),
                compression=zipfile.ZIP_DEFLATED) -> None:
    with zipfile.ZipFile(path, "w", compression) as zf:
        for name, text in members.items():
            zf.writestr(zipfile.ZipInfo(name, date_time=when), text)


class FingerprintTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_rezipping_the_same_files_keeps_the_fingerprint(self):
        a, b = self.dir / "a.zip", self.dir / "b.zip"
        zip_members(a, {"1.json": "{}", "2.json": "[]"})
        zip_members(b, {"2.json": "[]", "1.json": "{}"}, when=(2025, 6, 7, 8, 9, 10),
                    compression=zipfile.ZIP_STORED)
        self.assertNotEqual(a.read_bytes(), b.read_bytes())
        self.assertEqual(archive_digest(a), archive_digest(b))
        self.assertEqual(archive_digest(a)["files"], 2)

    def test_a_revised_or_added_file_changes_it(self):
        base = self.dir / "base.zip"
        zip_members(base, {"1.json": '{"v": 1}'})
        revised = self.dir / "revised.zip"
        zip_members(revised, {"1.json": '{"v": 2}'})
        added = self.dir / "added.zip"
        zip_members(added, {"1.json": '{"v": 1}', "2.json": "{}"})
        digests = {archive_digest(p)["sha256"] for p in (base, revised, added)}
        self.assertEqual(len(digests), 3)

    def test_combined_covers_every_archive(self):
        a, b = self.dir / "tests_json.zip", self.dir / "odis_json.zip"
        zip_members(a, {"1.json": "{}"})
        zip_members(b, {"2.json": "{}"})
        fp = fingerprint({"tests_json.zip": a, "odis_json.zip": b})
        self.assertEqual(list(fp["archives"]), ["odis_json.zip", "tests_json.zip"])
        self.assertRegex(fp["combined"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(fp, fingerprint({"odis_json.zip": b, "tests_json.zip": a}))
        zip_members(b, {"2.json": "{ }"})
        self.assertNotEqual(fp["combined"],
                            fingerprint({"tests_json.zip": a, "odis_json.zip": b})["combined"])

    def test_generated_comes_from_the_archives(self):
        a = self.dir / "a.zip"
        zip_members(a, {"1.json": "{}"}, when=(2026, 6, 29, 16, 35, 48))
        saved = os.environ.pop("SOURCE_DATE_EPOCH", None)
        try:
            self.assertEqual(generated_at([a]), "2026-06-29T16:35:48+00:00")
            os.environ["SOURCE_DATE_EPOCH"] = "0"
            self.assertEqual(generated_at([a]), "1970-01-01T00:00:00+00:00")
        finally:
            os.environ.pop("SOURCE_DATE_EPOCH", None)
            if saved is not None:
                os.environ["SOURCE_DATE_EPOCH"] = saved


class ReproducibleBuildTests(unittest.TestCase):
    def test_two_builds_are_byte_identical(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            archive = tmp / "t20s_json.zip"
            write_archive(archive, simulated_matches("t20i", 30, seed=3)
                          + simulated_matches("t20i", 30, gender="female", seed=4, suffix=" (W)"))
            outputs = []
            for n in (1, 2):
                out = tmp / f"out{n}"
                build_dataset(out, formats=("t20i",), archives={"t20i": archive}, sha="abc1234")
                outputs.append({p.relative_to(out).as_posix(): p.read_bytes()
                                for p in sorted(out.rglob("*")) if p.is_file()})
            self.assertEqual(set(outputs[0]), set(outputs[1]))
            for name in outputs[0]:
                self.assertEqual(outputs[0][name], outputs[1][name], name)

            manifest = json.loads(outputs[0]["manifest.json"])
            fp = json.loads(outputs[0]["fingerprint.json"])
            self.assertEqual(manifest["fingerprint"], fp["combined"])
            self.assertEqual(fp, fingerprint({"t20s_json.zip": archive}))
            self.assertEqual(manifest["generated"], "2024-01-02T03:04:06+00:00")
            self.assertEqual(manifest["buildId"], "2024-01-02T03:04:06+00:00-abc1234")
            self.assertEqual(manifest["provenance"]["dataset"], "live")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class CommandTests(unittest.TestCase):
    def test_fingerprint_command_matches_the_build(self):
        from pipeline import cli
        from pipeline.sources import cricsheet
        tmp = Path(tempfile.mkdtemp())
        saved = cricsheet.archive_path
        try:
            archive = tmp / "t20s_json.zip"
            zip_members(archive, {"1.json": "{}"})
            cricsheet.archive_path = lambda fmt: archive
            out = tmp / "data" / "fingerprint.json"
            self.assertEqual(cli.main(["fingerprint", "--formats", "t20i", "--out", str(out)]), 0)
            self.assertEqual(json.loads(out.read_text()),
                             fingerprint({"t20s_json.zip": archive}))
            cricsheet.archive_path = lambda fmt: tmp / "missing.zip"
            self.assertEqual(cli.main(["fingerprint", "--out", str(out)]), 1)
        finally:
            cricsheet.archive_path = saved
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
