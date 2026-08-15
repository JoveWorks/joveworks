#!/usr/bin/env python3
"""Extract the belt chapter of the predecessor package into catalogue data.

One-off, one chapter (S52). It **parses** `~/source/mechanical-design` with
stdlib `ast` and never imports or runs it, so there is no sympy here and no
dependency of any kind.

    python3 tools/extract/c16_belt.py \\
        --source ~/source/mechanical-design/MechDesign/RnM/C16_Belt.py \\
        --out ~/source/machine-design-catalogue/formulas/c16-belt.json

**This file is public; its output is not.** Nothing here may quote a formula:
the canonicalisation table below names methods and the numeric factors to
remove, never an expression. The generated JSON goes to the private catalogue
repository (S45) and nowhere else.

What it produces per method, and why each part is captured here rather than
later:

* the **expression**, transcribed from the code rather than the docstring —
  the two have drifted, and the code is what the golden notebooks ran;
* **canonical constants** (S53, S62). The predecessor wrote unit conversions
  into its expressions because it had no unit system. Here conversion happens
  at the boundary, so those factors are stripped and every number that survives
  is in mm-N-s-rad-K;
* **ports** from the class-level `MySymbolDict`, whose `'[unit] description'`
  entries are the unit table that was never machine-read;
* **`variantOf`** (S17), grouping by R&M equation number — recoverable now,
  effectively unrecoverable once the method names are gone;
* **`status`** (S19). Everything starts `unverified`; the goldens are a later
  step and nothing is `verified` until one exercises it. The quarantine table
  carries what the dimension check refuses, each with a reason.

Ids are namespaced `rm.16.<n>` (S65): a graph's reference carries no catalogue
id, so an R&M id shares one namespace with `add` from the base library.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
from pathlib import Path

SCHEMA_VERSION = 1
CATALOGUE_ID = "rm-c16-belt"
CATALOGUE_NAME = "Roloff & Matek — chapter 16, belt drives"
ID_PREFIX = "rm."
CHAPTER = "16"

# --- what the transcription deliberately changes -----------------------------

# Numeric factors that are a unit conversion rather than part of the relation,
# listed per method and removed once each (S53). The predecessor had no unit
# system, so it wrote the conversion into the expression; conversion at the
# boundary supplies the same factor, and leaving these in would apply it twice.
STRIP_FACTORS: dict[str, list[float]] = {
    "E16_5": [1e-6, 1e3],
    "E16_8": [100],
    "E16_9": [1e-3, 1e-3, 100],
    "E16_17": [1e-3],
    "E16_18A": [1e3],
    "E16_18B": [1e3],
}

# Literals that are a percent scale rather than a quantity. A port tagged `[%]`
# holds a fraction canonically (S21), so the hundreds written around it become
# ones. Applied after the factors above, which have already consumed any `100`
# standing as a plain multiplier.
REPLACE_LITERALS: dict[str, dict[float, float]] = {
    "E16_9": {100: 1},
}

# S19/S20. A record here is extracted like any other and simply cannot be
# evaluated until signed off. Each reason states what the dimension check
# refuses and what the evidence for a correction is; none of them is fixed
# here, because a defect corrected silently is the failure mode this project
# exists to remove.
QUARANTINE: dict[str, str] = {
    "E16_24A": (
        "the expression produces an angle (acos returns one, S54) while R&M tags the "
        "wrap angle []. Every other belt formula consumes that angle as a pure number, "
        "so retagging it alone would break the wiring. Needs a decision, not a fix — "
        "see the session report; not believed to be a defect in the source"
    ),
    "E16_24B": (
        "same as 16.24A: acos returns an angle (S54) and the declared tag is []. "
        "Needs a decision, not a fix"
    ),
    "E16_31": (
        "dimensionally unsound as transcribed: power divided by a specific torque is a "
        "velocity, not a width. Proposed correction — the specific *power* symbol, "
        "declared in the source's symbol dict and used by no method, in place of the "
        "specific torque. Evidence: dimensional analysis, plus 16.32 being the torque "
        "twin of this formula and dimensionally sound. Needs sign-off against R&M"
    ),
    "E16_34": (
        "dimensionally unsound as transcribed: two dimensionless strains times a "
        "dimensionless belt-type factor times a width is a length, not a force. The "
        "suspect is the unit tag rather than the expression — the belt-type factor is "
        "tagged [] and would have to carry force per unit width. The docstring also "
        "writes the factor as an exponent where the code multiplies, and an exponent "
        "must be dimensionless in any reading. Needs sign-off against R&M (S20)"
    ),
    "E16_36B": (
        "dimensionally unsound as transcribed: a product of two lengths declared as a "
        "length. Proposed correction — a sum, not a product. Evidence: this method's "
        "own docstring writes a sum, and its sibling 16.36C is a sum of the same two "
        "quantities. High confidence, but a defect is signed off, never fixed silently"
    ),
}

# Not a formula: the source method returns `False` and its docstring points at a
# table of limits. There is no expression to record, and inventing one would be
# the silent-placeholder failure the status field exists to avoid.
NOT_A_FORMULA = {"E16_35"}

# Docstring notes that describe the predecessor's own API rather than the
# formula. 16.1's second form carries seven lines warning that assigning its
# result back to its own input creates a loop — a hazard S18 removes by
# refusing the connection, so the warning would only confuse a student. The one
# sentence about the formula is kept.
NOTE_OVERRIDES: dict[str, list[str]] = {
    "E16_1B": ["remeber convertion from ° to rad"],
}

# The one method R&M does not number. Its docstring places it in the belt-force
# section after 16.37; a citation naming an equation that does not exist would
# be worse than saying so.
UNNUMBERED = {"E16_00A": "R&M 16, unnumbered (belt forces, after 16.37)"}

# --- reading the source ------------------------------------------------------


def load_class(source: Path, name: str) -> ast.ClassDef:
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == name:
            return node
    raise SystemExit(f"{source}: no class {name}")


def symbol_dict(cls: ast.ClassDef) -> dict[str, str]:
    """The class-level `MySymbolDict`: symbol -> `'[unit] description'`."""
    for node in cls.body:
        if not isinstance(node, ast.Assign):
            continue
        targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
        if "MySymbolDict" not in targets or not isinstance(node.value, ast.Dict):
            continue
        tags: dict[str, str] = {}
        for key, value in zip(node.value.keys, node.value.values):
            if isinstance(key, ast.Constant) and isinstance(value, ast.Constant):
                tags[str(key.value)] = str(value.value)
        return tags
    raise SystemExit("no MySymbolDict on the class")


TAG = re.compile(r"^\s*\[([^\]]*)\]\s*(.*)$", re.DOTALL)


def read_tag(text: str) -> tuple[str, str]:
    """Split `'[N] normal force'`. A missing tag is an undeclared unit (S5)."""
    match = TAG.match(text)
    if match is None:
        raise SystemExit(f"undeclared unit in tag {text!r}")
    return match.group(1).strip(), match.group(2).strip()


def formula_methods(cls: ast.ClassDef) -> list[ast.FunctionDef]:
    return [
        node
        for node in cls.body
        if isinstance(node, ast.FunctionDef) and node.name.startswith("E16_")
    ]


def method_body(method: ast.FunctionDef) -> tuple[str | None, ast.expr | None]:
    """The assigned name and the expression assigned to it.

    Every formula method in this chapter is `<symbol> = <expression>` followed
    by `return <symbol>`; anything else is not a formula and is reported rather
    than guessed at.
    """
    for node in method.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                return target.id, node.value
    return None, None


# --- the expression: predecessor AST to a catalogue expression string --------


class Transcribe(ast.NodeTransformer):
    """`self.x` -> `x`, `sp.f(...)` -> `f(...)`, `sp.pi` -> `pi`."""

    def visit_Attribute(self, node: ast.Attribute) -> ast.expr:  # noqa: N802
        if isinstance(node.value, ast.Name) and node.value.id in {"self", "sp"}:
            return ast.copy_location(ast.Name(id=node.attr, ctx=ast.Load()), node)
        return self.generic_visit(node)


def strip_factors(node: ast.expr, factors: list[float]) -> ast.expr:
    """Remove each listed constant once, where it multiplies (S53)."""
    remaining = list(factors)

    def walk(current: ast.expr) -> ast.expr:
        if isinstance(current, ast.BinOp):
            left = walk(current.left)
            right = walk(current.right)
            if isinstance(current.op, ast.Mult):
                for side, other in ((left, right), (right, left)):
                    if isinstance(side, ast.Constant) and isinstance(side.value, (int, float)):
                        match = next(
                            (f for f in remaining if abs(f - side.value) <= abs(f) * 1e-12),
                            None,
                        )
                        if match is not None:
                            remaining.remove(match)
                            return other
            return ast.BinOp(left=left, op=current.op, right=right)
        if isinstance(current, ast.UnaryOp):
            return ast.UnaryOp(op=current.op, operand=walk(current.operand))
        if isinstance(current, ast.Call):
            return ast.Call(
                func=current.func, args=[walk(a) for a in current.args], keywords=[]
            )
        return current

    result = walk(node)
    if remaining:
        raise SystemExit(f"factors {remaining} not found where they multiply")
    return result


def replace_literals(node: ast.expr, table: dict[float, float]) -> ast.expr:
    def walk(current: ast.expr) -> ast.expr:
        if isinstance(current, ast.Constant) and isinstance(current.value, (int, float)):
            for old, new in table.items():
                if abs(old - current.value) <= abs(old) * 1e-12:
                    return ast.Constant(value=new)
            return current
        if isinstance(current, ast.BinOp):
            return ast.BinOp(left=walk(current.left), op=current.op, right=walk(current.right))
        if isinstance(current, ast.UnaryOp):
            return ast.UnaryOp(op=current.op, operand=walk(current.operand))
        if isinstance(current, ast.Call):
            return ast.Call(func=current.func, args=[walk(a) for a in current.args], keywords=[])
        return current

    return walk(node)


def fold_units(node: ast.expr) -> ast.expr:
    """Drop `x * 1`, `1 * x` and `x / 1`, which the rewrites above leave behind."""

    def is_one(current: ast.expr) -> bool:
        return isinstance(current, ast.Constant) and current.value == 1

    def walk(current: ast.expr) -> ast.expr:
        if isinstance(current, ast.BinOp):
            left, right = walk(current.left), walk(current.right)
            if isinstance(current.op, ast.Mult):
                if is_one(left):
                    return right
                if is_one(right):
                    return left
            if isinstance(current.op, ast.Div) and is_one(right):
                return left
            return ast.BinOp(left=left, op=current.op, right=right)
        if isinstance(current, ast.UnaryOp):
            return ast.UnaryOp(op=current.op, operand=walk(current.operand))
        if isinstance(current, ast.Call):
            return ast.Call(func=current.func, args=[walk(a) for a in current.args], keywords=[])
        return current

    return walk(node)


BINARY = {ast.Add: ("+", 1), ast.Sub: ("-", 1), ast.Mult: ("*", 2), ast.Div: ("/", 2)}
POWER = 4
UNARY = 3


def number(value: float | int) -> str:
    if isinstance(value, int) or float(value).is_integer() and abs(value) < 1e15:
        return str(int(value))
    return repr(float(value))


def render(node: ast.expr, parent: int = 0) -> str:
    """The kernel's grammar (S34): no implicit multiplication, `**` right-assoc."""
    if isinstance(node, ast.Constant):
        return number(node.value)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise SystemExit(f"unsupported call {ast.dump(node.func)}")
        return f"{node.func.id}({', '.join(render(a) for a in node.args)})"
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        text = f"-{render(node.operand, UNARY)}"
        return f"({text})" if parent > UNARY else text
    if isinstance(node, ast.BinOp):
        if isinstance(node.op, ast.Pow):
            text = f"{render(node.left, POWER + 1)}**{render(node.right, POWER)}"
            return f"({text})" if parent > POWER else text
        symbol, precedence = BINARY[type(node.op)]
        # The right operand of `-` and `/` binds tighter, so `a - (b - c)` keeps
        # its parentheses while `a - b - c` does not.
        right = render(node.right, precedence + (1 if symbol in "-/" else 0))
        text = f"{render(node.left, precedence)} {symbol} {right}"
        return f"({text})" if parent > precedence else text
    raise SystemExit(f"unsupported node {ast.dump(node)}")


