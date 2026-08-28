# Roadmap

## Editor backlog

**8. Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the public
repo's node library and should be referenceable from the notebook.

**17. What about migration to newer versions?** Documents have a migration path.
Catalogues still have no migration path and refuse an unknown schema version.

**33. Change: What is the {table XX} notation in RM catalogue?** Decide how to
integrate tables as catalogue lookup items.

**35. Change: equation R&M 16.3 uses betahat_1** The hat is currently not
present as a caret on the letter. Out of scope for this repo — R&M catalogue
content lives in the private `machine-design-catalogue` repository.

**36. Target-driven sweep range suggestion** — setting up a study currently
means guessing a range before you know where the answer sits. Given a target on
an output, probe forwards and widen until the target is straddled, then propose
that range for the input. Forward-only and deterministic; no solver.

**37. Interpolated threshold-crossing readout** — on an already-evaluated
monotone slice, report the crossing between adjacent samples ("σ = 200 MPa at
d ≈ 37.4 mm") and mark it as interpolated, the way `candidates.ts` snaps to the
nearest sample and says so. A figure-layer reading off a computed curve, not
kernel behaviour — see the solver reasoning in [OVERVIEW.md](OVERVIEW.md).

**39. Decide the published viewer's weight** — drawing a published NodeBook
through the NodeBook's own components costs what a real figure costs:
Observable Plot and its d3 modules, KaTeX for typeset titles, and the kernel's
indexing and mark-matching helpers. The viewer bundle is 336 KiB gzipped
against a budget that was 250 KiB when it drew its own SVG, and the budget was
raised to 360 KiB rather than the figures being given up. If 250 KiB is worth
defending, the way back is lazy-loading `present/` behind the page shell: the
masthead and prose paint immediately and the figures stream in. Decide which,
then either lower `VIEWER_BUDGET` again or write down that this is the price.

**40. A published report from before the version bump is refused** — the
compiled NodeBook contract is version 2 and `parseCompiledNotebook` rejects
version 1 rather than half-reading it. Anything already saved to a Hub needs
republishing from its source document. Check whether any published or shared
material is actually out there before this reaches students.

**41. A plot axis can print its unit twice** — the platform sample's x axis
reads `platform width (mm) (mm)`: the authored axis label already carries the
unit and `PlotFigure` appends it again. Either the label loses its unit or the
figure stops appending one; the same choice governs every authored axis label.

**42. The convergence plot is unreadable at 2000 trials** — the running
failure-probability plot in the load-against-strength sample draws as a tangle
rather than a curve settling. It is a plot of a Monte Carlo running estimate
against a swept axis, and the two do not compose the way the output assumes.
Worth deciding what that output is meant to show before it is taught with.

**43. Monte Carlo receivers do not reach a published NodeBook** — a receiver
is a sink with its own node kind rather than an `output.kind`, so the NodeBook
panel presents one and the compiler skips it. A section that reads complete in
the editor arrives short. Either compile the receiver's playback as a
presentation-only figure or say why it is editor-only.
