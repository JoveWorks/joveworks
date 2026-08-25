# Lighter or stiffer — a cantilever

Most worked examples end with one number. This one ends with an argument,
because the question has two answers pulling against each other:

> A steel cantilever has to carry a 500 N tip load over a metre without
> deflecting more than L/300. Which hollow section should it be — and how
> much metal does the stiffness cost?

Open it from **Help → Examples → Cantilever — hollow sections**. It uses
the public Base and Mechanics catalogues bundled with JoveWorks; no
course catalogue is required.

## The study

A round tube, swept two ways at once: five outer diameters and four wall
thicknesses, giving twenty candidate sections.

| Parameter | Value |
|---|---:|
| Tip load *F* | 500 N |
| Beam length *L* | 1000 mm |
| Young's modulus *E* | 210 000 MPa |
| Outer diameter *d*<sub>o</sub> | 30, 40, 50, 60, 80 mm |
| Wall thickness *t* | 2, 3, 4, 5 mm |
| Deflection limit | L/300 = 3.33 mm |

Two quantities come out of every section. Deflection δ = *FL*³/3*EI*
falls as the section gets stiffer. Cross-section area stands in for
**mass** — one material, one length, so the section using less metal is
the lighter beam. There is no hollow-circle area formula in the public
catalogue, so the study composes one from base nodes:
π/4 · (*d*<sub>o</sub>² − *d*<sub>i</sub>²).

That is the trade: **less metal, or less deflection.** You cannot have
both, and no single number answers it.

## Why a Pareto and not a Best Design

If mass were the only thing that mattered, this would be a
[Best Design](/guide/node-reference#best-design) node: the lightest
section that passes, done. But "least deflection" is a real goal too —
you may want margin against a load you have not modelled — and once there
are two goals, "best" is not defined.

What *is* defined is which sections are **beaten outright**. A section
that is both heavier and floppier than another is off the table with no
argument needed. The [Pareto](/guide/node-reference#pareto) output finds
exactly those and draws the rest.

## Reading the chart

Of the twenty sections, only six meet the L/300 limit. Those are drawn
filled; the other fourteen are **hollow** — they failed the check and
never competed. Straight away the chart is telling you the limit, not the
trade-off, is what rules out most of the catalogue.

Of the six survivors, four sit on the front and **two are faded**: beaten
on both counts at once. One of them is worth stopping on.

> A 60 mm tube with a 4 mm wall deflects 2.86 mm and uses 704 mm² of
> steel.
> An 80 mm tube with a 2 mm wall deflects **2.13 mm** and uses
> **490 mm²**.

The bigger tube is lighter *and* stiffer. Not a compromise — a strictly
better beam, using 30% less steel. That is the whole reason bicycles,
aircraft and scaffolding are built from large thin tubes rather than
small thick ones, and here it falls out of the chart rather than out of a
rule of thumb: stiffness grows with the fourth power of diameter, while
material grows roughly with the first.

Past that point the free lunch ends. The remaining three front sections
buy their extra stiffness honestly:

| Section | Area | Deflection |
|---|---:|---:|
| 80 × 2 (**A**) | 490 mm² | 2.13 mm |
| 80 × 3 | 726 mm² | 1.47 mm |
| 80 × 4 | 955 mm² | 1.15 mm |
| 80 × 5 | 1178 mm² | 0.95 mm |

Each step up in wall thickness costs about the same 230 mm² of steel and
buys steadily less: 0.66 mm, then 0.32 mm, then 0.20 mm. Diminishing
returns, visible as the front flattening out — and the reason the last
step is the hardest to justify. Whether any of them is worth paying is an
engineering judgement, not a calculation, and presenting it as four
defensible options rather than one "answer" is what the front is for.

## Following the candidate

The 80 × 2 section is marked as **candidate A** — the lightest section
that still meets the limit, and the corner where the trade-off starts to
cost something.

Because a mark is a [document-wide candidate](/guide/candidates), not a
row number, that same **A** appears on every figure in the notebook: the
table row, the deflection plot, and the Pareto chart. Click a different
point on the front and it becomes candidate B, identified everywhere at
once — which is what lets a section note say "candidate B trades 236 mm²
for 0.66 mm" and have the reader find it.

## What this study does not say

The area proxy assumes one material and one length, so it ranks sections,
not costs. Nothing here checks bending or shear stress, local buckling of
a thin wall — which is exactly what limits how far the "bigger and
thinner" result can be pushed — weld or joint details, or whether the
tube sizes are stocked. Those are the next checks to add, and each one
would narrow the front rather than move it.
