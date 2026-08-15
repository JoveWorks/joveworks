# machine-design-studio

A node-editor design tool for dimensioning machine parts. Wire inputs,
equations and outputs together on a canvas; the graph *is* the calculation.

Built for the KU Leuven course on dimensioning of machine parts. Formulas follow
**Roloff & Matek, 6th edition**, and each one carries a citation back to its
textbook equation number.

Status: **milestone 1 done.** `units`, `schema`, `nodes`, `kernel` and
`editor` are built and tested — a graph of base nodes evaluates end to end,
sweeps included, with no textbook content anywhere in it, and `pnpm dev` opens
the canvas on a worked sweep. The belt chapter is extracted into the separate
private catalogue repository and **its golden values reproduce**, through the
kernel and through the editor alike, so the engine is verified against the
course's own worked examples. The hand pass over the interface is done and its
findings are fixed (see `UX-SPEC.md`). Every design decision is closed
(S1–S74). What remains besides code is content sign-off against the textbook,
which gates individual formulas rather than any build step.

```
pnpm install
pnpm dev         # the editor, at http://localhost:5173/
pnpm test        # vitest
pnpm build       # tsc -b; an undeclared cross-package import fails here (S55)
```

**New here? Start with [OVERVIEW.md](OVERVIEW.md)** — the whole project in one
read. Then [PLAN.md](PLAN.md) for the build sequence and
[DECISIONS.md](DECISIONS.md) for the settled decisions and their reasoning.
[NEXT.md](NEXT.md) names the immediate next piece of work.

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

## Relationship to `mechanical-design`

This project **replaces** [`mechanical-design`](https://github.com/ThomasVanRiel/mechanical-design),
a SymPy library of ~539 hand-transcribed formulas plus 22 worked-example
notebooks.

No code is carried over. That repository is a **reference for formula content
only**:

| Reference use | Detail |
|---|---|
| Formula source | The ~539 transcribed expressions and their `[unit]` tags |
| Verification fixtures | 22 notebooks with reproducible numeric results |
| Known-defect list | ~12 confirmed and ~10 suspected wrong formulas to *not* repeat |

Its Roloff & Matek expressions are under a distribution restriction. That
restriction follows the formula content into this project — see
[CLAUDE.md](CLAUDE.md).

## Licence

Engine and editor: **MIT.** This repository contains no textbook content.

The R&M formula catalogue: **restricted, not redistributable.** It lives in a
separate private repository and is delivered to students through the course LMS
— a repository boundary, not a build-time exclusion.
