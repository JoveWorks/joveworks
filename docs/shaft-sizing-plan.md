# Shaft sizing: from loads to a diameter

Status: plan, not started. Written 2026-11-12, revised the same day after a
design review with Thomas. Written to be implemented cold: every claim under
"Verified" was checked against the code on that date.

Read `AGENTS.md` first. The rules that bite here: invented numbers only in
tests, no R&M formula content in this repository, existing formula records
must not change (documents reference them by id, version and hash), do not
run `pnpm dev`, Conventional Commits, stage explicit paths (never `git add -A`).
`CLAUDE.md` adds one more: a node view's appearance is a visual change, so the
canvas view in Phase 2 is built, shown to Thomas, and committed only once he
approves it.

## Context

The base library can already draw a shaft's diagrams.
`packages/nodes/src/mechanicsNodes.ts` has `mechanics.shaft.torque`, `.shear`,
`.moment`, `.deflection-term`, `.deflection` and the two distributed-load
contributions, each evaluated at a position `z`; sweeping `z` draws the curve.

Two things are missing. The work *around* the diagrams (reactions, section
moduli, equivalent moment, required diameter) is typed by students as raw
expressions. And entering the loads themselves is not intuitive:

1. **Pairing is invisible.** A load is a `position` wire and a `force` wire
   into two separate variadic slot stacks, paired by wire order. Deleting one
   wire re-pairs every later load with the wrong position, silently.
2. **A list is a sweep, not a set.** Typing the loads as a `list` or a lookup
   table gives one diagram per row, each with a single load.
3. **Loads arrive two ways.** Some are typed; others are computed upstream (a
   gear force from torque) and arrive as single values. Zip cannot turn single
   values into rows (`ZipNode` docstring: "the values pass straight through").
4. **The same set is wired again and again** — into shear, moment, deflection
   and the reactions, then again for the second plane.
5. **Reactions loop back**: loads → reaction arithmetic → back into every
   diagram's `reactionA`/`reactionB`.
6. **One physical load is several entries**: a gear's two components sit at
   one position in two planes, which the student keeps in step by hand.
