# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **node-editor design tool** for dimensioning machine parts (KU Leuven course),
with formulas from *Roloff & Matek, 6th edition*. Wire inputs, equations and
outputs on a canvas; the graph is the calculation.

**Greenfield.** As of 2026-08-14 the repository contains documentation only —
no source, no build system, no dependencies. [PLAN.md](PLAN.md) holds the build
sequence; [DECISIONS.md](DECISIONS.md) holds what is settled (`S*`) and what is
still open (`D*`). Several `D*` entries are marked **blocking** and gate the
first code. Read both before starting work.

## The predecessor repository

`~/source/machine-design-studio` replaces `~/source/mechanical-design`
(github.com/ThomasVanRiel/mechanical-design, frozen at `348e2f0`).

**No code is reused.** The old repo is consulted for three things only:

1. **Formula content** — ~539 expressions transcribed from R&M, in
   `MechDesign/RnM/C*.py`. One class per textbook chapter; method names encode
   equation numbers (`E17_5b_MaxTopCircleDiameter`); a class-level
   `MySymbolDict` maps each symbol to `'[unit] description'`.
2. **Verification fixtures** — 22 notebooks under `notebooks/` with reproducible
   numeric results. See PLAN.md for the specific golden values.
3. **Known defects** — the confirmed wrong formulas listed in PLAN.md, so they
   are not transcribed a second time.

Do **not** port its architecture, its `MySymbol`/SymPy layer, its unit-symbol
convention (trailing-underscore SymPy symbols), or its helper functions. Those
are exactly what this project exists to replace. When something in the old code
looks worth keeping, check DECISIONS.md first — most such calls are already
settled against it.

## Distribution restriction — carries over

Roloff & Matek expressions are for internal student reference and **may never be
distributed or shared**. Consequences here:

- The R&M formula catalogue lives in its own package and is **not** published
  with the engine or editor.
- Never surface R&M formula content outside the repo — including in artifacts,
  issues, or pasted output — unless the user explicitly asks.
- The public application ships **no textbook content**; the catalogue reaches
  students as a file through the course LMS (see D2).

## Architecture

Planned layout, not yet created:

```
packages/
  schema/      formula + graph data model, versioned; the contract
  kernel/      evaluation: topological sort, vectorised ranges
  units/       canonical mm-N-s-rad-K, dimension algebra, port typing
  catalogue/   RESTRICTED — the R&M formulas as data
  editor/      React Flow UI
tools/
  migrate/     Python, one-off: AST extraction from the old MechDesign package
               + differential verification against it
```

`tools/migrate/` is the **only** place old code is executed, and it is not
shipped. It reads the predecessor repo, emits catalogue data, and is deleted or
frozen once migration is verified.

## Conventions

These follow from settled decisions; do not relitigate them in code.

- **TypeScript** throughout, except `tools/migrate/`. No runtime CAS.
- **Canonical units: mm, N, s, rad, K.** Convert at the boundary. Undeclared
  unit is a hard error. Mass is therefore tonnes and density t/mm³ — the classic
  silent corruption, so the dimension checker must catch it.
- **Angles: radians internally, degrees at the display boundary.**
- **Dimensions are port types**, enforced at connection time.
- **Every formula carries a citation** (`R&M 17.1B`) plus description, per-port
  dimension and display unit, and optional default and valid range.
- **Formulas are authored in the editor**, not hand-written as source. If you
  find yourself hand-editing catalogue JSON at scale, the authoring path is
  missing something — say so.

## Working style

- The valuable, testable core is the catalogue and the evaluation kernel. PLAN.md
  sequences them ahead of any UI deliberately; keep that order.
- Migration correctness is the whole game. Differential testing proves the
  migration is *faithful*, not that a formula is *correct* — the known defects
  pass differential testing because both sides are wrong identically. Defects are
  reported and signed off explicitly, never fixed silently and never carried
  across silently.
- When a formula's meaning is ambiguous, that is a content question for the
  user, not a guess. R&M is the authority, and only the user has it.