def names_in(node: ast.expr) -> list[str]:
    """Free symbols, in first appearance order. `pi` is a constant, not a port."""
    found: list[str] = []
    called = {
        child.func.id
        for child in ast.walk(node)
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name)
    }

    def walk(current: ast.expr) -> None:
        if isinstance(current, ast.Name):
            if current.id not in found and current.id not in called and current.id != "pi":
                found.append(current.id)
        elif isinstance(current, ast.BinOp):
            walk(current.left)
            walk(current.right)
        elif isinstance(current, ast.UnaryOp):
            walk(current.operand)
        elif isinstance(current, ast.Call):
            for argument in current.args:
                walk(argument)

    walk(node)
    return found


# --- naming: id, citation, variantOf ----------------------------------------

def stem(method_name: str) -> str:
    """`E16_24A_circumfranceAngle` -> `E16_24A`, the key the tables above use."""
    return "_".join(method_name.split("_")[:2])


LABEL = re.compile(r"^E16_(?P<number>\d+)(?P<letter>[A-Z]\d*)?_")


def label_of(method_name: str) -> tuple[str, str]:
    """`E16_14B1_...` -> equation label `16.14B1` and its base `16.14`."""
    match = LABEL.match(method_name)
    if match is None:
        raise SystemExit(f"cannot read an equation number from {method_name}")
    base = f"{CHAPTER}.{int(match.group('number')) if match.group('number') != '00' else '00'}"
    return base + (match.group("letter") or ""), base


CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def title_of(method_name: str) -> str:
    """`E16_5_CentrifugalForce` -> `Centrifugal force`. Source spelling kept."""
    tail = method_name.split("_", 2)[2] if method_name.count("_") >= 2 else method_name
    words = CAMEL.sub(" ", tail).split()
    if not words:
        return method_name
    return " ".join([words[0][0].upper() + words[0][1:]] + [w.lower() for w in words[1:]])


METHOD_REFERENCE = re.compile(r"\bE16_(\d+)([A-Z]\d*)?\b")


def notes_of(method: ast.FunctionDef) -> list[str]:
    """Docstring lines after the formula line — where R&M's prose conditions are.

    S40 wants these machine-readable, and belt's are not expressible: they
    select on *belt type* (flat, V, toothed, poly-V), which is a categorical
    port this chapter has none of (S38, and the gap S41 accepted). Keeping the
    prose on the description is what stops it being lost in the meantime.
    """
    override = NOTE_OVERRIDES.get(stem(method.name))
    if override is not None:
        return override
    doc = ast.get_docstring(method, clean=True) or ""
    lines = [line.strip() for line in doc.splitlines()[1:] if line.strip()]
    # A note that cross-references another equation names it by the predecessor's
    # method, which nothing downstream has ever heard of. Say it the way R&M does.
    return [METHOD_REFERENCE.sub(lambda m: f"{CHAPTER}.{int(m.group(1))}{m.group(2) or ''}", line) for line in lines]


