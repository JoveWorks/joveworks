# Next session

Beta prep continues. `main` is clean: build passes, 1240 tests, nothing pushed.

## Landed 2026-08-27

Seven branches merged: beta node gating, schema migration, release channels,
Hub inline catalogue contents, locked-catalogue removal, per-artefact schema
version split, notebook print/figure hardening.

## Prompt for tomorrow

> Continue JoveWorks beta prep. Read `docs/next-session.md`, then `ROADMAP.md`
> item 17 and the Open product questions. Work on `main` unless a task needs a
> worktree. Validate with `pnpm build && pnpm test`.
>
> Priority order:
>
> 1. **Feasibility heatmap is colour-only.** Pass/fail regions may be
>    indistinguishable printed greyscale — on the artefact students hand in.
>    Colours are hardcoded hex in `FeasibilityFigure.tsx`, not CSS tokens, so
>    print CSS can't retarget them. Needs a per-verdict texture or pattern at
>    the chart level.
> 2. **`list` vs `spectrum` rename.** Student-facing confusion. Gets
>    permanently more expensive once students have saved documents — now or
>    never. See ROADMAP item 6.
> 3. **Catalogue-mismatch recovery.** A version mismatch warns; there's no
>    "recompute against the new version, here's what changed" path. Corrected
>    R&M formulas ship mid-semester by design, so this will fire.
> 4. **Catalogue migration path.** `migrateDocument` covers documents only.
>    See the note at the end of ROADMAP item 17.

## Decisions still open (Thomas's, not an agent's)

- **GitHub org.** Three repos: `joveworks`, `machine-design-catalogue`,
  backend. Do it after the beta lands and before the school deploys — Netlify's
  GitHub App needs reauthorising on transfer, and org Actions policy can
  override `release.yml`'s `contents: write`.
- **Verify the release workflow.** It has never executed. Cut a throwaway
  release before the school depends on it.
- **Tell the school:** nightly and stable are different origins, so
  localStorage — autosave, cached catalogues, unsaved work — does not follow a
  student between them.

## Housekeeping

`git worktree prune`; several merged branches and stale `/tmp` worktrees remain.
