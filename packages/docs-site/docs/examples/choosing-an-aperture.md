# Choosing an aperture

This example is about the last step of a design study — the one that is easy
to leave undone:

> The sweep is plotted, the curve crosses the limit somewhere around f/6.
> **Now what?**

Read off by eye, "somewhere around f/6" stays in the picture. It never becomes
a number, never feeds anything downstream, and never appears in the report as
a decision anyone can check. This page builds that last step four ways, each
one a few nodes on top of a sweep you already have.

It uses the public **Photography** catalogue bundled with JoveWorks; no course
catalogue is required. Unlike [Pocket
milling](/examples/milling-power-envelope) it is a build-it-yourself
walkthrough rather than a bundled sample — but every number below is computed
by the editor, not estimated: they are asserted in
`packages/editor/src/model/photographyStudy.test.ts`, so if the catalogue
changes under them, that test fails.

## The question

Stopping down buys depth of field and costs sharpness to diffraction. Both are
real relations in the catalogue, and they pull in opposite directions:

- **Depth of field** grows as the aperture closes — through the hyperfocal
  distance, which depends on the circle of confusion, which depends on the
  camera's pixel pitch.
- **Diffraction blur** grows too, and past a point it is wider than the circle
  of confusion, so the detail you bought with depth is thrown away again.

So there is a best stop somewhere in the middle, and it depends on the body,
the framing, and how much depth the shot actually needs. That is a design
study, not a calculation.

## The graph

```text
camera ──► pixel pitch ──► circle of confusion ─┬──► hyperfocal ──► depth of field
                                                │         ▲
f-stop list (the axis) ───────────────────────────────────┘
             └───────────────────────────────────────► diffraction blur
```

The study below is a 50 mm lens focused at 2 m on a **Canon EOS R6 Mark III**
(5.16 µm pixel pitch, read from the camera picker rather than typed), with
"acceptably sharp" taken as a **three-pixel** circle of confusion — 15.48 µm.

The aperture input is an **explicit list**, not a linear range:

```text
{2.8, 4, 5.6, 8, 11, 16, 22}
```

These are the stops the lens can actually be set to. That distinction is what
the whole page turns on.

| f-number | Depth of field | Diffraction blur |
|---|---:|---:|
| 2.8 | 135.3 mm | 3.76 µm |
| 4 | 193.4 mm | 5.37 µm |
| 5.6 | 271.2 mm | 7.52 µm |
| 8 | 389.0 mm | 10.74 µm |
| 11 | 538.9 mm | 14.76 µm |
| 16 | 798.5 mm | 21.47 µm |
| 22 | 1134.3 mm | 29.52 µm |

