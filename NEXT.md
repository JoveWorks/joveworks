# Next session

A ready-to-paste prompt for starting the next chunk of work. Kept deliberately
short: [CLAUDE.md](CLAUDE.md) loads automatically and carries the detail, so
anything repeated here is a second source that can drift.

**Update this file when the session it describes is done**, so it always names
the *next* step rather than a finished one.

---

## Current: milestone 1, step 5 — the evaluation kernel

```
Continue milestone 1 of machine-design-studio.

Read OVERVIEW.md first, then PLAN.md (especially Sequencing) and DECISIONS.md.
S1–S60 are settled — implement them, don't relitigate them. If something looks
wrong, say so before building around it.

Steps 1–4 are done: `packages/units`, `packages/schema` and `packages/nodes`
are built and tested. Read S59 and S60 before starting — the kernel is what
consumes both, along with S56–S58.

Scope for this session: PLAN.md milestone 1, step 5 — `packages/kernel` only.
Do not build the editor and do not extract formulas. The base node catalogue
in `@mds/nodes` is your test corpus; it needs no textbook content.

Build `packages/kernel`:

1. The expression parser and compiler (S34/S35): strings to an AST to closures.
   Never `eval`, never `new Function` — catalogues are files students exchange.
2. Topological sort over the graph, with cycles rejected at connect time (S18).
3. Dimension resolution at connection time (S6), including binding generic
   signatures per node instance (S59) — this is the half of S59 that `schema`
   deliberately left undone.
4. Labelled-axis broadcasting (S43): two range inputs give an n × m grid with
   no grid node. Warn when the product of axis lengths grows large.
5. The boolean predicate layer (S39): comparisons plus and/or, serving check
   nodes, plot thresholds and `appliesWhen` alike.
6. The S19 gate: a quarantined formula cannot be evaluated, by anyone, ever.

Two things the base library surfaced that land on you:

- **Fractional dimension exponents.** `cbrt` of a force is force^(1/3), a real
  dimension no unit names. `dimensionsEqual` compares with `===`, which is
  right for integer exponents and fragile for thirds. Decide whether to compare
  with a tolerance and record it.
- **S54's permissiveness at a port.** The whitelist rule is "trig accepts an
  angle or a dimensionless argument". The node-graph counterpart is a
  connection rule — a dimensionless source may connect to an angle target —
  because the `sine` node's input port is declared `rad`. Implement it in the
  connection check, one-directionally, and nowhere else.

Stop when kernel has passing tests, including belt-shaped arithmetic built from
base nodes only. Report before starting the editor.
```

### Why it is shaped this way

- **It names a stopping point.** The editor is the visible payoff and the
  tempting thing to start in the same pass; the kernel is what has to be right.
- **It has a test corpus already.** The base node library exists precisely so
  the kernel can be exercised end to end before any catalogue does (S42).
- **It names the two loose ends** rather than leaving them to be rediscovered.

---

## After that, in order

From PLAN.md's milestone 1:

6. **Extract `C16_Belt`** — a one-off script over stdlib `ast`, into the private
   catalogue repo. Read the generated file; 55 expressions is a reviewable diff.
7. **Belt golden values** end to end — the table in PLAN.md.
8. **Minimal editor** — canvas, wiring, one sweep, one plot. No authoring UI.

## Standing items, none blocking

- **Defect and unit-tag sign-off** against R&M. Needs the book, so it is Thomas's.
  Belt is clean of junk tags and carries only one defect, so this does not gate
  milestone 1 at all.
- **Five decisions now sit under the kernel**: S56–S58 from step 3 (a port
  derives its dimension from its display unit; the content hash is a
  non-cryptographic FNV-1a over canonical JSON; a check node's threshold is a
  quantity rather than a predicate string), and S59–S60 from step 4 (generic
  dimension signatures on a port; only operations are catalogue content). The
  kernel consumes all five.
- **What actually enforces the dependency direction: S55**, measured while
  scaffolding rather than assumed. `test/project-references.test.ts` pins both
  the enforcement and its limit, so do not add a lint-based boundary rule on top
  without a reason the test does not already cover.
- **Neither repository has been pushed.** No remotes exist yet. When creating the
  catalogue repo on a host, it must be **private at creation** — a repository
  that is public even briefly is indexable.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
