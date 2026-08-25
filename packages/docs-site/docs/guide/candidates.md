# Candidates and marks

A study produces a grid of designs. At some point you pick one — and then
you have to talk about it: on the plot, in the table, against the checks,
on the feasibility map. Marking is how a NodeBook keeps all of those
talking about the *same* design.

Click a design anywhere it appears — a row in a table, a point on a
curve, a cell on a feasibility map, a point on a [Pareto](./node-reference.md#pareto)
front — and it is marked **everywhere at once**, carrying the same letter
on every figure.

## What a mark actually is

A mark is a **coordinate**, not a row number: `d = 40 mm`, or
`d = 40 mm, T = 80 °C`, or `material = steel`. It records *where the
design sits*, not where it happened to appear on the figure you clicked.

That distinction is the whole design. A row number survives nothing —
add a sample to the range, reorder a list, switch from ten points to
twenty, and row 7 is a different beam than it was this morning, with
nothing to tell you. A coordinate survives all of it, because 40 mm is
still 40 mm.

It also reads correctly. A report that says *candidate A: d = 40 mm,
2.47 kg* is saying something. One that says *row 7* is not.

## One rule for every figure

> A figure highlights every cell consistent with the mark **on the axes
> they share**.

That single rule is what lets one mark work across figures of different
shapes, and it is worth reading twice because both halves matter.

Suppose your study sweeps diameter **and** temperature.

- Click a point on the **Pareto chart**. That chart knows the whole grid,
  so the mark records both coordinates: `d = 40, T = 80`. It pins exactly
  one design.
- Look at a **plot of deflection against diameter** that does not vary
  with temperature. It shares only the diameter axis, so the mark lands
  on the single point `d = 40`.
- Look at a **feasibility map over both axes**. It shares both, so again
  one cell lights up.

Now the other direction. Click a point on a **plot that only knows about
diameter**. The mark records `d = 40` and nothing else — because that is
all the click could determine. On the feasibility map, that mark lights
the whole `d = 40` column: *every* temperature at that diameter. Which is
correct. You marked a diameter, not a design.

If you want a mark that pins one design, mark it somewhere that knows
every axis — the table, the feasibility map, or the Pareto chart.

## Letters

Marks are lettered **A**, **B**, **C** in the order you made them, and
the letter is what makes the marking *coordinated* rather than merely
persistent. A highlight says "this one". An **A** says "this one, and it
is the same one you are looking at on the other four figures".

Letters are stable: marking something new appends it, so a candidate B
you have already written about in a section note stays candidate B.

Marks are saved with the NodeBook, so a marked design is part of the
report you hand in, not something the reader has to reconstruct.

## When the range moves under a mark

Marks record coordinates, so editing a range afterwards is a real
question rather than a silent corruption. Two things can happen, and the
NodeBook tells you about both instead of quietly redrawing:

- **The coordinate falls between samples.** You marked `d = 40` and then
  re-sampled the range to 12, 22, 32, 42. The mark snaps to the nearest
  sample and says it was snapped. Same design, coarser grid.
- **The range no longer reaches it.** You marked `d = 40` and then swept
  100 to 300 instead. There is nothing to snap to — 40 mm is not "nearly"
  100 mm, it is a different beam — so the mark is reported and not drawn.

Pinning it to the nearest end in that second case would be inventing a
design nobody chose, which is the one thing a report must never do on
your behalf.

A categorical axis has no "nearest": `material = steel` matches steel or
it matches nothing.

## Where marks show up

| Surface | What a mark does |
| --- | --- |
| **Table** | highlights the row, with its letter in the first column |
| **Plot** | rings the point on the curve and labels it |
| **Feasibility** | letters the cell |
| **Pareto** | rings the point and labels it |
| **Check** | adds a line: the value and verdict at that design |
| **Print** | adds a line: the value at that design |

Check and Print add their per-candidate line only when the mark pins
**exactly one** point of that result. A mark that identifies a whole row
has no single number to report, so nothing is printed — averaging it or
taking the first would be making a reading up.
