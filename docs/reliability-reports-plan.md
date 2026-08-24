# Reliability reports for Monte Carlo

## Context

`docs/feature-review.md:308` is the fourth-priority item of that review:
**Monte Carlo histograms, CDFs, percentiles, and failure probability**. The
review's own framing (`docs/feature-review.md:94`) is that generators and
receivers already exist, and what is missing is everything that turns a cloud of
samples into a reliability *study*.

Two facts in the code decide most of the design.

**The trial axis is an ordinary axis.** `packages/kernel/src/random.ts` says it
outright: a generator "behaves like any other range: it introduces an axis." So
every quantity the review asks for is a reduction along that axis — nothing about
Monte Carlo needs its own evaluation machinery.

**There is exactly one trial axis per document.** `packages/kernel/src/graph.ts:415`
computes `mcTrialId` from the *first* generator and hands that same axis id to
every generator's `axisOf`. Two generators are one paired trial, never a
cross-product. That invariant is what lets "the trial axis" be an unambiguous
default anywhere below, and it is worth knowing before reading the rest.

Sorted by shape, the review's list falls into three groups:

| Ask | Shape | Therefore |
| --- | --- | --- |
| percentiles, quantiles, failure probability, confidence intervals, reliability index | reduce the trial axis to a number | series-shaped, so **wireable nodes** |
| convergence as samples accumulate | a *running* reduction that keeps the axis | the same primitive, `scan` not `reduce` — then an ordinary Plot |
| histograms, ECDFs | replace the trial axis with a bin or quantile axis | the one part that must be an **output kind** |

The first row is the point. "The 95th-percentile safety factor" becomes a number
a student can wire into a Check, a Table, a Print or a Pareto objective, rather
than text trapped inside a card.

This is also where the existing reductions run out. `packages/nodes/src/arrayNodes.ts`
already ships `mean`, `median` and `standardDeviation`, but over a **spectrum** —
a collection consumed whole, which introduces no axis. Nothing in the kernel can
reduce a swept axis today. `select.ts`, from the selection pass
(`docs/selection-and-best-design-plan.md`), is the primitive that changes that;
this pass is its statistical sibling and depends on it.

Decisions already taken:

- Statistics land as a **wireable node plus a reliability card**, not one or the
  other.
- The statistic node's `along` port is **optional**: unwired collapses every axis
  the value varies along; wired names one axis to reduce and keeps the rest.
  Unlike `select`, the output's dimension does not depend on `along`, so the
  relaxation costs no typing clarity. See the trap under §1.
- **In scope**: confidence intervals, the reliability index β, convergence as a
  running statistic, and triangular/lognormal/discrete distributions.
- **Out of scope**, and named as such: correlation groups. Sampling dependent
  quantities honestly means a joint draw across generators — a change to how the
  trial axis is populated, not another distribution variant.
- Build after the selection pass lands, in parallel with the Pareto pass
  (`docs/pareto-and-candidate-marking-plan.md`); the two barely overlap outside
  the shared registration points.

## Use cases the docs must teach

The docs work below is specified against these, not against the node list. Each
one is a study someone actually wants to run; the node reference explains parts,
these explain why anyone would assemble them.

1. **Tolerance stack — will it fit?** Shaft and hub diameters each normal about
   their nominal with a real tolerance; the clearance is their difference. The
   report is *the probability of interference*, not a scatter of sample
   clearances. The review names exactly this
   (`docs/feature-review.md:109`), and it is the shortest complete study in the
   product: two generators, one subtraction, one check, one reliability card.
2. **Load against strength — the classic reliability case.** Applied stress and
   material strength both lognormal (the distribution real strength data
   actually follows, which is half of why lognormal is in this pass). Pf is the
   overlap of the two, β is how many standard deviations of margin that buys, and
   the histogram with both distributions is the picture every reliability course
   opens with.
3. **A percentile as a design value.** Not every study wants Pf: bearing life
   under a scattered duty cycle is quoted as an L10 — the 10th percentile —
   because that is the number a catalogue is written against. This is the case
   that shows why a percentile has to be a **wireable** number: it feeds the next
   calculation, it is not a line in a report.
4. **How many samples is enough?** A running mean, and a running Pf, plotted
   against the trial axis. The teaching point is that the answer is visible
   rather than assumed, and that the interval on Pf is the honest version of the
   same question.
