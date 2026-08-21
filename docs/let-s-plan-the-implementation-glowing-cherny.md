# Two new "Analysis" output nodes: Feasibility and Sensitivity

## Context

JoveWorks' sweep model already lets a student turn any input into a range and
watch the effect propagate through a Plot with a single threshold line. Two
gaps in that story came up in brainstorming:

1. **Multi-constraint dimensioning.** Real sizing decisions are rarely gated
   by one check — safety factor *and* surface pressure *and* a size limit,
   simultaneously. Today only one threshold can be overlaid on one plotted
   value; there's no way to see where every constraint the student has
   already built (as separate Check nodes) passes at once.
2. **"Which input actually matters?"** Nothing in the editor answers this
   without the student manually sweeping every input in turn. A classic
   engineering tornado diagram (vary one input across its bounds, hold the
   rest fixed, rank by how much the output moves) is a natural fit for the
   existing forward-only, sweep-and-read-off philosophy — it's just repeated
   forward evaluation, never a solver.

Both land as new output-node kinds — **Feasibility** and **Sensitivity** —
placed in a new fixed palette section called **Analysis**, which also absorbs
the existing Monte Carlo generator/receiver entries (today their own
top-level section) so "Analysis" becomes the umbrella for graph-level
analysis tools generally, not just per-node results.

This plan was produced after two rounds of codebase research (an Explore
pass over the kernel's sweep/broadcast machinery and the editor's output-node
rendering, then a Plan pass that traced every call site by hand). The design
below reflects corrections that research surfaced against the original sketch
— most importantly, a real evaluation-order bug that Feasibility's "reference
existing Check nodes" approach would hit unless fixed deliberately.

## Design decisions

**Feasibility references existing Check nodes by id** (`checks: readonly
string[]`), rather than re-entering comparisons/thresholds inline. This
matches the actual motivation ("shade where the checks I already built all
pass") and avoids duplicating threshold config a student has already entered
elsewhere in the notebook. `PlotOutput.x/series/facet` already establish the
precedent of a plain string field referencing another node's id, resolved and
validated at evaluate time, erroring gracefully if dangling (no new pruning
machinery needed — `removeNodes` doesn't clean up Plot's axis references
either, and the existing retry/error-marking in `analysis.tsx` already
degrades one bad reference without blanking the canvas).

**This requires a two-pass evaluation fix, which is mandatory, not
optional.** `evaluateDocument`'s main loop (`packages/kernel/src/evaluate.ts`,
the `for (const node of resolution.order)` loop, `case 'output':` around line
231) calls `outputResult` and pushes each result into `outputs` inline, in
topological order. Output nodes are always sinks (`resolveGraph` never
records an edge *from* an output port), so there is no dependency edge
between a Feasibility node and the Check nodes it names — their relative
order in `resolution.order` is incidental to node-array/insertion order, not
semantic. A Feasibility node can land before the Check it references, which
would mean reading a result that doesn't exist yet. Fix: defer Feasibility
nodes to a second pass, after every other output (including every Check) has
been computed in the first pass. Do the identical split in the editor's
`packages/editor/src/model/analysis.tsx` `readiness()`, which independently
walks the same topological order to decide per-node state.

