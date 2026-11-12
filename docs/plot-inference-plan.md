# Plot inference: a plot that needs no configuration

Status: plan, not started. Written 2026-11-12. Every product decision in it is
taken; what remains is implementation. Read `AGENTS.md` and `CLAUDE.md` first.

## Goal

The audience is second-year university students. A student wires a value into
a Plot node and gets the chart they meant, without opening a settings panel.

Today the Plot node infers its chart from the *shape* of the sweep only
(`packages/editor/src/model/plot.ts`, `inferPlotPanels`): how many axes,
whether each is numeric, whether it came from a continuous range, how long it
is. It never looks at the values, and it recomputes on every evaluation.

## Decisions (Thomas, 2026-11-12) — do not reopen

1. Inference gives **initial settings only**. Every setting stays
   overrideable in the existing controls.
2. A plot that was always on Auto **is re-inferred when its wiring changes**
   (a new connection, a measure removed, a different set of swept inputs).
   Never when only values change: dragging a slider must not rearrange a chart.
3. Once the student has changed the **chart type, an axis role or a scale**,
   *all* settings are kept. A new connection re-infers nothing.
4. Changing only a **label or the height** does not count as a change in the
   sense of 3. It survives re-inference.
5. The **Auto button** re-infers on demand, including on a plot from an old
   document.
6. A numeric × numeric grid defaults to **contour**, whether its axes came
   from ranges or lists, once both have at least **four** points.
7. A log value scale at **three decades**.
8. **Existing documents do not redraw on open.**

## Why these rules — the sample audit

Every plot in `model/samples.ts` was run through today's inference twice: as
authored, and with the authored view stripped. Eleven plots across eight
samples (the belt and press-fit labs need the restricted catalogue).

| Plot | Authored | Today's Auto | Same? |
| --- | --- | --- | --- |
| 6 single-sweep plots (pad, platform, convergence, zoom, 2 × aperture) | line, x pinned | line, same x | yes |
| cantilever `out_plot` (5 × 4 lists) | heatmap | heatmap | yes |
| milling `out_Q_plot`, `out_P_plot`, `out_M_plot` (5 × 4 lists) | **contour** | heatmap | **no** |
| depth of field `out_dof_plot` (5-point range × 5-value list) | **contour**, x = `N` | heatmap, x = `f` | **no** |

- The four misses are one miss: Auto draws a heatmap whenever a numeric axis
  came from a list. Hence decision 6. The cantilever, same shape, will now
  default to a contour for a *new* plot and be one click from its heatmap.
- Choosing x by "where the value varies most" is **not** to be implemented. In
  the depth-of-field plot the value varies more along `f` and the author still
  put `N` on x.
- Value ranges in the samples top out at 2.3 decades, so decision 7 fires on
  none of them.
- Every sample pins at least `x` through the legacy `x`/`series`/`contour`
  fields, which `plotMeasures` (`packages/schema/src/document.ts:209`) turns
  into a `view`. By rule 3 they are all "changed", so **no sample may draw
  differently after this work**. That is a test (see Verification).

## Design

### Three states of a measure

`PlotViewOverride` (`schema/src/document.ts:177`) has two kinds of field:

- **structural**: `type`, `x`, `y`, `series`, `facet`, `scales`, `valueScale`
- **cosmetic**: `axisLabels`, `valueLabel`, `height`

| State | Stored on the `PlotMeasure` | Drawn from |
| --- | --- | --- |
| **legacy** | no `inferred`; `view` absent or cosmetic-only | today's shape-based rule, live, exactly as now |
| **inferred** | `inferred` present; `view` absent or cosmetic-only | `inferred.view`, with the cosmetic fields of `view` laid over it |
| **changed** | `view` has at least one structural field | `view`; missing structural fields fall back to the shape-based rule, as now |

Transitions:

- legacy or inferred → **inferred**: the wiring changed, or Auto was pressed.
- legacy or inferred → **changed**: the student changed a structural setting.
  The complete structural settings *as currently drawn* are frozen into
  `view` together with the change, and `inferred` is deleted.
- changed → **inferred**: Auto was pressed.

### Schema (`packages/schema/src/document.ts`) — additive only

```ts
/** Settings inference chose for a measure the student has not configured. */
export interface PlotInference {
  /** The wiring this was inferred for; a different one means infer again. */
  readonly signature: string;
  readonly view: PlotViewOverride;
}

export interface PlotMeasure {
  // …existing fields…
  readonly inferred?: PlotInference;
}
```

Also export from the same file:

