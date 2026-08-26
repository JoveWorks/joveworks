# JoveWorks — overview

A node editor for dimensioning machine parts. You wire inputs, equations and
outputs together on a canvas, and **the graph is the calculation**.

Built for a machine-parts course. Formulas come from *Roloff &
Matek, 6th ed.*, and every one carries a citation back to its equation number.

**Learning is free.** The engine and editor are open source and stay that
way — no paid tier planned, no monetization on the core tool. The project is
supported by the people who use it becoming better engineers, not by a
subscription.

The point is not to compute a number once. It is to **sweep a design space** —
try every shaft diameter in a standard series, see which ones satisfy every
constraint at once, and look at the result as a graph.

---

## How a student works with it

1. **Open a link.** It is a static web app — nothing to install, no account.
2. **Load the catalogue** file handed out through the course LMS. Once loaded it
   stays in browser storage; this is a first-run step, not a per-session chore.
3. **Drag in formulas** by equation number or by what they compute. Each arrives
   as a node with typed ports — inputs on one side, the result on the other.
4. **Wire them up.** Bad connections do not attach: a force output will not
   enter a length input, and neither will a link that would create a cycle.
5. **Set the knowns.** Type `250 kW`, `1450 rpm` — units are explicit and
   converted at the boundary. An undeclared unit is an error, never a guess.
6. **Turn an input into a range** and the whole graph becomes a study. See
   below — this is the part that matters.
7. **Group related nodes into titled frames.** Section frames become the
   sections of your report; lighter grouping frames annotate and organise the
   canvas without adding a heading, and can nest inside sections or each other.
8. **Export the notebook** — prose, values, checks and plots in reading order —
   as the thing you hand in. The graph itself saves separately, and autosaves.

Work is never lost to a closed tab, and the notebook is the submitted artefact.

---

## Sweeps: the part that matters

The old course notebooks all do the same thing. They compute a chain of
formulas, then ask *what happens if this input changes?* — plotting safety
factor against key length, surface pressure against diameter, and so on. One
notebook sweeps 14 key lengths × 8 diameters and draws a contour.

That is the primary use, not an add-on.

### How it works

**Set any input to a range instead of a value.** Everything downstream of it
becomes a series automatically — you do not rewire anything, and there is no
loop to write. The graph you already built is the study.

```
  ┌──────────────┐
  │ d = linspace │──┐          ┌───────────────┐      ┌─────────────┐
  │  (20,60,21)  │  ├─────────▶│  R&M 11.14    │─────▶│   S  (—)    │
  └──────────────┘  │          │  τ_t = …      │      │ safety fact.│
                    │          └───────────────┘      └──────┬──────┘
  ┌──────────────┐  │                                        │
  │  T = 1.2 kNm │──┘                                        ▼
  └──────────────┘                                    ┌─────────────┐
         scalar                                       │  plot vs d  │
                                                      │  ─── S=1.5  │
                                                      └─────────────┘
```

**Sweep two inputs and you get a grid** — a surface over the design space,
drawn as a contour or heatmap. This is the key-design notebook, reproduced
without writing a nested loop.

**Overlay the acceptance threshold.** A line at `S = 1.5` turns a curve into an
answer: everything to the right of where it crosses is a size that works. This
is the step the notebooks did by eye, and it is what makes the graph a design
tool rather than a plot.

### Range kinds

A range is not just `start..stop..step`. Five kinds, each earning its place:

| Range kind | Use |
|---|---|
| **Linear** — `linspace(20, 60, 21)` | The default. Fixed **number of points**, both endpoints included |
| **Logarithmic** — `logspace(1e4, 1e8, 40)` | Power laws and anything spanning decades |
| **Explicit list** — `{25, 30, 35, 40}` | **Standard sizes** — the realistic design case |
| **Table column** | A series pulled from catalogue data |
| **Categorical list** — `{H7, H8, K7}` | Fit classes and other named values, on an ordinal axis |

**Logarithmic ranges are not optional for this course.** Fatigue and Wöhler S–N
curves are log–log by construction; bearing life is a power law
(`L₁₀ ∝ (C/P)^p`, with p = 3 or 10/3). Sampling a decade-spanning quantity
linearly puts nearly every point at one end and leaves the interesting knee
unresolved. A log-spaced sweep also defaults its plot axis to log, so the
straight line a student is meant to recognise actually looks straight.

