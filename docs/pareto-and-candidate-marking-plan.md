# Pareto output and coordinated candidate marking

## Context

`docs/feature-review.md:306` is the second-priority item of that review: **Pareto
output with coordinated candidate marking**. It is really two things, and the
smaller one is the chart. The review's own sentence gives the order of
importance: "Selecting a point could mark the same candidate in every linked
table, plot, check, and diagram", expanded at `docs/feature-review.md:203` into
"a marked point should be a document-wide candidate identity rather than a
plot-local row index."

That identity is the load-bearing half, and the repository already says so twice.
`TableOutput.marks` is a list of **row indices** whose own schema comment calls it
"an accepted gap until this is unified with the plot's own 'mark a point on the
curve' affordance" (`packages/schema/src/document.ts:149`), and `ROADMAP.md:104`
leaves plot-side marking open as "the natural point to revisit index- vs.
axis-value-based marks so both share one representation." This pass is that
point. It closes the open half of roadmap item 1 as a side effect.

Nothing here computes anything new about the design. Domination is a comparison
over cells the graph has already evaluated, exactly as forward-only as
`sensitivity.ts` or the selection nodes.

Decisions already taken:

- **A candidate is a coordinate, not an index.** It stores the value on each axis
  it names (`40 mm`, `80 °C`, `'steel'`), resolved to a sample at render time.
  That is what survives a re-sampled or reordered range, and it is the only form
  that reads correctly in a report — "candidate A: d = 40 mm" rather than "row 7".
- **Marks live on the document, once.** Not per output. `TableOutput.marks`
  retires into them.
- **Exactly two objectives.** Two is the visualizable case and covers every pair
  the review names. N-objective domination is a noted extension, not this pass.
- **Every notebook surface participates**: the Pareto chart, plots, tables,
  feasibility maps, and the per-candidate reading on checks and prints.
- This builds on the selection/Best Design pass
  (`docs/selection-and-best-design-plan.md`), which is in flight in its own
  worktree. Start after it merges, so there is one set of edits to the shared
  registration points rather than two conflicting ones.

## Use cases the docs must teach

The docs work below is specified against these, not against the node list. The
node reference explains parts; these explain why anyone would assemble them.

1. **The lightest shaft that still passes.** Mass against safety factor, with
   strength and deflection wired in as the checks. The front is short, the
   infeasible designs are visibly excluded, and the chosen point is the answer to
   "why this one?" — which is the review's whole *calculate, compare, select,
   explain* progression in one figure.
2. **Machining time against surface finish.** The bundled pocket-milling example
   already sweeps feed and speed against a power envelope
   (`packages/docs-site/docs/examples/milling-power-envelope.md`), so it is one
   Pareto node away from asking the question a machinist actually asks. Extending
   an example someone already knows beats inventing a new one.
3. **Cost against lifetime, over a catalogue of sizes.** The case where the axis
   is a list of real parts rather than a continuous range: the front is a handful
   of catalogue entries, and marking one identifies *a part*, not a coordinate.
   This is where candidate letters earn their keep.
4. **Depth of field against diffraction.** The review names it, and the
   photography catalogue makes it buildable. One short example with no shafts in
   it is worth a paragraph of claiming the kernel is domain-neutral.
5. **Following one candidate through a whole report.** Mark a point on the front,
   then read it on the deflection plot, in the results table, on the feasibility
   map, and in the checks — the same letter every time. This is the use case that
   is *only* about marking, and the one that justifies a guide page of its own:
   the others could be told as chart features, this one cannot.
6. **A mark that survives an edit.** Widen the range, change the sample count, and
   watch the mark snap to the nearest sample and say so. Small, but it is the
   entire argument for coordinates over row numbers, and it is much easier to show
   than to assert.

## Approach

### 1. Candidate identity — `packages/kernel/src/candidates.ts` (new)

```ts
/** A design in the study: where it sits on each axis it names. */
export interface Candidate {
  /** Axis node id → canonical coordinate on that axis. */
  readonly at: Readonly<Record<string, number | string>>;
}
```

Three functions, and one rule that removes every special case:

- `candidateAt(coordinates, axes, cell)` — decompose a row-major cell index over
  `axes` into a per-axis index and read each axis's own coordinate. The stride
  convention is the one `series.ts` already documents (last axis contiguous);
  reuse what `indexer` encodes rather than re-deriving it.
- `candidateMask(coordinates, axes, candidate)` — the inverse, and deliberately a
  **mask over the target grid, not a single cell**. An axis the candidate does not
  name is unconstrained.
- `axisCoordinates(evaluation)` — `valueAt(evaluation, axisId, VALUE_PORT)` for
  every axis in `resolution.axes`, narrowed to a `Series`, as one map.