```ts
export const PLOT_STRUCTURAL_FIELDS = ['type', 'x', 'y', 'series', 'facet', 'scales', 'valueScale'] as const;

/** True once the student has chosen a type, role or scale (decision 3). */
export function plotViewChanged(view: PlotViewOverride | undefined): boolean;

/** The view a measure is drawn with: see the state table. Undefined for a legacy measure with no view. */
export function effectivePlotView(measure: PlotMeasure): PlotViewOverride | undefined;
```

`effectivePlotView`: if `plotViewChanged(measure.view)` return `measure.view`;
else if `measure.inferred` return `{ ...measure.inferred.view, ...measure.view }`
(the view here holds cosmetic fields only); else return `measure.view`.

Parse and serialize `inferred` in `parsePlotMeasure` (line 1216) and
`serializePlotMeasure` (line 1375), reusing `parsePlotView` /
`serializePlotView`, in the file's `optional()` / `put()` style. No
`DOCUMENT_SCHEMA_VERSION` bump and no migration step: an absent field means
the old behaviour, which is the rule in `AGENTS.md`.

### Kernel (`packages/kernel/src/evaluate.ts`) — two lines

At line 3095 the plot result copies `measure.view`. Replace it with
`effectivePlotView(measure)`, and add one optional flag to
`PlotMeasureResult` (line 181):

```ts
/** The view came from inference, not from the student — only the reason line cares. */
readonly viewInferred?: true;
```

set when the measure is in the *inferred* state. Nothing else in the kernel
changes. Because every consumer reads `PlotMeasureResult.view` — the figure
(`present/IntelligentPlotFigure.tsx:696`), the CSV export
(`present/plotCsv.ts:109`), the controls, the compiled NodeBook and the
published viewer — they all pick up the stored snapshot with no edits, and
none of them ever infers.

### Inference (`packages/editor/src/model/plot.ts`) — pure functions

Keep `inferPlotPanels` and its signature. Add:

```ts
/** Order-independent identity of what is wired into one panel. */
export function plotWiringSignature(measure: PlotMeasureResult, group: readonly PlotMeasureResult[]): string;

/** The complete structural view for a group of measures that share swept axes. */
export function inferPlotView(natures: AxisNatures, group: readonly PlotMeasureResult[]): PlotViewOverride;

/** The structural settings a panel is currently drawn with, for freezing. */
export function structuralViewOf(natures: AxisNatures, panel: PlotPanel): PlotViewOverride;

/** Bring every plot in the document up to date; returns the same reference when nothing changes. */
export function settlePlots(
  document: GraphDocument,
  outputs: readonly OutputResult[],
  natures: AxisNatures,
  seen: Map<string, string> | undefined,
): { readonly document: GraphDocument; readonly seen: Map<string, string> };
```

A **group** is the measures of one plot node whose swept axes have the same
`axisIdSetSignature`. Every measure of a group gets the *same* `inferred.view`.
That matters: `inferPlotPanels` puts two measures in one panel only when
`JSON.stringify(view)` is equal (line 265), so differing snapshots would split
a chart in two.

`plotWiringSignature` = the axis-set signature, then `#`, then the sorted ids
of the group's measures. Adding a second curve to a panel therefore re-infers
both (the value scale may change).

`inferPlotView`, in order:

1. Strip every `view` from the group and run the existing shape-based rule
   (`autoType`, `rolesFor`) to get a type and roles.
2. **Contour rule.** If that type is `heatmap`, and the axes in the `x` and
   `y` roles are both numeric and both have `axis.length >= 4`, the type is
   `contour`. Roles are unchanged (heatmap and contour share them).
3. `scales`: for each *numeric* axis, `'log'` if
   `axisNature(natures, id).logarithmic`, else `'linear'`. This is what the
   figure already resolves at draw time (`IntelligentPlotFigure.tsx:612`);
   writing it down is what makes it part of "all settings are kept".
4. `valueScale`: `'log'` when every value of every measure in the group is
   finite and above zero, **and** at least one measure has `max / min >= 1000`.
   Otherwise `'linear'`.
5. Return `type`, the roles that are defined, `scales` (omit when empty) and
   `valueScale`. No cosmetic fields.

`structuralViewOf(natures, panel)` returns the same shape read off a drawn
panel: `panel.type`, `panel.roles`, `panel.valueScale`, and for each numeric
axis `panel.scales[id]` or the nature-based default from step 3.

`settlePlots`, for each plot output node that has a result with `measures`,
for each measure (key `nodeId:measureId`):

1. **changed** → leave it. (If it still carries a stale `inferred`, drop it.)
2. Not changed, but another measure **in the same group is changed** → copy
   that measure's structural fields into this one's `view` (keeping this one's
   cosmetic fields) and drop `inferred`. This is decision 3 for a new
   connection onto a configured chart; without it the new curve would land in
   a separate panel.
