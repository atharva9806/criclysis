"""A fingerprint of the source archives, so a refresh can skip unchanged data.

The fingerprint hashes each zip's central directory - every member's name,
CRC-32 and uncompressed size - rather than the zip bytes. Re-zipping identical
files changes the bytes (timestamps, compression) but not the fingerprint,
while a revised match file (Cricsheet revises about a quarter of its files at
some point) changes its CRC and therefore the fingerprint. Reading the
directory touches no member data, so it takes milliseconds.

    sha256 of an archive  = sha256 over "name\\tcrc32-hex\\tsize\\n" lines, sorted by name
    combined              = "sha256:" + sha256 over "archive\\tsha256\\n" lines, sorted
"""
from __future__ import annotations

import hashlib
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def archive_digest(path: Path) -> dict:
    """{files, sha256} for one zip archive."""
    with zipfile.ZipFile(path) as zf:
        entries = sorted((i.filename, i.CRC, i.file_size) for i in zf.infolist()
                         if not i.is_dir())
    digest = hashlib.sha256()
    for name, crc, size in entries:
        digest.update(f"{name}\t{crc:08x}\t{size}\n".encode("utf-8"))
    return {"files": len(entries), "sha256": digest.hexdigest()}


def fingerprint(archives: dict[str, Path]) -> dict:
    """The fingerprint.json payload for ``{archive file name: path}``."""
    out = {name: archive_digest(path) for name, path in sorted(archives.items())}
    combined = hashlib.sha256()
    for name, entry in out.items():
        combined.update(f"{name}\t{entry['sha256']}\n".encode("utf-8"))
    return {"archives": out, "combined": f"sha256:{combined.hexdigest()}"}


def generated_at(archives: list[Path]) -> str:
    """The dataset's timestamp: when its newest source file was written.

    Taken from the archives, not the clock, so that building the same input
    twice gives byte-identical output. ``SOURCE_DATE_EPOCH`` (the
    reproducible-builds convention) overrides it. Zip times carry no zone;
    Cricsheet's are read as UTC.
    """
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat(timespec="seconds")
    times = []
    for path in archives:
        if path.exists():
            with zipfile.ZipFile(path) as zf:
                times.extend(i.date_time for i in zf.infolist())
    stamp = datetime(*max(times), tzinfo=timezone.utc) if times else \
        datetime(1970, 1, 1, tzinfo=timezone.utc)
    return stamp.isoformat(timespec="seconds")
