# Units

Every port on every node carries a dimension, and every connection is
checked against it. A force output will not plug into a length input — the
connection simply doesn't attach.

## Canonical units

Internally, everything is stored in one consistent system: **millimetres,
newtons, seconds, radians, kelvin.** You can type a value in whatever unit
is convenient — `250 kW`, `1450 rpm`, `12 kg/dm³` — and it's converted to
canonical form at the boundary, the moment it enters the graph.

An undeclared unit is a hard error, never a guess. There's no "assume SI
unless told otherwise" — every input is explicit.

This has one consequence worth knowing about: mass is tracked in tonnes
(so that force stays in newtons under `F = m·a` without a stray conversion
factor), and density is therefore tonnes per cubic millimetre. If you ever
see a density value that looks off by a factor of a million, this is why —
and it's exactly the kind of silent unit-scale error the boundary
conversion exists to prevent.

## Angles

Angles are tracked internally in **radians** and only converted to degrees
at the display boundary — node ports, plots, and exported notebooks show
degrees where that's the natural unit, but the math underneath is always
radians.

Trigonometric functions accept either an angle-dimensioned value or a
plain dimensionless number, since some formulas define an angle as an
already-dimensionless ratio.

## What this buys you

Because dimensions are enforced at connect time, not at evaluation time,
a wiring mistake shows up the moment you try to make it — not three nodes
downstream, and not as a silently wrong number in a plot.
