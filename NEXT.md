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

## Milestone 1 is done

Steps 1–8 are complete. The editor is built, the model layer is tested, and
the hand pass no automated test could do — opening it in a browser and using
it — is done across two passes. Findings are recorded and fixed; `UX-SPEC.md`
is the record, and its Backlog section (post-MVP, explicitly deferred) is the
only part still open. `packages/editor/TESTING.md`, the checklist that drove
those passes, has been removed — it was a one-time hand-testing aid, not a
living document, and its job is finished.

## Since milestone 1: three small additions, ahead of picking the milestone-2 chunk

- **A Renard-series range** (`renard` in `ValueSpec`/`RangeSpec`, S29's family):
  standard sizes by formula rather than by hand-typed list — R5/R10/R20/R40,
  a start and stop, expanded by the kernel at evaluation and converted to
  canonical units the same as `linear`/`logarithmic`. Editor exposes it as a
  fifth kind in the input node's dropdown, series selector plus bounds.
- **Table output creation in the editor.** The schema and kernel already had
  the whole `table` output kind (S33) — named columns, each its own port,
  rows shared across one axis — but `OutputNodeView.tsx` refused to let a
  student build one, reserving that for step 11's "full notebook view."
  Built now instead: `table` is a normal choice in the output kind dropdown
  and in the palette. Its ports work like a spectrum port's ghost slot
  (S71) — a trailing open handle that names a new column after whatever gets
  wired to it, `addNamedColumn` in `model/document.ts` — but unlike a
  spectrum's slots, a table's columns are ordered and named, so the detail
  panel also offers manual rename (carrying the wire along, same as a
  relabel), removal, and drag-to-reorder using the same before/after-half
  gesture `Notebook.tsx`'s section reordering already has. This is a slice
  of step 11, not all of it — frame section notes, per-output caption
  editing and export are what step 11 still means.
- **A `compare` node** — `value` against `threshold`, emitting a `pass`/
  `fail` verdict as an ordinary wireable value, most useful feeding a table
  column so a swept design's failing points are visible at a glance. A
  first-class graph node (`CompareNode` in schema/document.ts), not another
  `Output` variant on the output node the way the existing `check` kind is
  (S60 held here: a check's badge renders a value that already exists and
  goes nowhere else, but a comparison's *result* is exactly the kind of
  thing meant to flow onward, which an output node cannot do). `threshold`
  is the first port in the app with both a typed default (S58's quantity,
  now a fallback) and a wire that overrides it — wired to a swept series of
  its own, it lines up positionally against `value`'s cells by length
  rather than S43's usual axis-identity broadcast, deliberately, since a
  per-point bound naming its own unrelated axis is not what a threshold
  means. Existing `check` output kind is untouched — this is additive, not
  a replacement.

## Current: milestone 1 → milestone 2, pick the first chunk

Two candidates, and the order matters less than picking one deliberately:

- **The second slice** (step 10) — `C2_Tolerance` or the press-fit material in
  `C12`, chosen to exercise tables and categorical ports (S37, S38). Belt
  touches neither, and the kernel raises on both today rather than
  half-working. This is the one that tests whether the schema holds.
- **DEFECTS.md** (step 9) — which needs a home first; see the standing items.

Ask Thomas which one before starting; nothing in CLAUDE.md picks for you.

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
