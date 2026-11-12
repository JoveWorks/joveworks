# Shaft sizing: from loads to a diameter

Status: plan, not started. Written 2026-11-12. Written to be implemented cold:
every claim under "Verified" was checked against the code on that date.

Read `AGENTS.md` first. The rules that bite here: invented numbers only in
tests, no R&M formula content in this repository, existing formula records
must not change (documents reference them by id, version and hash), do not
run `pnpm dev`, Conventional Commits, stage explicit paths (never `git add -A`).

## Context

The base library can already draw a shaft's diagrams. `packages/nodes/src/mechanicsNodes.ts`
has `mechanics.shaft.torque`, `.shear`, `.moment`, `.deflection-term`,
`.deflection` and the two distributed-load contributions, each evaluated at a
position `z`; sweeping `z` draws the curve.

What it cannot do is the work around the diagrams. The course notebooks rebuilt
in `ref/machine-design-solutions/nodebooks/build/` (`w3.ts`, `w4.ts`; `ref/` is
gitignored reference material) show it: `w3-ex2` is 32 hand-written closure
nodes against 4 library formulas. Each step below is typed by the student as a
raw expression today.

| Step | How the notebooks do it today |
| --- | --- |
| Support reactions | `(f2 * (x_2 - x_A) - f1 * (x_A - x_1)) / (x_B - x_A)`, retyped per plane |
| Two-plane resultant | `sqrt(M_Ay**2 + M_Az**2)`, once per section of interest |
| Section moduli | `pi * d**3 / 32`, `pi * d**3 / 16` |
| Equivalent moment | `sqrt(M**2 + 0.75 * T**2)` |
| Required diameter along the shaft | `cbrt(32 * M_x / (pi * sigma_perm))` |

Decisions taken (Thomas, 2026-11-12):

- **No fatigue.** Static sizing only. Notch, size and surface factors stay in
  the private R&M catalogue.

## Approach

Sizing a solid round shaft is a closed form, so the forward-only kernel is not
in the way: no solver, no new node kind. Phase 1 is formula records only.
Phase 2 adds one piecewise kind for stepped shafts.

"Optimal size" is composed from nodes that exist:

- `d_req(z)` swept over `z` is the ideal profile.
- A Select node (`packages/kernel/src/select.ts`) reducing along `z` by
  maximum gives the governing diameter.
- A `list` range of standard diameters, a check on the safety factor, and a
  Select for the first passing size picks the part.

## Verified

- **Reductions take an expression over variadic and plain ports together.**
  `sum(force * (position - supportA))` evaluates per wired value, pairing
  `position`/`force` by wire order (`packages/kernel/src/functions.ts`
  docstring; `compile.test.ts` has `sum((xs / r) ** p)`).
- **A formula may have several outputs, each with its own expression, and a
  later output may name an earlier one** (`Formula.expressions` docstring in
  `packages/schema/src/formula.ts`). Order matters: an output can only name
  outputs declared *before* it.
- **The Phase 1 expressions below were run through the kernel** in a throwaway
  test. Loads −12 000 N at 0 mm and −20 000 N at 900 mm with supports at 500
  and 1500 mm gave `R_A = 30000`, `R_B = 2000`. `d = 75 mm` gave
  `W_b = 41417.48`, `W_p = 82834.96`. `M = 6e6 Nmm`, `σ = 100 N/mm²`, `T`
  left at its default 0 gave `d = 84.8628`.
- **A piecewise formula must have exactly one output** (schema validation), so
  the reactions formula is an ordinary expression formula, not piecewise.
- **`kernel` and `nodes` do not depend on each other.** The real records in
  `mechanicsNodes.ts` can only be evaluated from `packages/editor` tests.
  Kernel tests use invented catalogues from `invented.fixtures.ts`.
- `mechanicsNodes.ts` builds `Formula` objects directly (not through
  `draft.ts`). In a TypeScript record the field is `expressions: { name: '…' }`;
  the JSON spelling `expression` only appears in fixtures.
- Units are written `parseUnit('mm')`, `'N'`, `'Nmm'`, `'N/mm²'`, `'mm³'`.
- New records need no registration beyond the `MECHANICS_OPERATIONS` array at
  the bottom of `mechanicsNodes.ts`; `catalogue.ts` and the editor pick the
  array up. `palette/advancedNodes.ts` gates nothing from this catalogue.

## Phase 1 — formula records

All in `packages/nodes/src/mechanicsNodes.ts`, appended to
`MECHANICS_OPERATIONS`, `version: 1`, `status: 'unverified'`, labels and
descriptions through `text()` like the neighbours. Do not edit the seven
existing records.

Input ports that are not variadic may take `default`; variadic ports may not.

