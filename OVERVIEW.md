# machine-design-studio — overview

A node editor for dimensioning machine parts. You wire inputs, equations and
outputs together on a canvas, and **the graph is the calculation**.

Built for the KU Leuven machine-parts course. Formulas come from *Roloff &
Matek, 6th ed.*, and every one carries a citation back to its equation number.

The point is not to compute a number once. It is to **sweep a design space** —
try every shaft diameter in a standard series, see which ones satisfy every
constraint at once, and look at the result as a graph.

> **Status: greenfield.** Documentation only — no source, no build yet. Every
> decision that gates the first commit is settled (see
> [DECISIONS.md](DECISIONS.md)); the build sequence is in [PLAN.md](PLAN.md).
> This document describes the intended system, and flags where something is
> still a proposal rather than a decision.

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
7. **Group related nodes into titled frames** and write a note on each. The
   frames are the sections of your report, not just tidying.
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
for an unknown. That sounds like a limitation and mostly is not, for two
reasons:

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

### Four kinds of output node

| Kind | What it does |
|---|---|
| **Value** | A scalar with unit, label and significant figures |
| **Check** | An assertion — `S ≥ 1.5` → pass or fail |
| **Plot** | Line or contour over swept inputs, with threshold overlay |
| **Table** | A swept series as rows — standard sizes against results |

The **check** node is what makes the notebook a *dimensioning report* rather
than a list of numbers: it is the scalar counterpart of the threshold line on a
swept curve, and a section full of green checks is the actual deliverable.

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

**Quarantine is how correctness is protected.** The predecessor library silently
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
  plausible reading already proposed in DECISIONS.md and need confirming, not
  reconstructing.

**Once there is code**, the sequence in PLAN.md is deliberate: schema and units,
then migration, then the kernel and its verification, and the UI last. The core
is testable without any interface, and that is where correctness is won.

**Ground rules that are settled — please do not relitigate them in code:**

- TypeScript throughout, except the one-off Python migration tool.
- No computer algebra at runtime. Forward evaluation only.
- Canonical units mm-N-s-rad-K; undeclared units are a hard error.
- Never surface R&M formula content outside the repository.
- A defect is reported and signed off — never fixed silently, never carried
  across silently.

Adding formulas does not mean writing code: author them in the editor.

**Not yet settled:** the licence for the engine and editor, and whether the
repository is public (D13). The catalogue restriction is settled and unaffected.

---

## Where the numbers come from

Correctness is checked against the old course notebooks, whose results are
frozen as fixtures — for example the chain drive's `i = 2.478`, `a = 1007 mm`,
`F_Ab = 4224 N`. Migration is verified by evaluating the old implementation and
the new one on the same random inputs and diffing.

That proves the migration is *faithful*. It does not prove a formula is
*correct* — the known defects pass differential testing precisely because both
sides are wrong in the same way. Hence sign-off, and hence quarantine.

---

## Read next

| Document | For |
|---|---|
| [PLAN.md](PLAN.md) | Build sequence, migration strategy, verification plan |
| [DECISIONS.md](DECISIONS.md) | Every settled decision (S1–S38) and its reasoning |
| [CLAUDE.md](CLAUDE.md) | Conventions and the distribution restriction |

---

*Range kinds (S29) and the output/notebook model (S30–S33) are settled. Two
details are still described here as intent and are tracked as **D14** and
**D15**: how a two-input grid sweep is expressed on the canvas, and whether a
threshold is one concept rendered two ways (a badge on a scalar, a line on a
curve) or two separate node types. Both touch the schema, so both want settling
before it is written.*
