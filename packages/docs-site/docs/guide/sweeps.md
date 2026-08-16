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
| **Table column** | A series pulled from catalogue data |
| **Categorical list** — `{H7, H8, K7}` | Fit classes and other named values, on an ordinal axis |

Logarithmic ranges matter for this course specifically: fatigue and Wöhler
S–N curves are log–log by construction, and bearing life is a power law.
Sampling a decade-spanning quantity linearly puts nearly every point at one
end and leaves the interesting part unresolved.

Point count, not step size, is the primary control — `linspace(20, 60, 21)`
says exactly what you mean, and a two-input grid is simply `n × m`.

## Why this replaces solving for an input

The kernel only evaluates forwards; it never rearranges a formula to solve
for an unknown. Where R&M numbers a rearranged form itself, the editor
offers it as *same equation, solved for…*. Where no rearrangement exists,
sweep and read off the curve — which also shows the sensitivity around the
answer, not just a single number.