**Point count, not step size, is the primary control.** `linspace(20, 60, 21)`
says what you mean; `20..60 step 2` invites the classic floating-point question
of whether 60 is included. Step form stays available, but the number of points
is the canonical way to say it — it makes a sweep's cost predictable, and a
two-input grid is simply `n × m`.

Sweeping the sizes you can actually buy — the explicit list — is usually the
question worth asking. Linear and log spacing are for understanding *behaviour*;
the list is for choosing a *part*.

**Not everything swept is a number.** Fit classes (`H7`, `K7`) are categorical
values with a declared set of allowed entries, so a typo is rejected rather than
computed. They sweep as lists on an ordinal axis — and the study worth having
mixes the two: sweep diameter numerically *and* fit class categorically, and you
get one curve per fit class on a shared numeric axis.

### Why this replaces solving for an input

The kernel only evaluates **forwards**; it never rearranges a formula to solve
for an unknown. This isn't a gap left by scope pressure — it was measured. The
old course notebooks' SymPy-based equation reordering, the one function doing
genuine symbolic algebra, had **zero calls** across all 23 notebooks, and
the function itself was broken: it raised on every invocation and nobody had
noticed (see `docs/PLAN.md`). The CAS was inherited habit, not a requirement
anyone was exercising.

That sounds like a limitation and mostly is not, for two reasons:

- R&M already numbers its own rearranged forms (`17.1A`/`B`/`C` are one relation
  in three arrangements), so the "solved for" versions are catalogue content.
  The editor offers them as *same equation, solved for…*.
- Where no rearrangement exists, **sweep and read off**. "What diameter gives me
  a safety factor of 1.5" is answered by a curve crossing a threshold — and the
  curve shows the sensitivity around the answer, which a single returned number
  hides.

A root-finder would also silently pick one root of a formula that has two. The
graph shows you both.

---

## What it looks like

Three columns; the canvas is always the middle and always dominant. Both side
panels collapse.

```
┌──────────────────────────────────────────────────────────────┐
│  ▸ palette   [ belt-drive.jove.json ]                notebook  ◂   │
├────────────┬──────────────────────────────┬──────────────────┤
│ ┌────────┐ │  ┌─ Belt forces ──────────┐  │ ## Belt forces   │
│ │search  │ │  │  ┌──────────────────┐  │  │ Sizing for the   │
│ └────────┘ │  │  │ F_t    R&M 16.4  │  │  │ lab rig…         │
│ 16.1 speed │  │  │ 2457 N           │  │  │                  │
│ 16.4 force │  │  └──────────────────┘  │  │ F_t = 2457 N     │
│ 16.7 power │  │  ┌──────────────────┐  │  │ ✓ S = 1.8 ≥ 1.5  │
│ 16.9 …     │  │  │ S      R&M 16.9  │  │  │                  │
│            │  │  │ ▁▂▃▅▆█  d        │  │  │ ▁▂▃▅▆█           │
│            │  │  └──────────────────┘  │  │ Fig 2 — S rises  │
│            │  └────────────────────────┘  │ past 1.5 at 38mm │
└────────────┴──────────────────────────────┴──────────────────┘
```

**There is no properties panel.** Values, units and ranges are edited directly
on the node — otherwise the canvas would show a diagram while the real work
happened beside it, and the graph would stop being the calculation.

**Nodes are compact by default** — name, citation, result — and open on
selection or hover. You can pin one open while working elsewhere, and a node
missing a required input says so even while compact.

**A swept value shows a sparkline** where a scalar shows a number, labelled with
the axis it varies along, so you can watch a sweep propagate through the graph.

**Units are text on the port; colour means state.** With `N`, `mm`, `N/mm²`,
`W`, `Nm`, `m/s`, `rpm`, `%` and more in a single chapter, colour-coding
dimensions would produce a palette nobody could learn. Colour is spent where it
earns its keep: quarantined, out of applicability, failing check, error.

## Outputs and the notebook

The graph replaces the *calculation*. It does not replace the *document* — what
a student hands in is still prose, results and plots in reading order. So the
notebook comes back, not as a second tool but as a **view over the graph**.

