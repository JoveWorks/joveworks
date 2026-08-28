#!/usr/bin/env python3
"""Extract the cylindrical press-fit slice from the predecessor source.

The predecessor is parsed with stdlib ``ast`` only; it is never imported or
executed.  Its restricted output is written to the separate private catalogue:

    python3 tools/extract/c12_pressfit.py

This public script deliberately contains no R&M expression.

Historical note: this script was a one-off bootstrap that seeded the
earliest catalogue records. The catalogue is now transcribed and maintained
by hand in the private repository, has since diverged from what this script
would produce, and carries sign-off work this script knows nothing about.
Do not re-run it against the maintained catalogue.
"""

from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import re
from pathlib import Path


def belt_helpers():
    """Reuse the AST renderer, never the predecessor package."""
    path = Path(__file__).with_name("c16_belt.py")
    spec = importlib.util.spec_from_file_location("c16_belt_extract", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load extraction helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


H = belt_helpers()
SCHEMA_VERSION = 1
CATALOGUE_ID = "rm-c12-pressfit"
CATALOGUE_NAME = "Roloff & Matek — chapter 12, cylindrical press fits"
ID_PREFIX = "rm."

# R&M sign-off, 2026-08-18: the predecessor omitted F_res's unit tag, but 12.8
# defines it as the resultant of two forces.  It is therefore declared [N].
# Keep this correction here rather than changing the predecessor reference.
TAG_CORRECTIONS = {
    "F_res": "[N] resultant tangential force",
    # R&M sign-off, 2026-08-18: sigma_tUu is a tangential stress. Keep the
    # source's normal machine-design display unit rather than bare Pa.
    "sigma_tUu": "[N/mm²] tangential tension outer edge outer component",
}

# 12.13 assigns its local result to lower-case z_min, although its own
# docstring, declared port, and every consuming notebook assignment use Z_min.
# This is an identifier typo, not a formula change.
OUTPUT_CORRECTIONS = {"E12_13_Z_min": "Z_min"}

# Formula records exercised by PressFit1_TD.ipynb after F_S is supplied as the
# notebook's resultant design force.  Verification is per record, not per run.
VERIFIED = {
    "E12_5_hA_Q_U", "E12_5_hB_Q_I", "E12_8_hA_F_res", "E12_8_F_S", "E12_9_p_Fmin", "E12_9_hA_AF",
    "E12_12_K", "E12_13_Z_min", "E12_14_G", "E12_15_S_nmin",
    "E12_16A_p_Fmax_Outer", "E12_16B_p_Fmax_InnerHollow", "E12_17_Z_max",
    "E12_18_Snmax", "E12_19_P_T", "E12_20_hA_TB",
}

NORMAL = re.compile(r"^E12_(?P<number>\d+)(?P<letter>[A-Z])?_(?P<tail>.*)$")
HELPER = re.compile(r"^h(?P<letter>[A-Z])_")
CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


class KernelNames(ast.NodeTransformer):
    """Map predecessor/SymPy spellings onto the kernel's approved grammar."""

    def visit_Name(self, node: ast.Name) -> ast.expr:  # noqa: N802
        if node.id == "Abs":
            return ast.copy_location(ast.Name(id="abs", ctx=node.ctx), node)
        return node


def method_key(method: ast.FunctionDef) -> str:
    return method.name


def in_slice(method: ast.FunctionDef) -> bool:
    match = NORMAL.match(method.name)
    return match is not None and 5 <= int(match.group("number")) <= 20


def identity(name: str) -> tuple[str, str, str, bool]:
    """Return record label, equation family, citation, and helper flag."""
    match = NORMAL.match(name)
    if match is None:
        raise SystemExit(f"cannot read equation number from {name}")
    base = f"12.{int(match.group('number'))}"
    helper = HELPER.match(match.group("tail"))
    if helper is not None:
        letter = helper.group("letter").lower()
        return f"{base}.helper-{letter}", base, f"R&M {base} (helper {letter.upper()})", True
    letter = match.group("letter") or ""
    # The predecessor carries two distinct 16B forms.  Their source names make
    # the physical case explicit, so retain that distinction in the global id.
    if name in {"E12_16B_p_Fmax_InnerHollow", "E12_16B_p_Fmax_InnerMassive"}:
        case = "hollow" if name.endswith("Hollow") else "massive"
        return f"{base}B.{case}", base, f"R&M {base}B ({case})", False
    return f"{base}{letter}", base, f"R&M {base}{letter}", False


def title(name: str) -> str:
    tail = NORMAL.match(name).group("tail")  # type: ignore[union-attr]
    tail = HELPER.sub("", tail)
    words = CAMEL.sub(" ", tail).split("_")
    text = " ".join(word for word in words if word)
    return text[:1].upper() + text[1:].lower()


def notes(method: ast.FunctionDef) -> list[str]:
    doc = ast.get_docstring(method, clean=True) or ""
    return [line.strip() for line in doc.splitlines()[1:] if line.strip()]


def build(source: Path) -> dict:
    cls = H.load_class(source, "ShaftConnection")
    tags = {**H.symbol_dict(cls), **TAG_CORRECTIONS}
    records: list[dict] = []
    seen: set[str] = set()

    methods = [
        item for item in cls.body
        if isinstance(item, ast.FunctionDef) and item.name.startswith("E12_") and in_slice(item)
    ]
    for method in methods:
        key = method_key(method)
        seen.add(key)
        target, value = H.method_body(method)
        if target is None or value is None:
            raise SystemExit(f"{key}: not a simple assigned formula")
        target = OUTPUT_CORRECTIONS.get(key, target)
        expression = KernelNames().visit(H.Transcribe().visit(ast.parse(ast.unparse(value), mode="eval").body))
        label, base, citation, helper = identity(key)
        description = ". ".join([title(key)] + notes(method)).strip()
        if not description.endswith("."):
            description += "."
        record = {
            "id": ID_PREFIX + label,
            "version": 1,
            "output": H.port(target, tags),
            "inputs": [H.port(name, tags) for name in H.names_in(expression)],
            "expression": H.render(expression),
            "description": description,
            "citation": citation,
            "status": "verified" if key in VERIFIED else "unverified",
            "_base": base,
            "_helper": helper,
        }
        records.append(record)

    missing = VERIFIED - seen
    if missing:
        raise SystemExit(f"VERIFIED names methods not found in the source: {sorted(missing)}")
    counts: dict[str, int] = {}
    for record in records:
        if not record["_helper"]:
            counts[record["_base"]] = counts.get(record["_base"], 0) + 1
    for record in records:
        base, helper = record.pop("_base"), record.pop("_helper")
        if not helper and counts.get(base, 0) > 1:
            record["variantOf"] = ID_PREFIX + base

    ordered = [H.order_fields(record) for record in records]
    verified = sum(record["status"] == "verified" for record in ordered)
    print(f"{len(ordered)} records: {verified} verified, {len(ordered) - verified} unverified")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": CATALOGUE_ID,
        "name": CATALOGUE_NAME,
        "restricted": True,
        "formulas": ordered,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path.home() / "source/mechanical-design/MechDesign/RnM/C12_ShaftConnection.py")
    parser.add_argument("--out", type=Path, default=Path.home() / "source/machine-design-catalogue/formulas/c12-pressfit.json")
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(build(args.source), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
