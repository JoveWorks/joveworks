# Plan: machine-design-studio

Status: **agreed, not started.** Written 2026-08-14; revised the same day once
D1–D12 closed as S13–S33. **No decision blocks the first commit**; D14–D15 want
settling before step 2.

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
   worked-example notebooks — the 22 in `notebooks/` plus the archived contour
   notebook, excluding `tools/VerifyExpressions.ipynb` as tooling:
   `EqPrint` 410 calls (display), `substitute` 84 (deferred
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
| Runtime CAS | **None.** Forward evaluation over a DAG. No solver; cycles rejected at connect time. |
| Language | **TypeScript**, kernel as a standalone package with no React dependency. |
| Delivery | **Static web app, no backend.** Students open a link. Tauri wrapper possible later, so no Node-only APIs and file I/O sits behind an adapter. |
| Persistence | **IndexedDB autosave + explicit file export.** Graphs reference formulas by ID, version and hash — never embed them. |
| Versioning | **Integer schema version**, forward migration chain, with a stored fixture per version asserted to still load. |
| Plotting | **Observable Plot** for sweeps; **`d3-contour`** over the kernel's own grid for the one contour case. |
| Narrative | **Titled group frames with markdown notes**, on the graph document — never on the catalogue. |
| Outputs | Four kinds: **value, check, plot, table.** The check (`S ≥ 1.5`) is what makes a report a dimensioning report. |
| Notebook | A **live side-panel view over the graph**; frames are its sections. Export carries citation and values, not expressions. |
| Tooling | **pnpm workspaces**, TypeScript project references, Vitest, Vite. No Turborepo or Nx. |
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
  editor/        React Flow UI, plus the notebook view and output nodes
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

  Four range kinds (S29): **linear** (`linspace`, n points, both endpoints
  included), **logarithmic** (`logspace`), **explicit list**, and **table
  column**. Log spacing is a teaching requirement, not a nicety — Wöhler curves
  and bearing life are power laws, and linear sampling across decades resolves
  them badly. Point count rather than step size is the primary control, so a
  two-input grid is exactly `n × m` and sweep cost is predictable.

  Sweeping is the **primary** use of the kernel, not a secondary mode: it is
  what makes forward-only evaluation (S16) sufficient, since a threshold
  crossing on a swept curve answers "what size do I need" while also showing
  sensitivity and any second root.
- **Cycles are forbidden** (S18) and **no solving code exists** (S16). The kernel
  is a topological sort and nothing more. A connection that would close a cycle
  is rejected at connect time, exactly as a dimension mismatch is (S6) — so a
  graph is always evaluable and there is no invalid state for the UI to show.
- **Rearranged forms are content, not computation.** R&M numbers its own
  variants (`E17_1A/B/C`); where it does not, the inverse is authored in the
  editor, which S4 makes cheap. The `variantOf` link (S17) is what surfaces them
  as "same equation, solved for…".
- **Room is left for per-node inversion** (S17) without a schema migration: a
  future 1-D root-find on a single formula needs no cycle handling and no
  graph-level convergence. Per-port valid range is its bracketing interval, so
  populate it deliberately rather than as a UI nicety.

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
(`[__O]`, `[1E6rotatons]`, `[E-6m]`). These quarantine their formula until
signed off (S20); DECISIONS.md carries proposed readings for most of them, and
S21 settles how revolutions are modelled.

## Migration and verification

The heart of the work, and where correctness is won or lost.

1. **Extract** all 539 formulas from the old Python AST into schema data.
   Mechanical and scripted — not hand-translated. This is content extraction,
   not code reuse: the output is data, and the extractor is discarded after.

   **Capture `variantOf` during this step, not after** (S17). Method names encode
   equation numbers, so `E17_1A/B/C` — three forms of one relation — are
   recognisable while extracting and effectively unrecoverable later without
   re-reading all 539 by hand. The grouping is what makes forward-only
   evaluation (S16) feel complete: the editor offers "same equation, solved
   for…" instead of a solver.
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

Produced **alongside** migration, not ahead of it (S19, amending S8). Defects
must not cross the boundary — but the boundary is the `status` quarantine, not
the extraction run. A flagged formula is extracted like any other and simply
cannot be loaded or evaluated until signed off. Each entry:
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

0. ~~Resolve the blocking decisions.~~ **Done** — D1–D12 closed as S13–S33 on
   2026-08-14. Nothing gates the first commit. Settle **D14–D15** before step 2:
   both touch the schema, and retrofitting them would mean an S25 migration.
1. **DEFECTS.md.** Extract and report against the old repo; no fixes without
   sign-off. Per S19 this runs *alongside* migration rather than ahead of it —
   flagged formulas are quarantined by `status`, not held out of extraction.
2. **Schema + units package.** The contract everything else depends on.
3. **Migration tooling + extraction** of all 539 formulas into data.
4. **Evaluation kernel** and differential verification against the old Python
   implementation.
5. **Golden-value tests** end-to-end.
6. **Editor UI**, including the notebook view (S30–S33). Note that group frames
   are no longer a late nicety: they carry the notebook's section structure, so
   the schema must reserve them from step 2 (S28, as upgraded by S30).

Steps 1–5 deliver a verified, unit-checked formula catalogue with a working
evaluation kernel and no UI. That is independently useful and is the natural
checkpoint to reassess before committing to step 6.

## Verification

- Differential test: all 539 formulas, randomised inputs, old vs new agree.
- Dimensional check passes for every formula except entries parked in
  `DEFECTS.md`.
- Golden values reproduce the notebook results end-to-end through the kernel.
- Schema round-trips: save, reload, and confirm every formula's ports,
  dimensions, citation, defaults, ranges, `variantOf` links and status survive.
- A document saved under each historical schema version still loads (S25). The
  fixtures live in the repo; this test is what makes the promise real.
- Port typing rejects a force-to-length connection.
- A connection closing a cycle is rejected at connect time (S18).
- **A quarantined formula cannot be evaluated** — whether flagged for a defect
  (S19) or an unresolved unit tag (S20). This is the test that stops the
  known-wrong formulas reaching a student, so it carries the weight S8 used to
  place on migration ordering.
- Recompute the chain assignment through the editor and confirm `i = 2.478`,
  `a = 1007 mm`, `F_Ab = 4224 N`.
- A swept input produces a series of the expected length through the whole
  downstream graph, for each range kind in S29; a two-input sweep produces an
  `n × m` grid.
- **Notebook export contains no formula expressions by default** (S32). This is
  a distribution-restriction test, not a formatting one — assert it on a graph
  built from R&M formulas.