**Group frames are the notebook's sections.** Put a title and a note on a frame,
drop output nodes inside it, and that frame renders as a section: prose first,
then its results. Arranging the canvas arranges the report.

```
canvas                              notebook panel
┌─ Establish gear ratio ──────┐     ## Establish gear ratio
│  "We need an initial…"      │     We need an initial estimate…
│   [n₁]→[R&M 17.1A]→[i]      │     i = 2.478  (—)
│         ▣ i                 │
└─────────────────────────────┘     ## Chain forces
┌─ Chain forces ──────────────┐     F_t = 2457 N
│   [P]→[R&M 16.4]→[F_t]      │     ✓ S = 1.8 ≥ 1.5
│      ▣ F_t  ▣ S  ▣ plot     │     [plot: F_t vs d]
└─────────────────────────────┘
```

It lives in a **collapsible side panel and updates live**, so the document takes
shape while the graph is built rather than being discovered at export time.

**Important slider inputs can be exposed in the NodeBook.** Turn on `Expose in
NodeBook` in a slider node's expanded controls and every section holding a
result that depends on it gets a compact slider and exact-value field, placed
once between the section's prose and its results rather than repeated under
each result. These are synchronized views of the original input, not copied
nodes: changing any one updates the canvas slider, every other occurrence, and
all downstream results immediately.
The separate course viewer keeps changes for the current visit and offers a
reset to the authored values. PDF export records the current value as text and
omits the interactive control.

**A study can also name the design you chose.** Click a design on any figure and
it is marked across the whole NodeBook — the same lettered candidate on the
plot, the table row, the feasibility map and the Pareto front. A mark is stored
as a coordinate (`d = 40 mm`), not a row number, so it survives re-sampling the
range and reads correctly in the report: *candidate A: d = 40 mm, 2.47 kg*.

### Kinds of output node

| Kind | What it does |
|---|---|
| **Value** | A scalar with unit, label and significant figures |
| **Check** | An assertion — `S ≥ 1.5` → pass or fail |
| **Plot** | Line or contour over swept inputs, with threshold overlay |
| **Table** | A swept series as rows — standard sizes against results |
| **Equation** | Shows a wired formula's own expression, typeset — the opt-in escape hatch |
| **Feasibility** | Shades where every referenced Check node's verdict passes at once — the multi-constraint counterpart of a single check |
| **Sensitivity** | A tornado diagram: every candidate input swept alone across its own bounds, ranked by how much a wired output moves |

The **check** node is what makes the notebook a *dimensioning report* rather
than a list of numbers: it is the scalar counterpart of the threshold line on a
swept curve, and a section full of green checks is the actual deliverable.
With Monte Carlo inputs, the NodeBook can also report how often a design fails,
with a confidence interval and reliability index, rather than only whether one
sample passed.

### Exporting

Export produces the submittable artefact. By default it carries **the citation
and the numbers, not the expressions** — `R&M 17.1A` and `i = 2.478`, not the
equation itself.

That is deliberate. Saved graphs never embed formulas, but an exported PDF
showing `τ_t = T/W_t` would put textbook content straight back into a file that
circulates. The default export is safe to hand in. Expressions can be revealed
for personal use, and doing so is explicitly marked as restricted content.

---

## How formulas and data are handled

**Formulas are data, not code.** A formula is a record — expression, ports,
units, citation — that the kernel reads. Nothing is hand-written as source.

Each formula carries:

| Field | Purpose |
|---|---|
| Expression | The equation itself |
| Ports | Each with a **dimension** and a display unit |
| Citation | `R&M 17.1B` — traceable to the textbook |
| Description | What it computes, and when it applies |
| Default & valid range | Sensible starting values; the range also bounds sweeps |
| `variantOf` | Links the rearranged forms of one relation together |
| Status | Verified, unverified, or **quarantined** |

**The editor is the authoring tool.** You create and edit formulas in the same
interface you use to compute with them. If catalogue files are ever being
hand-edited at scale, something is missing from the authoring path.

**Units are canonical internally** — mm, N, s, rad, K — and converted at the
boundary. Angles are radians inside, degrees on screen. Dimensions are enforced
as port types at connection time, so an error is caught when you wire it, not
when you read a wrong answer.