5. **A design sweep crossed with trials.** Pf per diameter, drawn as one
   histogram panel per diameter, with the swept range wired into `along`. This is
   the case the `along` port exists for, and the case where leaving it unwired
   pools everything into a meaningless number — so the docs page and the
   `statisticPooledAxes` warning should say the same thing in the same words.
6. **Outside machine design.** The photography catalogue gives a study with no
   shafts in it: shutter speed and hand-shake both scattered, reported as the
   probability a handheld frame is sharp. One short example is worth a paragraph
   of claiming the kernel is domain-neutral.

## Approach

### 1. Reductions along an axis — `packages/kernel/src/statistics.ts` (new)

Two walks over the reduce axis, both built on `select.ts`'s axis handling rather
than re-deriving index maths:

- `reduceAlong` — drops the reduced axes, so a 1-D trial study collapses to a
  scalar and a diameter × trial study collapses to one value per diameter;
- `scanAlong` — keeps the axis, emitting the statistic over the first *k* cells
  at each *k*. That is the review's convergence plot, and it needs no figure of
  its own: the result is an ordinary series along the trial axis, which the
  existing Plot node already draws.

| Statistic | Consumes | Emits | Dimension |
| --- | --- | --- | --- |
| `mean`, `median`, `stddev`, `min`, `max` | numeric | the reduced value | `$A` |
| `percentile` | numeric + a percentile in 0–100 | the value at that percentile | `$A` |
| `probability` | categorical (a Compare verdict) | the fraction of cells equal to `match` | dimensionless |
| `count` | any series | how many cells were reduced | dimensionless |

Details that are decisions, not implementation:

- **The percentile definition is pinned**: linear interpolation between order
  statistics — the R type-7 / NumPy default. It has to be pinned because the
  distribution figure rules percentile lines using the same code, and a figure
  disagreeing with a wired number by a digit is worse than either being wrong.
- `stddev` is the **sample** standard deviation (n − 1), matching `sdev` in
  `packages/kernel/src/functions.ts:236`. Two things in one product called
  "standard deviation" must not differ in their denominator. Fewer than two cells
  gives `NaN` and a `statisticTooFewSamples` warning rather than a silent zero.
- `probability`'s `match` defaults to `'pass'` — the value `evaluateCompare`
  produces (`packages/kernel/src/evaluate.ts:1100`). `match: 'fail'` is how a
  student gets a failure probability as a **wireable number**, which is the whole
  reason the field exists rather than hard-coding `'pass'`.

**The `along` trap, and what guards it.** The chosen rule — unwired means collapse
everything — is right for a pure Monte Carlo study and silently wrong for exactly
the study this feature exists to serve: a design sweep crossed with trials, where
the student wants Pf *per diameter* and pooling every diameter into one number is
meaningless. Rather than add magic (a rule that guesses the trial axis reads well
until the one time it guesses wrong), the rule stays one rule and the kernel says
so: `statisticPooledAxes` warns whenever an unwired `along` collapses more than
one axis, names them, and says which to wire. A warning, not an error, per
`warnings.ts`'s stated line — wiring is an error, a result you should look at is a
warning. Wiring *any* generator's `value` into `along` names the trial axis,
because they all carry the one shared id.

**Running reductions.** `running: true` requires exactly one reduce axis; two is a
shape nobody has defined, so it is an error rather than a guess. `mean`, `stddev`
(Welford), `min`, `max`, `count` and `probability` are online and O(n). `median`
and `percentile` are not: they use an incrementally sorted array with binary
insertion, which at the 10 000-sample `DEFAULT_MONTE_CARLO_SAMPLE_LIMIT` is about
5 × 10⁷ element moves — tens of milliseconds, acceptable, and better stated here
than discovered in a profiler.

### 2. `StatisticNode` — a wireable node kind

A discriminated union on `statistic`, the same shape `MonteCarloGeneratorNode`
uses for `distribution` (`packages/schema/src/document.ts:330`):

