# Plan: machine-design-studio

Status: **agreed, not started.** Written 2026-08-14.

Supersedes the plan in the predecessor repository (`mechanical-design`, commit
`348e2f0`, `PLAN.md`), which framed the work as a refactor of that package. The
scope proved larger than a refactor: **nothing is carried over as code.** This
is a new application, with the old repository serving as a formula reference and
a set of verification fixtures.

## Context

The predecessor, `~/source/mechanical-design`
(github.com/ThomasVanRiel/mechanical-design), is a SymPy library of ~539
mechanical-design formulas transcribed by hand from Roloff & Matek (6th ed.) for
the KU Leuven machine-part dimensioning course, plus 22 Jupyter notebooks of
worked examples.

Research on it established three things, and all three shaped this plan:

1. **It silently computes wrong answers.** ~12 confirmed defects and ~10
   suspected across the 539 formulas — `is list` identity tests that make six
   `BallBearing` methods return `0` for correct usage, misplaced parentheses,
   `*` typed as `-`, `**self.P` where `self.p` was meant. Zero tests exist.
2. **Notebooks cover only 46 of 539 methods (8.5%)**, so nothing was going to
   catch the rest.
3. **The symbolic algebra is not actually used.** Measured across all 23
   notebooks: `EqPrint` 410 calls (display), `substitute` 84 (deferred
   evaluation), `evaluate` 38 (vectorised numerics), `MyHelp` 38 (metadata
   display), and `reorderEquation` — the one function performing genuine
   symbolic algebra — **0 calls, and it is broken**. It raises on every
   invocation and nobody noticed.

Point 3 is decisive. The CAS was inherited habit, not requirement. A node graph
already expresses "define the whole calculation, then solve"; a range input is a
loop; lambdas remain available for optimisation. None of that needs symbolics.

## What comes across, and what does not

**Not reused:** all code. The `MySymbol`/SymPy layer, the trailing-underscore
unit symbols, `Helpers.py`, the chapter classes, the notebooks as a runtime.

**Reused as reference only:**

| From the old repo | Used for |
|---|---|
| `MechDesign/RnM/C*.py` | The ~539 formula expressions and their `[unit]` tags — the content to migrate |
| `notebooks/` (22) | Golden numeric values for end-to-end verification |
| `MechDesign/RnM/Table/` | ISO fit and tolerance lookup data |
| The defect findings below | Errors to not transcribe a second time |

`tools/migrate/` is the only place old code is executed, and it is not shipped.

## Direction

Wire variables, inputs, equations and outputs together; the graph is the
calculation. The editor is both the product and the authoring tool for formulas.

| Area | Decision |
|---|---|
| Runtime CAS | **None.** Forward evaluation over a DAG. |
| Language | **TypeScript**, kernel as a standalone package with no React dependency. |
| Formulas | **Data**, in the editor's save format. Created and edited in the editor, not hand-written. |
| Traceability | Every formula carries a citation (`R&M 17.1B`), so a node shows which textbook equation it implements. |
| Sources | Roloff & Matek, other standards, and user-authored formulas, distinguished by the citation field. |
| Units | **Canonical internal base: mm, N, s, rad, K.** Convert at the boundary. Undeclared unit is a **hard error**. |
| Dimensions | Become **port types** — a force output will not connect to a length input. |
| Verification | The old notebooks' worked examples, frozen as fixtures. |
| Known defects | Reported and signed off explicitly, never migrated silently. |
| Packaging | Editor and kernel unrestricted; the R&M formula catalogue stays under its distribution restriction. |
| Python | Retained only as one-off migration and verification tooling. Not shipped. |

### Scope warning

This is an application build with a data migration attached. The formula
catalogue and evaluation kernel are the valuable, testable core; the UI is a
separate and substantial piece of work. The sequencing below builds and verifies
the core first, so that value lands before any UI risk is taken on.

## Architecture

```
packages/
  schema/        formula + graph data model, versioned; the contract
  kernel/        evaluation: topological sort, vectorised ranges
  units/         canonical mm-N-s-rad-K, dimension algebra, port typing,
                 boundary conversion and display formatting
  catalogue/     RESTRICTED — the R&M formulas as data
  editor/        React Flow UI
tools/
  migrate/       Python, one-off: AST extraction from the old MechDesign package
                 + differential verification against its implementation
```

### Formula data model

Per formula: output port, input ports, expression, per-port dimension and
display unit, description, citation, and optional default and valid range.

The old `MySymbol` carried `def_value` and `range` fields that were declared but
never set anywhere — hooks for exactly this. Populate them deliberately.

### Evaluation kernel

Forward evaluation over the DAG covers the overwhelming majority of use.

- **Ranges** sweep as vectorised loops, replacing the old `evaluate()`
  machinery — which had a confirmed `KeyError` on its own documented usage and
  emitted an unreadable `NameError` when a value was unset.
- **Implicit or cyclic graphs** would need a numeric root-finder. Whether cycles
  are permitted at all is open (D4), and gated on whether runtime solving is
  needed at all (D5). Forbidding cycles keeps the kernel a topological sort and
  nothing more, which is probably right for a teaching tool.

### Units

The old package's 812 symbol declarations already carry `[unit]` tags — the
table exists, it was just never machine-read. Parse into dimension + display
unit.

