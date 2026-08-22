# Roadmap

What's actually open, in one place: the two content-sign-off tasks that need
Roloff & Matek in hand, the next milestone's build sequence, and the backlog
of deferred or undecided editor ideas. `docs/PLAN.md` and `docs/UX-SPEC.md`
carry the history behind this — what was decided and why, and what the hand
passes over the editor found and fixed — but neither is where you look for
what's still open. This is.

## Content sign-off

Two tasks, neither gating a build step — they gate individual formulas
through the `status`/quarantine mechanism, and both need the book, so both
are Thomas's.

**The defect table.** Three formulas the dimension checker refused during
belt's extraction, each quarantined in the catalogue with its evidence and a
proposed correction. The first two need R&M to confirm; the third only needs
confirmation, since it already has two independent witnesses.

| Formula | What the check refuses | Proposed reading |
| --- | --- | --- |
| 16.31 | Produces a velocity where a width is declared | The specific *power* symbol — declared in the source's symbol dict and used by no method — in place of the specific torque. 16.32 is the torque twin and is sound |
| 16.34 | Produces a length where a force is declared | The unit tag, not the expression: the belt-type factor is tagged `[]` and must carry force per unit width. The docstring also writes it as an exponent where the code multiplies, and an exponent is dimensionless under any reading |
| 16.36B | Produces an area where a length is declared | A sum, not a product. Its own docstring writes a sum, and its sibling 16.36C sums the same two quantities |

**The unit-tag table.** About 30 tags across the corpus couldn't be
machine-parsed; most have a plausible reading below, needing confirmation
rather than reconstruction. The remaining ~500 tags normalise mechanically
and need no sign-off.

| Tag | Proposed reading |
| --- | --- |
| `[1E6rotatons]`, `[1e6revolutions]` | Millions of revolutions — bearing life L₁₀, ISO 281. The typo'd spelling and the case-variant duplicate are consistent with one quantity typed twice |
| `[E-6m]` | Micrometres — surface roughness, or a fit/tolerance deviation |
| `[__O]`, `[__o]` | Degrees; `°` mangled by an encoding round-trip |

**Belt's wrap angle** `β₁`/`β_k` is tagged `[]`. The tag parses, so it isn't
junk in the sense above — it reads as *a pure number* where the quantity is
plainly an angle, which is what quarantines `rm.16.24A`/`rm.16.24B` and costs
the twelfth belt golden. The reading to confirm is `[°]`; confirming it
doesn't by itself release the two records, since `sin`/`cos`/`tan` accepting
a dimensionless argument (`packages/kernel/src/dimensions.ts`) would also
need loosening for `acos`'s *return* — two other belt formulas consume the
same angle as a pure number. Worth taking both together, and worth a golden.

## Open product questions

Not editor features — decisions that shape scope before any building starts.

**A backend.** Server-hosted catalogues (distribute R&M content behind auth
instead of a file through the LMS) and saving graphs server-side (accounts, a
saved-graph library, shareable links) would be genuinely useful — especially
for a collaborative classroom setting, sharing course catalogues and worked
examples server-side rather than per-student files. But "client-side web app,
no backend" is a stated architecture convention here, not an oversight —
adding one is a decision on the order of the wrap-angle unit question, not a
backlog line. Left open until it's discussed and decided explicitly; nothing
below assumes it's happening.

**How bound to machine design is this, actually?** JoveWorks originates from
machine design, but nothing in the kernel is: a catalogue is dimensioned
formulas with citations, and the editor is a graph over them. Signal
processing, thermodynamics, anything with units and formulas would fit the
same machinery. The generic name is settled, as is the description of its
documents as NodeBooks; what remains open is whether to position the product
generically or keep machine design as the front door and let other domains
arrive as catalogues.

**Notebook themes, for classroom use.** A course or an instructor should be
able to put the notebook in their own visual key — school colours, a print-
friendly variant for handouts, a high-contrast variant for a projector.
Open beyond the styling itself: where a theme comes from. A file the student
imports alongside the catalogue works with no backend; auto-loading a
course's theme (so every student in a class gets it without a manual step)
does not, and so folds into the backend decision above. Ships fine as
importable-only if the backend never happens.

