# Next session

A ready-to-paste prompt for starting the next chunk of work. Kept deliberately
short: [CLAUDE.md](CLAUDE.md) loads automatically and carries the detail, so
anything repeated here is a second source that can drift.

**Update this file when the session it describes is done**, so it always names
the *next* step rather than a finished one.

---

## No decision is open

`D20` closed as `S66` on 2026-08-15, taking its option A: an angle does not
satisfy a requirement for a pure number, so `rm.16.24A`/`rm.16.24B` stay
quarantined and `β₁` stays out of reach. What would release them is now a
content question — confirm the wrap angle's `[]` tag against R&M — paired with
amending S54. Neither is code, and neither blocks the editor.

---

## Current: milestone 1, step 8 — the minimal editor

```
Continue milestone 1 of machine-design-studio.

Read OVERVIEW.md first (the "What it looks like" and "Outputs and the
notebook" sections are the spec), then PLAN.md and DECISIONS.md. S1–S66 are
settled — implement them, don't relitigate them. Nothing is open.

Steps 1–7 are done. `units`, `schema`, `nodes` and `kernel` are built and
tested; C16_Belt is extracted (54 records, 7 verified, 42 unverified, 5
quarantined) and its golden values reproduce end to end —
test/belt-goldens.test.ts is the worked example of driving the kernel from a
GraphDocument, and the closest thing to documentation for the API.

Scope for this session: PLAN.md milestone 1, step 8 — the minimal editor.
Canvas, wiring, one sweep, one plot. Do not extract another chapter, and do
not build a formula-authoring UI (S51).

The kernel already answers every question the canvas needs to ask, so the
editor should call it rather than reimplement any of it:

- `typesConnect` — what to grey out while a wire is being dragged. Cheap and
  explicitly not the authority (S64).
- `canConnect` — whether to attach this wire. It resolves the whole graph
  with the edge added, so connect time and evaluation time cannot disagree.
- `evaluateDocument` — the numbers, the outputs and the warnings, in one call.
- `valueAt` — what a given port produced, for the node bodies.

Layout is settled (S46–S50): collapsible palette left, canvas centre,
collapsible notebook right; **no permanent inspector** — values, units and
ranges are edited on the node. Units are text on the port; colour is reserved
for state (quarantined, out of applicability, failing check, error). Nodes are
compact by default, and a swept value shows a sparkline where a scalar shows a
number.

React Flow (`@xyflow/react`), Vite, and Observable Plot for the one plot
(S26). Keep React out of the kernel — `pnpm build` is what enforces that
(S22/S55), so run it.

The obvious graph to open it with is the belt lab, since it is already known
to be right. It needs the private catalogue, so the editor must degrade
honestly when none is loaded rather than shipping a fixture that embeds one.
```

### Why it is shaped this way

- **The kernel is the authority, and it is finished.** The editor's job is
  drawing and editing, not deciding. Every "can I do this?" already has an
  answer in `@mds/kernel`, and S64 exists precisely so the canvas cannot drift
  from it.
- **No authoring UI** (S51). A catalogue correction is a re-run of the
  extractor, as step 7 demonstrated: seven statuses changed, and the diff was
  seven lines.
- **The editor is the first place a distribution mistake can happen.** A
  fixture graph with belt formulas embedded in it would put R&M content in a
  public repo — graphs reference formulas by id, version and hash, never embed
  them (S23), and that is what makes this safe.

---

## After that

Milestone 1 ends with step 8; milestone 2 is breadth — DEFECTS.md across the
corpus, the remaining chapters, and the full notebook view. **Choose the second
slice to exercise tables and categorical ports** (S37, S38): `C2_Tolerance` or
the press-fit material in `C12`. Belt touches neither, and the kernel raises on
both today rather than half-working.

## Standing items, none blocking

- **Defect sign-off** against R&M. Needs the book, so it is Thomas's. Belt has
  three: 16.31, 16.34 and 16.36B, each quarantined with a proposed reading —
  see DECISIONS.md. 16.36B needs only confirmation; the other two need the book.
- **The wrap angle's `[]` tag**, added by S66. Confirming it reads as `[°]` is
  half of what would release 16.24A/B; amending S54 as D20's option B is the
  other half. Worth taking together, and worth a golden.
- **Belt's applicability conditions are not machine-readable.** They select on
  *belt type* — flat, V, toothed, poly-V — which is a categorical port (S38)
  this chapter has none of. `appliesWhen` is therefore empty across the
  chapter and the prose sits on each description instead. A `beltType`
  categorical would express all of them; it arrives with the second slice.
- **Defaults and valid ranges are unset.** S17 makes valid range load-bearing —
  a sweep bound and a bracketing interval — and belt has no source for either
  but the book and its tables. A content task, and the extractor is where the
  answers would go.
- **Tables and categorical ports are unvalidated** (S37, S38), and the kernel
  says so out loud rather than half-working.
- **DEFECTS.md has no home yet.** PLAN.md's format carries the current
  expression, which cannot live in this repository. Either it goes to the
  private repo or the entries drop the expression and cite file:line. The
  quarantine reasons carry the content in the meantime. Two entries are waiting
  that are not formula defects at all: the notebooks' `/3.14` in place of `/π`
  when printing β₁, and the `d_dg` 400-vs-420 discrepancy.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