```ts
export const STATISTICS = ['mean','median','stddev','min','max','percentile','probability','count'] as const;

interface StatisticNodeBase extends NodeBase {
  readonly kind: 'statistic';
  /** Emit the statistic over the first k cells at each k, keeping the axis. */
  readonly running?: boolean;
}
export interface PercentileStatisticNode extends StatisticNodeBase {
  readonly statistic: 'percentile';
  readonly percentile: number;          // port default, wire overrides
}
export interface ProbabilityStatisticNode extends StatisticNodeBase {
  readonly statistic: 'probability';
  /** Which categorical value counts. Defaults to 'pass'. */
  readonly match: string;
}
export interface PlainStatisticNode extends StatisticNodeBase {
  readonly statistic: 'mean' | 'median' | 'stddev' | 'min' | 'max' | 'count';
}
```

Ports stay stable across statistics so switching never strands a wire — `select`'s
own rule: in `value` (`$A`, categorical for `probability`), `along` (`$B`,
optional), `percentile` (dimensionless, percentile only); out `result` (`$A`,
dimensionless for `probability`/`count`).

**A naming collision worth resolving deliberately.** `arrayNodes.ts` already
offers palette entries called mean, median and standard deviation. Two entries
with the same name doing different things is a real trap, so the new ones are
sectioned as **Statistics** against the existing **Array nodes**, each summary
naming what it consumes ("over a swept axis" against "over a whole spectrum"), and
`docs/guide/node-reference.md`'s `### Array nodes` section — which already opens
by saying its reductions take "a load spectrum, consumed at once, not a swept
range" — gains the other half of that sentence.

### 3. `DistributionOutput` — histogram and ECDF

One output kind with a view switch, not two kinds: they share every part except
the drawing.

```ts
export const DISTRIBUTION_VIEWS = ['histogram', 'cdf'] as const;

export interface DistributionOutput {
  readonly kind: 'distribution';
  readonly view: DistributionView;
  /** Bin count. Absent means Freedman–Diaconis from the samples. */
  readonly bins?: number;
  /** Percentiles ruled on the figure, e.g. [5, 50, 95]. */
  readonly percentiles?: readonly number[];
  /** The axis whose values fill the distribution. Absent means the trial axis. */
  readonly over?: string;
  /** One panel per value — `PlotOutput.facet`'s own slot, same machinery. */
  readonly facet?: string;
  /** Overlay a fitted normal curve, or its CDF. */
  readonly fit?: boolean;
}
```

One port, `value`.

- **The default bin count is Freedman–Diaconis** (`2·IQR·n^(−1/3)`, falling back
  to Sturges when the IQR is zero) — deliberately *not* the receiver widget's
  rule, which derives bins from pixel width
  (`packages/editor/src/canvas/MonteCarloReceiverPlayback.tsx:116`). That is right
  for a live canvas visual and wrong for a report figure, which has to look the
  same at any width and in print. The two coexisting is intended, not duplication.
- `over` defaults to the trial axis, unambiguous because there is only ever one.
- A second axis **facets** rather than pooling: one histogram panel per diameter,
  reusing `pickPlotAxes` and the `fx` channel `PlotFigure` already uses. Anything
  beyond `over` and `facet` warns via `distributionAxisDropped`, mirroring
  `plotAxisDropped` — silently pooling would be the same mistake
  `statisticPooledAxes` guards against.
- The ECDF is a step, and its percentile rules use the same interpolation §1
  pinned, so a figure and a wired number never disagree.

The result carries one panel per facet value, each with its bins, its ECDF
points, its requested percentiles and its optional normal fit, so the figure
computes nothing — the same division `PlotResult` already keeps.

### 4. `ReliabilityOutput` — the card

```ts
export interface ReliabilityOutput {
  readonly kind: 'reliability';
  /** Check node ids, like FeasibilityOutput's. */
  readonly checks: readonly string[];
  /** Two-sided level for the interval on Pf. Defaults to 0.95. */
  readonly confidence?: number;
}
```

No ports. This is the fourth kind to reference Check nodes by id, so it joins
feasibility, Best Design and Pareto in the deferred second pass
(`packages/kernel/src/evaluate.ts:236`) on exactly the justification that comment
already gives, and it is the fourth caller of the shared feasible-mask helper the
selection pass extracts.

Per check, and for the AND of them, the card reports: trials, failures observed,
Pf, an interval, β, and whether the estimate has converged. Four rules make it
honest rather than merely impressive:

1. **Pf is `mean(!results)` along the trial axis.** `CheckResult.results` is
   already a per-cell boolean, so nothing is recomputed — this is a reduction of a
   value the document already produced.
