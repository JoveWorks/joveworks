# machine-design-studio

A node-editor design tool for dimensioning machine parts. Wire inputs,
equations and outputs together on a canvas; the graph *is* the calculation.

Built for the KU Leuven course on dimensioning of machine parts. Formulas follow
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
- **No computer algebra.** Forward evaluation over a directed acyclic graph.
  The predecessor project carried a full symbolic layer that measurement showed
  was never used.
- **Units are canonical internally** — mm, N, s, rad, K — converted at the
  boundary. An undeclared unit is a hard error.
- **Dimensions are port types.** A force output will not connect to a length
  input, and neither will a connection that would close a cycle.

## Licence

Engine and editor: **MIT.** This repository contains no textbook content.
Learning stays free — no paid tier is planned for the core tool.

The R&M formula catalogue: **restricted, not redistributable.** It lives in a
separate private repository and is delivered to students through the course LMS
— a repository boundary, not a build-time exclusion.
