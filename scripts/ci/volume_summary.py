#!/usr/bin/env python3
"""Summarise the size of a refresh build as Markdown (for $GITHUB_STEP_SUMMARY).

    python3 scripts/ci/volume_summary.py data/out=male data/out-female=female

Each argument is a pipeline output directory, optionally followed by the
gender of its rows. That default is needed for v1 manifests, whose formats are
keyed by "odi" and carry no gender. v2 manifests key formats by formatKey
("odi-w") and carry a gender, which wins. Missing directories are skipped.

The table gives the women's volume next to the men's (ARCHITECTURE §7, R4):
matches, deliveries, players and first and last dates per format, plus the
bytes on disk of each directory. Standard library only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

FIELDS = ("matches", "deliveries", "players", "venues")


def dir_stats(path: Path) -> tuple[int, int]:
    files = [p for p in path.rglob("*") if p.is_file()]
    return len(files), sum(p.stat().st_size for p in files)


def mb(n: int) -> str:
    return f"{n / 1e6:,.1f} MB"


def rows_from(path: Path, default_gender: str) -> list[dict]:
    manifest = json.loads((path / "manifest.json").read_text())
    rows = []
    for key, spec in sorted((manifest.get("formats") or {}).items()):
        fmt = spec.get("format") or key.split("-")[0]
        gender = spec.get("gender") or default_gender
        row = {"dir": str(path), "fmt": fmt, "gender": gender}
        row.update({f: spec.get(f) for f in FIELDS})
        row["first"] = spec.get("firstDate", "")
        row["last"] = spec.get("lastDate", "")
        rows.append(row)
    return rows


def ratio(w, m) -> str:
    if not isinstance(w, (int, float)) or not isinstance(m, (int, float)) or not m:
        return "n/a"
    return f"{100 * w / m:.0f}%"


def main(argv: list[str]) -> int:
    out: list[str] = ["## Build volume", ""]
    rows: list[dict] = []
    sizes: list[str] = []
    for arg in argv:
        name, _, gender = arg.partition("=")
        path = Path(name)
        if not path.is_dir():
            continue
        files, size = dir_stats(path)
        sizes.append(f"| `{path}` | {files:,} | {mb(size)} |")
        if (path / "manifest.json").is_file():
            try:
                rows.extend(rows_from(path, gender or "male"))
            except (OSError, ValueError, AttributeError) as exc:
                out.append(f"Could not read `{path}/manifest.json`: {exc}")

    archives = sorted(Path(".cache/raw/cricsheet").glob("*.zip"))
    if archives:
        out += ["Cricsheet archives (men's and women's matches together):", ""]
        out += [f"- `{a.name}`: {mb(a.stat().st_size)}" for a in archives]
        out.append("")

    if not rows and not sizes:
        out.append("No build output was found.")
        print("\n".join(out))
        return 0

    if rows:
        out += ["| Format | Gender | Matches | Deliveries | Players | Venues | First | Last |",
                "|---|---|---:|---:|---:|---:|---|---|"]
        for r in rows:
            nums = " | ".join(
                f"{r[f]:,}" if isinstance(r[f], int) else "" for f in FIELDS)
            out.append(f"| {r['fmt']} | {r['gender']} | {nums} | {r['first']} | {r['last']} |")
        out.append("")

        by = {(r["fmt"], r["gender"]): r for r in rows}
        fmts = sorted({r["fmt"] for r in rows})
        pairs = [(by.get((f, "female")), by.get((f, "male"))) for f in fmts]
        pairs = [(f, w, m) for f, (w, m) in zip(fmts, pairs) if w and m]
        if pairs:
            out += ["Women's volume as a share of men's:", "",
                    "| Format | Matches | Deliveries | Players |", "|---|---:|---:|---:|"]
            tot_w = {f: 0 for f in ("matches", "deliveries")}
            tot_m = dict(tot_w)
            for fmt, w, m in pairs:
                out.append(f"| {fmt} | {ratio(w['matches'], m['matches'])} | "
                           f"{ratio(w['deliveries'], m['deliveries'])} | "
                           f"{ratio(w['players'], m['players'])} |")
                for f in tot_w:
                    if isinstance(w[f], int) and isinstance(m[f], int):
                        tot_w[f] += w[f]
                        tot_m[f] += m[f]
            out.append(f"| all | {ratio(tot_w['matches'], tot_m['matches'])} | "
                       f"{ratio(tot_w['deliveries'], tot_m['deliveries'])} | |")
            out.append("")

    if sizes:
        out += ["| Output | Files | Size |", "|---|---:|---:|", *sizes, ""]

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
