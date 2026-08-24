# Selection nodes and the Best Design card

## Context

`docs/feature-review.md:304` is the top-priority item of that review: **threshold
crossing, first-passing size, governing constraint, and Best Design**. The review's own
framing is that JoveWorks already has plenty of arithmetic, and that the next
useful step is helping someone *compare alternatives, select a design, and explain
why*. Today a student sweeps a diameter, plots deflection, and reads "roughly 38 mm"
off the curve by eye; the answer never becomes data, never gets wired onward, and
never appears in the notebook as a decision.

Everything here stays forward-only. Nothing rearranges equations or solves; it
searches the finite study the graph has already evaluated, exactly as
`sensitivity.ts` already does.

The gap it closes is architectural as much as it is a feature: the kernel has no way
to reduce *along a labelled axis*. Reductions today (`arrayNodes.ts`) run over a
spectrum, which introduces no axis; sweeps carry axes but nothing collapses one and
recovers the coordinate at which something happened. That primitive is what all four
features share.

Decisions already taken:

- All four features in one pass.
- A selection node learns its axis by having the swept range **wired into an `along`
  port**, not by naming an axis id in a dropdown. The result's dimension is then that
  port's, resolved by the same edge-driven typing `CompareNode.threshold` already
  uses (`packages/kernel/src/graph.ts:805`).
- "Governing" means **least normalised margin at the winning candidate**, and it is
  reported in the Best Design card only — no per-point wireable governing value in
  this pass.

## Approach

Two new things in the document, plus one shared kernel primitive.

### 1. Kernel primitive — `packages/kernel/src/select.ts` (new)

One idea: *reduce along the axis a coordinate series introduces, keeping every other
axis intact*. A 1-D sweep collapses to a scalar; a 2-D study collapses to a 1-D
result (a crossing size per temperature), which stays broadcastable and plottable.

- The reduce axis is the single axis of `along`. Zero axes or more than one is an
  error with a real message ("wire the swept range into `along`"), not a guess.
- Output axes are `unionAxes(value.axes, along.axes)` minus the reduce axis; reuse
  `unionAxes`, `gridSize`, and the broadcasting in `packages/kernel/src/series.ts`
  rather than re-deriving index maths.

Four operations, each walking the reduce axis for every remaining-axis cell:

| Mode | Consumes | Emits |
| --- | --- | --- |
| `crossing` | numeric `value`, scalar `threshold` | interpolated `along` coordinate of the first crossing |
| `firstPassing` | categorical `value` (a Compare verdict) | `along` coordinate of the first `'pass'` cell — sampled, never interpolated, which is what makes it a *standard size* |
| `argMin` / `argMax` | numeric `value` | `along` coordinate of the extremum, plus the extremum itself |

Details that matter:

- **All crossings are found**, per the review's "every threshold crossing, rather
  than an arbitrarily selected root". A series has a fixed grid shape, so a variable
  number of roots per cell cannot be the wired value: the wired output is the first
  crossing (respecting `direction`), and the full list rides along on the result for
  the canvas/notebook readout and a `selectExtraCrossings` warning.
- **Coarse-sweep warning** (the review asks for it explicitly): compare the linear
  interpolation on the bracketing interval against a quadratic through one extra
  neighbouring sample. Disagreement beyond a small fraction of the interval width
  means the sweep is too coarse for the interpolation to be trusted — a real
  numerical criterion, and cheap.
- **Nothing found** (no crossing, nothing passes) is a normal state of a
  partly-failing study, not an exception: emit `NaN` for that cell and warn. Errors
  stay reserved for wiring, per `warnings.ts`'s stated line.

### 2. `SelectNode` — a wireable node kind

A discriminated union on `mode`, the same shape `MonteCarloGeneratorNode` uses for
`distribution` (`packages/schema/src/document.ts:330`):