2. **The interval is Wilson, not Wald.** Wald's width collapses to zero at zero
   observed failures, which is precisely the case a student most needs an interval
   for. Wilson stays sensible there.
3. **β = Φ⁻¹(1 − Pf)**, via an inverse-normal rational approximation in
   `packages/kernel/src/normal.ts` (new) — no CAS, deterministic, ~20 lines, and
   the same function the histogram's normal fit needs.
4. **A resolution floor.** With n trials the smallest resolvable non-zero Pf is
   1/n, so zero observed failures reports "Pf < 1/n, β > Φ⁻¹(1 − 1/n)" and never
   β = ∞. This is the single most important rule in the pass: without it, the
   least-informative possible run produces the most reassuring possible number.

And one warning that matters more than the rest: **`reliabilityNoTrials`**. If the
referenced checks do not vary along the trial axis, Pf is 0 or 1 by construction
and estimates nothing. That catches "you forgot to make an input random", which is
the mistake that otherwise yields a confident, meaningless report.

### 5. Three more distributions

Additive variants on the `MonteCarloGeneratorNode` union. Port names are chosen so
switching distribution never strands a wire — `select`'s stable-ports rule again:

- **triangular** — `MIN_PORT` / `MODE_PORT` (new) / `MAX_PORT`. Shares both bounds
  with `uniform`, so uniform ↔ triangular keeps both wires. One uniform draw
  through the inverse CDF.
- **lognormal** — `MEAN_PORT` / `STDDEV_PORT`, shared with `normal` for the same
  reason. **Parameterised by the variable's own mean and standard deviation**,
  which is what an engineer measures, converting internally
  (`σ² = ln(1 + (s/m)²)`, `μ = ln m − σ²/2`). Documenting that choice is not
  optional: the other convention — μ and σ *of the log* — is equally common,
  silently different, and would make every number wrong without any error.
- **discrete** — the odd one, and the only one adding a port *shape* the generator
  has never had: two spectrum ports, `values` and `weights`. `weights` unwired
  means equal weights, which makes **resampling a measured dataset** — the
  review's "empirical" distribution — the same node rather than a fourth one.

Every draw keeps the property `random.ts` exists to guarantee: sample *i* depends
only on *i* (or on its Box–Muller pair), never on `count`, so playback still only
ever appends and never reshuffles. Triangular and discrete take one uniform per
sample; lognormal is `exp` of a normal and inherits normal's pair-stability.

## Files

**Schema** — `packages/schema/src/document.ts`: the `StatisticNode` union and
`STATISTICS`; `DistributionOutput` and `DISTRIBUTION_VIEWS`; `ReliabilityOutput`;
the three generator variants; `MODE_PORT`, `VALUES_PORT`, `WEIGHTS_PORT`,
`PERCENTILE_PORT`, `ALONG_PORT` (shared with `select`) and
`STATISTIC_RESULT_PORT` beside the existing port constants — the last mirrors
`CLOSURE_RESULT_PORT`, which already names the same string for a different node;
`NODE_KINDS`/`OUTPUT_KINDS`; and the parse/serialize pairs for every one.
**No `SCHEMA_VERSION` bump**: every addition is additive and every existing
document still parses (`packages/schema/src/version.ts` explains why there is no
chain).

**Kernel** — `statistics.ts`, `distribution.ts` and `normal.ts` (new);
`random.ts` for the three draws; `graph.ts` for the `statistic` typing branch, its
port names, `distribution`/`reliability` in `outputPortNames`
(`packages/kernel/src/graph.ts:259`), and the generator's per-distribution
parameter ports — line 618's two-way `paramPorts` becomes a per-distribution map,
and `discrete`'s spectrum ports are a different shape from the numeric `paramType`
beside them; `evaluate.ts` for `case 'statistic'`, the `distribution` and
`reliability` branches, and the deferred list; `warnings.ts` for
`statisticPooledAxes`, `statisticTooFewSamples`, `distributionAxisDropped`,
`distributionEmpty`, `reliabilityNoTrials`, `reliabilityUnresolved` and
`monteCarloDiscreteWeights`; `index.ts` exports.