**Quarantine is how correctness is protected.** The old formula library silently
computed wrong answers — around 12 confirmed defective formulas, and no tests at
all. Here, a formula whose correctness is not signed off, or whose unit tag
could not be resolved, is marked and **cannot be evaluated**. It is visible, it
is not silently usable, and it is not silently dropped either.

---

## How catalogues are shared

This is shaped by a hard constraint: **the Roloff & Matek expressions may not be
redistributed.**

| Piece | Distribution |
|---|---|
| Editor and kernel | Public. Ship with **no textbook content whatsoever** |
| R&M catalogue | **Restricted.** Reaches students as a file through the course LMS |
| Other sources, own formulas | Unrestricted; a catalogue is just a file |

The app supports multiple catalogues at once, so a course pack, a standards set
and your own formulas coexist and are told apart by their citation field.

**Saved graphs never embed formulas.** A graph references them by ID, version
and content hash. Three consequences:

- A graph file can be shared, submitted or committed **without carrying
  restricted content**.
- Opening a graph against a different catalogue version **warns you** instead of
  quietly recomputing different numbers.
- A graph needs its catalogue present to open. That is the deliberate trade.

---

## How to contribute

**Right now, the useful contributions are not code.** Nothing is built yet, and
two content tasks gate formulas reaching students — both need the textbook in
hand:

- **Defect sign-off.** Confirm the known-wrong formulas against R&M. Triage
  first: the dimensional checker catches misplaced operators unaided, and the
  `BallBearing` `is list` bugs are Python type errors with no textbook question
  attached. Only the remainder needs the book.
- **Unit-tag sign-off.** About 30 tags could not be machine-parsed. Most have a
  plausible reading already proposed in ROADMAP.md's content sign-off section
  and need confirming, not reconstructing.

**The code that exists** followed `docs/PLAN.md`'s deliberate order: units and
schema, the base node library, then the kernel — and the UI last. The core is
testable without any interface, and that is where correctness is won.

**Ground rules that are settled — please do not relitigate them in code:**

- TypeScript throughout, except the one-off Python migration tool.
- No computer algebra at runtime. Forward evaluation only.
- Canonical units mm-N-s-rad-K; undeclared units are a hard error.
- Never surface R&M formula content outside the repository.
- A defect is reported and signed off — never fixed silently, never carried
  across silently.

Adding formulas does not mean writing code: author them in the editor.

**Licence:** engine and editor are **MIT**. The R&M catalogue is restricted and
lives in a **separate private repository** — a repository boundary rather than a
`.gitignore`, so the restriction cannot be lost to a stray `git add -A`.

**Where to start:** milestone 1 is deliberately narrow — the base node library
plus the belt chapter's 55 formulas, end to end. Not all 539. If the schema is
wrong, finding out after 55 formulas costs a morning.

---

## Where the numbers come from

Correctness is checked against the old course notebooks, whose results are
frozen as fixtures — the belt lab's `i = 4.444`, `v = 7.069 m/s`,
`F_t = 435.7 N`, or the chain drive's `i = 2.478`, `a = 1007 mm`. The belt set
is reproduced today, end to end through the kernel. The formulas
themselves are transcribed by parsing the old Python source, which is a
reference to read, never a system to run.

Reproducing those numbers proves the transcription is *faithful*. It does not
prove a formula is *correct* — the known defects would survive it, because the
error is in the source. Hence sign-off, hence quarantine, and hence formulas no
golden exercises stay marked unverified rather than assumed sound.

---

## Read next

| Document | For |
|---|---|
| [ROADMAP.md](ROADMAP.md) | What's actually still open — content sign-off, milestone 2, the backlog |
| [CLAUDE.md](CLAUDE.md) | Conventions and the distribution restriction |
| [docs/PLAN.md](docs/PLAN.md) | Historical: the build sequence, migration strategy, verification plan |
| [docs/UX-SPEC.md](docs/UX-SPEC.md) | Historical: editor UX findings from the hand-testing passes, all fixed |

Design rationale beyond what's in these documents lives as comments at the
code site it explains, not in a separate decisions log.
