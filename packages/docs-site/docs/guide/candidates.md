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

## Marking from a table

A table row *is* a design. Every column is broadcast onto the same grid
before the table is drawn, so row 3 is one cell of the study with each
wired value read out beside it — which is why clicking a row can mark
anything at all.

Clicking one does three things at once: the row is highlighted, its letter
appears in the **first column**, and the same design is called out on every
other figure in the NodeBook. Click it again to unmark.

A table is the most precise place to mark from, and that is not a
preference — its rows know **every** swept axis in the study, so a mark
made here pins exactly one design. Two consequences follow, and they are
the practical reason to reach for the table:

- A mark that pins one design is the only kind that produces a
  **per-candidate reading** under a Check or Print output (`A: S = 1.8 ✓`).
  Mark from a one-axis plot and no line appears, because there is no single
  number to report.
- It is the mark you want in a report. *Candidate A: d = 40 mm, 2.47 kg,
  S = 1.8* is a sentence. A marked column of temperatures is not.

Two small things worth doing on purpose:

- **Put the swept axis in the first column.** The letter badge is drawn
  there, so the mark sits directly beside the value that identifies it —
  `A 40 mm` reads as one thing.
- **Drag the columns you are comparing next to each other** (drag a header
  left or right in the notebook). A marked row is read across, and the
  argument for a design is usually two columns wide: mass against safety
  factor, cost against life.

## Marking from a plot

Click any point on the curve. The design under the cursor is marked with a
ring and its letter, and — this is the part that matters — the same letter
appears on every other figure that shares an axis with it. That is the link
between the picture and the numbers: the point you pointed at on the curve
is the highlighted row in the table below it.

What a plot mark **records** is only the axes that plot sweeps. A curve of
deflection against diameter can only tell you `d = 40`, so that is what the
mark says. On a feasibility map over diameter and temperature, that mark
lights the whole `d = 40` column — every temperature at that diameter,
which is exactly what you marked. Nothing is wrong there; it is the one
rule doing its job. If you wanted one design, mark it from a table, a
feasibility map or a Pareto front.

**On a contour**, the ring sits at the grid point it identifies: x from the
first swept axis, y from the **second** one. A contour puts the plotted
value on colour rather than on the y axis, so the marked design's value is
the colour under the ring, read against the colourbar — or, better, read
off a marked table row beside it. Height on a contour is the second swept
axis, never the result — so a ring sitting somewhere the colour does not
justify is the figure being read wrong, not the mark being in the wrong
place.

## Use cases

**"Which stocked size do I actually buy?"** — sweep a list of stock
diameters, table the results, click the row you would order. The letter now
appears on the deflection plot and beside every check, so the report's
"we chose 40 mm" is visible in every figure rather than asserted once in
the prose.

**"Why this one and not the next one up?"** — mark two. Candidates A and B
each get their own lettered line under every Check and Print, so the two
margins sit under each other and the comparison is a reading rather than an
argument. A report that compares A with B is doing engineering; one that
shows only A is announcing a conclusion.

**"It passes here and fails there."** — mark the cell on the
[feasibility map](/guide/node-reference#feasibility), which knows every
axis, then look at the contour plot: same design, same letter, one view
showing *whether* it passes and the other *by how much*.

**"What happens at 40 mm?"**, asked while someone is looking over your
shoulder — one click answers it on every figure at once, and the mark is
saved with the NodeBook, so the answer is in the document you hand in
rather than something the reader has to find again.

**"I widened the range after I wrote the text."** — the mark is a
coordinate, so it either still lands on a sample, snaps to the nearest one
and says so, or is reported as no longer reachable. In all three cases the
NodeBook tells you, which is the entire argument for coordinates over row
numbers.

## Tips and tricks

- **Mark where the axes are.** Table, feasibility map and Pareto front know
  the whole grid and pin one design; a one-axis plot pins a slice. Both are
  correct — only one of them prints a number under your checks.
- **Click again to unmark.** Marking is a toggle, everywhere.
- **Letters follow position.** Marks are lettered in the order you made
  them, so a *new* mark is always the next letter — but removing one
  re-letters everything after it. If a section note already names candidate
  C, unmark from the end, or re-read the note afterwards.
- **Keep it to a few.** Three rings and three letters read as a comparison.
  Eight read as a scatter plot with extra steps — at which point the figure
  you want is a [Pareto front](/guide/node-reference#pareto), not more
  marks.
- **A mark is part of the report.** It is saved with the NodeBook and drawn
  in the exported PDF, so a section note can refer to "candidate B" and
  trust the reader will find it.
- **Marks survive a rename, not a rewire.** They are keyed to the axis
  *node*, so retitling an input keeps them; deleting the input that
  introduced the axis is what makes a mark stale, and the NodeBook says so
  rather than quietly drawing something else.