3. **inferred** → re-infer when `inferred.signature` differs from the current
   signature, **or** when the stored snapshot no longer draws: run
   `inferPlotPanels` on the group as stored and re-infer if the panel has an
   `error`. (Without this, an inferred log scale turns into the error "a
   logarithmic value scale needs every plotted value above zero" the first
   time a slider takes a value to zero.)
4. **legacy** → this is where decision 8 lives.
   - `seen === undefined` means this is the first settle since the document
     was loaded. Record the signature in the new `seen` map and **write
     nothing**.
   - Otherwise compare with `seen.get(key)`. Missing (a plot wired during this
     session) or different (rewired) → infer. Equal → leave it.
5. Always record the current signature in the returned `seen`.

A measure with no result (unwired, or its node is in error) is skipped and not
recorded.

### Editor wiring (`packages/editor/src/App.tsx`, `model/history.ts`)

Inference needs evaluated values, so it runs after evaluation, not inside the
connect reducer.

- `model/history.ts`: add `replacePresent(history, next)` — swaps `present`,
  leaves `past`, `future` and `pending` alone. The settled document thereby
  belongs to the edit that changed the wiring: one undo step, and redo returns
  to the settled state.
- `App.tsx`: a `useRef<Map<string, string> | undefined>(undefined)` for
  `seen`, reset to `undefined` inside `resetDocument` (line 403). Then an
  effect on `[analysis]`, placed after `analysis` is computed (line 827):

  ```ts
  useEffect(() => {
    const evaluation = analysis.evaluation;
    if (evaluation === undefined || evaluation.document !== document) return;
    const settled = settlePlots(document, evaluation.outputs, axisNaturesOf(document), plotsSeen.current);
    plotsSeen.current = settled.seen;
    if (settled.document !== document) setHistory((current) => replacePresent(current, settled.document));
  }, [analysis]);
  ```

  It must reach a fixed point in one pass: the second run sees matching
  signatures and returns the same reference. A loop here is the bug to test
  for.
- Freshly opened documents stay clean: `isDirty` (line 393) compares
  serialized text, and the first settle after a load writes nothing for legacy
  plots.
- Check `analytics/documentEvents.ts` does not report a settle as a user
  edit. It classifies by added nodes and changed sweeps, so it should not, but
  confirm with a test in its existing test file if one exists.
- Other entry points that call `analyse` (the published viewer, the NodeBook
  compile) must **not** settle. They draw what is stored.

### Controls (`packages/editor/src/notebook/IntelligentPlotControls.tsx`)

This part is visible. See "Committing" below.

- **A structural change freezes everything.** `setField` for `type` and
  `valueScale`, `setRole` and `setScale` currently edit one field of
  `measure.view`. They must instead start from
  `{ ...structuralViewOf(natures, panel), ...cosmetic fields of the current view }`,
  apply the change, write that as `view` for every measure in the panel, and
  delete `inferred`.
- **Cosmetic changes stay cosmetic.** `axisLabel`, `valueLabel` and `height`
  keep editing `view` only and leave `inferred` alone.
- **Role selects swap.** With every role stored, picking for `x` the axis that
  currently holds `series` would trip "one swept axis is assigned to more than
  one role" (`invalidReason`, `plot.ts:138`). When the chosen axis already has
  a role, give that role the axis being displaced.
- **Selects show the effective value.** `type`, the roles, the axis scales and
  the value scale show `panel.type`, `panel.roles[name]`, and so on, not `''`.
  Remove their per-field "Auto (…)" options; keep an empty "none" option for
  `series` and `facet` only. The one way back to Auto is the button.
- **"Reset to Auto"** (line 231) already exists and already removes the marks
  the plot drew. Keep that, and instead of leaving the measure with nothing,
  write a fresh `inferred` for the panel's group right there:
  `{ signature: plotWiringSignature(…), view: inferPlotView(natures, group) }`.
  It has `result.measures` and the natures in scope, so no round trip through
  the effect is needed. It clears labels and height too, as it does today.

### Reason line (`plot.ts:204`)

`panelFor` prints `Pinned · <type>` when `lead.view?.type` is defined. With a
snapshot every inferred measure has a type, so branch on
`lead.viewInferred` first and keep the existing `Auto · …` sentences for it,
with these additions:

- contour by rule 2 on a list axis: `Auto · contour for a numeric grid`
- log value scale: append ` · log scale, values span N decades`

A changed measure keeps `Pinned · <type>`.

