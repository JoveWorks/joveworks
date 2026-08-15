# Next session

A ready-to-paste prompt for starting the next chunk of work. Kept deliberately
short: [CLAUDE.md](CLAUDE.md) loads automatically and carries the detail, so
anything repeated here is a second source that can drift.

**Update this file when the session it describes is done**, so it always names
the *next* step rather than a finished one.

---

## Blocked until one thing is cloned

`~/source/mechanical-design` **is not on this machine** (checked 2026-08-15).
Extraction parses it, so the next step cannot start without it:

```
git clone https://github.com/ThomasVanRiel/mechanical-design ~/source/mechanical-design
```

It is a source to read, never to run — no `pip install`, no venv, and `348e2f0`
is the frozen commit the plan's line numbers refer to.
`~/source/machine-design-catalogue` *is* present, primed and empty.

---

## Current: milestone 1, step 6 — extract `C16_Belt`

```
Continue milestone 1 of machine-design-studio.

Read OVERVIEW.md first, then PLAN.md (Migration and verification, and
Sequencing) and DECISIONS.md. S1–S65 are settled — implement them, don't
relitigate them. If something looks wrong, say so before building around it.

Steps 1–5 are done: `units`, `schema`, `nodes` and `kernel` are built and
tested, and a graph of base nodes evaluates end to end with sweeps, checks and
plots. Read S51, S52, S53, S62 and S65 before starting — they are the five that
shape what the extraction script may write.

Scope for this session: PLAN.md milestone 1, step 6 — `C16_Belt` only, 55
formulas. Do not generalise the script to other chapters (S52) and do not start
the editor. The script is public and lives in `tools/extract/`; **its output
goes to the private repo at ~/source/machine-design-catalogue** and never into
this one.

1. Parse `~/source/mechanical-design/MechDesign/RnM/C16_Belt.py` with stdlib
   `ast`. Never import it, never run it — no sympy, no venv.
2. Read the docstring form, the code expression and the class-level
   `MySymbolDict` (`'[unit] description'`) into `Formula` records.
3. Capture `variantOf` and `appliesWhen` *while extracting* (S17, S40) — the
   equation numbers are in front of you now and effectively unrecoverable later.
4. Strip inlined conversion constants (S53): `1E-6 * 1E3 * rho` is the boundary
   conversion, not part of the formula. Every constant that survives is in
   canonical mm-N-s-rad-K (S62).
5. Namespace the ids (S65). A graph's reference carries no catalogue id, so
   `add` from the base library and anything from R&M share one namespace.
6. Status is `unverified` for everything (S19). The goldens are step 7; nothing
   is `verified` until one of them exercises it.

The acceptance test is the kernel's, and it is why the kernel came first: load
the generated catalogue and run `checkFormulaDimensions` over all 55. A record
that fails is either a transcription error or a defect — triage it, don't
silence it. Then read the generated file: 55 expressions is a reviewable diff,
and a script's errors are systematic rather than scattered.

Stop when the catalogue generates, parses and passes the dimension check, with
the diff read. Report before starting the goldens.
```

### Why it is shaped this way

- **The kernel is the acceptance test.** Step 5 built a dimension checker that
  can be run over a whole catalogue; this is the first content it has to answer
  for, and a systematic parser bug shows up as many failures at once.
- **It names a stopping point** before the goldens, because reproducing numbers
  and transcribing faithfully are different claims (PLAN.md is explicit that
  neither proves the formula *correct*).
- **The restricted output never touches this repo.** That is a repository
  boundary (S45), and the one instruction worth repeating in every prompt.

---

## After that, in order

From PLAN.md's milestone 1:

7. **Belt golden values** end to end through the kernel — the table in PLAN.md,
   asserted at `rel=1e-3`. Both notebooks use `d_dg = 400 mm` where the
   assignment text says 420; that is a `DEFECTS.md` entry, not a value to
   reproduce differently.
8. **Minimal editor** — canvas, wiring, one sweep, one plot. No authoring UI
   (S51). The kernel already answers every question the canvas needs to ask:
   `canConnect` for a candidate wire, `typesConnect` for what to grey out while
   dragging, `evaluateDocument` for the numbers and the warnings.

## Standing items, none blocking

- **Defect and unit-tag sign-off** against R&M. Needs the book, so it is
  Thomas's. Belt is clean of junk tags and carries only one defect, so this does
  not gate milestone 1 at all.
- **Tables and categorical ports are unvalidated** (S37, S38), and the kernel
  says so out loud rather than half-working: a table column, a categorical value
  in an expression, or a categorical formula output each raise "tables arrive
  with the second slice". `C2_Tolerance` or the press-fit material in `C12` is
  what will exercise them.
- **What enforces the dependency direction: S55**, measured rather than assumed.
  `test/project-references.test.ts` pins both the enforcement and its limit.
- **Neither repository has been pushed.** No remotes exist yet. When creating the
  catalogue repo on a host, it must be **private at creation** — a repository
  that is public even briefly is indexable.
- **KU Leuven IP question** (S44): confirm the university claims no rights over
  course-derived material before publishing anything.
