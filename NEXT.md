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
amending S54. Neither is code.

`S67`–`S69` were settled by step 8 and needed no schema change: the editor's
questions were all about how an *unfinished* graph behaves, not about the rules.
`S74`, from a second browser pass over the same editor, settled that a panel's
own subdivisions (a catalogue, a notebook section) collapse as session UI
state — reopens on reload, same as a pinned node — never a document field.

---

## Current: milestone 1, step 8 — fix what the browser pass found

The editor is built and the model layer is tested. What is left is the pass no
test can do: opening it and using it. That is
[packages/editor/TESTING.md](packages/editor/TESTING.md), done by hand, on a
machine with a browser.

**Thomas drives the browser himself now** (a `pnpm dev` he keeps running) and
reports findings live rather than as a pasted checklist — the prompt below is
still the shape of the work, not the literal handoff. A second pass, mid-way
through, landed `S74` (collapsible palette/notebook sections) plus a run of
smaller fixes: a still-blank range bound no longer refuses a unit, and a
range's unit field never refuses a retype at all; the "not connected" reason
renders port names the way their own labels do (a true subscript, not the
raw id); the notebook's drag grip and default width. `UI-FEEDBACK.md` reflects
what is now fixed — read it fresh rather than trusting memory of the first
pass.

```
Continue milestone 1 of machine-design-studio.

Steps 1–7 are done and step 8 — the minimal editor — is built: canvas,
palette, notebook, wiring, one sweep, one plot. `pnpm build` and `pnpm test`
are green, and the belt lab reproduces its golden values through the editor's
own path (packages/editor/src/model/samples.test.ts).

Read CLAUDE.md, then packages/editor/TESTING.md, which is the hand checklist
for the interface. I have run it and here is what I found:

  <paste findings here>

Fix those. Keep the kernel the authority — every "can I do this?" already has
an answer in @mds/kernel and S64 exists so the canvas cannot drift from it —
and do not widen the milestone: no second chapter, no formula-authoring UI
(S51), no autosave (S24 is settled but was not in step 8's scope).

Where a finding is a judgement call rather than a defect — node density, what
colour means, how much a compact node shows — say so and propose, rather than
quietly changing a settled decision (S46–S50).
```

### If the pass came back clean

Then milestone 1 is done, and the next chunk is the first of milestone 2. Two
candidates, and the order matters less than picking one deliberately:

- **The second slice** (step 10) — `C2_Tolerance` or the press-fit material in
  `C12`, chosen to exercise tables and categorical ports (S37, S38). Belt
  touches neither, and the kernel raises on both today rather than
  half-working. This is the one that tests whether the schema holds.
- **DEFECTS.md** (step 9) — which needs a home first; see the standing items.

### Why the current chunk is shaped this way

- **The editor's job is drawing and editing, not deciding.** Every rule about
  graphs was settled before it existed, and `canConnect` resolves the whole
  graph with the candidate edge added so connect time and evaluation time cannot
  disagree (S64). A finding that seems to call for new logic in the editor is
  usually a finding about the kernel, or about a decision.
- **A hand pass is not a formality here.** Three of the four things the editor
  must get right are perceptual: that a refusal is *visible*, that a sweep reads
  as a sweep propagating (S50), that colour means state and nothing else (S49).
  A green test suite says nothing about any of them.

---

## After that

Milestone 1 ends with step 8; milestone 2 is breadth — DEFECTS.md across the
corpus, the remaining chapters, and the full notebook view. **Choose the second
slice to exercise tables and categorical ports** (S37, S38).

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
  says so out loud rather than half-working. The editor accordingly offers
  neither as an input kind.
- **No autosave.** S24 settled IndexedDB autosave plus file export; step 8 built
  the export half only, so a refresh loses the graph *and* the loaded catalogue.
  Worth doing before anyone uses this for real work, and it is small.
- **Contour is drawn but unverified.** S26 asks for it to be checked against the
  key-design case before it is trusted; a non-uniformly spaced axis is currently
  stretched onto a uniform grid.
- **The bundle is 718 kB** (238 kB gzipped), most of it React Flow and Observable
  Plot. Fine for now, worth a look before students on a phone tether open it.
- **DEFECTS.md has no home yet.** PLAN.md's format carries the current
  expression, which cannot live in this repository. Either it goes to the
  private repo or the entries drop the expression and cite file:line. The
  quarantine reasons carry the content in the meantime. Two entries are waiting
  that are not formula defects at all: the notebooks' `/3.14` in place of `/π`
  when printing β₁, and the `d_dg` 400-vs-420 discrepancy.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
