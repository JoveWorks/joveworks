# Node reference

Every node on the canvas is one of several kinds. This page is what the "?"
button on a node's header links to.

## Input

A value you set directly — a scalar, or a range for a [sweep](./sweeps).
Inputs are where a design study starts: everything downstream of an input
set to a range becomes a series automatically.

## Formula

A catalogue expression with typed ports — inputs on one side, results on
the other. Each formula carries a citation back to its source, a display
unit per port, and (where R&M numbers a rearranged form) alternate
"solved for…" variants of the same equation.

## Output

Where a graph's result surfaces — in the node itself, and as an entry in
the notebook panel. Pick its kind from the dropdown in the node's own
panel:

- **Print** — a scalar, in a unit and figure count you choose.
- **Check** — an assertion against a threshold; see [Compare](#compare)
  below for the same idea as a wireable verdict.
- **Plot** — a swept value as a line or contour, with an optional
  threshold line.
- **Table** — several swept series as rows, one column per wire.
- **Equation** — the wired formula's own expression, typeset, instead of
  its value.

Two more kinds live under a separate **Analysis** heading in the palette,
because they don't read a single wired value the way the five above do —
each one looks across several other nodes already on the canvas.

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

## Monte Carlo generator

Draws a value from a distribution, sample by sample, instead of taking
one you typed — a **uniform** draw between a low and high bound, or a
**normal** draw around a mean with a standard deviation. It introduces a
sweepable axis exactly like a range input does: everything wired
downstream becomes a series over its samples, with no separate "trial"
node to add. The sample count is the axis length, and (unusually) is
meant to change over a session — see the Monte Carlo receiver below for
why.

Sampling is deterministic per document: reopening the same NodeBook
reproduces the same draws, and raising the count only ever appends new
samples rather than reshuffling the ones already drawn.

Each distribution parameter (`min`/`max`, or `mean`/`stddev`) is also a
port: typed on the node, and wireable like a check or plot's threshold — an
edge into it overrides the typed value, which still applies once the edge is
removed. Wiring one takes a single value, not a swept series, since nothing
on the axis this node introduces exists yet for it to line up against.

## Monte Carlo receiver

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

## Compare

Checks a `value` against a `threshold` and emits a pass/fail verdict. This
is how an acceptance criterion — a safety factor, a pressure limit — turns
from "a number to eyeball" into something the graph itself flags.

## Closure

A student-typed equation, not a catalogue formula — its ports are whatever
names the expression mentions. Save a finished equation from its right-click
menu to reuse it from **My equations** in another notebook. Saved equations
can be imported and exported from the File menu; removing one from the palette
does not affect copies already embedded in graphs.

## Waypoint

A redirect on the canvas, not an operation. Each `inN` port passes unchanged
to its matching `outN`, and every pair keeps its own dimension. Use one waypoint
to bend several unrelated connections around other nodes without merging them
or touching a single number along the way.

## Pack

Bundles any number of independently-dimensioned wires into one — a length,
a force and an angle can travel together as a single edge instead of three
parallel wires. Pairs with [Unpack](#unpack) at the other end; a pack's
bundle may feed more than one unpack.

## Unpack

The inverse of [Pack](#pack): one bundle in, and as many outputs as the
bundle carries — each with the dimension its matching pack channel had.