**A read-only NodeBook viewer.** Mobile is an intentional documentation
destination, not a reduced graph editor: wiring, direct node editing, and the
three-column workspace require a desktop-sized viewport. A later viewer could
make a finished NodeBook pleasant to read on a phone — sections, prose,
values, checks, tables, and plots — without exposing graph editing controls or
formula expressions. Start with published examples and a portable, safe
report artefact rather than trying to open another device's browser storage.
Its source format, sharing route, and whether it remains file-based or needs
the separately undecided backend are product decisions to make before work
begins.

## Editor backlog

**1. Plot node's remaining options.** A first slice landed: three axis slots
(`x`, `series`, `facet`), auto-assigned from whatever axes the wired value
varies along. The table half of "complex settings live in the notebook, not
the node panel" has landed too: a table's column order, per-column decimal
figures and marked rows are now edited directly in the rendered notebook
table (drag a header to reorder, a small figures field per column, click a
row to mark it) and only stored on the node (`TableOutput.figures`,
`TableOutput.marks`); the node panel keeps just rename and remove. Marks are
row-index based for now, not axis-value based, so a sweep that changes shape
can leave a mark pointing at the wrong row — an accepted gap until this is
unified with the plot's own version below.

Still open, on the plot side: marking specific values on a curve (the same
"mark a value" affordance as the table's, extended to a curve — and the
natural point to revisit index- vs. axis-value-based marks so both share one
representation), a fourth axis (facet-row × facet-col) if that turns out to
be needed, and a settable plot height. Plot width was raised too but folded
into the larger "whole notebook redesign" and postponed rather than picked up
here.

