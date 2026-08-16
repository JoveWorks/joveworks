# Node reference

Every node on the canvas is one of five kinds. This page is what the "?"
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
the notebook panel. An output node can also carry a plot of a swept value.

## Compare

Checks a `value` against a `threshold` and emits a pass/fail verdict. This
is how an acceptance criterion — a safety factor, a pressure limit — turns
from "a number to eyeball" into something the graph itself flags.

## Closure

A student-typed equation, not a catalogue formula — its ports are whatever
names the expression mentions. Useful for a one-off relation that doesn't
need its own catalogue entry, without leaving the typed, unit-checked
world the rest of the graph lives in.