Three traps, all confirmed present in the source material:

- **R&M is not internally consistent.** ~40 constants assume other systems
  (`9550*P/n` wants kW and rpm; `946*sqrt(1/f)`, `2.7*cbrt(...)`,
  `72.3*sqrt(...)` likewise). Each needs an audited explicit conversion during
  migration.
- **Mass is tonnes, density t/mm³** in a consistent mm-N-s system — the classic
  silent corruption. The old `C16_Belt.py:155` already fudged it with
  `1E-6 * 1E3 * rho`. Enforce in the checker.
- **Angles: radians internally, degrees at the boundary.** Dissolves the three
  incompatible conventions coexisting in the old code (`deg_`-carrying, bare
  `/180*pi`, and raw radians) rather than reconciling 72 sites.

~500 tags need normalising (`[N/mm²]`, `[N/mm**2]`, `[MPa]`; `[rpm]`, `[1/min]`,
`[min-1]`; `[deg]`, `[°]`, `[rad]`). 315 are already `[]`. ~30 are junk
(`[__O]`, `[1E6rotatons]`, `[E-6m]`) and need a content decision (D7).

## Migration and verification

The heart of the work, and where correctness is won or lost.

1. **Extract** all 539 formulas from the old Python AST into schema data.
   Mechanical and scripted — not hand-translated. This is content extraction,
   not code reuse: the output is data, and the extractor is discarded after.
2. **Differentially verify**: evaluate the original Python implementation and
   the new data-driven kernel on randomised inputs, and diff. Any divergence is
   an extraction error.
3. **Dimensionally check** every migrated formula against its declared units.

**These prove different things, and the distinction matters.** Differential
testing proves the migration is *faithful*; it does not prove the formulas are
*correct*. The twelve known defects will pass differential testing, because both
sides are wrong in the same way. They must be surfaced and corrected as an
explicit, signed-off step — never carried across silently.

4. **Golden values** from the old notebooks then verify end-to-end behaviour
   (verified reproducible in the predecessor repo at `348e2f0`):
   - Chain — `notebooks/chain/Chain_Example_BottomUp_Short.ipynb`: `i=2.478`,
     `P_D=4267 W`, `a=1007 mm`, `d_1=186.5 mm`, `v=1.221 m/s`, `F_t=2457 N`,
     `F_Ab=4224 N`. **BottomUp only** — the TopDown variants set `P_1 = 300*W_`
     (missing a zero) and their outputs contradict their own conclusions.
   - Keys — `notebooks/keys/Key_TD_short.ipynb`; full-precision
     `p_gem = 73.3137829912024 N/mm²` survives in
     `archive/session5_1_KeyDesign_contourplot.ipynb`.
   - Press fits — four distinct input sets across `notebooks/pressfit/`, covering
     hollow/massive, outer/inner-limiting, and the `Q_I = 0` degenerate branch.
   - Belt — `notebooks/belt/Lab_belt.ipynb`, `Lab_belt_incl_Fa.ipynb`. Both use
     `d_dg = 400 mm` while their assignment text says 420.

   Assert with `rel=1e-3`; stored outputs are 4-significant-figure.

## DEFECTS.md

Produced before migration, since defects must not cross the boundary. Each entry:
old-repo file:line, current expression, proposed correction, evidence (its own
docstring, a sibling method, or dimensional analysis), and confidence. Severity
order, led by the six `C14_BallBearing` `is list` tests and the
misplaced-operator bugs in `C21:557,597`, `C12:251,321,514,519,529`, `C11:116`,
`C14:175`.

Also recorded: the `P_1 = 300*W_` typo across four TopDown notebooks, the `d_dg`
400-vs-420 discrepancy, the duplicate `'F_sp'` key in `C8_ThreadConnection`
silently discarding a description, and the ~30 junk unit tags.

Note that the docstring-vs-code differential — the technique that found most of
these — becomes unnecessary after migration. It exists to police drift between
two representations of the same formula, and the new model has one.

## Sequencing

0. **Resolve the blocking decisions** in DECISIONS.md — D1–D5 gate the kernel,
   D6 gates migration, D7 gates units.
1. **DEFECTS.md.** Extract and report against the old repo; no fixes without
   sign-off.
2. **Schema + units package.** The contract everything else depends on.
3. **Migration tooling + extraction** of all 539 formulas into data.
4. **Evaluation kernel** and differential verification against the old Python
   implementation.
5. **Golden-value tests** end-to-end.
6. **Editor UI.**

Steps 1–5 deliver a verified, unit-checked formula catalogue with a working
evaluation kernel and no UI. That is independently useful and is the natural
checkpoint to reassess before committing to step 6.

## Verification

- Differential test: all 539 formulas, randomised inputs, old vs new agree.
- Dimensional check passes for every formula except entries parked in
  `DEFECTS.md`.
- Golden values reproduce the notebook results end-to-end through the kernel.
- Schema round-trips: save, reload, and confirm every formula's ports,
  dimensions, citation, defaults and ranges survive.
- Port typing rejects a force-to-length connection.
- Recompute the chain assignment through the editor and confirm `i = 2.478`,
  `a = 1007 mm`, `F_Ab = 4224 N`.
