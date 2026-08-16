# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **node-editor design tool** for dimensioning machine parts (KU Leuven course),
with formulas from *Roloff & Matek, 6th edition*. Wire inputs, equations and
outputs on a canvas; the graph is the calculation. Set an input to a range and
the graph becomes a design study.

## Start here

**Milestone 1 is done.** As of 2026-08-15 every package is built and
tested — `units`, `schema`, `nodes`, `kernel` and `editor`, which is a
working React Flow canvas with a palette, a notebook panel, one sweep and one
plot. `C16_Belt` is extracted by `tools/extract/c16_belt.py` into the private
catalogue repo, and its golden values reproduce both through the kernel
(`test/belt-goldens.test.ts`) and through the editor's own path
(`packages/editor/src/model/samples.test.ts`); both need `MDS_CATALOGUE` set and
skip without it, exactly as `test/catalogue-check.test.ts` does. `pnpm test`
runs everything; `pnpm build` (`tsc -b`) is also the dependency-direction check;
`pnpm dev` serves the editor.

The hand pass over the editor in a browser — the one thing no automated test
could do — is done; its findings are recorded and fixed in `docs/UX-SPEC.md`.

Read [OVERVIEW.md](OVERVIEW.md) first — it is the whole project in one pass.
**[ROADMAP.md](ROADMAP.md) is where what's still open lives** — content
sign-off against R&M, the milestone-2 build sequence, and the editor
backlog. `docs/PLAN.md` and `docs/UX-SPEC.md` are historical record (the
build sequence already completed, and the hand-testing findings already
fixed), not live status pages. Design rationale that isn't obvious from the
code lives as comments at the site it explains, not in a separate decisions
doc — this is still a solo project days old, not one with a meeting trail to
keep.

**No design decision is open.** How an angle becomes a pure number is settled:
the two wrap-angle formulas (`rm.16.24A`/`rm.16.24B`) stay quarantined, and the
`β₁` golden stays out of reach, until the wrap angle's `[]` tag is confirmed
against R&M as `[°]` — a content question now, not a design one; see
ROADMAP.md's content sign-off section.

Still outstanding, none of it gating code: defect and unit-tag sign-off against
R&M, which quarantines individual formulas rather than holding up a build step.
Of the 54 belt records, 7 are `verified`, 42 `unverified` and 5 quarantined.
Both repositories have an `origin` on GitHub —
`ThomasVanRiel/machine-design-studio` here and
`ThomasVanRiel/machine-design-catalogue` for the restricted half, which **must
be private** (S45).

## Milestone 1 is a vertical slice — do not widen it

The first milestone is a **base node library plus `C16_Belt` only** — 55
formulas, not 539 (S41). A thin slice validates the schema before the whole
corpus is committed to it: wrong schema after 55 formulas costs a morning,
after 539 it costs a data migration.

Belt was chosen on evidence. It imports only `sympy` and `MySymbol` — no tables,
no other chapter — it has golden values (in `docs/PLAN.md`), and it exercises the
hardest units cases deliberately: `[kg/dm³]` is the density trap that
`C16_Belt.py:154` fudges as `1E-6 * 1E3 * rho`, and `[%]` needs
dimensionless-with-display-scale handling.

**Accepted gap:** belt uses no tables and no categorical ports, so those parts of
the schema stay unvalidated until a second slice (`C2_Tolerance` or the press-fit
material in `C12`) exercises them.

## The predecessor repository

`~/source/machine-design-studio` replaces `~/source/mechanical-design`
(github.com/ThomasVanRiel/mechanical-design, frozen at `348e2f0`).

**No code is reused, and the package is never imported or run.** It is a source
to *transcribe from* — `tools/extract/` parses it with stdlib `ast`, which is why
the project has no Python dependencies at all. It is consulted for three things:

1. **Formula content** — ~539 expressions in `MechDesign/RnM/C*.py`. One class
   per textbook chapter; method names encode equation numbers
   (`E17_5b_MaxTopCircleDiameter`); a class-level `MySymbolDict` maps each symbol
   to `'[unit] description'`. Docstrings carry the formula in near-readable form.
2. **Verification fixtures** — 22 notebooks under `notebooks/`. Golden values are
   recorded in `docs/PLAN.md`; do not re-derive them.
3. **Known defects** — listed in `docs/PLAN.md`, so they are not transcribed again.

Do **not** port its architecture, its `MySymbol`/SymPy layer, its unit-symbol
convention (trailing-underscore SymPy symbols), or its helpers. Those are what
this project exists to replace. If something in the old code looks worth keeping,
that call has most likely already been made and rejected — check the comments
in the relevant package before reintroducing it.

## Distribution restriction — carries over

Roloff & Matek expressions are for internal student reference and **may never be
distributed or shared**. Consequences:

- The R&M catalogue lives in a **separate private repository** (S45), not in
  this one: `~/source/machine-design-catalogue`. A repository boundary, not a
  `.gitignore` — this repo is MIT and public.
- **Never use a real R&M formula as a test fixture here.** It is natural to
  reach for one because it is at hand; use an invented formula instead —
  `y = a*b + c` exercises a topological sort perfectly well and carries no
  citation for anyone to copy.
- Never surface R&M formula content outside the repo — artifacts, issues, pasted
  output — unless the user explicitly asks.
- The public app ships **no textbook content**; the catalogue reaches students as
  a file through the course LMS (S14).
- Notebook export carries citation and values by default; expressions only behind
  an explicitly marked toggle (S32).

## Architecture

This repo — **MIT, publishable**. Every package below now exists:

```
packages/
  schema/      formula + graph data model, versioned; the contract
  kernel/      evaluation: topological sort, labelled-axis broadcasting
  units/       canonical mm-N-s-rad-K, dimension algebra, port typing
  nodes/       base node library — inputs, math operations, outputs.
               Unrestricted: no textbook content
  editor/      React Flow UI, notebook view, output nodes
tools/
  extract/     Python, one-off scripts, one per chapter. Parses the old source
               with stdlib `ast`. Never imports or runs it
```

The restricted catalogue lives in its own private repo (S45), primed at
`~/source/machine-design-catalogue`. The extraction *script* is public — it holds
no textbook content; its *output* goes there.

## Conventions

These reflect the current design and the reasons behind it, not fixed law —
revisit them when there's a reason to.

- **TypeScript** throughout, except the Python in `tools/`. No runtime CAS.
- **pnpm workspaces**, TypeScript project references, Vitest, Vite. No Turborepo
  or Nx. Project references are load-bearing: they keep React out of the kernel.
- **Canonical units: mm, N, s, rad, K.** Convert at the boundary. Undeclared unit
  is a hard error. Mass is therefore tonnes and density t/mm³ — the classic
  silent corruption — and one the dimension checker **cannot** catch, because a
  wrong scale factor is dimensionally sound (S53). Conversion at the boundary is
  the defence; the goldens are the confirmation.
- **Angles: radians internally, degrees at the display boundary.** Angle is a
  tracked dimension, so trig accepts an angle *or* a dimensionless argument
  (S54) — belt's wrap angles are tagged `[]` in the source.
- **Dimensions are port types**, enforced at connection time. Ports are
  numeric-with-dimension or **categorical**; categoricals declare an enumerated
  domain and sweep by explicit list only. A port may also declare a **generic
  dimension** — `$A`, `$A*$B` — which is how the base node library says "whatever
  is wired here" (S59). No catalogue formula uses one; R&M names every unit.
- **Forward evaluation only.** No solver. Cycles are rejected at connect time,
  the same way a dimension mismatch is. Rearranged forms are catalogue content
  linked by `variantOf` — not computed.
- **Sweeps are the primary use of the kernel**, not a secondary mode. Ranges are
  linear, logarithmic, explicit lists, table columns or categorical lists,
  controlled by point count rather than step size. Log spacing is a teaching
  requirement (Wöhler curves, bearing life). Values carry **labelled axes**, so
  two ranges give an `n × m` grid with no extra wiring.
- **Expressions are strings**, parsed to an AST and compiled to closures. Never
  `eval` or `new Function` — catalogues are files students exchange. No
  conditionals inside an expression; `sum`/`prod` aggregation over load spectra
  is needed. **Every number written in an expression is canonical** (S62): `d <
  50` in a length context means 50 mm, because an expression string cannot carry
  a unit and the kernel has only one unit system.
- **Branching selects formulas, it does not live inside them.** R&M numbers case
  variants and states the condition in prose; formulas carry it as a
  machine-readable `appliesWhen` predicate, and using a formula outside its
  condition warns. One predicate layer serves this, check nodes and thresholds.
- **Every formula carries** a citation (`R&M 17.1B`), description, a display
  unit per port — the port's dimension is *derived* from it rather than declared
  twice (S56) — `variantOf`, `appliesWhen`, `status`, and optional default and
  valid range. Valid range is load-bearing: it is a sweep bound and S17's
  bracketing interval.
- **Client-side web app.** No backend, no Node-only APIs in app code; file I/O
  sits behind an adapter so a Tauri build can drop in later.
- **Commit messages follow Conventional Commits** — `type(scope): subject`,
  scope one of the package boundaries (`schema`, `kernel`, `units`, `nodes`,
  `editor`, `tools`). Feeds automated changelog/release generation — see
  ROADMAP.md.
- **Graphs reference formulas by ID, version and hash** — never embed them.
  Embedding would leak R&M content into files students circulate. That reference
  carries no catalogue id, so **formula ids are global**: extraction namespaces
  what it generates or an R&M id collides with a base node's (S65).
- **Documents carry an integer schema version stamp.** The N→N+1 migration chain
  is deliberately deferred until real student graphs exist (S25, amended).
- **The notebook is a view over the graph**, not a second document. Titled group
  frames are its sections, so they are load-bearing schema, not decoration.
  Prose exists at two levels: section notes and per-output captions.
- **Editor layout**: collapsible palette left, canvas centre, collapsible
  notebook right. **No permanent inspector** — values, units and ranges are
  edited on the node. Units are text on the port; colour is reserved for state.
- **Formulas are data, authored in the editor** — but the authoring UI is
  deferred out of milestone 1 (S51), so belt's catalogue is a regenerated
  artefact of the extraction script. If you find yourself hand-editing catalogue
  JSON at scale, the authoring path is missing something — say so.

## Working style

- **Thomas tests the editor in the browser himself. Do not launch `pnpm dev`
  or drive it yourself** — he already has it running and killing/restarting it
  from underneath him loses that session. State what you changed and what to
  check for; let him report back what he saw.
- **Work on `main`.** No feature branches until there is an MVP.
- **Do not build for hypothetical futures.** This is early development; scope
  decisions have repeatedly been narrowed on purpose (S25, S41, S51, S52). When
  something looks like infrastructure for a problem that does not exist yet, say
  so rather than building it.
- The valuable, testable core is the catalogue and the evaluation kernel.
  `docs/PLAN.md` sequenced them ahead of any UI deliberately; keep that order
  in mind.
- Reproducing the golden values proves a transcription is *faithful*, not that a
  formula is *correct* — the known defects would survive it, because the error is
  in the source. Defects are reported and signed off explicitly, never fixed
  silently and never carried across silently. Anything no golden exercises stays
  `unverified` rather than assumed sound.
- When a formula's meaning is ambiguous, that is a content question for the user,
  not a guess. R&M is the authority, and only the user has it.