**Editor** — `canvas/StatisticNodeView.tsx` (new), modelled on
`canvas/CompareNodeView.tsx` for the typed-default-plus-overriding-wire
`percentile` field; `notebook/DistributionFigure.tsx` (new), Observable Plot
`rectY` for the histogram and a step line for the ECDF, `ruleX` for percentiles,
faceted via `fx` the way `PlotFigure` already does; `notebook/ReliabilityCard.tsx`
(new). Then `canvas/MonteCarloGeneratorNodeView.tsx` (the distribution switch and
its parameter fields grow three entries) and the registration points a node kind
and two output kinds each touch: `canvas/Canvas.tsx`, `canvas/quickAdd.ts`,
`canvas/QuickAddMenu.tsx`, `canvas/OutputNodeView.tsx` (kind dropdown, the
existing feasibility check-picker reused for `reliability.checks`, the
distribution's view/bins/percentile fields), `palette/Palette.tsx`,
`model/document.ts` (`defaultOutput`, `changeOutputKind` pruning, a
`changeStatistic` that prunes only `percentile`/`match`), `model/analysis.tsx`
(a statistic node needs `value` wired; `distribution` needs `value`;
`reliability` has no ports and joins the deferred check-readiness pass at line
391), `notebook/Notebook.tsx`, `viewer/CourseMaterialViewer.tsx` (the read-only
path needs both new output kinds too), `model/samples.ts` (use case 2 built as a
bundled sample, so the example page walks through a document that ships), `i18n.ts` (**en and nl both**), `help-links.ts`, `styles.css`.

## Docs

A feature is not finished until the docs site describes it, and `help-links.ts`
makes that structural rather than optional: every node kind's "?" button links to
`#{kind}` under `/guide/node-reference`, and `NODE_HELP_URLS`/`OUTPUT_HELP_URLS`
are `Record`s over the kind unions — so adding a kind is a compile error until its
entry exists, and a wrong anchor ships a dead link from inside the editor.

- `packages/docs-site/docs/guide/node-reference.md`
  - a new `## Statistics` section with `### Statistic`, listing every statistic,
    the pinned percentile definition, what `along` does wired and unwired, and
    what `running` produces;
  - `### Distribution` and `### Reliability` under `## Analysis`, beside
    Feasibility and Sensitivity, matching the anchors `OUTPUT_HELP_URLS` points at;
  - `### Monte Carlo generator` grows the three new distributions, and **must**
    state the lognormal parameterisation explicitly — mean and standard deviation
    of the variable, not of its log — since the wrong reading produces plausible
    numbers with no error anywhere;
  - `### Array nodes` gains the contrast sentence: those reduce a spectrum
    consumed whole, these reduce a swept axis.
- `packages/docs-site/docs/guide/reliability.md` — **a new guide page**, with its
  sidebar entry in `packages/docs-site/docs/.vitepress/config.ts`. A method, not a
  node list, and structured around use cases 1–5 above rather than around the
  nodes: what a Monte Carlo study is here, why every generator shares one trial
  axis, how to choose a distribution for a real tolerance (with the lognormal
  parameterisation stated where someone will actually read it), reading a
  histogram against reading a CDF, what Pf and β actually mean, why an interval
  belongs beside every Pf, what the resolution floor is telling you when it
  appears, how to tell from a convergence plot whether the run was long enough,
  and the "nothing in this study is random" failure mode `reliabilityNoTrials`
  catches. Use case 1 is the page's opening worked example — it is small enough
  to build while reading and complete enough to be a real answer. This page is
  what turns a set of nodes into something a student can be taught from.
- `packages/docs-site/docs/guide/sweeps.md` — a paragraph placing the trial axis
  among the range kinds: it broadcasts like any other axis, but it is one paired
  trial across every generator rather than a cross-product.
- `packages/docs-site/docs/examples/` — a worked walkthrough for the reliability
  sample, in `milling-power-envelope.md`'s style (a question in a blockquote, the
  starting inputs as a table, then what each figure says), plus its sidebar entry.
  Use case 2, **load against strength**, is the one to write up: it is the study
  that needs every piece of this pass at once — a distribution choice that
  matters, a histogram, a Pf with an interval, a β, and a convergence plot that
  justifies the sample count. Use case 6 gets a short second example if the
  photography catalogue makes it cheap; it is the one that shows the machinery is
  not about shafts. These pages are the only place the *reading* of a reliability
  report is taught rather than defined.
- `packages/editor/src/help-links.ts` — `NODE_HELP_URLS` gains `statistic`;
  `OUTPUT_HELP_URLS` gains `distribution` and `reliability`.
