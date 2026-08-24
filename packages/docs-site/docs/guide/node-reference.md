# Node reference

Every node on the canvas is one of several kinds. This page is what the "?"
button on a node's header links to, and it's organized the same way the
palette on the left of the editor is: **Input**, **Output**, **General**,
the formula catalogues (**Base nodes**, **Array nodes**, **Mechanics
nodes**, and whatever restricted course catalogue you've loaded), and
**Analysis**.

## Input

A value you set directly, rather than one computed from a wire. Inputs are
where a design study starts, and every one of them holds exactly one
`kind` of value at a time — switchable from the dropdown in the node's own
panel any time afterward, so the five shortcuts the palette offers only
save the first click:

- **value** — a plain scalar.
- **range** — a swept series; starts as **linear**, switchable to
  **logarithmic**, **list**, or **renard**.
- **list** — hand-typed standard sizes, swept.
- **spectrum** — a whole series consumed at once, never swept.
- **category** — a named choice from an enumerated domain.

Two more kinds exist only as a later switch, not a palette shortcut,
because starting one from scratch needs nothing typed yet: **slider**
(a scalar with drag bounds) and **categorical list** (a swept series of
named choices). A **table column** kind exists too, pulled from catalogue
data rather than typed — see below.

### Value and slider — a single number

**Value** is the plain case: type `250 N/mm²` for a yield strength, `1450
rpm` for a shaft speed — a design parameter you're treating as fixed for
this run, not something you're studying the effect of. Every unit is
explicit and converted to canonical form at the boundary (see
[Units](./units)); there's no "assume SI."

**Slider** is the same single number with its own `min`/`max` travel
bounds, for dragging rather than retyping. Reach for it when you want to
*feel around* a value interactively — drag a fillet radius back and forth
and watch a stress-concentration factor respond live — rather than typing
a series of candidate numbers by hand. The typed field next to the slider
still accepts an exact value, including one outside the slider's own
bounds (the thumb just pins at whichever end it overshoots); dragging
rounds to a chosen number of significant figures so the document only
ever holds numbers a student could plausibly have read off the slider.

### Range vs. list vs. spectrum

These three are easy to mix up because all three carry an array of
numbers, but each means something structurally different, and the
kernel treats them differently:

| Kind | Introduces a sweep axis? | Downstream becomes | Use it for |
|---|---|---|---|
| **Range** (linear, logarithmic, renard) | Yes | A series, one graph evaluation per point | "What happens as this varies smoothly?" — a plot's x-axis |
| **List** | Yes (an unevenly-spaced range) | A series, one graph evaluation per value | "What happens across *these specific* sizes?" — standard sizes, stock diameters |
| **Spectrum** | **No** | Nothing — still a single evaluation | "This node needs the whole array as one thing, right now" — a load history, fed to a reduction or a diagram |

Concretely:

- Set a shaft diameter to a **linear** range `linspace(20, 60, 21)` to
  plot a safety factor curve against diameter — 21 separate evaluations,
  one per point, which is exactly what a **Plot** output needs on its
  x-axis. Reach for **logarithmic** instead whenever the quantity spans
  decades and the relationship is a power law — cycles to failure on a
  Wöhler S–N curve, `logspace(1e4, 1e8, 40)`, since a linear sample would
  crowd every point at one end and hide the interesting part.
  **Renard** answers "sweep across the standard sizes near this range" by
  formula rather than by hand — `R20` from 6 to 30 mm produces every
  preferred bolt diameter in that band without you transcribing the
  series yourself. See [Sweeps](./sweeps) for the full range-kind
  reference.
- Set a shaft diameter to a **list** `{25, 30, 35, 40}` when the realistic
  question isn't "every diameter from 20 to 60" but "which of the sizes
  we actually stock works" — a list is still swept (four evaluations, one
  per value), it's just not evenly spaced and not formula-generated the
  way a range is.