::: tip Why not just solve for the aperture?
JoveWorks evaluates forwards and never rearranges a formula to solve for an
unknown — see [Why this replaces solving for an
input](/guide/sweeps#why-this-replaces-solving-for-an-input). The sweep *is*
the answer; the nodes below are how you read it.
:::

## 1. Where exactly does it cross?

Say the shot needs 300 mm of depth. Add a
[**Select**](/guide/node-reference#select) node in **threshold crossing** mode
and wire two things into it:

| Port | Wire |
|---|---|
| `value` | the computed depth of field |
| `along` | **the f-stop input itself** |

The node answers on `at`: **f/6.186**.

**`along` is the wire people forget.** There is no dropdown asking which axis
you meant; the wire says it. It is also why the answer comes back as an
*f-number* even though the value being searched is a *length* — `at` takes its
dimension from `along`, never from `value`.

The exact root of the continuous relation is f/6.189, so interpolating across
a gap as wide as f/5.6 → f/8 costs three thousandths of a stop here: depth of
field is very nearly linear in f-number over this span. The node checks that
rather than assuming it — it compares the straight line against a curve
through one more sample and stays quiet, which is why **no coarse-sweep
warning appears on a seven-point sweep**. That guard is a numerical test, not
a point count.

## 2. Which stop can I actually set?

f/6.186 is not a setting on any lens. The crossing answers "where would the
requirement be met if aperture were continuous" — useful, but not the thing
you dial in.

For that, ask the sampled question instead:

1. Add a [**Compare**](/guide/node-reference#compare) node — depth of field
   `>=` 300 mm — which emits a `pass`/`fail` verdict per stop, as a wire.
2. Add a **Select** node in **first passing size** mode. Wire the Compare's
   `verdict` into `value`, and the f-stop input into `along` as before.

The answer is **f/8** — a stop on the list, never one between two of them.
That is exactly why this mode does not interpolate.

::: tip Both at once
The two nodes sit on the same sweep happily. The crossing says where the
requirement is genuinely met (f/6.19); the first passing stop says what you
can set (f/8); the gap between them is the margin the standard stop buys you.
:::

## 3. Where are the extremes?

Add **smallest at** and **largest at** nodes — maximise depth of field,
minimise diffraction blur — and they answer:

- deepest: **f/22**, at 1134.3 mm
- sharpest: **f/2.8**

Both sit at the ends of the sweep, and **neither is a bug**. Depth of field
really does keep growing as you stop down, and diffraction blur really is
least wide open; both relations are monotonic here, so their extremes can only
be at the ends. A winner sitting at the edge of a range is information: it
says the objective alone does not decide this, and something else has to.

That is the entire argument for the next section.

## 4. Which stop wins?

Build each requirement as its own [**Check**](/guide/node-reference#check)
output — that is what makes it a line in the report:

- **enough depth** — depth of field `≥` 300 mm
- **sharp enough** — diffraction blur `≤` the circle of confusion

Wire the circle of confusion into the second Check's `threshold` port rather
than retyping 15.48 µm. A Check's threshold is a port like any other, so
changing camera or pixel criterion moves that bound automatically instead of
leaving a stale number behind.

Then add a [**Best Design**](/guide/node-reference#best-design) output:

- wire **depth of field** into `objective`;
- set the direction to **largest**;
- tick both Checks in the node's checklist.

There is no wire from Best Design to the Checks — it references them by name,
the same way a plot names a range input rather than wiring it. Hovering a row
in the checklist highlights that Check on the canvas.

The notebook card reads:

> **f-number 11 — largest at 538.9 mm.**
> 2 of 7 candidates feasible, governed by sharp enough at 4.7% margin.

**f/11, not f/22.** The unconstrained `argMax` above said f/22; with the
diffraction limit in play, f/16 and f/22 are out and f/11 is the deepest stop
that still resolves what it captures. Three stops lack depth, two are past the
diffraction limit, and two survive.

**"governed by sharp enough at 4.7% margin"** is the clause that earns the
node. *Governing* is the check with the least **normalised** margin at the
winner: `(value − threshold) / |threshold|`, sign-corrected so more room is
always a bigger number. At f/11 the blur is 14.76 µm against a 15.48 µm
circle of confusion — 4.7% of room — while depth of field is 538.9 mm against
300 mm, or 80% of room. Normalising is what makes those two comparable at all:
as raw differences, 0.72 µm and 239 mm say nothing about each other.

So the card is telling you something specific and actionable: **this shot is
diffraction-limited, not depth-limited.** If you need more depth, stopping
down further will not get it — focus stacking, a shorter lens, or stepping
back will.

### Asking it the other way

Keep both Checks and change the objective to **least diffraction blur**, and
the card picks **f/8** instead, governed by *enough depth*: the widest stop
that still gives the depth you asked for. Same constraints, different
question, and the answer agrees with what **first passing size** said in
step 2 — which is a good consistency check to have between the two ways of
asking.

### When nothing works

Tighten the criterion to two pixels and ask for 600 mm of depth at 2 m, and
no stop satisfies both. The card says so as an *answer*:

> **No candidate satisfies every check at once.**
> enough depth fails at 6 of 7 candidates — the most of any check here.

Depth blocks six of the seven stops and sharpness four, so depth is what it
points at — and that is the right advice: 600 mm at 2 m on a 50 mm lens is the
harder half of the ask, and stepping back will do more than stopping down.

### Feasibility beside it

A [**Feasibility**](/guide/node-reference#feasibility) output over the same
two Checks shades *where* the design works; Best Design says *which point to
build*. They pair naturally in a report: the figure shows the shape of the
feasible band, the card states the decision.

## 5. A second swept input

Make subject distance a sweep too — `{1.5, 2, 3} m` — and the study becomes a
grid. Nothing about the Select node changes:

- it collapses **only** the axis wired into `along`;
- every other axis survives.

So the crossing node's `at` output is now a **series** — a required f-number
per subject distance — plottable against distance like any other value:

| Subject distance | f-number for 300 mm of depth |
|---|---:|
| 1.5 m | f/11.07 |
| 2 m | f/6.19 |
| 3 m | — |

The blank is not a failure. At 3 m the widest stop already gives 307 mm, so
the curve starts above the requirement and never crosses it. The node reports
a blank cell and warns "at 1 of 3 points" — the ordinary state of a study
that is partly satisfied before it begins.

The Best Design card, meanwhile, would name the winning coordinate on *both*
axes.

## What still needs engineering judgement

These nodes search a finite study. They are exact about what they searched and
say nothing about what you did not sweep:

- **The circle of confusion is a criterion, not a constant.** Three pixels is
  a defensible pixel-level rule; the traditional diagonal/1500 rule gives a
  very different number, and so does a print-size argument. The whole answer
  moves with it — which is a reason to wire it from a formula, as above,
  rather than typing a number nobody can trace.
- **A crossing is only as good as the points around it.** Heed the
  coarse-sweep warning rather than dismissing it; if the answer moves when you
  add points, the earlier answer was interpolation, not analysis.
- **First passing size answers "the first that passes in the order swept".**
  List the stops ascending if you mean the widest.
- **Best Design picks from the candidates you swept.** A winner at the edge of
  the range usually means the range, not the design, is what is binding —
  widen it and re-read the card.
- Diffraction and defocus are not the only things limiting a real photograph.
  Lens aberrations, focus accuracy, subject and camera motion, and the
  processing chain all sit outside this study, and a stop that wins here can
  still lose on the ones that don't.