- `docs/file-guide.md` — one line each for `packages/kernel/src/statistics.ts`,
  `distribution.ts` and `normal.ts`, and for
  `packages/editor/src/canvas/StatisticNodeView.tsx`,
  `notebook/DistributionFigure.tsx` and `notebook/ReliabilityCard.tsx`, each
  saying what you would open the file *for*. Add the new guide and example pages
  to the `packages/docs-site/` section, and this plan to the `docs/` section —
  that section currently lists four files while the directory holds nine, so it
  is already behind and this pass should not add to the drift.
- `OVERVIEW.md` — a sentence where it describes what a study produces: a NodeBook
  can now report how often a design fails, not only whether one sample did.
- `ROADMAP.md` — an entry under `## Editor backlog` recording what landed and what
  was deliberately deferred: correlation groups, an empirical distribution as its
  own kind (it is `discrete` with equal weights), and rainflow counting, which the
  review already parks as a later specialist extension.

`docs/feature-review.md` stays as written; it is a review, not a status file.

## Verification

- `pnpm build` (also enforces package direction) and `pnpm test`.
  Catalogue-dependent tests skip without `JOVEWORKS_CATALOGUE`; that is expected.
- `packages/kernel/src/statistics.test.ts`, **invented formulas only**
  (`y = a*b + c`, per AGENTS.md — never an R&M expression as a fixture):
  percentile against hand-computed type-7 values at both an exact order statistic
  and an interpolated one; `stddev` asserted **equal to `functions.ts`'s `sdev`**
  on the same numbers, which is what stops the two drifting; running mean and
  stddev matching the batch value at every *k*; `probability` with `match` of
  `'pass'` and `'fail'`; a 2-D study where an unwired `along` pools and warns
  `statisticPooledAxes`, and a wired one keeps the design axis; a single-cell
  reduction warning rather than returning zero; `running` with two reduce axes
  refused.
- `packages/kernel/src/distribution.test.ts`: Freedman–Diaconis bin count on a
  known sample and the Sturges fallback at zero IQR; a histogram whose counts sum
  to the sample count; an ECDF that is monotone and ends at exactly 1; and the
  figure's percentile rule agreeing digit-for-digit with the statistic node's on
  the same data — the cross-check that pinning the definition was for.
- `packages/kernel/src/normal.test.ts`: the inverse normal against known quantiles
  (1.644854 at 0.95, 2.326348 at 0.99) to 1e-9, and symmetry about 0.5.
- Reliability coverage in `packages/kernel/src/evaluate.test.ts`, beside the
  existing feasibility tests: Pf over a known verdict grid; a Wilson interval
  against published values; the **zero-failure case** producing a non-degenerate
  interval, a finite β and the resolution floor rather than `Infinity`; checks
  that do not vary along the trial axis raising `reliabilityNoTrials`; and
  `checks: []`.
- `packages/kernel/src/random.test.ts` additions: triangular, lognormal and
  discrete moments over a large sample within tolerance; **sample-*i* stability
  under a growing `count` asserted for each**, which is the property playback
  depends on and the one a new distribution is most likely to break; and a
  values/weights length mismatch warned rather than thrown.
- `packages/schema/src/document.test.ts`: round-trips for the statistic node
  (every statistic, plus a rejected unknown one), both new output kinds, and the
  three new generator variants.
- Editor tests: `notebook/DistributionFigure.test.ts` and
  `notebook/ReliabilityCard.test.ts` in `FeasibilityFigure.test.ts`'s style;
  `model/analysis.test.tsx` for the new incomplete/blocked states.

**For Thomas in the browser** (I will not touch `pnpm dev`): take a shaft with a
normal-distributed load and a lognormal-distributed strength, wire the safety
factor into a Check, and add a Reliability node referencing it — confirm Pf, its
interval and β read sensibly, then raise the sample count and watch the interval
tighten. Add a Distribution node on the safety factor in both views and confirm
the 5th-percentile rule lands where a `percentile` statistic node wired to a Print
says it does. Add a `running: true` mean plotted against the trial axis and
confirm it converges rather than jumping. Then two deliberate mistakes: delete the
randomness (make every input a scalar) and confirm the card says the study has no
trials rather than reporting Pf = 0; and cross the study with a diameter sweep,
leaving `along` unwired, and confirm the warning names the axes it pooled instead
of quietly averaging across diameters.
