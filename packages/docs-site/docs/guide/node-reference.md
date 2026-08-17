# Node reference

Every node on the canvas is one of eight kinds. This page is what the "?"
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