**The rule:** a figure highlights every cell consistent with the candidate on the
axes they share. That is what makes one identity work across figures of different
shapes. Click a Pareto point and you get a fully determined design, because the
scatter knows the whole union grid; click a 1-D plot of a value that varies only
along `d` and you get `d = 40 mm`, which then marks the whole `d = 40` column on a
2-D feasibility map. Both readings are correct, and neither needs its own code
path.

Resolution is exact where an exact coordinate exists. Where it does not:

- a numeric axis snaps to the nearest sample and the mark is flagged
  `approximate` — drawn with a subtle ring and a tip saying the range changed,
  never silently relocated;
- a categorical axis requires an exact match; no match means the candidate names
  an axis value that no longer exists, and the mark is reported rather than drawn.

`evaluateDocument` raises `candidateStale` once per affected mark after the
deferred pass, where every axis is known.

### 2. `ParetoOutput` — a new output kind

```ts
export const OBJECTIVE_DIRECTIONS = ['minimize', 'maximize'] as const;

export interface ParetoOutput {
  readonly kind: 'pareto';
  readonly xDirection: ObjectiveDirection;
  readonly yDirection: ObjectiveDirection;
  /** Check node ids a candidate must pass to compete — feasibility's own field. */
  readonly checks: readonly string[];
}
```

Two ports, `x` and `y`, independently generic ($A and $B — the two objectives have
unrelated dimensions). `checks` is character-for-character `FeasibilityOutput`'s,
for the same reason it gave: a student who has already built "safety factor ≥ 1.5"
should not retype it to exclude the designs that fail it.

Domination in `packages/kernel/src/pareto.ts` (new), over the union of the two
objectives' axes:

- normalise to minimisation by negating a maximised objective — one rule, not four
  branches;
- `a` dominates `b` when it is at least as good on both and strictly better on one,
  so **duplicate points both survive**, which is the honest answer for two designs
  that trade identically;
- an infeasible cell neither dominates nor joins the front;
- a cell whose objective is `NaN` (a partly-failing study, which is normal) is
  excluded and warned about, not thrown on.
- **Sort and sweep, not O(n²).** Sort by `x` ascending with `y` as tiebreak and
  keep the best `y` seen — the classic two-objective algorithm. A grid may hold up
  to `LARGE_GRID` (10 000) cells, where the pairwise version is 10⁸ comparisons and
  this one is a sort.

The result carries its points already resolved, so a click becomes a mark with no
second lookup:

```ts
export interface ParetoPoint {
  readonly cell: number;
  readonly x: number;            // canonical
  readonly y: number;
  readonly feasible: boolean;
  readonly onFront: boolean;
  readonly candidate: Candidate;
}
```

Worth naming: `onFront` is one boolean per grid cell, which makes it exactly
series-shaped, like a Compare verdict. A wireable Pareto **node** emitting that
mask — feeding a selection node's `value` for "the smallest front design" — is
therefore a small later addition rather than a redesign. It is not in this pass;
the review asks for a chart.

**Ordering.** Like feasibility and Best Design, this reads other outputs' results,
so it joins the deferred second pass in `evaluateDocument`
(`packages/kernel/src/evaluate.ts:236`) — the list the selection pass renames away
from `deferredFeasibility`. The comment's justification still holds unchanged:
one deferred pass suffices because all three kinds reference only checks, and
checks are never deferred.

### 3. Marks on the document

```ts
interface GraphDocument {
  // ...
  /** Designs called out across every figure. Order is their A, B, C labels. */
  readonly marks?: readonly Candidate[];
}
```

- **No `SCHEMA_VERSION` bump.** The addition is additive, and dropping
  `TableOutput.marks` is parse-compatible: `parseOutput` reads named fields and
  ignores the rest, so an existing document still loads. Its table marks vanish,
  which is the intended trade — they were the unreliable index-based ones being
  replaced, and `version.ts` is explicit that documents are regenerated rather
  than migrated while there is no chain.
- **One accent colour, distinguished by letter.** Marks must stay legible on top
  of a series-coloured plot, so they do not take colours from the series ramp;
  every mark is the same accent, and `A`/`B`/`C` by position in `marks` says which
  is which. That letter appearing on the Pareto chart, on the curve, on the table
  row and in the Best Design card is the whole feature.
- **No `label` field.** A student-renamed candidate is speculation until someone
  asks for it.

`toggleCandidate(document, candidate)` in `model/document.ts` replaces
`toggleMark`, with equality by coordinates rather than identity.

### 4. Coordinated highlight