# --- assembling the records --------------------------------------------------


def build(source: Path) -> dict:
    cls = load_class(source, "Belt")
    tags = symbol_dict(cls)
    formulas = []
    skipped: list[str] = []

    for method in formula_methods(cls):
        key = stem(method.name)
        if key in NOT_A_FORMULA:
            skipped.append(method.name)
            continue

        target, value = method_body(method)
        if target is None or value is None:
            skipped.append(method.name)
            continue

        expression = Transcribe().visit(ast.parse(ast.unparse(value), mode="eval").body)
        if key in STRIP_FACTORS:
            expression = strip_factors(expression, STRIP_FACTORS[key])
        if key in REPLACE_LITERALS:
            expression = replace_literals(expression, REPLACE_LITERALS[key])
            # Only where a rewrite ran: an untouched expression is transcribed
            # exactly, so a stray `1 *` in the source stays visible in the diff.
            expression = fold_units(expression)

        label, base = label_of(method.name)
        notes = notes_of(method)
        description = ". ".join([title_of(method.name)] + notes)
        if not description.endswith("."):
            description += "."

        record = {
            "id": ID_PREFIX + label,
            "version": 1,
            "output": port(target, tags),
            "inputs": [port(name, tags) for name in names_in(expression)],
            "expression": render(expression),
            "description": description,
            "citation": UNNUMBERED.get(key, f"R&M {label}"),
            "status": "unverified",
        }
        if key in QUARANTINE:
            record["status"] = "quarantined"
            record["quarantineReason"] = QUARANTINE[key]
        record["_base"] = base
        formulas.append(record)

    # `variantOf` only where R&M itself numbered more than one form (S17).
    counts: dict[str, int] = {}
    for record in formulas:
        counts[record["_base"]] = counts.get(record["_base"], 0) + 1
    for record in formulas:
        base = record.pop("_base")
        if counts[base] > 1:
            record["variantOf"] = ID_PREFIX + base

    ordered = [order_fields(record) for record in formulas]
    if skipped:
        print(f"not formulas, skipped: {', '.join(skipped)}")
    print(f"{len(ordered)} records, {sum(1 for r in ordered if 'quarantineReason' in r)} quarantined")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": CATALOGUE_ID,
        "name": CATALOGUE_NAME,
        "restricted": True,
        "formulas": ordered,
    }


FIELD_ORDER = [
    "id",
    "version",
    "output",
    "inputs",
    "expression",
    "description",
    "citation",
    "variantOf",
    "appliesWhen",
    "status",
    "quarantineReason",
]


def order_fields(record: dict) -> dict:
    """Serialize in the schema's own field order, so the file reads like one."""
    return {key: record[key] for key in FIELD_ORDER if key in record}


def port(name: str, tags: dict[str, str]) -> dict:
    if name not in tags:
        raise SystemExit(f"'{name}' has no entry in the symbol dict — undeclared unit (S5)")
    unit, description = read_tag(tags[name])
    return {"kind": "numeric", "name": name, "unit": unit, "description": description}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path.home() / "source/mechanical-design/MechDesign/RnM/C16_Belt.py",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path.home() / "source/machine-design-catalogue/formulas/c16-belt.json",
    )
    args = parser.parse_args()

    catalogue = build(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
