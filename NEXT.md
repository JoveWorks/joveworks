# Next session

A ready-to-paste prompt for starting the next chunk of work. Kept deliberately
short: [CLAUDE.md](CLAUDE.md) loads automatically and carries the detail, so
anything repeated here is a second source that can drift.

**Update this file when the session it describes is done**, so it always names
the *next* step rather than a finished one.

---

## Current: milestone 1, step 3 — the schema package

```
Continue milestone 1 of machine-design-studio.

Read OVERVIEW.md first, then PLAN.md (especially Sequencing) and DECISIONS.md.
S1–S55 are settled — implement them, don't relitigate them. If something looks
wrong, say so before building around it.

Steps 1 and 2 are done: the pnpm workspace is scaffolded and `packages/units`
is built and tested. Read `packages/units/src/index.ts` before designing ports —
dimensions, units and the boundary conversion already exist and the schema
should sit on top of them, not restate them.

Scope for this session: PLAN.md milestone 1, step 3 — the schema package only.
Do not build the kernel, the base nodes or the editor, and do not extract
formulas.

Build `packages/schema`: the contract everything else depends on.

1. The formula record: output port, input ports, expression string, per-port
   dimension and display unit, description, citation, `variantOf`,
   `appliesWhen`, `status` (verified / unverified / quarantined), and optional
   default and valid range. Valid range is load-bearing — it is a sweep bound
   and S17's bracketing interval, so it is not a UI nicety.
2. Ports are dimensioned-numeric or categorical (S38); categoricals carry an
   enumerated domain. Spectrum inputs (S36) take an explicit list and cannot be
   swept.
3. The graph document: nodes, edges, labelled axes (S43), titled group frames
   (S28/S30, load-bearing, not decoration), output nodes in four kinds (S33),
   and formula references by ID + version + content hash, never embedded (S23).
4. An integer schema version stamp, and no migration chain (S25).
5. Parse/validate at the boundary and round-trip: save, reload, and confirm
   every field survives.

Use invented formulas as fixtures, never real R&M ones (see CLAUDE.md).

Stop when schema has passing tests and report before starting the base node
library.
```

### Why it is shaped this way

- **It names a stopping point.** The kernel is the tempting next thing, and it
  will silently drive schema decisions if written in the same pass.
- **It points at `units` first.** The two are entangled — port types are
  dimensions — and the schema restating what units already models is the most
  likely way this step goes wrong.
- **It fixes the scope.** Scope has been narrowed deliberately several times
  (S25, S41, S51, S52); the prompt names what *not* to touch so that holds.

---

## After that, in order

From PLAN.md's milestone 1:

4. **Base node library** — literal inputs, math operations, output nodes.
   Unrestricted, and it makes the kernel testable before any catalogue exists.
5. **Evaluation kernel** — topological sort, labelled-axis broadcasting, the
   boolean predicate layer.
6. **Extract `C16_Belt`** — a one-off script over stdlib `ast`, into the private
   catalogue repo. Read the generated file; 55 expressions is a reviewable diff.
7. **Belt golden values** end to end — the table in PLAN.md.
8. **Minimal editor** — canvas, wiring, one sweep, one plot. No authoring UI.

## Standing items, none blocking

- **Defect and unit-tag sign-off** against R&M. Needs the book, so it is Thomas's.
  Belt is clean of junk tags and carries only one defect, so this does not gate
  milestone 1 at all.
- **What actually enforces the dependency direction: S55**, measured while
  scaffolding rather than assumed. `test/project-references.test.ts` pins both
  the enforcement and its limit, so do not add a lint-based boundary rule on top
  without a reason the test does not already cover.
- **Neither repository has been pushed.** No remotes exist yet. When creating the
  catalogue repo on a host, it must be **private at creation** — a repository
  that is public even briefly is indexable.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
