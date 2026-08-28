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

**8. A version 1 report reads "NodeBook unavailable"** — seen in the wild, not
hypothetical. `parseCompiledNotebook` refuses schema version 1, and the viewer
has no path past that, so an already-published report is a dead link.
Republishing it from the editor fixes that one report; the open question is
what the viewer should do about the ones nobody republishes.

Three leads, none needing investigation:

- **Fall through to the interactive runtime.** `activateNotebook` never reads
  the compiled payload — it fetches the source document and the pinned
  catalogues and compiles fresh, and its `published` argument is optional. So a
  version the parser cannot read could go straight to activation instead of to
  an error, and the report renders from source. It costs the reader the wait a
  slider costs today, and it only works while the Hub still holds the source.
- **Migrate version 1 forward.** The fields version 2 added are exactly the
  ones a version 1 payload has no answer for: axis natures, Check labels,
  display settings, and axis readouts in the shape marks resolve against.
  Defaulting them is not free — a logarithmic sweep would draw linear, a check
  would be named by its node id, and marks would not resolve at all — but a
  degraded report beats a dead link.
- **Say which report and what to do.** Whatever else changes, the message
  should name the version it found and tell the reader to ask the author to
  republish, rather than reading as "this link is broken".

**9. A plot axis can print its unit twice** — the platform sample's x axis
reads `platform width (mm) (mm)`: the authored axis label already carries the
unit and `PlotFigure` appends it again. Either the label loses its unit or the
figure stops appending one; the same choice governs every authored axis label.

**10. The convergence plot is unreadable at 2000 trials** — the running
failure-probability plot in the load-against-strength sample draws as a tangle
rather than a curve settling. It is a plot of a Monte Carlo running estimate
against a swept axis, and the two do not compose the way the output assumes.
Worth deciding what that output is meant to show before it is taught with.

**11. Monte Carlo receivers do not reach a published NodeBook** — a receiver
is a sink with its own node kind rather than an `output.kind`, so the NodeBook
panel presents one and the compiler skips it. A section that reads complete in
the editor arrives short. Either compile the receiver's playback as a
presentation-only figure or say why it is editor-only.

**12. v0.24.0 has no GitHub Release or stable bundle** — the release run
tagged it and pushed `main`, then failed promoting `production` and never
reached the steps that build the bundle and create the release. Re-running the
workflow would bump to 0.25.0 rather than publish this tag, so v0.24.0 needs
either a manual `gh release create` over a locally built stable bundle, or a
workflow path that publishes an existing tag without bumping. Until then the
latest downloadable bundle a school can self-host is v0.23.1.

**13. Tag v0.23.2 names a release that is on no branch** — a race between a
release run and a push to `main` left the tag (and, until it was forced back,
`production`) pointing at `95e3f43`, a bump commit that never landed. It has no
GitHub Release and no CHANGELOG entry on `main`, and every commit it covered
shipped in v0.24.0. Delete it, or accept that `git describe` and the tag list
name a version the changelog does not. The race itself is fixed by pushing the
release's three refs atomically — a change that is committed but not yet
released.

**14. Saving to a Hub fails with 400** — `The Hub could not complete this
workspace request (400)` is `hub.ts`'s catch-all for a rejected workspace
request body, and that body carries the compiled NodeBook. The contract in this
repo went to version 2 in the same session; the Hub is a separate service that
stores and serves that payload and did not. Two leads, neither needing
investigation:

- **The Hub validates against version 1** and rejects `schemaVersion: 2`
  outright. If so, nothing can be saved until the Hub carries the version 2
  contract — which makes the schema bump a two-repository change, and the
  reason to say so somewhere the next bump will be read.
- **The payload outgrew a Hub-side limit.** Version 2 added `axes`,
  `checkLabels` and `columnFigures`, and turned each axis readout from a unit
  symbol plus a coordinate list into the whole readout — axis, full series and
  unit. The editor's own 1 MiB guard throws its own message before sending, so
  a smaller limit at the far end would surface exactly as this 400.

The Hub's response body will say which; nothing here can tell them apart. Same
root as item 8 — one contract, two services, versioned in one of them.
