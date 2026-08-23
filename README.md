# JoveWorks

> Build engineering **NodeBooks**.

A node-editor design tool for dimensioning machine parts. Wire inputs,
equations and outputs together on a canvas; the graph *is* the calculation.

![JoveWorks editor: a node graph feeding a live results panel with plots and pass/fail checks](docs/images/editor-overview.png)

Built for a course on dimensioning of machine parts. Formulas follow
**Roloff & Matek, 6th edition**, and each one carries a citation back to its
textbook equation number.

```
pnpm install
pnpm dev         # the editor, at http://localhost:5173/
pnpm test        # vitest
pnpm build       # tsc -b; an undeclared cross-package import fails here
```

**New here? Start with [OVERVIEW.md](OVERVIEW.md)** — the whole project in one
read. Then [ROADMAP.md](ROADMAP.md) for what's still open, or
[docs/PLAN.md](docs/PLAN.md) for the build sequence that got here.

## Why JoveWorks?

The name is a playful nod to Jupyter notebooks: Jove is another name for
Jupiter, and each visual calculation becomes a **NodeBook** — a notebook whose
calculation is built from connected nodes.

## What it is

- **Runs in the browser.** A static web app with no backend and nothing to
  install; students open a link.
- **Sweeps, not single answers.** Set any input to a range — linear, log, or a
  list of standard sizes — and the whole graph becomes a study, plotted against
  the acceptance threshold. This is the primary use, not an add-on.
- **The notebook comes back as a view.** Titled frames on the canvas are the
  sections of a live report: prose, values, pass/fail checks and plots in
  reading order. That report is what gets handed in.
- **Formulas are data**, not code. The editor is both the product and the
  authoring tool for the formula catalogue.
- **Units are canonical internally** — mm, N, s, rad, K — converted at the
  boundary. An undeclared unit is a hard error.
- **Dimensions are port types.** A force output will not connect to a length
  input, and neither will a connection that would close a cycle.

## What it isn't

- **Not a computer algebra system.** Forward evaluation over a directed
  acyclic graph — the kernel never rearranges a formula to solve for an
  unknown input. A rearranged form is authored as catalogue
  content instead, or answered by sweeping and reading off a threshold
  crossing — see [OVERVIEW.md](OVERVIEW.md) for the reasoning.

## Licence

Engine and editor: **MIT.** This repository contains no textbook content.
Learning stays free — no paid tier is planned for the core tool.

The R&M formula catalogue: **restricted, not redistributable.** It lives in a
separate private repository and is delivered to students through the course LMS
— a repository boundary, not a build-time exclusion.