**Sensitivity runs direct forward re-evaluation, live, with one mandatory
guard.** For each candidate input, clone the document, collapse every other
sweepable input to a representative fixed value, evaluate at the candidate's
low and high bound, and read the target output at both — `O(2k)` full
evaluations, `k` = number of sweepable inputs. Since every sub-evaluation is
scalar (`gridSize` 1 everywhere), cost scales with node count, not sweep
width, so this can run live on every document edit like everything else in
`analysis.tsx` today — no debounce/gating infrastructure needed (consistent
with `AGENTS.md`'s "don't add hypothetical infrastructure without a concrete
need"). The one thing that **is** required: every cloned sub-document must
have all `output`-kind nodes stripped before evaluating, or a document
containing a second analysis output (another Sensitivity, or a Feasibility)
would get recursively re-evaluated inside every one of the `2k` calls,
compounding combinatorially.

## Implementation

### Schema — `packages/schema/src/document.ts`

- Add `'feasibility'` and `'sensitivity'` to `OUTPUT_KINDS`.
- `FeasibilityOutput { kind: 'feasibility'; checks: readonly string[]; x?: string; series?: string; facet?: string }` — no `contour` field; `series` present ⇒ 2-D heatmap, absent ⇒ 1-D band (a boolean mask has no line/contour ambiguity a numeric plot has).
- `SensitivityOutput { kind: 'sensitivity' }` — no fields; wired via a single `VALUE_PORT` like Check/Print.
- Extend the `Output` union; add both to `parseOutput`/`serializeOutput`. Parse `checks` via `readStringArray`, and **allow an empty array** (a freshly-dropped node has none yet — don't reject it the way Table's `columns` parsing currently rejects `[]`; that's a separate pre-existing inconsistency, not one to copy).
- `packages/schema/src/index.ts`: export both new types.

### Kernel

**`packages/kernel/src/series.ts`** — extract the body of `indexer` into a private `indexerForAxes(seriesAxes, target)`; `indexer` becomes a thin wrapper. Add `broadcastBoolean(data: readonly boolean[], axes: readonly Axis[], target: readonly Axis[]): readonly boolean[]` built the same way, for ANDing multiple checks' per-cell results onto a shared grid.

**`packages/kernel/src/graph.ts`** — `outputPortNames` (currently private, ~line 244): add `if (output.kind === 'feasibility') return [];`. `'sensitivity'` needs no new branch — falls through to the existing `[VALUE_PORT]` default. **Export `outputPortNames`** so the editor's `analysis.tsx` can stop reimplementing this logic independently (it currently hardcodes `output.kind === 'table' ? output.columns : ['value']`, which would silently miss the `feasibility` zero-port case if left as-is).

**`packages/kernel/src/evaluate.ts`**
- Add `FeasibilityResult { kind: 'feasibility'; checks: readonly string[]; axes: readonly Axis[]; mask: readonly boolean[]; x: PlotAxis; series2?: PlotAxis; facet?: PlotAxis }` and `SensitivityResult { kind: 'sensitivity'; targetUnit: Unit; rankings: readonly SensitivityRankingResult[] }` (`SensitivityRankingResult { nodeId; label; low; high; unit; lowValue; highValue; swing }`, sorted descending by swing, empty array if no candidates). Extend `OutputResult`.
- Convert `outputResult`'s current implicit "anything left over is a plot" fallthrough into an explicit `switch (output.kind)` with an unreachable `default` (`const _exhaustive: never = output`) — without this, the two new kinds would silently compute as `PlotResult` instead of failing to compile.
- Extract the existing plot axis-picking block (`pinned`/`autofill`/`nextAuto`, ~lines 900-958) into a shared `pickPlotAxes(pinned, varyingAxes, axes, coordinatesOf, nodeId, warnings)`, parameterized on `varyingAxes` instead of hardcoding the plotted value's own axes. Both the plot branch and the new feasibility branch call it (feasibility passes the union of its referenced checks' axes).
- New `'feasibility'` branch, reachable only from the deferred second pass: look up each `checks[i]` id's already-computed `CheckResult`, throwing a clear `KernelError` if it's missing or not `kind: 'check'` (this also caps recursion — a feasibility node can never reference another feasibility node); `unionAxes` across all referenced checks' `series.axes`; `broadcastBoolean` each check's `results` onto the union; AND cellwise; `pickPlotAxes` over the union.
- New `'sensitivity'` branch: resolve the wired `VALUE_PORT` edge (same pattern as the existing `'equation'` branch's edge lookup) and call `evaluateSensitivity(document, catalogues, edge.from.node, edge.from.port)`.
- `outputResult` needs `catalogues` and (for the deferred pass) `outputsSoFar` added to its signature.
- Split the main loop's `case 'output':` — non-feasibility outputs computed inline as today; feasibility outputs collected into a `deferredFeasibility` array and evaluated in a second pass immediately after the main loop, appended to the same `outputs` array. (Rendering is unaffected: `Notebook.tsx` and `OutputNodeView.tsx` both look up results by `nodeId`, never by array position.)

**`packages/kernel/src/sensitivity.ts` (new)**
- `sensitivityCandidates(document, resolution): readonly SensitivityCandidate[]` — iterate `document.nodes` in document order; for each `input` node: if `isRange(node.value)` (linear/logarithmic/list/renard only — **exclude `categoricalList`**, a numeric swing has no natural meaning on an unordered axis), take the range's own bounds; else walk its `VALUE_PORT` edge to the wired port's `NumericPort.validRange` and use it if both `min`/`max` are declared; else skip. This is `validRange`'s first real consumer — its doc comment ("bounds a sweep... the bracketing interval a future 1-D inversion would need") supports this reading directly.
- `collapseAxis(node: AxisNode, resolvedColumn?: ResolvedTableColumn): InputNode` — the "hold this input fixed at a representative value" transform, replacing the originally-sketched `representativeScalar(value: ValueSpec)`, which can't handle a `tableColumn` range (its values live in the catalogue's resolved table, not the `ValueSpec`) or a `MonteCarloGeneratorNode` (not a `ValueSpec`/`InputNode` at all — needs its own collapse: uniform → mean of `[min,max]`, normal → `mean` field).
- `evaluateSensitivity(document, catalogues, targetNode, targetPort): readonly SensitivityRankingResult[]` — for each candidate: build a baseline document with every *other* sweepable axis collapsed via `collapseAxis`, **strip every `output`-kind node and its edges** (mandatory, see Design decisions above), splice the candidate to a scalar at `low` then `high`, `evaluateDocument` each, read the target's value, compute `swing = |high - low|`; wrap each call in `try/catch` and skip-with-warning (new warning kind, e.g. `sensitivityCandidateSkipped`) rather than aborting the whole result; sort descending by swing.
- Export result types and functions from `packages/kernel/src/index.ts`.

### Editor

**`packages/editor/src/model/analysis.tsx`** — replace the hardcoded port-name ternary with the newly-exported `outputPortNames`. Add a feasibility-specific readiness branch: decide every other node in the existing pass, then a feasibility node is `ready` iff every id in `checks` is already `ready`.

**`packages/editor/src/model/document.ts`** — `changeOutputKind`: entering `feasibility` must prune any existing `VALUE_PORT` edge (it's the one kind that goes to *zero* ports). Recommend factoring the "default `Output` for a freshly-chosen kind" logic into one exported `defaultOutput(kind, contextUnit?)` — it's currently duplicated across `Palette.tsx`'s `addOutput`, two spots in `Canvas.tsx` (`compatibleQuickAddPort` and the quick-add commit handler), and `OutputNodeView.tsx`'s kind `<select>`; each would otherwise need the same two-kind addition made by hand in four places, which is exactly the kind of gap that's easy to miss in one spot.

**`packages/editor/src/canvas/OutputNodeView.tsx`**
- Add `feasibility`/`sensitivity` options to the kind `<select>`.
- `ports` derivation: `feasibility` → `[]`, `sensitivity` → `[VALUE_PORT]` (falls into the existing default).
- New feasibility detail panel: a checklist of every `kind: 'check'` output node in the document (by caption) toggling membership in `checks`, plus the existing `AxisPicker` widget reused verbatim for `x`/`series`/`facet`. Sensitivity needs no detail panel beyond caption (same minimal footprint as `equation`).
- `Verdict()`: add a `feasibility` badge (pass/fail/partial from `mask`, reusing the existing check-verdict coloring) and a `sensitivity` badge (top-ranked input, or "no candidates").
- The compact-node "reading" area's `table`-exclusion ternary needs to also exclude `feasibility`/`sensitivity` (neither has a single scalar/series reading — only the `Verdict()` badge).

**`packages/editor/src/notebook/Notebook.tsx`** — new `Result()` branches for both kinds, added *before* the existing implicit "anything left over is a plot" fallthrough (make that fallthrough explicit while here, mirroring the kernel-side fix).

**`packages/editor/src/notebook/FeasibilityFigure.tsx` (new)** — mirrors `PlotFigure.tsx`'s structure: 1-D (`series2` absent) renders a shaded band along `x`; 2-D renders a two-color heatmap (pass/fail coloring, not the numeric contour palette — a mask is categorical, not a gradient); `facet` uses the same `fx` channel treatment as `PlotFigure`. Uses `FeasibilityResult.axes` directly (already the union) rather than recomputing it.

**`packages/editor/src/notebook/SensitivityFigure.tsx` (new)** — a horizontal tornado bar chart (Observable Plot `barX`), category axis = input label, sorted by swing descending, values converted out of canonical for display.

**`packages/editor/src/palette/Palette.tsx`** — rename the fixed `MONTE_CARLO` section to `ANALYSIS` (`copy.analysis` replacing `copy.monteCarlo` as the heading; leave `monteCarloGenerator`/`monteCarloReceiver`'s own labels unchanged). Add `builtin:output:feasibility` and `builtin:output:sensitivity` entries to this section — not the general `Output` section, which stays print/plot/table/check only.

**`packages/editor/src/canvas/QuickAddMenu.tsx`** — `QuickAddChoice`'s `outputKind` field is a **closed literal union** (`'print' | 'check' | 'plot' | 'table'`) with a compile-time exhaustiveness check that only covers top-level `GraphNode['kind']`, not this nested union — so it will not catch a missed addition here. Add `'sensitivity'` (it has a `VALUE_PORT`, so a dragged wire can complete it, same as print/check/plot). **Deliberately exclude `'feasibility'`** from quick-add (no port to complete a wire onto) — leave a comment explaining this is a decision, not an oversight.

**`packages/editor/src/canvas/Canvas.tsx`** — the two duplicated default-Output-per-kind ternaries (`compatibleQuickAddPort` and the quick-add commit handler) need a `sensitivity` branch (or use the shared `defaultOutput` helper). The port-selection ternaries need no change (already default to `VALUE_PORT` for anything but `table`).

**`packages/editor/src/viewer/CourseMaterialViewer.tsx`** — has its own `Result()`-equivalent switch, and passing the now-wider `OutputResult` union to its typed `<PlotFigure>` call will fail to compile once the union grows, forcing this file to be touched regardless. Add both new kinds here (neither carries restricted formula content, unlike `equation`, which is deliberately excluded from this viewer).

**`packages/editor/src/i18n.ts`** — rename `monteCarlo` → `analysis` in both `en`/`nl` (keep the generator/receiver keys); add `feasibility`/`feasibilitySummary`/`sensitivity`/`sensitivitySummary` pairs following the existing `check`/`checkSummary` naming. Add both locale entries in the same edit — nothing in the type system enforces `en`/`nl` key parity, a missing `nl` key silently renders `undefined` rather than failing to compile. Add any new dynamic `t('...')` strings (QuickAddMenu's `'sensitivity output'` label, warning copy, "top driver:", pass/fail labels) to `DUTCH_PHRASES`.

### Docs

`OVERVIEW.md`'s output-node table (currently stale — it says "Four kinds" but `equation` already shipped as a fifth) gets updated to list all six/seven kinds with one-line descriptions for Feasibility and Sensitivity.

### Tests

- **Kernel** (`evaluate.test.ts`): AND of two checks sharing an axis; AND across a union of *different* axes (mirroring the existing n×m grid test); a `checks` id that doesn't exist, or that isn't a `check`, throws; **the ordering regression specifically** — a document where the Feasibility node's array position precedes a Check node it references still evaluates correctly (this is the most important new test, given the bug class it closes). Sensitivity: candidate discovery from a range vs. a `validRange`-bounded scalar vs. neither; `categoricalList` excluded; swing computed and sorted; a throwing candidate is skipped with a warning, not fatal; a document with two analysis outputs doesn't blow up combinatorially (assert via call-count or an explicit perf bound). `series.test.ts`: `broadcastBoolean` alongside existing `broadcastSeries` coverage.
- **Schema** (`document.test.ts`): round-trip both new output types, including `checks: []` parsing successfully.
- **Editor**: `changeOutputKind` prunes the stale edge when entering `feasibility`; `QuickAddMenu`/`Canvas` compatibility test confirms `sensitivity` is offered and `feasibility` is not; `Notebook` rendering smoke test for both new result kinds.

## Verification

- `pnpm build` (checks package-reference direction — this work touches schema → kernel → editor in that order, so build order will surface any layering mistake) and `pnpm test`.
- Manual browser check (Thomas): build a small graph with two Check nodes (e.g. a safety-factor check and a pressure check) sharing a swept diameter input, add a Feasibility node referencing both, confirm the shaded region matches where both checks are independently green; build a graph with several sweepable/bounded inputs, add a Sensitivity node on an output, confirm the tornado ranks inputs sensibly and updates live on edits; confirm the new "Analysis" palette section shows Monte Carlo generator/receiver plus the two new entries, and that dragging a wire only offers Sensitivity (not Feasibility) as a quick-add completion.
