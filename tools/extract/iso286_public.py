#!/usr/bin/env python3
"""Generate the public ISO 286 data module from the predecessor dependency.

Only literal ISO table assignments are read with stdlib ``ast``.  The source
module is never imported or executed, and no R&M expression is copied.

Historical note: this script is part of the same one-off extraction batch as
the R&M catalogue bootstrap scripts, but its target is different. It
regenerates this repo's own public `packages/nodes/src/iso286-data.ts` table,
not the private R&M catalogue, which is now transcribed and maintained by
hand and must not be regenerated from these scripts.
"""

from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path


NAMES = (
    "IT_C_NR", "IT_C_DIM", "IT_HS_DIM", "IT_Hole_NR", "IT_Shaft_NR",
    "IT_C", "IT_Hole", "IT_Shaft",
)


def literals(source: Path) -> dict[str, object]:
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    found: dict[str, object] = {}
    for statement in tree.body:
        if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
            continue
        target = statement.targets[0]
        if isinstance(target, ast.Name) and target.id in NAMES:
            found[target.id] = ast.literal_eval(statement.value)
    missing = set(NAMES) - found.keys()
    if missing:
        raise SystemExit(f"missing ISO table assignments: {sorted(missing)}")
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    data = literals(args.source)
    lines = [
        "/** Generated public ISO 286 table data. Do not edit by hand. */",
        "",
    ]
    for name in NAMES:
        value = json.dumps(data[name], ensure_ascii=False, separators=(",", ":"))
        lines.append(f"export const {name} = {value} as const;")
    lines.append("")
    args.out.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