### `mechanics.shaft.reactions` — label "Support reactions"

| Port | Kind | Unit |
| --- | --- | --- |
| in `position` | variadic | mm |
| in `force` | variadic | N |
| in `supportA` | plain, no default | mm |
| in `supportB` | plain, no default | mm |
| out `R_B` (declare first) | | N |
| out `R_A` | | N |

```ts
expressions: {
  R_B: '-sum(force * (position - supportA)) / (supportB - supportA)',
  R_A: '-sum(force) - R_B',
},
```

Signed like the loads, so `sum(force) + R_A + R_B = 0` and the outputs wire
straight into the diagram nodes' `reactionA`/`reactionB`. The description must
say two things: loads and reactions share one sign convention, and a
distributed load enters as its resultant (`rate × length`) at its centroid,
which is exact for reactions.

### `mechanics.shaft.resultant-moment` — label "Resultant bending moment"

Inputs `M_y`, `M_z` (Nmm). Output `M` (Nmm).
`expressions: { M: 'sqrt(M_y**2 + M_z**2)' }`.

### `mechanics.shaft.section-modulus` — label "Section moduli of a round shaft"

Inputs `d` (mm), `d_i` (mm, `default: 0`). Outputs `W_b` then `W_p` (mm³).

```ts
expressions: { W_b: 'pi * (d**4 - d_i**4) / (32 * d)', W_p: '2 * W_b' },
```

### `mechanics.shaft.equivalent-moment` — label "Equivalent moment (von Mises)"

Inputs `M` (Nmm), `T` (Nmm, `default: 0`). Output `M_v` (Nmm).
`expressions: { M_v: 'sqrt(M**2 + 0.75 * T**2)' }`.

### `mechanics.shaft.required-diameter` — label "Required diameter of a solid shaft"

Inputs `M_v` (Nmm), `sigma_allow` (N/mm²). Output `d` (mm).
`expressions: { d: 'cbrt(32 * M_v / (pi * sigma_allow))' }`.

### `mechanics.shaft.equivalent-stress` — label "Equivalent stress (von Mises)"

Inputs `sigma_b` (N/mm²), `tau_t` (N/mm², `default: 0`). Output `sigma_v` (N/mm²).
`expressions: { sigma_v: 'sqrt(sigma_b**2 + 3 * tau_t**2)' }`.

### Tests for Phase 1

New file `packages/editor/src/model/shaftSizing.test.ts`. Copy the scaffolding
at the top of `packages/editor/src/model/photographyStudy.test.ts` (`lookup`,
`formulaRef`, the local `formulaNode`/`scalar` helpers), but load the
catalogues with `builtInCatalogues()` from `./catalogues`: that file's
`baseCatalogue()` is the base nodes only, and the shaft records live in
`mechanicsCatalogue()`, which `builtInCatalogues()` includes.

Assert, with invented numbers (do not reuse the course figures above):

1. Reactions for two loads and an overhang; `sum(force) + R_A + R_B` is 0.
2. The reactions wired into `mechanics.shaft.moment` give `M = 0` at a `z`
   past the last load and support. This is the test that the sign convention
   really matches the diagram nodes.
3. `section-modulus` for a solid and a hollow shaft; `W_p = 2·W_b`.
4. The chain moment → equivalent-moment → required-diameter over a swept `z`
   returns a series the length of the sweep.
5. Feeding `required-diameter`'s result back through `section-modulus` and
   `M_v / W_b` returns `sigma_allow` (round trip).

`packages/nodes/src/catalogue.test.ts` already round-trips and hashes every
record in the catalogue; it must stay green without edits.

Commit: `feat(nodes): add shaft reactions and static sizing formulas`.

## Phase 2 — stepped shafts

A real shaft has shoulders. The picture worth having is the actual profile
`d(z)` drawn over `d_req(z)`: the shaft is adequate where the first stays
above the second.

### Schema — `packages/schema/src/formula.ts`

- Add `'stepValue'` to `PIECEWISE_KINDS` and a bullet to the docstring above
  it: the value whose breakpoint is the greatest one at or before `axis`; on
  equal breakpoints the later-declared entry wins; `NaN` where `axis` is
  before every breakpoint.
- In the piecewise validation block (search `cumulativeCubic contribution is
  not implemented`), reject `distributedStart/End/Rate` for `stepValue` the
  same way, and require `breakpoints`/`values`.
- The dimension rule needs no change: the existing ternary's fall-through
  already demands `values` share the output's dimension, which is right here.
- Tests in `packages/schema/src/formula.test.ts` beside
  `describe('cumulativeCubic')`: accepts a valid record, rejects distributed
  fields, rejects a `values` port of the wrong dimension.