## Out of scope for this pass

Do not build these; they were discussed and deferred.

- Splitting a shared y axis when two same-dimension measures differ by two
  decades. `PlotViewOverride` has no field that says which y axis a measure is
  on, and panel grouping keys on view equality, so this needs its own design.
- Sending an axis the value does not respond to to facet, or dropping it.
- Inferring height.
- Correcting on the chart itself (click an axis title to swap roles).
- Drawing something instead of an error for more than three swept axes.
- A threshold line taken from a Check wired to the same value.
- ROADMAP items 8, 9 and 14.

## Order of work

Each step builds and tests on its own.

1. Schema: `PlotInference`, the two helpers, parse and serialize, tests.
2. Kernel: `effectivePlotView` and `viewInferred` in the plot result, tests.
3. `model/plot.ts`: the four pure functions and the reason line, tests.
4. `history.ts` `replacePresent`, the `App.tsx` effect.
5. Controls.

## Verification

Extend the existing Vitest files; invented formulas and fixtures only.

`packages/schema` (document tests):
- A document with `inferred` round-trips through parse and serialize.
- A document without it parses to a measure with no `inferred` key.
- `effectivePlotView` and `plotViewChanged` for all three states, including a
  cosmetic-only `view` beside an `inferred`.

`packages/editor/src/model/plot.test.ts` (it already has `axis`, `measure`,
`range` and `documentWith` helpers):
- 5 × 4 numeric lists → contour; 3 × 5 → heatmap; numeric × categorical
  unchanged.
- Values 1…10 000 → log value scale; 1…500 → linear; a range containing 0 or a
  negative → linear.
- A log-spaced axis gets `scales[id] === 'log'`.
- `settlePlots`: first call with `seen` undefined writes nothing for a legacy
  measure and returns the **same document reference**.
- `settlePlots`: a legacy measure whose signature changed since `seen` gets
  `inferred`; a second call returns the same reference (fixed point).
- `settlePlots`: a changed measure is never modified, whatever the signature.
- `settlePlots`: a cosmetic-only `view` survives re-inference unchanged.
- `settlePlots`: an inferred log scale is replaced once a value reaches zero.
- `settlePlots`: an unconfigured measure joining a changed group adopts the
  group's structural view.
- Two measures in one group get identical snapshots and one panel.

`packages/editor/src/model/samples.test.ts`:
- For every bundled sample, `settlePlots` on a first call returns the same
  document reference, and `inferPlotPanels` over its results gives the same
  types and roles as before this work (contour for the three milling plots and
  depth of field, heatmap for the cantilever, line for the rest).

`packages/editor/src/model/history.test.ts`:
- `replacePresent` keeps `past`, `future` and `pending`.

Then `pnpm build && pnpm test`. Catalogue-dependent tests skip without
`JOVEWORKS_CATALOGUE`; that is expected.

For Thomas in the browser:
- Open each example: nothing looks different, and the title bar does not show
  unsaved changes.
- Wire a new plot onto a 5 × 4 list grid: it draws a contour and says why.
- Drag a slider: nothing rearranges.
- Change the chart type, then wire in another value: every setting holds.
- Rename an axis on an untouched plot, then rewire: the label holds and the
  chart re-infers.
- Press Reset to Auto on an old plot: it re-infers.
- Undo after wiring: one step takes the wire and the inferred settings away
  together.

## Committing

Follow `CLAUDE.md`. Steps 1–4 are functional. Step 5 and the reason-line
wording change what the panel looks like, and the contour default changes what
a new plot looks like: in the main chat, do not commit those until Thomas has
seen them. A worktree agent commits to its own branch as usual. Other sessions
edit `main` concurrently, so stage explicit paths, never `git add -A`.

## Traps

- `pnpm exec vitest …` tried to reinstall and purge `node_modules` in a
  non-interactive shell on 2026-11-12 and aborted. Run a single file with
  `./node_modules/.bin/vitest run <path>` instead. Do not let any command
  remove `node_modules`.
- The codebase builds optional fields with conditional spreads and `put()`,
  never by assigning `undefined`. Match it; `tsc -b` will object otherwise.
- `PlotResult` also carries a legacy projection (`evaluate.ts:3101`) derived
  from the primary measure's view. It now follows the effective view. Nothing
  at runtime draws from it when `measures` is present
  (`present/ResultView.tsx:414`), but kernel tests may assert on it.
- The Monte Carlo convergence axis has no entry in `axisNaturesOf`
  (`plot.ts:284`), so it reads as discrete and linear. Leave that alone; it is
  ROADMAP item 9.
- Do not start, stop or drive `pnpm dev`.
