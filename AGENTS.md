# AGENTS.md

Guidance for coding agents working in this repository.

## Read first

Read [OVERVIEW.md](OVERVIEW.md) for the project in one pass, then
[ROADMAP.md](ROADMAP.md) for current work and outstanding content sign-off.
`docs/PLAN.md` and `docs/UX-SPEC.md` record completed milestone-1 work; they
are useful history, not live status.

## Project and scope

Machine Design Studio is a browser-based node editor for dimensioning machine
parts. A directed graph of inputs, formula nodes, and outputs is the
calculation; input sweeps turn it into a design study.

Milestone 1 is complete and intentionally narrow: the unrestricted base-node
library plus the `C16_Belt` catalogue slice. Do not broaden that scope or add
hypothetical infrastructure without a concrete need. Tables and categorical
catalogue ports remain an accepted, unvalidated gap until a later slice.

## Public/restricted boundary

This repository is MIT and publishable. Roloff & Matek (R&M) formula content is
restricted and must stay in the separate private catalogue repository.

- Never add, paste, log, or publish real R&M expressions in this repository,
  its tests, generated artifacts, issues, or external output unless explicitly
  asked.
- Never use a real R&M formula as a test fixture. Use invented formulas such as
  `y = a*b + c` instead.
- The public extraction scripts may parse predecessor source with Python's
  stdlib `ast`, but must never import or execute it. Their output belongs in the
  private catalogue repository.
- The predecessor repository is transcription/reference material only. Do not
  reuse its architecture, SymPy/MySymbol layer, unit-symbol convention, or
  helpers.

## Architecture and invariants

Packages are deliberately layered. Keep React and browser concerns out of the
kernel.

```
packages/schema/  Versioned formula and graph data contract
packages/units/   Canonical units, dimension algebra, and port typing
packages/kernel/  DAG evaluation, broadcasting, and expression handling
packages/nodes/   Unrestricted base-node library
packages/editor/  React Flow editor, notebook view, and outputs
tools/extract/    One-off Python extraction scripts
```

- Use TypeScript except for `tools/` extraction scripts. There is no runtime
  computer algebra system.
- The workspace uses pnpm, TypeScript project references, Vitest, and Vite.
  Project references enforce dependency direction.
- Internal units are `mm`, `N`, `s`, `rad`, and `K`; convert only at boundaries.
  Undeclared units are errors. Mass is tonnes and density is `t/mm³`, so check
  scale conversions carefully—dimension checking alone cannot catch them.
- Track angles as a dimension; store them in radians and display degrees only at
  the boundary. Trig accepts angle or dimensionless inputs.
- Dimensions are connection-time port types. Ports can be numeric with a
  dimension, categorical with an enumerated domain, or generic dimensions such
  as `$A` and `$A*$B`.
- Evaluation is forward-only. Reject cycles at connection time; do not add a
  solver. Formula variants are explicit catalogue data (`variantOf`).
- Sweeps are first-class: values carry labelled axes and ranges broadcast into
  grids. Support only the defined sweep forms rather than inventing ad hoc
  stepping behavior.
- Expressions are strings parsed to an AST and compiled safely. Never use
  `eval` or `new Function`. Numbers in expressions are canonical-unit values.
- Formula applicability belongs in `appliesWhen`, not expression conditionals.
  Formula metadata and valid ranges are load-bearing data, not optional UI
  decoration.
- Graphs reference formulas by global ID, version, and hash; never embed formula
  bodies. Documents carry an integer schema version. The notebook is a view of
  graph group frames, not a second document.
- The editor is desktop-only. Preserve its palette/canvas/notebook layout and
  avoid introducing a permanent inspector without an explicit product decision.

## Formula content and verification

R&M is the authority. If a formula, unit tag, defect, or meaning is ambiguous,
stop and ask the user rather than guessing. Do not silently fix known source
defects or silently carry them forward.

Golden values establish faithful transcription, not correctness. Keep formulas
that lack coverage `unverified`; preserve quarantines until the relevant content
question is signed off. Formula authoring UI is deferred, so a large need to
hand-edit generated catalogue JSON is a signal to raise, not paper over.

## Development workflow

- Work on `main` unless the task explicitly uses an isolated worktree. Do not
  discard or overwrite unrelated working-tree changes.
- Do not start, stop, or drive `pnpm dev`: the user runs and browser-tests the
  editor. Report what to verify manually instead.
- Normal validation is `pnpm build` (also checks package direction) and
  `pnpm test`. Catalogue-dependent tests require `MDS_CATALOGUE` and skip when
  it is absent; that is expected.
- Use `pnpm --filter @mds/editor dev` only when documenting the command; do not
  run it as part of agent work.
- Keep rationale near the code it explains. Avoid adding process or decision
  documents for hypothetical future needs.

## Commits

Use Conventional Commits: `type(scope): subject`. Changelog-facing types are
`feat`, `fix`, `perf`, `refactor`, and `docs`; housekeeping types are `test`,
`build`, `ci`, `chore`, and `style`. Use a package boundary as scope when one
package is affected (`schema`, `kernel`, `units`, `nodes`, `editor`, or `tools`)
and omit scope for repository-wide changes. Mark breaking changes with `!` or a
`BREAKING CHANGE:` footer.
