"""Command line entry point.

    python -m pipeline fetch     --formats test odi t20i
    python -m pipeline build     --genders male female
    python -m pipeline winprob   # fit and validate the win-probability models
    python -m pipeline replays   --all --genders male female
    python -m pipeline fingerprint --out data/out/fingerprint.json
    python -m pipeline fixtures  --out fixtures/data-out
    python -m pipeline all       # fetch then build

``build`` is the one that matters: it streams the downloaded archives, fills the
aggregates, runs the strengths/weaknesses analysis and writes data/out in the
shape docs/ARCHITECTURE.md §1 describes. Nothing here scrapes or calls an API:
the only network access is ``fetch``, which downloads Cricsheet's archives.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import net
from .config import ALL_FORMATS, FORMATS, GENDERS, WEB_DATA_DIR
from .sources import cricsheet

log = logging.getLogger("pipeline")


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )


# ---------------------------------------------------------------------------
def cmd_fetch(args) -> int:
    failures = 0
    for fmt in args.formats:
        try:
            path = cricsheet.download_archive(
                fmt, use_cache=not args.refresh,
                allow_mirror=not getattr(args, "no_mirror", False))
            size = path.stat().st_size / 1e6
            log.info("%-5s %s (%.1f MB)", fmt, path, size)
        except net.Blocked as exc:
            log.error("blocked by robots.txt: %s", exc)
            failures += 1
        except net.FetchError as exc:
            log.error("could not fetch %s: %s", fmt, exc)
            failures += 1
    return 1 if failures else 0


def cmd_build(args) -> int:
    from .build import build_dataset
    try:
        build_dataset(Path(args.out), formats=tuple(args.formats), genders=tuple(args.genders),
                      styles_file=Path(args.styles_file) if args.styles_file else None,
                      limit_matches=args.limit_matches, pretty=args.pretty)
    except FileNotFoundError as exc:
        log.error("%s", exc)
        return 1
    return 0


def cmd_winprob(args) -> int:
    from .winprob import build
    try:
        build(tuple(args.formats), Path(args.out), genders=tuple(args.genders))
    except FileNotFoundError as exc:
        log.error("%s", exc)
        return 1
    return 0


def cmd_replays(args) -> int:
    from . import corpus
    from .enrich import resolve, split_maps
    from .replay import export_replays, replay_items
    try:
        scanned = corpus.scan()
        styles, hands = split_maps(resolve(scanned)[0])
        index = export_replays(
            replay_items(args.formats, tuple(args.genders), all_matches=args.all),
            out_dir=Path(args.out), venue_key=scanned.venues.key, styles=styles, hands=hands)
    except FileNotFoundError as exc:
        log.error("%s", exc)
        return 1
    return 0 if index else 1


def cmd_fingerprint(args) -> int:
    from .export import write_json
    from .fingerprint import fingerprint
    paths = {cricsheet.archive_path(fmt).name: cricsheet.archive_path(fmt) for fmt in args.formats}
    missing = [str(p) for p in paths.values() if not p.exists()]
    if missing:
        log.error("missing archives: %s - run `python -m pipeline fetch` first", ", ".join(missing))
        return 1
    payload = fingerprint(paths)
    write_json(Path(args.out), payload, pretty=True)
    log.info("%s -> %s", payload["combined"], args.out)
    return 0


def cmd_fixtures(args) -> int:
    from .fixtures import build_fixtures
    try:
        build_fixtures(Path(args.out))
    except FileNotFoundError as exc:
        log.error("%s", exc)
        return 1
    return 0


def cmd_all(args) -> int:
    for step in (cmd_fetch, cmd_build):
        code = step(args)
        if code:
            return code
    return 0


# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline",
        description="Build the cricket analytics dataset.")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_formats(p, default=tuple(FORMATS), choices=tuple(ALL_FORMATS)):
        p.add_argument("--formats", nargs="+", default=list(default), choices=list(choices),
                       help="formats to process (default: %(default)s)")

    def add_genders(p):
        p.add_argument("--genders", nargs="+", default=list(GENDERS), choices=list(GENDERS),
                       help="genders to process (default: %(default)s)")
        # Kept for old scripts: --gender any is both genders.
        p.add_argument("--gender", choices=[*GENDERS, "any"], help=argparse.SUPPRESS)

    def add_build_options(p):
        add_formats(p, choices=tuple(FORMATS))
        add_genders(p)
        p.add_argument("--out", default=str(WEB_DATA_DIR))
        p.add_argument("--styles-file", help="extra styles CSV to merge in")
        p.add_argument("--limit-matches", type=int, dest="limit_matches",
                       help="only process the first N matches per format (a quick trial run)")
        p.add_argument("--pretty", action="store_true",
                       help="indent the JSON (much larger; useful for debugging)")

    p_fetch = sub.add_parser("fetch", help="download Cricsheet archives")
    add_formats(p_fetch)
    p_fetch.add_argument("--refresh", action="store_true",
                         help="ignore the cache and re-download")
    p_fetch.add_argument("--no-mirror", action="store_true", dest="no_mirror",
                         help="only use cricsheet.org; do not fall back to a mirror")
    p_fetch.set_defaults(func=cmd_fetch)

    p_build = sub.add_parser("build", help="aggregate, analyse and export")
    add_build_options(p_build)
    p_build.set_defaults(func=cmd_build)

    p_wp = sub.add_parser("winprob", help="fit and validate the win-probability models")
    p_wp.add_argument("--formats", nargs="+", default=["odi", "t20i"], choices=["odi", "t20i"])
    add_genders(p_wp)
    p_wp.add_argument("--out", default=str(WEB_DATA_DIR))
    p_wp.set_defaults(func=cmd_winprob)

    p_rp = sub.add_parser("replays", help="export matches for replay mode")
    p_rp.add_argument("--all", action="store_true",
                      help="every match, not only the featured ones")
    add_formats(p_rp, choices=tuple(FORMATS))
    add_genders(p_rp)
    p_rp.add_argument("--out", default=str(WEB_DATA_DIR))
    p_rp.set_defaults(func=cmd_replays)

    p_fp = sub.add_parser("fingerprint", help="fingerprint the downloaded archives")
    add_formats(p_fp, choices=tuple(FORMATS))
    p_fp.add_argument("--out", default=str(WEB_DATA_DIR / "fingerprint.json"))
    p_fp.set_defaults(func=cmd_fingerprint)

    p_fx = sub.add_parser("fixtures", help="write the small deterministic fixture dataset")
    p_fx.add_argument("--out", default="fixtures/data-out")
    p_fx.set_defaults(func=cmd_fixtures)

    p_all = sub.add_parser("all", help="fetch then build")
    add_build_options(p_all)
    p_all.add_argument("--refresh", action="store_true")
    p_all.add_argument("--no-mirror", action="store_true", dest="no_mirror")
    p_all.set_defaults(func=cmd_all)
    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    args = build_parser().parse_args(argv)
    # The old single --gender option maps onto --genders ("any" is both).
    gender = getattr(args, "gender", None)
    if gender:
        args.genders = list(GENDERS) if gender == "any" else [gender]
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    setup_logging(args.verbose)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
