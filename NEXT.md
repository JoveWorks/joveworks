# Next session

A ready-to-paste prompt for starting the next chunk of work. Kept deliberately
short: [CLAUDE.md](CLAUDE.md) loads automatically and carries the detail, so
anything repeated here is a second source that can drift.

**Update this file when the session it describes is done**, so it always names
the *next* step rather than a finished one.

---

## Current: milestone 1, step 4 — the base node library

```
Continue milestone 1 of machine-design-studio.

Read OVERVIEW.md first, then PLAN.md (especially Sequencing) and DECISIONS.md.
S1–S58 are settled — implement them, don't relitigate them. If something looks
wrong, say so before building around it.

Steps 1–3 are done: the workspace is scaffolded, and `packages/units` and
`packages/schema` are built and tested. Read `packages/schema/src/index.ts`
before writing a single node — a base node is a `Formula` record like any
other, and the point of this step is that it needs no new schema. If it does
need one, that is the finding, and it is worth more than the nodes.

Scope for this session: PLAN.md milestone 1, step 4 — `packages/nodes` only.
Do not build the kernel, do not build the editor, and do not extract formulas.

Build `packages/nodes`: the base node library (S42), which carries no textbook
content and ships unrestricted.

1. Literal inputs and the arithmetic and math operations of S35's whitelist,
   authored as ordinary `Formula` records in an unrestricted catalogue.
2. Output nodes in the four kinds of S33 — value, check, plot, table — insofar
   as they are catalogue content rather than editor rendering. Say which half
   is which.
3. The catalogue is a build artefact of this package, not hand-written JSON at
   scale (CLAUDE.md names that as the smell). Author the records in TypeScript
   and serialize them with `@mds/schema`.
4. Tests: the catalogue parses, round-trips, and every record's dimensions are
   consistent with its expression by inspection — the dimension checker itself
   is the kernel's, so do not build it here.

Stop when nodes has passing tests and report before starting the kernel.
```

### Why it is shaped this way

- **It names a stopping point.** The kernel is what makes these nodes do
  anything, which makes it the tempting thing to start in the same pass.
- **It makes the library a test of the schema.** If the base nodes need a field
  the formula record does not have, better to learn it here — on records we
  wrote ourselves — than during belt extraction.
- **It fixes the scope.** Scope has been narrowed deliberately several times
  (S25, S41, S51, S52); the prompt names what *not* to touch so that holds.

---

## After that, in order

From PLAN.md's milestone 1:

5. **Evaluation kernel** — topological sort, labelled-axis broadcasting, the
   boolean predicate layer, and the gate that a quarantined formula cannot be
   evaluated.
6. **Extract `C16_Belt`** — a one-off script over stdlib `ast`, into the private
   catalogue repo. Read the generated file; 55 expressions is a reviewable diff.
7. **Belt golden values** end to end — the table in PLAN.md.
8. **Minimal editor** — canvas, wiring, one sweep, one plot. No authoring UI.

## Standing items, none blocking

- **Defect and unit-tag sign-off** against R&M. Needs the book, so it is Thomas's.
  Belt is clean of junk tags and carries only one defect, so this does not gate
  milestone 1 at all.
- **Three decisions came out of step 3** and are recorded as S56–S58: a port
  declares a display unit and derives its dimension, the content hash is a
  non-cryptographic FNV-1a over canonical JSON, and a check node's threshold is
  a quantity rather than a predicate string. Worth a read before the kernel,
  which is what consumes all three.
- **What actually enforces the dependency direction: S55**, measured while
  scaffolding rather than assumed. `test/project-references.test.ts` pins both
  the enforcement and its limit, so do not add a lint-based boundary rule on top
  without a reason the test does not already cover.
- **Neither repository has been pushed.** No remotes exist yet. When creating the
  catalogue repo on a host, it must be **private at creation** — a repository
  that is public even briefly is indexable.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
