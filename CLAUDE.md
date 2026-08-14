# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **node-editor design tool** for dimensioning machine parts (KU Leuven course),
with formulas from *Roloff & Matek, 6th edition*. Wire inputs, equations and
outputs on a canvas; the graph is the calculation.

**Greenfield.** As of 2026-08-14 the repository contains documentation only —
no source, no build system, no dependencies. [PLAN.md](PLAN.md) holds the build
sequence; [DECISIONS.md](DECISIONS.md) holds what is settled (`S1`–`S42`). All
nineteen open questions are closed and **nothing blocks the first code**.
Still outstanding, none of it gating the first commit: **D14**, one
sweep detail that touches the schema and so wants settling before step 2;
defect and unit-tag sign-off against R&M, which quarantines individual formulas
rather than holding up a build step; and **D13**, the engine/editor licence,
which only bites at publication.

[OVERVIEW.md](OVERVIEW.md) is the one-read introduction. Read it, then PLAN and
DECISIONS, before starting work.

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
- **pnpm workspaces**, TypeScript project references, Vitest, Vite. No Turborepo
  or Nx. Project references are load-bearing: they are what keeps React out of
  the kernel and the restricted catalogue unimportable from published packages.
- **Forward evaluation only.** No solver. Cycles are rejected at connect time,
  the same way a dimension mismatch is. Rearranged forms are catalogue content,
  linked by `variantOf` — not computed.
- **Client-side web app.** No backend, no Node-only APIs in app code; file I/O
  sits behind an adapter so a Tauri build can drop in later.
- **Graphs reference formulas by ID, version and hash** — never embed them.
  Embedding would leak R&M content into files students circulate. The same rule
  governs notebook export: citation and values by default, expressions only
  behind an explicitly marked toggle.
- **Sweeps are the primary use of the kernel**, not a secondary mode. Ranges are
  linear, logarithmic, explicit lists, table columns or categorical lists,
  controlled by point count rather than step size. Log spacing is a teaching
  requirement.
- **Expressions are strings, parsed to an AST and compiled to closures.** Never
  `eval` or `new Function` — catalogues are files students exchange. The corpus
  has no conditionals *inside* an expression; it does need `sum`/`prod`
  aggregation over load spectra.
- **Branching selects formulas, it does not live inside them.** R&M numbers case
  variants and states the condition in prose; formulas carry it as a
  machine-readable `appliesWhen` predicate, and using a formula outside its
  condition warns. One predicate layer serves this, check nodes and thresholds.
- **Ports are numeric-with-dimension or categorical.** Categoricals declare an
  enumerated domain and sweep by explicit list only.
- **The notebook is a view over the graph**, not a second document. Titled group
  frames are its sections, so they are load-bearing schema, not decoration.
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