7. **No concentrated bending couple** (a helical gear's axial force × radius).

## Decisions taken (Thomas, 2026-11-12)

- **No fatigue.** Static sizing only. Notch, size and surface factors stay in
  the private R&M catalogue.
- **A Load node.** One node per physical load, typed or wired field by field,
  producing one typed `load` wire. Fields: position, two transverse forces,
  torque, bending couple (see open decision 1 for their names).
- **A Distributed load sibling node** producing the same `load` wire.
- **No table of loads.** One node per load; a table may return with the table
  redesign (`docs/table-input-node-plan.md`).
- **Old nodebooks keep working through a fallback catalogue.** The seven
  shipped records move, byte for byte, into a hidden legacy catalogue; the new
  records take the same ids in the mechanics catalogue.
- **The stepped profile uses existing nodes**: a lookup table plus
  Interpolate in `nextDown` mode. No new piecewise kind.

## Verified

- **The mechanics records have shipped.** `origin/production` (release
  0.33.0) contains `mechanicsNodes.ts`, so students may hold nodebooks that
  reference the v1 records.
- **A catalogue refuses a duplicate id** (`formula.ts:1046`, "appears twice
  in this catalogue"), so v1 and v2 of one id cannot share a catalogue.
- **Resolution searches every loaded catalogue by id, then picks the exact
  version and hash** (`indexFormulas`/`lookupFormula`, `graph.ts:217–254`). On
  no exact match it warns `formulaChanged` and falls back to the *first*
  candidate. A `FormulaRef` is `{ id, version, hash }` with no catalogue id
  (`formula.ts:910`). So a legacy catalogue holding the v1 records resolves old
  documents exactly, provided the mechanics catalogue is listed first.
- **Every built-in catalogue loads through one function**,
  `builtInCatalogues()` (`packages/editor/src/model/catalogues.ts:135`). The
  published-notebook viewer uses it too (`viewer/interactiveRuntime.ts`, "A
  pinned catalogue still wins on an id collision"). `PERMANENT_CATALOGUE_IDS`
  (`catalogues.ts:153`) keeps the built-ins from being removed. The palette
  lists every formula of every catalogue (`entries()`, `catalogues.ts:182`)
  with no version deduplication.
- **Wireable typed fields have a precedent**: `RangeNode`'s `start`/`stop`/
  `count` are literals that become ports once wired (`document.ts:511`,
  `START_PORT`/`STOP_PORT`). So does `CompareNode.threshold`.
- **A structured value on a wire has a precedent**: `BundleValue`
  (`kernel/src/series.ts:51`) joins `PortValue`. `BundlePort` exists in
  `schema/src/port.ts:189` but "no catalogue formula ever declares one".
- **The zip node is the template for adding a node kind.** Commit `4c14cc9`
  (kernel and schema: `document.ts`, `index.ts`, `graph.ts`, `evaluate.ts`,
  `sensitivity.ts`, `editor/src/model/analysis.tsx`, `jupyter.ts`,
  `canvas/quickAdd.ts`, `help-links.ts`, `docs-site/docs/guide/node-reference.md`)
  and `094d3e7` (canvas: `Canvas.tsx`, `QuickAddMenu.tsx`, `ZipNodeView.tsx`,
  `i18n.ts`, `palette/Palette.tsx`, `styles.css`). Neither bumped
  `DOCUMENT_SCHEMA_VERSION`.
- **Jupyter export already carries beam diagrams untranslated**
  (`jupyter.ts:733`, "a beam diagram"); a Load node does the same through the
  node-kind label map at `jupyter.ts:515`.
- **Interpolate's `nextDown`** is "the last row whose key is at or below the
  point" (`INTERPOLATION_MODES`, `document.ts`): a step function over a lookup
  table. Rows may arrive unsorted; duplicate keys are refused. It learns the
  row axis from the `xs` wire and broadcasts over every other axis.
- **Select has no "maximum value" mode.** Modes are `crossing`,
  `firstPassing`, `argMin`, `argMax`; `argMax` answers the coordinate and,
  on its `best` port, the value there.
- **Real mechanics records are evaluated end to end** in
  `test/mechanics-nodes-end-to-end.test.ts` (helpers `node`, `wire`, `graph`,
  `NODE_IDS`; catalogues from `mechanicsCatalogueJson()`). Its test at line
  115 solves a 1000 N load at 80 mm on a 200 mm span to 600 N / 400 N by hand,
  with loads negative downward and reactions positive upward.
- **Expressions**: a formula may have several outputs, a later one naming an
  earlier one (`formula.ts:231`); reductions pair variadic and plain ports by
  wire order (`functions.ts:24`); `cbrt` and `pi` exist. A piecewise formula
  must have exactly one output (`formula.ts:642`); the `deflection` field is
  a second, separate special evaluator (`formula.ts:180`).
- `mechanicsNodes.ts` builds `Formula` objects directly (not through
  `draft.ts`). Units are written `parseUnit('mm')`, `'N'`, `'Nmm'`, `'N/mm²'`,
  `'mm³'`.

## Phase 1 — sizing formulas

Independent of everything else; can ship first. All in `mechanicsNodes.ts`,
appended to `MECHANICS_OPERATIONS`, `version: 1`, `status: 'unverified'`,
labels and descriptions through `text()` like the neighbours. Do not edit the
seven existing records.

| id | Label | Inputs | Outputs |
| --- | --- | --- | --- |
| `mechanics.shaft.section-modulus` | Section moduli of a round shaft | `d` (mm), `d_i` (mm, `default: 0`) | `W_b` then `W_p` (mm³) |
| `mechanics.shaft.equivalent-moment` | Equivalent moment (von Mises) | `M` (Nmm), `T` (Nmm, `default: 0`) | `M_v` (Nmm) |
| `mechanics.shaft.required-diameter` | Required diameter of a solid shaft | `M_v` (Nmm), `sigma_allow` (N/mm²) | `d` (mm) |
| `mechanics.shaft.equivalent-stress` | Equivalent stress (von Mises) | `sigma_b` (N/mm²), `tau_t` (N/mm², `default: 0`) | `sigma_v` (N/mm²) |

```ts
section-modulus:    { W_b: 'pi * (d**4 - d_i**4) / (32 * d)', W_p: '2 * W_b' }
equivalent-moment:  { M_v: 'sqrt(M**2 + 0.75 * T**2)' }
required-diameter:  { d: 'cbrt(32 * M_v / (pi * sigma_allow))' }
equivalent-stress:  { sigma_v: 'sqrt(sigma_b**2 + 3 * tau_t**2)' }
```

Descriptions must say: `section-modulus` needs `d_i < d`;
`required-diameter` expects a moment magnitude (a resultant or equivalent
moment), since a signed moment gives a negative diameter.

The former `resultant-moment` record is dropped: Phase 3's diagrams answer
the resultant directly through their plane picker.

Checked through the kernel on 2026-11-12: `d = 75 mm` gives
`W_b = 41417.48`, `W_p = 82834.96`; `M = 6e6 Nmm`, `σ = 100 N/mm²`, `T = 0`
gives `d = 84.8628`.

### Tests

In `test/mechanics-nodes-end-to-end.test.ts`, extending `NODE_IDS`. Invented
numbers only (not the ones above):

1. `section-modulus` for a solid and a hollow shaft; `W_p = 2·W_b`.
2. `equivalent-moment` with and without `T`.
3. Round trip: `required-diameter`'s `d` back through `section-modulus` and
   `M_v / W_b` returns `sigma_allow`.
4. `equivalent-stress` agrees with `equivalent-moment / W_b` when
   `tau_t = T / W_p`.

`packages/nodes/src/catalogue.test.ts` must stay green without edits.

Commit: `feat(nodes): add static shaft sizing formulas`.

## Phase 2 — Load and Distributed load nodes

Two document node kinds and one value kind. Follow the zip node's two commits
file for file (see Verified).

### Schema — `packages/schema/src/document.ts`

```ts
/** One physical load on a shaft: where it acts and what it applies there. */
export interface LoadNode extends NodeBase {
  readonly kind: 'load';
  readonly at: Quantity;          // position along the shaft
  readonly force1?: Quantity;     // transverse force, plane 1   (names: open decision 1)
  readonly force2?: Quantity;     // transverse force, plane 2
  readonly torque?: Quantity;
  readonly couple1?: Quantity;    // concentrated bending couple, plane 1
  readonly couple2?: Quantity;    // concentrated bending couple, plane 2
}

/** A uniform load over a span. */
export interface DistributedLoadNode extends NodeBase {
  readonly kind: 'distributedLoad';
  readonly from: Quantity;
  readonly to: Quantity;
  readonly rate1?: Quantity;      // force per length, plane 1
  readonly rate2?: Quantity;
}
```

Every field is also a port of the same name, its literal the default until
something is wired — `RangeNode`'s shape exactly. An absent optional field is
zero. Output port `load`. Validation: units of the right dimension per field;
`to ≥ from` is a kernel check (a wired value can violate it).

Add both kinds to the node-kind list (`document.ts`, search `'zip',` near
line 1573), the parser and serializer switches, and the `GraphNode` union.
Additive: no `DOCUMENT_SCHEMA_VERSION` bump, as for zip.

### Port kind — `packages/schema/src/port.ts`

A `LoadPort` (`kind: 'load'`, may be `variadic`) in the `Port` union, never in
`OutputPort`. Serialization and hashing must leave every existing port's
bytes unchanged — `catalogue.test.ts` hashes every record and proves it.

### Kernel

- `series.ts`: a `LoadValue` in `PortValue`:
  `{ kind: 'load', shape: 'point', at, force1, force2, torque, couple1, couple2 }`
  or `{ kind: 'load', shape: 'span', from, to, rate1, rate2 }`, each field a
  `NumericSeries` so a swept field (a moving load) broadcasts like any other.
- `graph.ts`: resolve the two kinds and their ports; a `load` output connects
  only to a `load` input.
- `evaluate.ts`: evaluate both kinds into a `LoadValue`.
- `sensitivity.ts`: follow what zip needed.

### Editor

- Canvas views `LoadNodeView.tsx`, `DistributedLoadNodeView.tsx`. Match
  `CompareNodeView`/`FormulaNodeView`'s style for wireable ports, not
  `MonteCarloGeneratorNodeView`'s fixed-unit layout. Show the sign
  convention on the node (a small arrow per force field). **Visual: show
  Thomas, commit only after approval.**
- Palette: a Mechanics section beside the mechanics catalogue's formulas (ids
  `builtin:mechanics:load`, `builtin:mechanics:distributedLoad`), plus
  `QuickAddMenu`, `quickAdd.ts`, `i18n.ts` with Dutch copy.
- `analysis.tsx`, `help-links.ts`, `jupyter.ts` (label map: carried
  untranslated, like a beam diagram).
- `packages/docs-site/docs/guide/node-reference.md`: both nodes.

### Tests

Schema: round trip, defaults, wrong-dimension field rejected. Kernel: a Load
node evaluates to a `LoadValue`; a range wired into `at` broadcasts; a `load`
output into a numeric port is refused at resolve.

Commits: `feat(schema): add load and distributed-load nodes`,
`feat(kernel): evaluate load nodes into load values`,
`feat(editor): show load nodes on the canvas and offer them in the palette`
(the last one after Thomas approves the view).

## Phase 3 — legacy catalogue and diagrams on loads

One change: the legacy split and the new records land together so the
palette never loses its diagrams in between.

### The fallback catalogue

- In `packages/nodes/src`, move the seven v1 records **unchanged** out of
  `mechanicsNodes.ts` into `mechanicsLegacyNodes.ts`, exported as
  `MECHANICS_LEGACY_OPERATIONS`, in a catalogue `mechanics-legacy`
  (`MECHANICS_LEGACY_CATALOGUE`, `mechanicsLegacyCatalogueJson()`, same
  pattern as `catalogue.ts:52–77`). A test asserts every moved record's
  `formulaRef` equals a hard-coded `{ id, version, hash }` list taken before
  the move.
- `builtInCatalogues()`: add the legacy catalogue **after**
  `mechanicsCatalogue()`, so a ref that matches neither version exactly falls
  back to the current record. Add its id to `PERMANENT_CATALOGUE_IDS`.
- Hide it everywhere a student browses: `entries()` (the palette and its
  search), `ValueEditor.tsx:353`, `TableNodeView.tsx:68`, and any list of
  loaded catalogues the editor shows. Search for `catalogues.flatMap` and
  `catalogues.map` to find them all. A hidden catalogue still resolves.
- Anything that finds a formula's catalogue must do it by identity, as
  `formulaSource` in `catalogues.ts` already does, never by formula id.
- Regression test: a document saved against the v1 records (built from
  `MECHANICS_LEGACY_OPERATIONS` refs, using the existing 600 N / 400 N case)
  evaluates to the same numbers with no `formulaChanged` warning.
- `advancedNodes.ts` and its test name the v1 ids in a docstring and an
  assertion; keep them truthful.

### New records in `mechanicsNodes.ts`

`version: 2` of `mechanics.shaft.torque`, `.shear`, `.moment` and
`.deflection`. `deflection-term`, `distributed-shear` and
`distributed-moment` are not reissued: a distributed load is now a load, and
the deflection record solves its constants itself.

Inputs of each v2 diagram:

- `z` (mm, `default: 0`): where to evaluate; sweep it to draw.
- `loads`: variadic `load` port, point and distributed loads alike.
- `supportA`, `supportB` (mm): torque has none. **The reactions are solved
  inside** from statics, so nothing loops back.
- `plane`: categorical picker, `plane1 | plane2 | resultant` (names follow
  open decision 1). Torque has none. Resultant is `sqrt(a² + b²)` of the two
  planes' values.
- Deflection also takes `E` and `I`.

Kernel: extend the piecewise evaluator (`evaluate.ts`, search
`Closed-form at every sampled`) so a `loads` port expands each `LoadValue`
into the entries the closed forms already use: point forces into
breakpoints/values, spans into `distributedStart/End/Rate`, couples as steps
in the moment and as `C·(z − p)²/2` terms in the deflection. How the schema
declares this (a `loads` field on `FormulaPiecewise` and on the deflection
spec, plus `supports`) is the implementer's design, to be shown before it is
built out. Deflection with a distributed load stays unimplemented, as in v1:
refuse it with a kernel error naming the node, never a wrong curve.

### Reactions record

`mechanics.shaft.reactions`, label "Support reactions", for reporting and
checks: inputs `loads`, `supportA`, `supportB`, `plane` (no resultant: a
reaction is signed). Outputs `R_A`, `R_B` (N). It needs two outputs, so it is
evaluated by its own special field beside `piecewise`/`deflection`, not by
`piecewise`. Signed like the loads: `Σ forces + R_A + R_B = 0`.

### Tests

In `test/mechanics-nodes-end-to-end.test.ts`, invented numbers:

1. The existing 600 N / 400 N case rebuilt with one Load node: `reactions`
   gives the same numbers, and v2 `shear`/`moment` reproduce the v1 test's
   series without any reaction wiring.
2. Two loads with an overhang: `M = 0` at a `z` past the last load and
   support (the test that the internal reactions are right).
3. A load with force in both planes: `plane: resultant` equals
   `sqrt(M1² + M2²)` of the two single-plane diagrams.
4. A couple alone between the supports: the moment closes to zero at the end
   and steps by the couple at its position.
5. A Distributed load gives the same shear and moment as v1's
   `distributed-shear`/`distributed-moment` composition.
6. v2 `deflection` matches v1 `deflection` on the 600 N / 400 N case.
7. Chain: moment (resultant) → equivalent-moment (torque from the torque
   diagram) → required-diameter over a swept `z` returns a series the length
   of the sweep; Select `argMax` on it gives the governing diameter on `best`.

Commits: `refactor(nodes): move the shipped mechanics records into a legacy catalogue`,
`feat(kernel): evaluate shaft diagrams from load values`,
`feat(nodes): add shaft diagrams and reactions on loads`.

## Phase 4 — bundled sample (needs Thomas before it is committed)

A sample in `packages/editor/src/model/samples.ts`, with
`cantileverHollowSections` as the template (an exported `*_FORMULAS` id list,
`provides(catalogues, ids)` guard, `input`/`formulaNode`/`output`/`wire`/
`frameAround` helpers, `localizeExample`). Invented numbers. Content:

- Load nodes with forces in two planes, one of them wired from a computed
  value; two supports.
- Moment diagrams per plane and as a resultant, the torque diagram.
- The required-diameter curve, and over it, in one plot, the stepped profile:
  a lookup table (`start | d`, first step at the shaft's start) into
  Interpolate in `nextDown` mode with `x` wired from the same `z` sweep.
- A `list` of standard diameters, a Compare on the safety factor, and Select
  `firstPassing` picking the size.

Conventions: node and frame positions are multiples of the canvas grid `GAP`
(`samples.test.ts` asserts this for the milling sample); example-owned text
gets a Dutch entry in `sample-translations.json`. Register the sample in
`packages/editor/src/App.tsx`, `packages/editor/src/viewer/CloudMaterialViewer.tsx`
and the sample list in `samples.test.ts:448`, following
`cantileverHollowSections` in each.

A sample is layout and wording, which are Thomas's call: build it, leave it
uncommitted, and report it for a browser check.

## Validation

`pnpm build && pnpm test` after each phase. On 2026-11-12 `pnpm exec` tried to
reinstall and aborted (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). If the
`pnpm` scripts do the same, do not let pnpm purge `node_modules`; run
`node_modules/.bin/tsc -b` and `node_modules/.bin/vitest run` instead and
report it.

Report at the end of each phase: commit SHAs, what was run with its result,
and what to check in the browser.

## Open decisions

Each has a default so implementation is not blocked. Build the default;
Thomas may overrule.

1. **Axis and plane names.** The library's shaft axis is `z`, so the two
   transverse planes are x and y, and a force along "z" would point along the
   shaft. The course notebooks use `x` along the shaft. Default: keep `z`,
   name the fields `Fx`, `Fy`, `Cx`, `Cy` (a couple named by the plane whose
   moment diagram it enters), `qx`, `qy`, and the picker `x | y | resultant`.
2. **Cantilevers.** v2 diagrams assume two simple supports. Default: out of
   scope; a fixed-end support is a later record.
3. **Deflection with distributed loads.** Default: refused, as in v1.
4. **Upgrading old nodebooks.** Default: none; the legacy catalogue keeps
   them evaluating exactly as saved. An explicit "upgrade this node" action
   could come later, but v1 pairs loads by wire order, so any automatic
   rewrite would be guessing.
5. **`required-diameter` in the public library.** Default: add it. It is
   `σ = M / W` rearranged for a round section. The course notebooks use
   `rm.11.1` and `rm.11.16B` for the same step, so students with the R&M
   catalogue loaded will see both. Do not open, quote or imitate the R&M
   records to align them.
6. **`α₀` in the equivalent moment.** Default: leave it out; it is fatigue
   reasoning and belongs to the R&M catalogue.
7. **Tresca.** Default: not added.