```ts
export const SELECT_MODES = ['crossing', 'firstPassing', 'argMin', 'argMax'] as const;

interface SelectNodeBase extends NodeBase { readonly kind: 'select'; }
export interface CrossingSelectNode  extends SelectNodeBase {
  readonly mode: 'crossing';
  readonly threshold: Quantity;              // port default, wire overrides — CompareNode's pattern
  readonly direction: 'any' | 'rising' | 'falling';
}
export interface PassingSelectNode   extends SelectNodeBase { readonly mode: 'firstPassing'; }
export interface ExtremumSelectNode  extends SelectNodeBase { readonly mode: 'argMin' | 'argMax'; }
```

Ports are stable across modes so switching mode never strands a wire:

- in: `value` ($A, or categorical in `firstPassing`), `along` ($B), `threshold` ($A,
  `crossing` only);
- out: `at` ($B — the headline answer, the coordinate), `best` ($A, `argMin`/`argMax`
  only — the objective's value there).

`at` taking `along`'s dimension is the whole reason for the `along` port, and falls
out of a `select` branch in `resolveGraph` that mirrors the `compare` branch: read
the wired source type, propagate it to the output. `crossing`'s bare unitless
threshold reads in `value`'s display unit, exactly as `evaluateCompare` does
(`packages/kernel/src/evaluate.ts:1051`) — reuse that reasoning, don't reinvent it.

Palette: four entries, all inserting a `select` node with a different mode — the same
one-node-several-entries pattern `input` already uses for scalar/range/list.

### 3. `BestDesignOutput` — the decision card

```ts
export interface BestDesignOutput {
  readonly kind: 'bestDesign';
  readonly checks: readonly string[];          // Check output node ids, like FeasibilityOutput
  readonly direction: 'minimize' | 'maximize';
}
```

One wired port, `objective` ($A). Deliberately **no `along` port**: the card reports
the winning coordinate on *every* axis the study varies along, read from each axis
node's own coordinate series the way `FeasibilityOutput`'s `axisFor` already does
(`packages/kernel/src/evaluate.ts:1315`). That is what "emit the winning axis values"
means for a multi-axis study, and it needs no extra wire.

Evaluation:

1. Feasible mask = AND of the referenced checks' `results`, broadcast onto the union
   of their axes. This is character-for-character what the `feasibility` branch
   already does — **extract it as a shared helper** and have both call it rather than
   copying it.
2. Among feasible cells, take the min/max `objective`. Ties resolve to the first cell
   in axis order.
3. Governing constraint = the check with the **least normalised margin** at the
   winner: `(value − threshold)/|threshold|` for `>=`/`>`, negated for `<=`/`<`.
   `==`/`!=` have no margin and are excluded from the ranking; a zero threshold makes
   the ratio meaningless, so that check is excluded and warned about too. If nothing
   is rankable, the card reports the winner without naming a governing constraint.
4. No feasible cell is a first-class answer, not a failure: the card says so and
   names the check that fails at the most candidates — the review's "failure card"
   idea in its cheapest honest form.

`checks: []` stays legal (feasibility already allows it) and means an unconstrained
min/max.

**Ordering.** Like feasibility, this reads other outputs' results, so it joins the
deferred second pass in `evaluateDocument` (`packages/kernel/src/evaluate.ts:236`).
Rename `deferredFeasibility` to cover both and note in the comment that one deferred
pass suffices because both kinds reference only checks, and checks are never
deferred.

## Files

**Schema** — `packages/schema/src/document.ts`: the `SelectNode` union, `BestDesignOutput`,
`NODE_KINDS`/`OUTPUT_KINDS`, `parseNode`/`serializeNode`/`parseOutput`/`serializeOutput`,
and `ALONG_PORT`/`AT_PORT`/`BEST_PORT`/`OBJECTIVE_PORT` beside the existing port-name
constants. No `checkReferences` addition — feasibility's own `checks` ids are
validated at evaluate time, and consistency beats a new structural rule. No
`SCHEMA_VERSION` bump: both additions are additive and every existing document still
parses (`packages/schema/src/version.ts` explains why there is no chain).

**Kernel** — `select.ts` (new); `graph.ts` for the `select` typing branch, `select`'s
port names, and `bestDesign` in `outputPortNames`; `evaluate.ts` for `case 'select'`,
the `bestDesign` branch, the shared feasible-mask helper, and the deferral;
`warnings.ts` for `selectNoCrossing`, `selectCoarseSweep`, `selectExtraCrossings`,
`selectNothingPasses`, `bestDesignInfeasible`, `bestDesignFlat`; `index.ts` exports.

**Editor** — a new `canvas/SelectNodeView.tsx` modelled closely on
`canvas/CompareNodeView.tsx` (same typed-default-plus-overriding-wire threshold UI,
same sparkline/reading idiom), and a new `notebook/BestDesignCard.tsx`. Then the
registration points a new node kind and a new output kind each touch, all of which
`compare`/`feasibility` already mark out: `canvas/Canvas.tsx` (node types, port
names, quick-connect candidates, `hasDetails`), `canvas/quickAdd.ts`,
`canvas/QuickAddMenu.tsx`, `canvas/OutputNodeView.tsx` (kind dropdown, and the
existing feasibility check-picker reused for `checks`), `palette/Palette.tsx`,
`model/document.ts` (`defaultOutput`, `changeOutputKind` pruning like feasibility's,
and a `changeSelectMode` that prunes only `threshold`/`best`),
`model/analysis.tsx` (a select node needs `value` and `along` wired; Best Design
needs `objective` wired and joins the deferred check-readiness pass at line 391),
`notebook/Notebook.tsx`, `i18n.ts` (**en and nl both**), `help-links.ts`, `styles.css`.

**Docs** — a short entry under `## Editor backlog` in `ROADMAP.md` recording what
landed and what was deliberately deferred (per-point governing, the margin/utilisation
nodes it would need, Pareto). `docs/feature-review.md` stays as written; it is a
review, not a status file.

## Verification

- `pnpm build` (also enforces package direction) and `pnpm test`. Catalogue-dependent
  tests skip without `JOVEWORKS_CATALOGUE`; that is expected.
- New kernel tests in `packages/kernel/src/select.test.ts` using **invented formulas
  only** (`y = a*b + c`, per AGENTS.md — never an R&M expression as a fixture):
  crossing on a monotonic ramp with a known analytic root; two crossings on a
  parabola, asserting the first is wired and the extras are warned; a coarse sweep
  that trips `selectCoarseSweep` and a fine one that does not; `firstPassing` over a
  Renard range with the first passing size known; `argMin`/`argMax` including a tie;
  a 2-D study asserting the second axis survives; and the empty answers (no crossing,
  nothing passes) landing as `NaN` plus a warning rather than a throw.
- Best Design coverage in `packages/kernel/src/evaluate.test.ts` beside the existing
  feasibility tests: winner selection under several checks, the governing constraint
  when two checks are close, `==` and zero-threshold checks excluded from the ranking,
  the infeasible case, and `checks: []`.
- Schema round-trip tests in `packages/schema/src/document.test.ts` for both new
  kinds, including every `mode` and a rejected unknown one.
- Editor tests: `model/analysis.test.tsx` for the new incomplete/blocked states, and a
  `notebook/BestDesignCard.test.ts` in the style of `FeasibilityFigure.test.ts`.

**For Thomas in the browser** (I will not touch `pnpm dev`): drop a Renard diameter
sweep into a shaft calculation, wire deflection into a `crossing` node with the
diameter into `along`, and confirm the readout matches where the plotted curve meets
its threshold line. Then add two Check nodes, a Best Design node referencing both with
mass as the objective, and confirm the notebook card names the winning size and the
governing check — and that unwiring the range to type a scalar on the port degrades to
a clear "wire the swept range into `along`" rather than a crash.
