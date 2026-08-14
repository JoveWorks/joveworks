# Next session

A ready-to-paste prompt for starting the next chunk of work. Kept deliberately
short: [CLAUDE.md](CLAUDE.md) loads automatically and carries the detail, so
anything repeated here is a second source that can drift.

**Update this file when the session it describes is done**, so it always names
the *next* step rather than a finished one.

---

## Current: milestone 1, steps 1–2 — scaffolding and units

```
Start milestone 1 of machine-design-studio.

Read OVERVIEW.md first, then PLAN.md (especially Sequencing) and DECISIONS.md.
S1–S52 are settled — implement them, don't relitigate them. If something looks
wrong, say so before building around it.

Scope for this session: PLAN.md milestone 1, steps 1 and 2 — scaffolding and the
units package. Do not touch the catalogue, the kernel, or the editor yet, and do
not extract formulas.

1. Scaffold the pnpm workspace: TypeScript project references, Vitest, Vite.
   Packages: schema, units, kernel, nodes, editor. Placeholders are fine for all
   but units. Verify the project references actually fail a build when a
   dependency direction is violated — that enforcement is the point of S22.

2. Build the units package:
   - canonical base mm, N, s, rad, K; dimension algebra; boundary conversion;
     display formatting
   - parse the old [unit] tag forms into dimension + display unit
   - an undeclared unit is a hard error, not a default

Target the belt tag set, which is milestone 1's real input and is entirely clean:
[] [%] [kg/dm³] [m] [mm] [mm²] [m/s] [N] [Nm] [N/mm] [N/mm²] [Nm/mm] [rpm]
[s-1] [W] [W/mm]

Three that need care:
- [kg/dm³] — the density trap. Mass is tonnes and density t/mm³ in a consistent
  mm-N-s system. The dimension checker must catch C16_Belt.py:154's
  `F_c = A_S * 1E-6 * 1E3 * rho * v**2` fudge. Make that a test.
- [%] — dimensionless with a display scale, same treatment as revolutions (S21).
- [s-1] — frequency; belt's f_B golden is 6.464 s⁻¹.

Use invented formulas as test fixtures, never real R&M ones (see CLAUDE.md).

Stop when units has passing tests and report before starting the schema package.
```

### Why it is shaped this way

- **It names a stopping point.** Schema and units are entangled — port types need
  dimensions — so it is tempting to do both at once. Stopping after units gives a
  checkpoint while the contract is still cheap to change.
- **It asks for the project-reference enforcement to be *verified*, not just
  configured.** S22 leans on references to keep React out of the kernel and the
  catalogue unimportable from published packages. A config that silently fails to
  enforce that is worse than none, because it is trusted.
- **It fixes the scope.** Scope has been narrowed deliberately several times
  (S25, S41, S51, S52); the prompt names what *not* to touch so that holds.

---

## After that, in order

From PLAN.md's milestone 1:

3. **Schema package** — the contract. Formula record with ports, dimensions,
   citation, `variantOf`, `appliesWhen`, `status`, defaults and valid ranges;
   graph document with labelled axes, group frames and output nodes; integer
   version stamp, no migration chain.
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
- **Neither repository has been pushed.** No remotes exist yet. When creating the
  catalogue repo on a host, it must be **private at creation** — a repository
  that is public even briefly is indexable.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
