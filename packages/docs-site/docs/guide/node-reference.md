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
names the expression mentions. Useful for a one-off relation that doesn't
need its own catalogue entry, without leaving the typed, unit-checked
world the rest of the graph lives in.

## Waypoint

A redirect on the canvas, not an operation — it copies the wire it carries
through unchanged. Useful for bending a connection around other nodes, or
for giving a long wire a labelled stop, without touching a single number
along the way.

## Pack

Bundles any number of independently-dimensioned wires into one — a length,
a force and an angle can travel together as a single edge instead of three
parallel wires. Pairs with [Unpack](#unpack) at the other end; a pack's
bundle may feed more than one unpack.

## Unpack

The inverse of [Pack](#pack): one bundle in, and as many outputs as the
bundle carries — each with the dimension its matching pack channel had.