Persistent marks are the deliverable; a transient hover is what makes it read as
*coordinated*. `graph-context.ts` gains `hoveredCandidate` beside `hovered`, for
exactly the reason that comment already gives — the notebook's figures are
siblings under the context, not parent and child, so there is nowhere closer to
share it. Hovering a Pareto point lights the same design on every other figure.

Clicks come from Observable Plot's own pointer machinery: `Plot.pointer` already
backs `chartTip` (`packages/editor/src/notebook/PlotFigure.tsx:218`), and the
rendered plot element exposes the pointed datum as its `value` and fires `input`
when it changes. A `click` listener on the element reads `figure.value` and
toggles that datum's candidate — no hit-testing of our own.

## Files

**Schema** — `packages/schema/src/document.ts`: `Candidate`, `ParetoOutput`,
`OBJECTIVE_DIRECTIONS`, `GraphDocument.marks`, `X_PORT`/`Y_PORT` beside the
existing port constants, `OUTPUT_KINDS`, `parseOutput`/`serializeOutput`, the
document-level parse/serialize of `marks`, and the removal of `TableOutput.marks`
with `parseTableMarks`. No `checkReferences` rule — feasibility validates its own
check ids at evaluate time, and consistency beats a new structural rule.

**Kernel** — `candidates.ts` and `pareto.ts` (new); `graph.ts` for `pareto` in
`outputPortNames` (`packages/kernel/src/graph.ts:259`); `evaluate.ts` for the
`pareto` branch, its place in the deferred list, and the `candidateStale` sweep;
`warnings.ts` for `paretoUndefinedPoint`, `paretoInfeasible`, `paretoFlat`,
`candidateStale`; `index.ts` exports. The feasible-mask helper the selection pass
extracts is reused here rather than copied — that is the third caller it was
extracted for.

