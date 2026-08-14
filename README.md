# machine-design-studio

A node-editor design tool for dimensioning machine parts. Wire inputs,
equations and outputs together on a canvas; the graph *is* the calculation.

Built for the KU Leuven course on dimensioning of machine parts. Formulas follow
**Roloff & Matek, 6th edition**, and each one carries a citation back to its
textbook equation number.

Status: **greenfield, nothing built yet.** See [PLAN.md](PLAN.md) for the build
sequence and [DECISIONS.md](DECISIONS.md) for what is settled and what still
needs a call.

## What it is

- **Formulas are data**, not code. The editor is both the product and the
  authoring tool for the formula catalogue.
- **No computer algebra.** Forward evaluation over a directed acyclic graph.
  The predecessor project carried a full symbolic layer that measurement showed
  was never used.
- **Units are canonical internally** — mm, N, s, rad, K — converted at the
  boundary. An undeclared unit is a hard error.
- **Dimensions are port types.** A force output will not connect to a length
  input.

## Relationship to `mechanical-design`

This project **replaces** [`mechanical-design`](https://github.com/ThomasVanRiel/mechanical-design),
a SymPy library of ~539 hand-transcribed formulas plus 22 worked-example
notebooks.

No code is carried over. That repository is a **reference for formula content
only**:

| Reference use | Detail |
|---|---|
| Formula source | The ~539 transcribed expressions and their `[unit]` tags |
| Verification fixtures | 22 notebooks with reproducible numeric results |
| Known-defect list | ~12 confirmed and ~10 suspected wrong formulas to *not* repeat |

Its Roloff & Matek expressions are under a distribution restriction. That
restriction follows the formula content into this project — see
[CLAUDE.md](CLAUDE.md).

## Licence

Engine and editor: to be decided, intended to be open.
The R&M formula catalogue: **restricted, not redistributable.**
