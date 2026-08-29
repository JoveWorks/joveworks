# Roadmap

## Editor backlog

**1. Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the public
repo's node library and should be referenceable from the notebook.

**2. What about migration to newer versions?** Documents have a migration path.
Catalogues still have no migration path and refuse an unknown schema version.

**3. Change: What is the {table XX} notation in RM catalogue?** Decide how to
integrate tables as catalogue lookup items.

**4. Change: equation R&M 16.3 uses betahat_1** The hat is currently not
present as a caret on the letter. Out of scope for this repo — R&M catalogue
content lives in the private `machine-design-catalogue` repository.

**5. Target-driven sweep range suggestion** — setting up a study currently
means guessing a range before you know where the answer sits. Given a target on
an output, probe forwards and widen until the target is straddled, then propose
that range for the input. Forward-only and deterministic; no solver.

**6. Interpolated threshold-crossing readout** — on an already-evaluated
monotone slice, report the crossing between adjacent samples ("σ = 200 MPa at
d ≈ 37.4 mm") and mark it as interpolated, the way `candidates.ts` snaps to the
nearest sample and says so. A figure-layer reading off a computed curve, not
kernel behaviour — see the solver reasoning in [OVERVIEW.md](OVERVIEW.md).

**7. Decide the published viewer's weight** — drawing a published NodeBook
through the NodeBook's own components costs what a real figure costs:
Observable Plot and its d3 modules, KaTeX for typeset titles, and the kernel's
indexing and mark-matching helpers. The viewer bundle is 336 KiB gzipped
against a budget that was 250 KiB when it drew its own SVG, and the budget was
raised to 360 KiB rather than the figures being given up. If 250 KiB is worth
defending, the way back is lazy-loading `present/` behind the page shell: the
masthead and prose paint immediately and the figures stream in. Decide which,
then either lower `VIEWER_BUDGET` again or write down that this is the price.

**8. A plot axis can print its unit twice** — the platform sample's x axis
reads `platform width (mm) (mm)`: the authored axis label already carries the
unit and `PlotFigure` appends it again. Either the label loses its unit or the
figure stops appending one; the same choice governs every authored axis label.

**9. The convergence plot is unreadable at 2000 trials** — the running
failure-probability plot in the load-against-strength sample draws as a tangle
rather than a curve settling. It is a plot of a Monte Carlo running estimate
against a swept axis, and the two do not compose the way the output assumes.
Worth deciding what that output is meant to show before it is taught with.

**10. Monte Carlo receivers do not reach a published NodeBook** — a receiver
is a sink with its own node kind rather than an `output.kind`, so the NodeBook
panel presents one and the compiler skips it. A section that reads complete in
the editor arrives short. Either compile the receiver's playback as a
presentation-only figure or say why it is editor-only.

**11. Publications are a frozen copy, not a live link to their workspace** —
`create_publication` (joveworks-hub) copies `document_json`/`catalogues_json`/
`compiled_notebook_json` from the source workspace once, at publish time. A
later `PUT /api/v1/workspaces/{id}` (an ordinary "Save to Cloud" edit) never
touches the publication row, so `/p/{id}`, the admin console's "Cloud
material" list, and the compiled report students see all stay frozen at
whatever the workspace looked like the moment "Publish NodeBook" was clicked
— routine edits after that need a fresh, separate publish to reach students.
Three ways to close the gap, in increasing order of change:
- **Sync on save**: have `replace_workspace` also refresh the three copied
  columns on every publication whose `source_workspace_id` matches, re-running
  the same validation `create_publication` already does (complete compiled
  report, catalogue hashes intact). Smallest change — the Hub still only ever
  copies, never computes (it has no formula kernel; that lives in the editor's
  TypeScript `compileNotebook`). Needs a decision on what an *incomplete* save
  does while published: reject the save outright, skip syncing until the next
  complete save (silently going stale), or something else.
- **Live read-through**: drop the copy and have `GET /api/v1/publications/{id}`
  and `.../notebook` read the current workspace row via `source_workspace_id`
  at request time. No possible drift, but it drops the "publications are
  immutable" guarantee `docs/API-v1.md` documents today, which classroom use
  may actually depend on — a locked link for grading/reference that doesn't
  move under a student mid-semester. It also means a mid-edit or (if ever
  allowed again) deleted-workspace state is exactly what the published link
  shows, which is part of why workspace deletion is now locked while published
  (ROADMAP item done: see the `published` field and delete-lock shipped
  alongside this research).
- **Reuse the dormant `mode` field**: `PublicationMode`/`mode: 'viewer' |
  'editor'` already round-trips end to end (client and server — see
  `src/main.rs` and `packages/editor/src/model/hub.ts`) but nothing branches
  on it anywhere yet; it is only ever validated and stored. It may already
  have been meant to carry exactly this distinction — a locked "viewer"
  snapshot vs. a "live" one — rather than needing a new field.

Whichever shape, this changes what a published link promises a class, so it
is a product decision, not a bug fix — needs signoff before implementation.

A second, related gap: there is currently no path back from a publication to
its editable source workspace at all. `openCloudPublication` (App.tsx) loads
a document straight from the publication resource and never calls
`setHubWorkspace`, so "Save to Cloud" stays unreachable afterward — the only
option is "Save to Cloud…", which creates a brand-new, disconnected
workspace. The sole way to update the workspace a publication actually came
from is to still hold that specific workspace via "Manage cloud
workspaces…" → Open in the same browser that created it (edit tokens live
only in that browser's `localStorage`, never on the server) — nothing
connects "the NodeBook a class is looking at" back to something editable.
Whichever option above is chosen for keeping a publication in sync, it is
moot without also closing this: either `openCloudPublication` needs to
resolve and reattach `hubWorkspace` when the opening browser holds the
source workspace's edit token, or a workspace needs to expose which
publication(s) it sources (the new `published` flag already knows the fact;
it would need to carry the workspace id(s) too) so the reverse lookup does
not depend on the browser's own memory.
