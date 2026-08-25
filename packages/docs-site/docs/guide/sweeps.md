# Sweeps

The old course notebooks all do the same thing: compute a chain of formulas,
then ask *what happens if this input changes?* — plotting safety factor
against key length, surface pressure against diameter, and so on. That's the
primary use case here, not an add-on.

## How it works

Set any input to a range instead of a fixed value, and everything downstream
of it becomes a series automatically. You don't rewire anything, and there's
no loop to write — the graph you already built is the study.

Sweep two inputs and you get a grid: a surface over the design space, drawn
as a contour or heatmap. Overlay an acceptance threshold — a line at
`S = 1.5` — and a curve becomes an answer: everything past where it crosses
is a size that works.

## Range kinds

| Range kind | Use |
|---|---|
| **Linear** — `linspace(20, 60, 21)` | The default. Fixed number of points, both endpoints included |
| **Logarithmic** — `logspace(1e4, 1e8, 40)` | Power laws and anything spanning decades |
| **Explicit list** — `{25, 30, 35, 40}` | Standard sizes — the realistic design case |
| **Renard series** — R10 from 10 to 100 | Preferred numbers — the standardized step sizes stock and catalogue parts actually come in |
| **Table column** | A series pulled from catalogue data |
| **Categorical list** — `{H7, H8, K7}` | Fit classes and other named values, on an ordinal axis |

Logarithmic ranges matter for this course specifically: fatigue and Wöhler
S–N curves are log–log by construction, and bearing life is a power law.
Sampling a decade-spanning quantity linearly puts nearly every point at one
end and leaves the interesting part unresolved.

Point count, not step size, is the primary control — `linspace(20, 60, 21)`
says exactly what you mean, and a two-input grid is simply `n × m`.

A Monte Carlo generator introduces an axis the same way a range does, but
draws it from a distribution instead of a designed sequence — reach for one
when the question is "how sensitive is this to scatter in an input" rather
than "what happens across this design space."

Every generator in a NodeBook shares one paired trial axis. Sample 37 from a
load generator combines with sample 37 from a strength generator; the two do
not form a load × strength cross-product. That trial axis broadcasts with
ordinary design ranges, so a diameter sweep crossed with Monte Carlo trials is
a diameter × trial grid and can be reduced to one failure probability per
diameter.

## Turning a sweep into an answer

Reading "somewhere around f/6" off a curve by eye leaves the answer stuck in
the picture: it never becomes data, never gets wired onward, and never
appears in the notebook as a decision. Four modes close that gap, all of them
searching the points the sweep has *already* evaluated:

| You want | Reach for |
|---|---|
| The coordinate where a value meets its limit | [Select](/guide/node-reference#select) — **threshold crossing** |
| The first *settable* value that passes | [Select](/guide/node-reference#select) — **first passing size** |
| Where a value is least or greatest | [Select](/guide/node-reference#select) — **smallest at** / **largest at** |
| Which candidate to build, and what governs it | [Best Design](/guide/node-reference#best-design) |

A Select node learns *which* axis to search by having the swept range
wired into its `along` port — so the answer comes back in that range's own
unit, and a two-axis study collapses only the axis you wired, leaving one
answer per coordinate of the other rather than a single number.

Worked end to end in
[Choosing an aperture](/examples/choosing-an-aperture).

When two answers pull against each other — lighter *or* stiffer — there is no
single best point to read off, and a [Pareto](/guide/node-reference#pareto)
output draws the candidates worth arguing about instead. Whichever one you
settle on, click it: a marked design is identified by the same letter on every
figure in the notebook. See [Candidates and marks](/guide/candidates), worked
through in [Lighter or stiffer](/examples/lighter-or-stiffer).

## Why this replaces solving for an input

The kernel only evaluates forwards; it never rearranges a formula to solve
for an unknown. Where R&M numbers a rearranged form itself, the editor
offers it as *same equation, solved for…*. Where no rearrangement exists,
sweep and read off the curve — which also shows the sensitivity around the
answer, not just a single number. And "read off the curve" is now
something the graph itself can do: see above.