Additive: no saved document or published catalogue uses the kind, so no
`DOCUMENT_SCHEMA_VERSION` bump and no migration.

### Kernel — `packages/kernel/src/evaluate.ts`

In the `if (formula.piecewise !== undefined)` block (search
`Closed-form at every sampled`), after `positions`/`magnitudes` are read and
length-checked for a cell, branch before the cumulative loop:

```ts
if (piecewiseKind === 'stepValue') {
  let best = Number.NaN;
  let bestPosition = -Infinity;
  for (let i = 0; i < positions.length; i += 1) {
    const position = positions[i] as number;
    if (position <= z && position >= bestPosition) {
      bestPosition = position;
      best = magnitudes[i] as number;
    }
  }
  data[cell] = best;
  continue;
}
```

Tests in `packages/kernel/src/evaluate.test.ts` inside
`describe('piecewise-backed formulas')`, following the `runningMoment` case
directly above (invented catalogue via `catalogueOf`, `variadicWires`, a
`list` input for `z`): `z` before the first step gives `NaN`, `z` exactly on a
step takes that step, steps wired out of positional order still resolve by
position.

### Node — `mechanicsNodes.ts`

`mechanics.shaft.diameter-profile`, label "Stepped shaft profile". Inputs `z`
(mm, `default: 0`), variadic `position` (mm, "Where each step begins"),
variadic `diameter` (mm). Output `d` (mm).

```ts
expressions: { d: 'sum(diameter)' },   // unused at evaluation; keeps dimensions honest
piecewise: { kind: 'stepValue', axis: 'z', breakpoints: ['position'], values: ['diameter'] },
```

Add one case to `shaftSizing.test.ts`: profile → `section-modulus` →
`M / W_b` over a swept `z` changes value at the step.

Commits: `feat(schema): add the stepValue piecewise kind`,
`feat(kernel): evaluate stepValue piecewise formulas`,
`feat(nodes): add a stepped shaft diameter profile`.

Out of scope: deflection of a stepped shaft. `mechanics.shaft.deflection`
solves its two constants assuming one `E·I` for the whole shaft.

## Phase 3 — bundled sample (needs Thomas before it is committed)

A sample in `packages/editor/src/model/samples.ts`, using
`cantileverHollowSections` as the template (an exported `*_FORMULAS` id list,
`provides(catalogues, ids)` guard, `input`/`formulaNode`/`output`/`wire`/
`frameAround` helpers, `localizeExample`). Invented numbers. Content: loads in
two planes, reactions per plane, the two moment diagrams and their resultant,
the required-diameter curve, a stepped profile over it in one plot, and a
standard-size list with the first passing size selected.

Conventions to follow: node and frame positions are multiples of the canvas
grid `GAP` (`samples.test.ts` asserts this for the milling sample), and
example-owned text gets a Dutch entry in `sample-translations.json`
(`localizeExample` falls back to English when one is missing, so nothing fails
if it is forgotten). The sample is registered in `packages/editor/src/App.tsx`
and `packages/editor/src/viewer/CloudMaterialViewer.tsx`; follow
`cantileverHollowSections` in both.

A sample is layout and wording, which are Thomas's call: build it, leave it
uncommitted, and report it for a browser check.

## Validation

`pnpm build && pnpm test` after each phase. On 2026-11-12 `pnpm exec` tried to
reinstall and aborted (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). If the
`pnpm` scripts do the same, do not let pnpm purge `node_modules`; run
`node_modules/.bin/tsc -b` and `node_modules/.bin/vitest run` instead and
report it.

Report at the end: commit SHAs, what was run with its result, and what to
check in the browser (new nodes appear under Mechanics in the palette; a
reactions node wired into a moment diagram closes to zero at the shaft end).

## Open decisions

Each has a default so implementation is not blocked. Build the default; Thomas
may overrule.

1. **`required-diameter` in the public library.** Default: add it. It is
   `σ = M / W` rearranged for a round section. The course notebooks use
   `rm.11.1` and `rm.11.16B` for the same step, so students with the R&M
   catalogue loaded will see both. Do not open, quote or imitate the R&M
   records to align them.
2. **`α₀` in the equivalent moment.** Default: leave it out. It corrects for
   bending and torsion having different load cases, which is fatigue
   reasoning and belongs to the R&M catalogue.
3. **Tresca.** Default: not added.
4. **Standard diameters.** Default: the sample types a `list` range by hand.
   A preferred-number series or the table-input node
   (`docs/table-input-node-plan.md`) can replace it later.
5. **Reaction sign convention.** Default: signed like the loads. The `w3`
   notebooks report positive upward magnitudes and negate the loads when
   wiring the diagrams; if Thomas prefers that, only the two reaction
   expressions and their description change.
