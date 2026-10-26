#!/usr/bin/env python3
"""Copy stdin to stdout with the values of secret environment variables masked.

    npm run import ... 2>&1 | python3 -u scripts/ci/redact.py DATABASE_URL | tee report.txt

GitHub masks secrets in the job log but not in uploaded artifacts, and
artifacts of a public repository can be downloaded by any signed-in GitHub
user. So anything uploaded from a step that sees a secret goes through this
filter first. For every named variable it masks the whole value and, when the
value is a URL with credentials, the password on its own (raw and
percent-decoded). Standard library only.
"""
from __future__ import annotations

import os
import sys
from urllib.parse import unquote, urlsplit

MASK = "***"


def secrets_from(names: list[str]) -> list[str]:
    found: set[str] = set()
    for name in names:
        value = os.environ.get(name, "")
        if not value:
            continue
        found.add(value)
        try:
            password = urlsplit(value).password
        except ValueError:
            password = None
        if password:
            found.update({password, unquote(password)})
    # Longest first, so a password inside a masked URL cannot leave a fragment.
    return sorted((s for s in found if len(s) >= 4), key=len, reverse=True)


def main(argv: list[str]) -> int:
    secrets = secrets_from(argv)
    for line in sys.stdin:
        for secret in secrets:
            line = line.replace(secret, MASK)
        sys.stdout.write(line)
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