**Editor** — `notebook/ParetoFigure.tsx` (new), modelled on `FeasibilityFigure.tsx`:
dominated points muted, front points filled and connected with a step line
oriented by the two directions, infeasible points hollow, marks drawn as ringed
dots with their letter. `notebook/marks.ts` (new) is the shared resolver every
figure calls — candidate → mask → letter — so the highlight logic exists once.
Then: `PlotFigure.tsx` (mark overlay and click-to-toggle, closing roadmap item 1's
open half), `FeasibilityFigure.tsx` (the same overlay on a cell),
`notebook/Notebook.tsx` (table rows highlight from marks instead of
`output.marks`; check and print rows gain a per-candidate reading — `A: S = 1.8 ✓`
— when a candidate resolves to exactly one cell of that result's grid, which is
the review's "show its checks and margins"), `viewer/CourseMaterialViewer.tsx`
(the read-only path needs the new kind too, beside its feasibility branch at line
114), `graph-context.ts` (`hoveredCandidate`), `canvas/OutputNodeView.tsx` (kind
dropdown, two direction selects, the existing feasibility check-picker reused for
`checks`, and `pareto`'s two ports in the port list at line 226),
`canvas/Canvas.tsx` and `canvas/QuickAddMenu.tsx` (pareto *does* have ports,
unlike feasibility, so it belongs in quick-connect), `canvas/quickAdd.ts`,
`palette/Palette.tsx`, `model/document.ts` (`defaultOutput`, `changeOutputKind`
pruning, `toggleCandidate`, remove `toggleMark`), `model/analysis.tsx` (pareto
needs `x` and `y` wired — the ordinary first-pass check — and *then* joins the
deferred pass at line 391 for check readiness; that pass currently handles only
feasibility's zero-port case and has to learn the two-step shape),
`model/samples.ts` (use case 1 built as a bundled sample, and a Pareto figure
added to the existing milling sample for use case 2), `i18n.ts` (**en and nl both**), `help-links.ts`, `styles.css`.

**Docs** — a new feature is not finished until the docs site describes it, and
`help-links.ts` makes that structural rather than optional: an output kind's "?"
button links to `#{kind}` under `/guide/node-reference`, so a kind added without
its heading ships a dead link.

- `packages/docs-site/docs/guide/node-reference.md` — a `### Pareto` subsection
  under `## Analysis`, beside Feasibility and Sensitivity, matching the anchor
  `OUTPUT_HELP_URLS` will point at. It has to say what domination means in
  plain words, that infeasible candidates are drawn but never compete, and that
  duplicate trade-offs both survive. The `### Plot` and `### Table` subsections
  each gain a paragraph on marking, since the table's row-number marks are being
  replaced and the plot is gaining marks it never had.
- `packages/docs-site/docs/guide/candidates.md` — **a new guide page**, plus its
  sidebar entry in `packages/docs-site/docs/.vitepress/config.ts`. Marking is a
  cross-cutting concept, not a node, so it has nowhere to live in a node
  reference. Built around use cases 5 and 6: what a candidate is, why it is a
  coordinate rather than a row number, the one rule (*a figure highlights every
  cell consistent with the candidate on the axes they share*) with the worked
  two-axis example that rule needs to be believable, what the A/B/C letters mean,
  and what a snapped-to-nearest mark is telling you. This is the page the
  review's own "document-wide candidate identity" sentence deserves.
- `packages/docs-site/docs/examples/` — use case 2 extends
  `milling-power-envelope.md` in place rather than adding a page: it already has
  the sweep, the question and the reader's familiarity, and it gains a section on
  reading the front and marking the chosen cutting condition. Use case 1 is the
  new page, in that file's style (a question in a blockquote, the starting inputs
  as a table, then what each figure says), plus its sidebar entry. Between them
  they are the only place the *reading* of a front is taught rather than defined —
  in particular that a point on the front is not automatically the right answer,
  it is the set of answers worth arguing about.
- `packages/editor/src/help-links.ts` — `OUTPUT_HELP_URLS`' literal union widens
  to include `pareto`. It is typed as a `Record` over that union, so this is a
  compile error until done, which is the intended safety net.
- `docs/file-guide.md` — one line each for `packages/kernel/src/candidates.ts`,
  `packages/kernel/src/pareto.ts`, `packages/editor/src/notebook/ParetoFigure.tsx`
  and `packages/editor/src/notebook/marks.ts`, in their package sections, each
  saying what you would open the file *for*. The `notebook/Notebook.tsx` line
  mentions "table-column editing (order/figures/marks)" and needs its marks half
  rewritten. Add the new guide and example pages to the `packages/docs-site/`
  section, and this plan to the `docs/` section — that section currently lists
  four files and the directory holds nine, so it is already behind.
- `OVERVIEW.md` — one sentence where it describes what the notebook shows: a
  study now names the design you chose, and names it the same way in every
  figure.
- `ROADMAP.md` — update item 1: the plot-marking half is closed and the
  index-vs-value question is settled in favour of coordinates, for both plot and
  table. Record what was deliberately deferred: N-objective domination, the
  wireable front mask, and marking on the canvas rather than the notebook.
  `docs/feature-review.md` stays as written; it is a review, not a status file.

## Verification

- `pnpm build` (also enforces package direction) and `pnpm test`.
  Catalogue-dependent tests skip without `JOVEWORKS_CATALOGUE`; that is expected.
- `packages/kernel/src/pareto.test.ts`, **invented formulas only** (`y = a*b + c`,
  per AGENTS.md — never an R&M expression as a fixture): a hand-built grid with a
  known front; both minimise/maximise combinations; duplicate points both
  surviving; infeasible candidates excluded by a wired check; a `NaN` objective
  excluded and warned; and the sort-and-sweep asserted equal to a brute-force
  pairwise reference on a random grid, which is what keeps the fast path honest.
- `packages/kernel/src/candidates.test.ts`: cell → candidate → mask round-trip on a
  2-D grid; a candidate naming a superset of a figure's axes resolving to a single
  cell; a candidate naming a subset resolving to a whole row; numeric snapping
  flagged `approximate`; a categorical coordinate that no longer exists reported
  rather than snapped.
- `packages/schema/src/document.test.ts`: `pareto` round-trip including both
  directions and a rejected unknown one; document-level `marks` round-trip with
  numeric and categorical coordinates; and a document still parsing when it
  carries a legacy `TableOutput.marks`, with the marks dropped.
- Editor: `notebook/ParetoFigure.test.ts` in `FeasibilityFigure.test.ts`'s style;
  `notebook/marks.test.ts` for the shared resolver; `model/document.test.ts` for
  `toggleCandidate` including coordinate equality; `model/analysis.test.tsx` for
  pareto's incomplete (unwired objective, no checks chosen) and blocked states.

**For Thomas in the browser** (I will not touch `pnpm dev`): take a shaft study
with a Renard diameter sweep and a second axis, wire mass into a Pareto node's `x`
(minimize) and safety factor into `y` (maximize), reference the existing strength
and deflection checks, and confirm the front is the shape the scatter suggests and
that infeasible designs are drawn hollow. Then click a front point and confirm the
same candidate appears — same letter — on the deflection plot, the results table,
the feasibility map, and the Best Design card, and that hovering a point lights it
on all of them at once. Finally, widen the diameter range so the marked size is no
longer a sample, and confirm the mark snaps to the nearest one and says so rather
than silently moving or disappearing.