**2. A range's two bounds showing different units** — `10 mm ... 1 m`, each
bound keeping its own unit rather than both sharing one. Two ways to build
it were weighed: editor-only display state (doesn't survive save/reload) or
a schema change to carry a unit per bound (persists properly, but widens
`ValueSpec` and ripples into the kernel and everywhere else that assumes a
range has one unit). Neither was picked; parked here rather than decided
under scope pressure.

**3. Minimap visibility.** Put a Show/Hide minimap toggle in the ribbon's
**View** menu and let a right-click on the minimap close it. Persisting that
choice is already implemented locally; the broader settings-persistence item
below is specifically about panel widths and other remaining preferences.

**4. Extensive worked examples**, beyond the one belt lab sample. Waits on
breadth — more chapters, or more graphs within belt — rather than being an
editor feature on its own. Revisit once the second slice is in.

**5. Spectrum-editing UI.** A load spectrum (a hand-typed collection consumed
whole by an aggregation, not swept) exists in the schema, but nothing in the
editor can create or edit one yet. Surfaced while adding the palette's Input
shortcuts — left out of that pass on purpose.

**6. `list` vs `spectrum` naming.** Both are a hand-typed collection of values,
but `list` sweeps (one point per value) and `spectrum` is consumed whole,
never swept — the names don't say which is which. Leaning toward renaming
`spectrum` instead of `list`, since `spectrum` is the outlier in the
`ValueSpec` family (every other kind sweeps) — but not urgent.

**7. Gear calculations and their effect on shafts.** Especially angled gears,
which complicate calculations via the combination of normal and bending
loads. Catalogue content, for when that chapter is designed — not an editor
question.

**8. Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the
public repo's node library, not the private catalogue — and should be
referenceable from the notebook the way Plot nodes already are. A bigger
design question than most items here: how it's parametrized, what rendering
approach draws the diagram from port values, and which diagram to build
first. Needs its own discussion before building.

**9. Standard-deviation node.** Fits and tolerance calculations need the standard
deviation that underlies a tolerance. Add it as a public base node, with its
input shape and its relationship to spectra settled when the ISO fit/table
slice is designed; there is no node for it today.
Implemented as `standardDeviation` (`sdev(xs)`, sample stdev over a spectrum)
alongside item 26's other array reductions — its relationship to the ISO
fit/table slice is still open, since that slice hasn't been designed yet.

**10. Vertical spacing does not take actual node height into account**
Widths are constant, but heights vary per node. The spacing should add same width space between bottom and top of each node, based on the total height from top of top node to bottom of bottom node. Also spacing should take into account rows of nodes and collumns of nodes for vertical and horizontal spacing respectively. There should be some error margin where nodes are considered aligned, and they will be aligned exactly.
Question: How should we integrate this spacing in grid-snap mode?
Implemented on `feat/canvas-layout-interaction-polish` — auto-arrange now uses
each node's real measured height instead of a nominal constant. Awaiting
review before merge.
Feedback: Does this follow collapsed or expanded height? It should be collapsed (unless pinned)

**11. Notebook export to Markdown**, for pasting a finished graph into an
external site. Checked against `~/source/website`'s Astro content
collections: entries are Markdown/MDX with frontmatter (`title`, `subtitle`,
`summary`, `date`, `tags`) under `src/content/{articles,projects,...}` — an
export matching that shape drops straight in. Same rule as any other export:
citations and values by default, expressions only behind the explicit
toggle. Gate it behind a hidden console command for now rather than a UI
button — personal-use export, not a student-facing feature yet.

**12. Tutorial guides** The tutorial seems to break when the viewport was moved/zoomed. It should check in each step if the target is visible, and adapt the viewport. Actually, maybe zooming and moving should just be part of the steps to clarify the nodes and controls?

**13. Press fit example** Update it to use ISO fit LUT based on categorical input. I also want to have a new section that showcases plotting and sweep functionality.

**16. Nodes expose preferred display units.** Dimensions do not have one global
presentation unit: values evaluate canonically, while each exposed node port
can state the unit it prefers to show and display boundaries convert to it. A
frequency port should prefer `Hz` over bare `s⁻¹`; a general pressure port can
prefer `Pa`; and a machine-design stress port can legitimately prefer
`N/mm²`. The preference is a node/port default, not a dimension-wide rewrite:
other nodes remain free to choose the unit that fits their domain, and output
nodes retain the user's existing display-unit override. This replaces global
SI normalisation, which would make the right answer unreadable in the wrong
domain. **First implementation:** generic and derived frequency ports now
default to `Hz`; fixed catalogue ports already use their declared display unit,
and the belt sample's frequency output now chooses `Hz` explicitly.
Largely implemented, but R&M catalogue needs updating.

**17. What about migration to newer versions?** I'm thinking notebooks and
catalogues that the user made before.

**26. Feature: We need more array nodes.** Sum and product are in. We need length, mean, median, sdev, etc. Combine them in a catalogue, what should we name this?
Implemented, for everything expressible as a pure function of the whole series:
`count`, `mean`, `median`, `standardDeviation` (sample stdev, n − 1 — the usual
estimator when the series is a sample, which is also what closes out item 9's
standard-deviation node) and `valueAt` (0-based index, `at(xs, i)`) join
`sum`/`product` — moved out of `operations.ts` alongside them — in a new
`packages/nodes/src/arrayNodes.ts`, its own **Array nodes** catalogue
(`ARRAY_CATALOGUE`) rather than folded into Base nodes, so it answers the
item's own "what should we name this" with its own palette section. It's
wired into the editor the same way Base nodes is: always loaded
(`App.tsx`'s `initialCatalogues`), never removable
(`model/catalogues.ts`'s `removeCatalogue`), pinned right after Base nodes'
section rather than sorted in with restricted/bundled catalogues
(`Palette.tsx`). `minimum`/`maximum` stayed in `operations.ts` — they also
take a spectrum port, but read as arithmetic over an open set of
same-dimension values rather than as a property of the series itself. The two
files now share their small port-building helpers (`text`/`generic`/`plain`/
the `Draft` shape) from a new `draft.ts`, since the alternative was copying
them a second time.

`at` needed a real kernel extension: every reduction before it took exactly
one spectrum argument by name (`REDUCTIONS`'s whole contract), and an index
is a second, ordinary argument alongside it. `ReductionSpec` now carries an
`extraArity` (`packages/kernel/src/functions.ts`), threaded through
`compile.ts`'s `reductionCallParts` and `closure.ts`'s spectrum-argument
detection — so a typed-equation node's `at(xs, i)` also infers `xs` as a
spectrum port and `i` as a plain one, the same as `sum(xs)` does today.

**A random value from a spectrum did not get built**, and needs a decision,
not just more code: every existing reduction is a pure function of the values
it's given, but a random pick needs a seed to be reproducible at all — and
nothing in the expression language carries one. The one place this codebase
already draws random numbers, the Monte Carlo generator
(`packages/kernel/src/random.ts`), isn't a `Formula`/expression node for
exactly this reason: it derives its seed from the document id and its own
node id, both of which live outside what a compiled expression closure ever
sees. Bolting a seed into `Env` just for this would leak generator-specific
plumbing into every other reduction's call site. The honest options are a
dedicated node kind that samples one element the way the generator samples a
range (consistent with how randomness already works here, but a bigger,
`evaluate.ts`-touching change than any reduction above), or accepting a
`Math.random()` draw that differs on every evaluation — which breaks
replayability and the golden-value discipline every other node in this
catalogue is held to. Leaning toward the former; parked here rather than
decided under scope pressure, the same way item 2 was.

**28. Feature: Can we share private catalogues with a password?** Maybe encrypt them and share public key?

**29. Bug: Opening an example link on mobile does not redirect to the mobile landing page**. It just shows a blank screen.

**30. Change: Should we use compiled notebooks to share in the notebook viewer?** To save mobile processing power, they can't edit anyway.

**32. Feature: We need a tool to quickly author catalogues and/or formulas** Import and export to json catalogue. It should be as straightforward as possible for authors. It can be a separate app like the /docs app.

**33. Change: What is the {table XX} notation in RM catalogue?** E.g. in eq 16.1. There must be a better way to integrate the tables in the catalogue. Actually, since we will have a LUT node, can we just have the table as catalogue items?

**35. Change: equation R&M 16.3 uses betahat_1** The hat is currently not present as a caret on the letter
Out of scope for this repo — R&M catalogue content (equation 16.3) lives in
the private `machine-design-catalogue` repository, not here.

**38. Change: Bearing pad and platform size should use the Pa unit instead of N/mm²**
Implemented: these are the `padPressure` and `platformFootprint` worked
examples in `model/samples.ts` — built from base nodes only, not R&M content,
so this was in scope here after all. Both now declare `Pa` as the display
unit; thresholds were rescaled to match (2 N/mm² → 2,000,000 Pa, 0.02 N/mm² →
20,000 Pa) so the canonical values driving the checks are unchanged. `Pa` is
a prefixable atom and the app's own default number format is `si`
(`numberFormat.ts`), so these print as `2 MPa` / `20 kPa` for most viewers
rather than raw Pa magnitudes. Awaiting a look in the browser.

**39. Change: Checkmark in the check output nodes should be on other side of label** to be consistent with other notebook items.
Implemented: the mark now sits between the label and the reading (`Notebook.tsx`'s `check-row`), matching print/equation's label-then-value order instead of leading the row. Awaiting a look in the browser.

**40. change: number of digits in table view must not be printed to pdf** Also, it should be digits after decimal point, not total digits.
Implemented: `displayNumber` (table cells only — the notebook table and the mobile viewer) now rounds to a fixed decimal-place count (`toDecimalPlaces`, `@joveworks/units`) instead of significant figures, matching what the header's own "decimal figures" label already claimed. The per-column figures field is hidden under `@media print` alongside the rest of the editing chrome. Nothing else that calls `toSignificantFigures`/`formatQuantity` changed — this was table-only. Awaiting a look in the browser and a real print-to-PDF check.

**41. Bug: Fuzzy finding in quick add is still very slow**
Root cause found: `compatiblePort` — a document clone plus a full `resolveGraph`/`canConnect` through the kernel — was run on *every* fuzzy match, not just the ones the menu shows. A common query matches most of the catalogue, so each keystroke paid for hundreds of full graph resolutions. Fixed in `QuickAddMenu.tsx` by capping to the top `MAX_FORMULA_RESULTS` (30, matching what was already the render slice) before running the kernel check, not after. Awaiting a look in the browser to confirm it feels fast now.

**42. Bug: Zooming with trackpad pinch is too slow** Can we even change this? Using two finger swipe is working as intended.
Investigated, not changed: `@xyflow/react`'s `ZoomPane` takes `panOnScrollSpeed` but exposes no equivalent for scroll/pinch zoom — no sensitivity knob to turn. The only way to slow it down would be disabling `zoomOnScroll`/`zoomOnPinch` and hand-rolling zoom from raw `onWheel` events (distinguishing pinch from pan by `ctrlKey`, as browsers report trackpad pinch) — a real rewrite of core canvas interaction, and one I can't verify without trackpad hardware in front of me. Given two-finger swipe already covers pan, leaving this as a discussion item rather than guessing at a gesture handler.

**43. Bug: Equation node output unit cannot be set**

**44. Bug: Hovering over the output of a node does not highlight connected nodes/edges**. Only the port is recognized, not the full output text

**45. Bug: RM catalogue does not show equations in dropdown** Can we not autogenerate it from the expression?

**46. Bug: Feasibility heatmap's axis title, tick labels, and ticks overlap.** The non-faceted branch of `FeasibilityFigure.tsx` fixes its plot width at a flat `360` (`packages/editor/src/notebook/FeasibilityFigure.tsx:78`) regardless of how many x-axis ticks the swept range produces or how long their coordinate labels are — unlike the faceted branch, already fixed to size each facet panel from its own tick count (`perFacetWidth`, line 76, commit 897e2f6). A two-input sweep with many points and long decimal coordinates (e.g. `66.667`, `73.333`, …) crowds ten-plus tick labels into a ~300px plot area, so they collide with each other and with the x-axis title sitting below them. Same class of bug as the one already fixed for facets, just not extended to the single-panel case — likely wants the same tick-count-aware width logic.

Separately, worth having but a distinct piece of work: interpolating/smoothing between a Feasibility node's sampled grid cells, since each cell is currently solved independently — the feasibility branch ANDs every referenced Check node's verdict cell-by-cell (`packages/kernel/src/evaluate.ts:926-980`) with no interpolation, so a true pass/fail boundary that doesn't line up with the sampled grid can show as scattered single-cell islands rather than a contiguous region. Should be an opt-in per-node setting rather than a default, the same pattern as item 1's per-node display settings (table figures/marks stored on the node, not forced) — smoothing implies a claim about what happens between samples that not every check can back up, so the node author should choose it rather than have it assumed.

Also worth adding: hovering a cell to show what combination it represents and whether it passed. Nothing in the notebook's charts is interactive today — `PlotFigure.tsx` and `SensitivityFigure.tsx` both render a static SVG once per `useEffect` (`PlotFigure.tsx:323-351`), and no chart uses Observable Plot's `Plot.tip` or any other hover mechanism, so this would be the first. Showing the swept coordinates plus the combined pass/fail is a `Plot.tip` mark away. Showing *which* referenced Check failed is more than a UI change: `FeasibilityResult` only keeps the AND'd `mask` (`packages/kernel/src/evaluate.ts:143-153`) — the per-check boolean grid is computed and thrown away inside the `.reduce` that builds it (`evaluate.ts:926-943`) — so surfacing a per-check breakdown on hover needs the kernel to retain that intermediate per-check result alongside `checks` (currently just the list of referenced Check node IDs), not only the final combined mask.

**47. Bug: Marquee selection opens a node's dropdown, which then falls outside the marquee and gets unselected.** Dragging a marquee over a compact node expands it (hover/selection opens the node, per `OVERVIEW.md`'s "compact by default... open on selection or hover"), but the expanded bounds are what selection then tests against — so a node whose collapsed footprint was fully inside the marquee ends up only partially inside once it opens, and drops out of the selection. Marquee hit-testing should use each node's collapsed (unexpanded, unless pinned open) size regardless of what opening does to it mid-drag.