- Set an input to a **spectrum** when a *single* node needs to look at
  several numbers *together*, in one evaluation, rather than being run
  once per number. A fatigue duty cycle's ten load levels, wired as one
  spectrum into a Mean or Standard deviation [array node](#array-nodes),
  is read as one whole series and reduced to one number — it does **not**
  turn the rest of the graph into a ten-point study the way a list of ten
  values would. The point loads and their positions on a
  [shaft shear/moment diagram](#mechanics-nodes) are the same shape: the
  diagram node consumes the whole spectrum at once to build V(z) or M(z)
  as a function of position, not once per load.

If you're unsure which of the two swept kinds to use: a **range** answers
"how does this behave as X varies," a **list** answers "which of these
specific options works." If you're unsure whether you want a swept kind
at all: ask whether the node reading the value needs to see every number
*at once* (spectrum) or be evaluated *once per* number (range or list).

### Category and categorical list

**Category** is a single named choice from an enumerated domain — an ISO
fit letter like `H7`, wired into the [ISO 286 lookup](#base-nodes) to read
off a hole's limit deviation. **Categorical list** switches that into a
swept, ordinal axis — `{H7, H8, K7}` — the only way a categorical value
sweeps, since `linspace` and a "spacing" between fit classes have no
meaning. Use it to compare interference across a handful of named fits in
one plot or table rather than rebuilding the graph for each.

### Table column

Pulled straight from a catalogue's own table data — a column of standard
bearing bores, say — rather than typed at all. It sweeps like a list, but
its values and length live in the table it names, so changing the
catalogue changes the sweep without editing the input node.

### File

Reads a file you pick and offers what it found as ports. Today one reader
is available: a **photograph**, from a Canon CR3 raw. It answers with the
settings the frame was taken at — focal length `f`, aperture `N`, exposure
time `t`, `ISO`, focus distance `s`, the pixel counts `px`/`py`, the sensor
size `w`/`h`, and the names the body gives itself and its lens as `camera`
and `lens`. Those last two wire straight into the [camera and lens
libraries](#formula): the library knows the name a body writes into its own
files, so a photograph selects its own row. With `f`, `N` and `s` all read
from the frame, a depth-of-field graph needs nothing typed in at all.

Two things to know about it:

- **The file is not stored in your NodeBook — the values are.** Picking a
  file reads it and keeps what it found; the file itself is never held or
  saved. Hand the NodeBook to someone else and every number still
  evaluates, but the node names a file they do not have. Re-pick to follow
  a different frame.
- **Only these fields are read.** A raw file also carries body and lens
  serial numbers, and — if the camera had a fix — where the frame was taken.
  What keeps those out of a NodeBook you share is the fixed field list: it
  names the tags it wants and reads nothing else. The location block is held
  out structurally as well, and is never opened at all.

Two readings come with a caveat. Sensor size is derived from the
focal-plane resolution rather than recorded outright, so it is close but
not exact — the camera library answers the same question from published
figures if you need it precise. And focus distance is a bracket rather than
a measurement: the camera records the interval its focus encoder believes
the subject sits in, and `s` is the middle of it. A subject further away
than that encoder can report leaves `s` empty rather than guessing; wire an
input node for it when the exact distance matters.

Pick several files at once and the node becomes a sweep: one point per
file, and every field an axis you can plot against — how depth of field
moved across a bracket, straight from the frames.

## Output

Where a graph's result surfaces — in the node itself, and as an entry in
the notebook panel. Pick its kind from the dropdown in the node's own
panel; every kind reads its subject from the same `value` port, so
switching kinds after the fact keeps the wire. The node's own "?" button
always opens the paragraph for whichever kind is currently selected.

### Print

A scalar, in a unit and figure count you choose. The everyday case: wire
a computed safety factor in and get `S = 2.31` in the notebook. Use this
whenever the number itself, not a pass/fail judgement or a curve, is what
belongs in the report.

### Check

A `value` against a `comparison` and `threshold`, typed directly on this
node — `S ≥ 1.5`, `pressure ≤ 200 N/mm²` — rendered as pass/fail. This is
the everyday way to gate a design: wire the same safety-factor node into
a Check instead of a Print when the report needs a verdict, not just a
figure. See [Compare](#compare) for the same idea as a wireable value
rather than a node you read directly, and [Feasibility](#feasibility) for
combining several Checks into one multi-constraint answer.

### Plot

A swept value as a line or contour, with an optional threshold line.
Needs a range input somewhere in the graph to plot against. Sweep a
shaft diameter and wire a safety-factor result in to get "S versus
diameter," with a horizontal line at `S = 1.5` marking where the design
first passes; sweep two inputs and the same output becomes a contour
instead of a line, with the second axis picked from `x`/`series`/`facet`
the same way a [Feasibility](#feasibility) output picks its axes.

### Table

Several swept series as rows, one column per wire — the natural home for
an explicit-list sweep: stock diameters down the left column, the
resulting safety factor and mass in the columns beside them, so a
student can read off which stocked size to actually buy.

### Equation

No `value` to configure at all: shows the wired formula's or closure's
own expression, typeset, instead of a number. Use it in a notebook to
show the reader *which* equation produced a result, right next to the
Print output that shows what it evaluated to.

Two more output kinds — **Feasibility** and **Sensitivity** — live under
the palette's separate **[Analysis](#analysis)** heading, because they
don't read a single wired value the way the five above do; each one looks
across several other nodes already on the canvas. Their own node's "?"
button opens [Feasibility](#feasibility) or [Sensitivity](#sensitivity)
directly, the same as any other output kind here.

## General

Domain-free operations: routing and comparison nodes that aren't formulas
but read like one by shape, so the palette groups them together rather
than filing them under Input or Output.

### Compare

Checks a `value` against a `threshold` and emits a pass/fail verdict **as
a wire**, not just a badge on the node — the difference from a
**Check** output, whose verdict is a display, dead-ends there. Reach for
Compare instead of Check whenever the pass/fail result itself needs to go
somewhere else — into a **Table** column so a swept design's rows each
show pass/fail alongside their numbers, or into a Closure that combines
several verdicts with its own logic. Note that a
[Feasibility](#feasibility) output references **Check** *outputs* by
name, not Compare nodes — build the acceptance criteria you want to
combine as Check outputs, even if a Compare node elsewhere already
produces the same verdict as a wire. If the verdict only needs to be read
on the canvas, a Check output alone is simpler — one node instead of two.

### Closure

A student-typed equation, not a catalogue formula — its ports are whatever
names the expression mentions. Drop one to combine values with plain
algebra that doesn't need its own catalogue entry — `margin = allowable -
applied`, or `factor = min(s1, s2) / required` combining two safety
factors already on the canvas — without reaching for a Base node per
operation. Save a finished equation from its right-click menu to reuse it
from **My equations**, a section that appears in the palette once you
have at least one saved. Saved equations can be imported and exported
from the File menu; removing one from the palette does not affect copies
already embedded in graphs.

### Waypoint

A redirect on the canvas, not an operation. Each `inN` port passes unchanged
to its matching `outN`, and every pair keeps its own dimension. Use one waypoint
to bend several unrelated connections around other nodes without merging them
or touching a single number along the way — for instance, routing a shared
`E` (Young's modulus) wire around a dense cluster of formula nodes so the
canvas stays readable, without turning it into a bundle the way Pack would.

### Pack

Bundles any number of independently-dimensioned wires into one — a length,
a force and an angle can travel together as a single edge instead of three
parallel wires. Reach for it when several values conceptually belong
together and travel the same route across a busy canvas — a load case's
force, its position and its angle, bundled into one wire that crosses a
crowded region and is split apart again with an Unpack right where each
value is actually needed, instead of three parallel wires all making the
same trip. Pairs with [Unpack](#unpack) at the other end; a pack's
bundle may feed more than one unpack.

### Unpack

The inverse of [Pack](#pack): one bundle in, and as many outputs as the
bundle carries — each with the dimension its matching pack channel had.
Use it right where a bundled value is actually consumed — after a Pack has
carried a load case's force, position and angle across a crowded canvas,
an Unpack at the destination exposes all three again, and you only need
to wire the `outN` ports the formulas there actually use.

## Formula

A catalogue expression with typed ports — inputs on one side, results on
the other. Each formula carries a citation back to its source, a display
unit per port, and (where the source numbers a rearranged form) alternate
"solved for…" variants of the same equation.

A formula's `status` tells you how much to trust it:

- **verified** — an independent numeric example has been pinned as a
  golden test.
- **unverified** — transcribed and dimensionally consistent, but not yet
  checked against a worked example. Faithful transcription, not a claim
  of correctness.
- **quarantined** — dragged in anyway (quarantine is *visible and not
  silently usable*, not hidden), but flagged as ambiguous or defective and
  cannot be evaluated until the underlying question is resolved. Its
  reason for quarantine shows in the palette and on the node itself.

Every formula the loaded catalogues carry appears in the palette, grouped
by catalogue — one section per catalogue, in the same order as the
palette. The catalogues that ship with JoveWorks itself are below; a
course's own restricted catalogue (Roloff & Matek content, for instance)
is distributed separately and loaded — locked, until you unlock it with
its password — the same way.

### Base nodes

Ordinary arithmetic and the trigonometric/rounding function whitelist —
unrestricted, citation-free, and evaluated through the exact same path as
any other formula. Nothing here is textbook content:

- **Arithmetic** — add, subtract, negate, double, half, absolute value,
  minimum, maximum, multiply, divide, square, square root, cube root,
  power. Dimension-preserving nodes (add, negate, absolute, min/max, …)
  require every input to share one dimension; dimension-combining ones
  (multiply, divide, square, …) derive the output dimension from the
  inputs algebraically, so `multiply` on a length and a force gives a
  moment, not an error.
- **Rounding** — floor, ceiling, round. All keep the input's dimension.
- **Trigonometry** — sine, cosine, tangent and their inverses take or
  return an angle; hyperbolic sine/cosine/tangent, natural logarithm and
  exponential all require a dimensionless argument.
- **Constants** — pi, as a node so it can be wired rather than retyped.
- **ISO 286 deviation lookups** — hole and shaft limit deviation for a
  nominal diameter, tolerance letter and IT grade, read from the ISO 286
  table rather than computed from an expression. Wire a shaft diameter's
  **category** input set to `k6` and grade `6`, for instance, to get the
  upper and lower deviation for that fit without looking the table up by
  hand.

A worked example that touches several Base nodes at once: to get a
safety factor's reciprocal expressed as a percentage margin, wire the
factor into `divide` as the denominator with `1` as numerator (`1/S`),
then into `subtract` against `1`, then `multiply` by `100` — three Base
nodes chained instead of one Closure, useful when each intermediate
value (the reciprocal, the margin) is itself worth its own Print output
in the notebook.

### Array nodes

Reductions over a whole series — a **spectrum** input consumed all at
once, never swept (see [Range vs. list vs. spectrum](#range-vs-list-vs-spectrum)
above for why a spectrum doesn't turn the graph into a study): sum,
product, count, mean, median, standard deviation (sample, n − 1 in the
denominator), and value-at-position. Every reduction preserves the
series' dimension except `count`, which is always dimensionless, and
`product`, whose input must itself be dimensionless (the dimension of a
product of *n* terms depends on *n*, which is a value, not a type).

For example, wire ten measured load-cycle amplitudes as one spectrum
input into **Mean** and **Standard deviation** nodes to summarize a duty
cycle with two numbers for a report, or into **valueAt** with `i = 0` to
pull out just the first reading for a spot check — all three read the
same spectrum, in the same single evaluation, rather than each triggering
their own run of the graph.

`minimum`/`maximum` also take a spectrum input but live under
[Base nodes](#base-nodes) instead — they read as ordinary arithmetic
(comparing an open set of same-dimension values) rather than as a
property of the series itself.

### Mechanics nodes

Generic beam/shaft load-diagram formulas — not tied to any particular
textbook, so they ship publicly like Base and Array nodes, but modelling
enough to be marked `unverified` throughout. Each takes a position `z`
along the shaft plus spectra of applied loads (and, where relevant, a
support's position and signed reaction) and returns the running total at
that position:

- **Torque diagram** (`shaftTorque`) — T(z), the running total of applied
  torques, taken as already balanced.
- **Shear diagram** (`shaftShear`) — V(z), the running total of transverse
  point loads plus either support's reaction, once wired. Apply once per
  transverse plane.
- **Bending moment diagram** (`shaftMoment`) — M(z), the moment about z of
  every point load and reaction at or before that position — shaftShear's
  result integrated. Evaluate it at a support's own position (unswept,
  both supports left unwired) to solve for that support's reaction with
  ordinary Base nodes, rather than a solver.
- **Deflection term** (`shaftDeflectionTerm`) and **Deflection diagram**
  (`shaftDeflection`) — the moment integrated twice more. The term is an
  intermediate EI·y quantity you still solve two constants of integration
  from; the diagram does that solving internally (given Young's modulus
  `E` and second moment of area `I`) and returns a directly plottable
  displacement y(z), zero at both supports by construction.
- **Distributed-load shear/moment contributions**
  (`shaftDistributedShear`, `shaftDistributedMoment`) — a uniform
  distributed load's own contribution, added to the point-load diagrams
  above with an ordinary `add` node. Wire as many start/end/rate spectra
  as the shaft has distributed loads.

None of these solve a statically indeterminate shaft or support a
distributed load in the deflection diagram directly — each node's own
description spells out the manual steps (evaluating at a support,
solving with Base nodes) where the graph doesn't do it for you.

### Restricted catalogues

A course catalogue — Roloff & Matek formulas, for instance — ships
locked: its name shows in the palette but its formulas stay hidden until
you enter the password your course hands out. Restricted content is never
exported or logged outside the graphs that use it, and this reference
intentionally says nothing about what any specific restricted catalogue
contains — that's the textbook's material, not this editor's.

## Analysis

Graph-level tools that look across several other nodes already on the
canvas, rather than reading one wired value the way a Print or Plot does.

### Monte Carlo generator

Draws a value from a distribution, sample by sample, instead of taking
one you typed — a **uniform** draw between a low and high bound, or a
**normal** draw around a mean with a standard deviation. It introduces a
sweepable axis exactly like a range input does: everything wired
downstream becomes a series over its samples, with no separate "trial"
node to add. The sample count is the axis length, and (unusually) is
meant to change over a session — see the Monte Carlo receiver below for
why.

Reach for it instead of a range input whenever the question is
statistical rather than "how does this vary" — a bolt's diameter and a
hole's diameter each measured with manufacturing tolerance, both wired
as **normal** generators around their nominal size, feeding a clearance
formula and a downstream **Print** or histogram of the resulting
clearance's spread, instead of a single worst-case number.

Sampling is deterministic per document: reopening the same NodeBook
reproduces the same draws, and raising the count only ever appends new
samples rather than reshuffling the ones already drawn.

Each distribution parameter (`min`/`max`, or `mean`/`stddev`) is also a
port: typed on the node, and wireable like a check or plot's threshold — an
edge into it overrides the typed value, which still applies once the edge is
removed. Wiring one takes a single value, not a swept series, since nothing
on the axis this node introduces exists yet for it to line up against.

### Monte Carlo receiver

Watches a wired series accumulate and an aggregate converge, sample by
sample, rather than only ever seeing a finished result. Wire anything
downstream of a Monte Carlo generator into a receiver's one input and
use its playback controls to reveal samples progressively; the mean band
and histogram it draws update as playback advances, and can each be
hidden from the receiver's own settings icon if you only want the other.

Playback position is session state — reopening a NodeBook always starts
a receiver back at the beginning. The notebook export always shows the
aggregate at the sample limit you set, regardless of where playback
happens to be paused on the canvas.

### Feasibility

Shades where several existing **Check** nodes all pass at once — the
multi-constraint question a single check can't answer on its own. A part
is rarely gated by one number: a shaft might need a safety factor of at
least 1.5 *and* a bearing pressure under some limit *and* a diameter that
still fits in an assembly. Build each of those as its own Check node
first (as always: a value wired to `value`, a comparison, a threshold),
then add a Feasibility output and tick every check it should require —
the tick list is in the node's own panel, not on the canvas.

There is deliberately **no wire** from a Feasibility node to the checks
it uses — it references them by name from a checklist instead, the same
"pick it from a list, don't wire it" pattern a plot's x/series/facet
axis picker already uses for range inputs. Hovering a row in the
checklist highlights the Check node it names on the canvas, so the
reference stays visible even without a wire; hovering that Check
elsewhere (its own entry in the notebook, say) lights the row back up
the same way.

What you get depends on how many of the checks' inputs are swept:

- **One swept input** — a single shaded band along it: green where every
  ticked check passes, red where at least one fails.
- **Two swept inputs** — a two-colour heatmap, one axis each (pick which
  with the same `x`/`series`/`facet` pickers a plot uses; left unset,
  they are filled in automatically from whichever inputs the checks
  actually vary along).

A Feasibility node needs at least one swept input somewhere in the
checks it references — with everything held at a single value there is
only one cell to shade, which is just what the checks themselves already
show.

### Sensitivity

"Which input actually matters?" — a tornado diagram, without hand-sweeping
every input in turn to find out. Wire a Sensitivity output to whatever
value you want to explain (a formula's result, same as any other output's
`value` port). It then finds every input in the document that has a
bracket to swing across:

- a **range** input (linear, logarithmic, list, Renard, or a table-column
  sweep) uses its own start/stop — a categorical sweep (`{H7, K7, …}`) is
  left out, since a numeric swing has no meaning on an unordered axis;
- an ordinary **scalar** input can still take part if the formula port
  it's wired to declares a valid range in the catalogue (its bracket
  comes from there instead).

For each candidate, every *other* input is held at a representative
value, the candidate itself is set to its low bound and then its high
bound, and the wired value is read at both. The bar for each candidate
spans those two readings; inputs are ranked by how far apart they are,
so the widest bar at the top is the one to focus on first if you only
have time to refine one measurement.

This is plain forward evaluation, repeated — never a solver, and never
approximate. It runs live as the document changes, the same as every
other output.

For example, wire a Sensitivity output to a shaft's computed safety
factor in a graph with five range/scalar inputs — diameter, applied
torque, fillet radius, material strength, required factor — and the
tornado ranks which of the five is worth tightening a tolerance on or
measuring more carefully; a narrow bar for material strength but a wide
one for fillet radius says the stress concentration, not the material
choice, is what's actually driving the design's margin.
