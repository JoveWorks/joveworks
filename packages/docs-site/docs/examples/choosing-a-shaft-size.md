# Choosing a shaft size

This example is about the last step of a design study — the one that is easy
to leave undone:

> The sweep is plotted, the curve crosses the limit somewhere around 38 mm.
> **Now what?**

Read off by eye, "roughly 38 mm" stays in the picture. It never becomes a
number, never feeds anything downstream, and never appears in the report as a
decision anyone can check. This page builds that last step four ways, each one
a few nodes on top of a sweep you already have.

Unlike [Pocket milling](/examples/milling-power-envelope), this is a
build-it-yourself walkthrough rather than a bundled sample. It needs no course
catalogue: the public Base and Mechanics catalogues carry everything used
here. **Every number below is illustrative** — the point is the shape of the
graph, not these particular values.

## The starting point

A shaft carrying a transverse load, with a diameter to choose. Whatever
catalogue you build it from, the study has the same three pieces:

```text
diameter (range input)  ──┬──►  section properties  ──►  deflection
                          │                                  │
                          └──►  mass                          ▼
                                                     Plot vs. diameter
```

Sweep the diameter — a **linear** range from 20 to 60 mm, say, at 41 points —
and wire the computed deflection into a **Plot** with a threshold line at the
allowable value. You now have the familiar picture: a falling curve, a
horizontal line, and a crossing somewhere in the middle.

Everything below adds to this. Nothing below changes it.

