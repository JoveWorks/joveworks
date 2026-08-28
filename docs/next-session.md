# Next session

Beta prep. `main` is clean: build passes, 1250 tests, nothing pushed. The
catalogue repo is 4 commits ahead of its origin, also unpushed.

## Landed 2026-08-28

Yesterday's four priorities are all done, and all verified in the browser.

- **Feasibility figure.** Single-panel width restored to a 360 floor — the
  "cramped too thin" regression was `c517272` giving a lone panel the 120
  floor meant for a facet. Fail cells now carry a diagonal SVG hatch, so
  pass/fail survives a greyscale printout. Closes the old item 46.
- **The spectrum concept is gone.** Not renamed — deleted. `SpectrumValue`,
  the `spectrum` port kind and the kernel's `Spectrum` runtime type are all
  removed; ports that take several values are ordinary `numeric` ports with a
  `variadic` flag, and their values arrive by wire through the ghost slots
  (`portSlots.ts`, formerly `spectrumSlots.ts`). Students meet no new word:
  the wiring error can no longer name the kind. Base-node hashes all changed,
  which was free only because no student document exists yet.
- **Monte Carlo discrete takes a list again.** The deletion made it demand one
  wire per choice. A generator forbids swept parameters outright, so a
  multi-valued wire there can only mean "more choices" — it now consumes whole
  wires. This is the one deliberate exception to "one value per wire per
  cell", and it is documented as such on the `variadic` flag.
- **The wrap angle is settled.** R&M's `[]` tag was right — a radian is a
  ratio, which `exp(mu * beta_1)` and `z_k * beta_k / (2*pi)` both depend on.
  The kernel was the odd one out, so `connectable` now bridges angle and
  dimensionless in both directions, and `rm.16.24A`/`16.24B` declare `rad`
  outputs at version 2. Nothing is quarantined in either catalogue any more.
- **Port value fields.** A clipped wired value ellipsizes and its tooltip
  works — that tooltip was dead on every disabled field in the editor, so
  Compare/Select thresholds, Range bounds and the Monte Carlo field gained
  working tooltips too.
- **Docs.** Every reference to the deleted `docs/PLAN.md` / `docs/UX-SPEC.md`
  is gone, from top-level docs and from source comments; the `S`-numbers went
  with them, since they recorded design choices that were never settled. The
  GitHub org migration is reflected everywhere, in both repos.

## Prompt for tomorrow

> Continue JoveWorks beta prep. Read `docs/next-session.md`, then `ROADMAP.md`.
> Work on `main` unless a task needs a worktree. Validate with
> `pnpm build && pnpm test`.
>
> Priority order:
>
> 1. **The extractor no longer matches the catalogue it generates.** Running
>    `tools/extract/c16_belt.py` against its source produces 559 differing
>    lines versus the committed `c16-belt.json` — different port names,
>    descriptions and statuses across many records. Record ids still match
>    1:1, so nothing was lost, but the catalogue repo's `CLAUDE.md` tells the
>    next person to "regenerate rather than edit", and following that today
>    would clobber signed-off work. Either re-sync extractor and source so
>    regeneration is safe, or stop claiming the file is generated. This is the
>    most dangerous stale instruction in either repo.
> 2. **Golden values.** 23 of belt's 54 records and 14 of press-fit's 30 are
>    `unverified`, including the two wrap-angle records. Nothing gates CI, but
>    see the open question below before treating this as routine.
> 3. **Catalogue-mismatch recovery.** A version mismatch warns; there is no
>    "recompute against the new version, here is what changed" path. Corrected
>    R&M formulas ship mid-semester by design, so this will fire.
> 4. **Catalogue migration path.** `migrateDocument` covers documents only.

## Decisions still open (Thomas's, not an agent's)

- **Were the corrected readings confirmed against the book?** 16.31's
  specific power, 16.34's unit tag, 16.36B's sum. Whether each was confirmed
  against R&M or merely applied is not recoverable from the files. If any went
  in unconfirmed, that is a larger task than adding goldens, and a bad thing
  to discover after students rely on the formulas.
- **Transfer the catalogue repo.** `joveworks` moved to the org; the catalogue
  is still on the personal account with 4 unpushed commits. A half-migrated
  pair is what surfaces at the worst moment, and the catalogue is what the
  school's LMS serves.
- **Verify the release workflow.** It has still never executed. Netlify and
  the org's Actions policy are both confirmed fine, so nothing is in the way
  of cutting a throwaway release.
- **Tell the school:** nightly and stable are different origins, so
  localStorage — autosave, cached catalogues, unsaved work — does not follow a
  student between them.

## Smaller loose ends

- `test/catalogue-check.test.ts` claims the kernel was built before any
  extraction ran. The dead citation behind it is gone and the claim can no
  longer be traced; flagged in `docs/REVIEW-2026-08.md` B1 for a decision.
- The catalogue repo's `CLAUDE.md` status section still says "5 quarantined,
  two waiting on the wrap angle". All five are resolved.
- Nothing is pushed, in either repo.