::: tip Why not just solve for the diameter?
JoveWorks evaluates forwards and never rearranges a formula to solve for an
unknown — see [Why this replaces solving for an input](/guide/sweeps#why-this-replaces-solving-for-an-input).
The sweep *is* the answer; these nodes are how you read it.
:::

## 1. Where exactly does it cross?

Add a [**Select**](/guide/node-reference#select) node in **threshold
crossing** mode and wire two things into it:

| Port | Wire |
|---|---|
| `value` | the computed deflection — the same wire the Plot reads |
| `along` | **the diameter range input itself** |

Type the allowable deflection into the node's `threshold` field, or wire it in
from wherever the allowable value already lives.

The node answers on `at`: `38.2 mm`. Not a label on a chart — a value on a
wire, in millimetres, that you can Print into the notebook, Compare against
something else, or feed into the next formula.

**`along` is the wire people forget.** There is no dropdown asking which axis
you meant; the wire says it. That is also why the answer comes back as a
*length* even though the value being searched is a *deflection* — `at` takes
its dimension from `along`, never from `value`.

Two things the node will tell you here that a plotted curve will not:

- **"also crosses at …"** if the curve meets the limit more than once. All
  crossings are found; the first is the one on the wire, and the rest are
  listed underneath rather than quietly dropped.
- **"the sweep … is too coarse"** if the straight-line interpolation between
  the two bracketing points disagrees with a curve through one more sample.
  That is a numerical test, not a point count — it fires on a knee and stays
  quiet on a gentle curve. When it fires, add points and watch whether the
  answer moves.

## 2. Which size do I actually buy?

`38.2 mm` is not a shaft you can order. Swap the diameter input's range kind
from **linear** to **Renard** — R10 from 20 to 63 — and the sweep becomes the
sizes that actually exist: 20, 25, 31.5, 40, 50, 63.

Now the crossing node is the wrong tool: it would interpolate *between* two
stocked sizes and hand you a number nobody stocks. Use the sampled answer
instead:

1. Add a [**Compare**](/guide/node-reference#compare) node — deflection
   `<=` the allowable value — which emits a `pass`/`fail` verdict per swept
   size, as a wire.
2. Add a **Select** node in **first passing size** mode. Wire the Compare's
   `verdict` into `value`, and the diameter range into `along` as before.

The answer is `40 mm` — one of the sizes on the list, never one between two of
them. That is the whole reason this mode never interpolates.

::: tip Same axis, two questions
Both Select nodes can sit on the same sweep at once: the crossing tells you
where the requirement is genuinely met (`38.2 mm`), the first-passing size
tells you what to order (`40 mm`), and the gap between them is the margin the
standard size buys you.
:::

## 3. Which of the passing sizes is best?

A real shaft is not gated by one number. Say it must also carry the torque
with a safety factor of at least 1.5, and you would rather it were light.

Build each requirement as its own [**Check**](/guide/node-reference#check)
output — that is what makes it a line in the report:

- `deflection ≤ 0.5 mm`
- `safety factor ≥ 1.5`

Then add a [**Best Design**](/guide/node-reference#best-design) output:

- wire the shaft's **mass** into `objective`;
- set the direction to **smallest**;
- tick both Checks in the node's checklist.

There is no wire from Best Design to the Checks — it references them by name,
the same way a plot names a range input rather than wiring it. Hovering a row
in the checklist highlights that Check on the canvas.

The notebook card reads:

> **diameter 40 mm — smallest at 2.47 kg.**
> 3 of 6 candidates feasible, governed by safety factor at 4.1% margin.

Three sentences of it are worth pulling apart:

**"diameter 40 mm"** — the winning coordinate on every axis the study varies
along. Sweep a material as well and the card names both, which is why this
output has no `along` port: a decision has no single axis to reduce.

**"3 of 6 candidates feasible"** — how much of the swept space actually works.
Six of six would mean the sweep never got near a constraint; one of six means
you are choosing from almost nothing.

**"governed by safety factor at 4.1% margin"** — the payoff. *Governing* is
the check with the least **normalised** margin at the winner:
`(value − threshold) / |threshold|`, sign-corrected so more room is always a
bigger number. Normalising is what makes two constraints comparable at all — a
safety factor 0.02 above 1.5 and a deflection 0.02 mm below 0.5 mm are not
comparable as raw differences, and are as percentages. 4.1% says this design
is genuinely up against the torque requirement; 60% would say the winner is
limited by something else entirely, or just by where the sweep stops.

### When nothing works

If no size passes everything, the card says so as an *answer*, not an error:

> **No candidate satisfies every check at once.**
> safety factor fails at 6 of 6 candidates — the most of any check here.

That names where to look next — here, that no diameter in the swept range
carries the torque, so the range or the material has to change before any
amount of choosing helps.

### Feasibility beside it

A [**Feasibility**](/guide/node-reference#feasibility) output over the same
two Checks shades *where* the design works; Best Design says *which point to
build*. They pair naturally in a report: the figure shows the shape of the
feasible region, the card states the decision.

## 4. Two swept inputs

Add a second sweep — an operating temperature, driving the allowable stress —
and the study becomes a grid. Nothing about the Select node changes:

- it still collapses **only** the axis wired into `along`;
- every other axis survives.

So the crossing node's `at` output is now a **series** — a crossing diameter
per temperature — plottable against temperature like any other value. That is
the ordinary broadcasting rule, not a special case: wire `at` into a Plot and
the answer to "what size do I need?" becomes a curve against operating
temperature.

The Best Design card, meanwhile, names the winning coordinate on *both* axes.

## What still needs engineering judgement

These nodes search a finite study. They are exact about what they searched and
say nothing about what you did not sweep:

- A crossing is only as good as the points around it. Heed the coarse-sweep
  warning rather than dismissing it; if the answer moves when you add points,
  the earlier answer was interpolation, not analysis.
- A first-passing size answers "the first that passes **in the order swept**".
  Sweep the list ascending if you mean the smallest.
- Best Design picks from the candidates you swept. A winner sitting at the
  edge of the range usually means the range, not the design, is what is
  binding — widen it and re-read the card.
- A governing margin says which constraint is tightest *at the winner*. It is
  not a statement about how the design behaves anywhere else, and it is not a
  substitute for the check itself.
