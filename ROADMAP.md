# Roadmap

What's actually open, in one place: the two content-sign-off tasks that need
Roloff & Matek in hand, the next milestone's build sequence, and the backlog
of deferred or undecided editor ideas. `docs/PLAN.md` and `docs/UX-SPEC.md`
carry the history behind this — what was decided and why, and what the hand
passes over the editor found and fixed — but neither is where you look for
what's still open. This is.

## Content sign-off

Two tasks, neither gating a build step — they gate individual formulas
through the `status`/quarantine mechanism, and both need the book, so both
are Thomas's.

**The defect table.** Three formulas the dimension checker refused during
belt's extraction, each quarantined in the catalogue with its evidence and a
proposed correction. The first two need R&M to confirm; the third only needs
confirmation, since it already has two independent witnesses.

| Formula | What the check refuses | Proposed reading |
| --- | --- | --- |
| 16.31 | Produces a velocity where a width is declared | The specific *power* symbol — declared in the source's symbol dict and used by no method — in place of the specific torque. 16.32 is the torque twin and is sound |
| 16.34 | Produces a length where a force is declared | The unit tag, not the expression: the belt-type factor is tagged `[]` and must carry force per unit width. The docstring also writes it as an exponent where the code multiplies, and an exponent is dimensionless under any reading |
| 16.36B | Produces an area where a length is declared | A sum, not a product. Its own docstring writes a sum, and its sibling 16.36C sums the same two quantities |

**The unit-tag table.** About 30 tags across the corpus couldn't be
machine-parsed; most have a plausible reading below, needing confirmation
rather than reconstruction. The remaining ~500 tags normalise mechanically
and need no sign-off.

| Tag | Proposed reading |
| --- | --- |
| `[1E6rotatons]`, `[1e6revolutions]` | Millions of revolutions — bearing life L₁₀, ISO 281. The typo'd spelling and the case-variant duplicate are consistent with one quantity typed twice |
| `[E-6m]` | Micrometres — surface roughness, or a fit/tolerance deviation |
| `[__O]`, `[__o]` | Degrees; `°` mangled by an encoding round-trip |

**Belt's wrap angle** `β₁`/`β_k` is tagged `[]`. The tag parses, so it isn't
junk in the sense above — it reads as *a pure number* where the quantity is
plainly an angle, which is what quarantines `rm.16.24A`/`rm.16.24B` and costs
the twelfth belt golden. The reading to confirm is `[°]`; confirming it
doesn't by itself release the two records, since `sin`/`cos`/`tan` accepting
a dimensionless argument (`packages/kernel/src/dimensions.ts`) would also
need loosening for `acos`'s *return* — two other belt formulas consume the
same angle as a pure number. Worth taking both together, and worth a golden.

## Open product questions

Not editor features — decisions that shape scope before any building starts.

**A backend.** Server-hosted catalogues (distribute R&M content behind auth
instead of a file through the LMS) and saving graphs server-side (accounts, a
saved-graph library, shareable links) would be genuinely useful — especially
for a collaborative classroom setting, sharing course catalogues and worked
examples server-side rather than per-student files. But "client-side web app,
no backend" is a stated architecture convention here, not an oversight —
adding one is a decision on the order of the wrap-angle unit question, not a
backlog line. Left open until it's discussed and decided explicitly; nothing
below assumes it's happening.

**How bound to machine design is this, actually?** The tool originates from
machine design, but nothing in the kernel is: a catalogue is dimensioned
formulas with citations, and the editor is a graph over them. Signal
processing, thermodynamics, anything with units and formulas would fit the
same machinery. Open question whether to *position* it generically — which
touches the name, the sample content, the docs, and how the catalogue
boundary is explained — or keep machine design as the front door and let
other domains arrive as catalogues. Not a build task; decide before the
naming question below is settled.

**The full name.** `machine-design-studio` presumes the domain the question
above puts in doubt. The editor display name is now **NodeBooks**, leaning on
the two generic parts of the product (nodes and the notebook); the open
question is whether the repository, deployed URL, package names, and docs
should follow it. A full rename touches all of those surfaces, so do it once
after the scope question is answered, not twice.

**Display name: NodeBooks.** The editor header should call the product
**NodeBooks** now, in the right-hand header group before its GitHub icon and
version. This is a product-facing label, not yet a decision to rename the
repository, package names, or deployed URL; take that larger rename together
with the scope question above.

**Notebook themes, for classroom use.** A course or an instructor should be
able to put the notebook in their own visual key — school colours, a print-
friendly variant for handouts, a high-contrast variant for a projector.
Open beyond the styling itself: where a theme comes from. A file the student
imports alongside the catalogue works with no backend; auto-loading a
course's theme (so every student in a class gets it without a manual step)
does not, and so folds into the backend decision above. Ships fine as
importable-only if the backend never happens.

## Editor backlog

Deferred or explicitly parked features from the hand-testing passes
(`docs/UX-SPEC.md`) and later sessions — not milestone-1 scope, not
necessarily milestone-2 either.

**Plot node's remaining options.** A first slice landed: three axis slots
(`x`, `series`, `facet`), auto-assigned from whatever axes the wired value
varies along. Still open: marking specific values on a curve, and a fourth
axis (facet-row × facet-col) if that turns out to be needed.

**A range's two bounds showing different units** — `10 mm ... 1 m`, each
bound keeping its own unit rather than both sharing one. Two ways to build
it were weighed: editor-only display state (doesn't survive save/reload) or
a schema change to carry a unit per bound (persists properly, but widens
`ValueSpec` and ripples into the kernel and everywhere else that assumes a
range has one unit). Neither was picked; parked here rather than decided
under scope pressure.

**Waypoint/pack/unpack — built, but the hand pass found real gaps.** The
three routing node kinds landed (`waypoint`, `pack`, `unpack`; splice-on-
delete for all three), on the design that a `waypoint` is one shared
channel — several wires fan in, but only if they all share one dimension,
merged into a single output — while `pack`/`unpack` carries several
independently-dimensioned wires bundled into one edge. Thomas's first pass
in the browser (2026-08-16) found this isn't what's needed:

- **Waypoint should be the multiple-independent-channels design after
  all.** The actual want is several `in_n → out_n` pairs on one waypoint,
  each its own ghost slot, each its own dimension, straight through with no
  merging — purely to bend/tidy wires on the canvas without touching
  values. Today's single shared-dimension `in`/`out` pair doesn't cover
  the common case (rerouting several unrelated wires through one point).
  Revisit the waypoint design itself before touching pack/unpack, which
  already covers a *different* need (actually bundling into one edge).
- **Pack throws a waypoint error in ordinary use.** Reported: wiring
  differently-dimensioned values into a `pack` node produces
  `waypoint.in: every wire into a waypoint must share one dimension: power
  (N·mm/s) and dimensionless (—) are different dimensions` — a message and
  node id that belong to `waypoint`'s resolution branch, not `pack`'s.
  Unconfirmed root cause: `pack.ts`'s current code path looked correct on
  read-through (`packages/kernel/src/graph.ts`'s `pack` branch, separate
  from `waypoint`'s), so this needs to be reproduced and traced rather than
  assumed — possibly a mix-up between the two node kinds while testing
  rather than a `pack`-specific bug, but the exact error text is real and
  worth chasing down first.

All three are quarantined for now (`packages/kernel/src/bundle.ts`'s
`ROUTING_KINDS`/`ROUTING_QUARANTINE_REASON`, gated in `graph.ts`'s
`resolveGraph`, the one choke point every evaluation path runs through) —
same mechanism a quarantined formula uses: still listed in the palette,
marked and explained rather than hidden, still lands on the canvas, but
`resolveGraph` refuses it outright instead of computing a wrong or
confusing result. Lift the gate once the waypoint redesign above lands and
the pack error is traced.

**Catalogue authoring should be easier for contributors.** Today a
catalogue is authored by running the extraction script (`tools/extract/`,
R&M content only) or hand-writing JSON against the schema — a real authoring
UI was deferred out of milestone 1. Unscoped for now: could mean better
docs for hand-writing JSON, a schema validator with useful errors, a
scaffold CLI, or eventually the authoring UI itself. Revisit later; keep in
mind rather than build toward yet.

**Why is the Math catalogue a JSON file?** Checked before writing this down:
it isn't hand-written JSON. `packages/nodes/src/operations.ts` authors the
operations as TypeScript `Formula` records, `catalogue.ts` serializes them
(`baseCatalogueJson`), and `packages/editor/src/model/catalogues.ts` loads
that string through the ordinary `loadCatalogue` path — deliberately, so a
base node and a belt formula are the same kind of object to the palette, the
graph and the kernel. The open part is whether that round trip is still
worth its cost now that the palette special-cases the base catalogue by id
anyway (`Palette.tsx`'s `isMath`), or whether the operations should just be
a library the kernel knows about directly.

**General nodes need a general catalogue.** `compare` and `closure` (the
student-authored equation node) are node kinds in the schema
(`packages/schema/src/document.ts`), not catalogue entries — so they arrive
in the palette by a different route than every other node, and there's no
place to put the next one. They belong in a general catalogue alongside
Math: domain-free, unrestricted, citation-free. Decide together with the
question above, since both are really "what is the base library, and how
does it reach the palette".

**A machining catalogue** — machining power, chip load, and the rest of the
cutting-parameter set. Content, not editor work; the nearest existing model
is `basic-mechanics.json`, unrestricted and public, since none of this is
R&M material.

**User-authored equations should be saveable to the palette.** Today a
`closure` node's expression lives in the graph that contains it — write the
same equation in the next notebook and you type it again. The want: save it
as a reusable node, have it appear in the palette, and remove it from the
palette again when it stops being useful. Design questions before building:
where saved nodes live (a user catalogue, or a distinct store), how they're
identified and versioned given a catalogue formula carries id/version/hash,
and what happens to a graph referencing a node the user later deletes —
which is the quarantine question again, not a new one.

**Export and import user-authored nodes**, one node or the whole list, so a
set can be handed to a colleague or a class. Same rule as any other export:
the never-embed boundary makes this straightforward — user-authored content
is the student's own, so its expression travels with it, unlike an R&M
formula. Naturally follows the palette-saving item above and shares its
storage decision.

**Catalogue-item context menu and favourites.** Right-clicking an item in a
catalogue should open a small menu with **Insert**, **Help**, and **Add to
favourites**. Favourites form a catalogue section at the top of the palette;
favouriting duplicates the entry there and leaves it in its original catalogue.
Open details: whether favourites persist locally (the likely expectation), and
what **Help** resolves to — formula metadata in the app, documentation, or
both. This belongs with user catalogues, rather than being a palette-only
preference, because user-authored nodes should be favouritable in exactly the
same way.

**Selection actions and a selection context menu.** A multi-node selection
needs right-click actions, initially **align** and **arrange**. Alignment is a
well-bounded set of canvas commands (left/right/top/bottom/centre); arrange
needs its own small design before implementation: preserve the user's graph
reading order and group frames, avoid crossing wires where possible, and do
not let an automatic layout unexpectedly rewrite a carefully placed notebook.
This extends the existing selection behavior (move and delete together) rather
than introducing another selection model.

**Viewport controls and keyboard-reference overlay.** Add a faint control
overlay at the top left of the viewport that teaches the canvas's direct
manipulation: Shift-drag marquee selection and Ctrl-click selection, plus the
core shortcuts. The expected set is Ctrl+A, Z, Y, C, V, and D; audit each
against the current editor before promising it in the overlay, then implement
or intentionally omit the gaps. The existing Ctrl+A backlog item folds into
this rather than standing alone.

**Minimap visibility.** Put a Show/Hide minimap toggle in the ribbon's
**View** menu and let a right-click on the minimap close it. Persisting that
choice is already implemented locally; the broader settings-persistence item
below is specifically about panel widths and other remaining preferences.

**Extensive worked examples**, beyond the one belt lab sample. Waits on
breadth — more chapters, or more graphs within belt — rather than being an
editor feature on its own. Revisit once the second slice is in.

**Documentation for teachers** — how to author a catalogue formula (today
that path is the extraction script, not an editor UI), how
`appliesWhen`/quarantine/status work, what a schema version bump means for a
course's in-flight graphs. Distinct audience from the student tutorial
above: instructor-facing, about the tool's authoring and versioning model.

**What should a multi-node selection do?** "Group into new section" now
frames only the current selection, or spawns an empty section at an open
location with none selected (`groupIntoSection`, `model/document.ts`). Open
beyond that: what else, if anything, should a selection enable — move
together (already true, independent React Flow nodes), delete together
(already true, Backspace/Delete), anything else? The first additional actions
are now defined above: right-click offers alignment and arrange.

**Spectrum-editing UI.** A load spectrum (a hand-typed collection consumed
whole by an aggregation, not swept) exists in the schema, but nothing in the
editor can create or edit one yet. Surfaced while adding the palette's Input
shortcuts — left out of that pass on purpose.

**`list` vs `spectrum` naming.** Both are a hand-typed collection of values,
but `list` sweeps (one point per value) and `spectrum` is consumed whole,
never swept — the names don't say which is which. Leaning toward renaming
`spectrum` instead of `list`, since `spectrum` is the outlier in the
`ValueSpec` family (every other kind sweeps) — but not urgent.

**Gear calculations and their effect on shafts.** Especially angled gears,
which complicate calculations via the combination of normal and bending
loads. Catalogue content, for when that chapter is designed — not an editor
question.

**Quick Add should offer every compatible node kind.** Today it offers
catalogue formulas, Input, Compare, and output nodes, but not Closure or the
routing nodes. The rule: when a wire is dropped onto empty canvas, offer every
node kind that can validly complete that wire and hide kinds with no compatible
port. This is an extension of the existing connection-aware filter, not a
second palette.

**Persist the remaining settings.** Number format, colour theme, and minimap
visibility already persist locally. Palette and notebook widths do not; store
them as local, per-device UI preferences rather than graph-file state.

**Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the
public repo's node library, not the private catalogue — and should be
referenceable from the notebook the way Plot nodes already are. A bigger
design question than most items here: how it's parametrized, what rendering
approach draws the diagram from port values, and which diagram to build
first. Needs its own discussion before building.

**Notebook export to Markdown**, for pasting a finished graph into an
external site. Checked against `~/source/website`'s Astro content
collections: entries are Markdown/MDX with frontmatter (`title`, `subtitle`,
`summary`, `date`, `tags`) under `src/content/{articles,projects,...}` — an
export matching that shape drops straight in. Same rule as any other export:
citations and values by default, expressions only behind the explicit
toggle. Gate it behind a hidden console command for now rather than a UI
button — personal-use export, not a student-facing feature yet.

**Plausible analytics during alpha.** A thin adapter — mirrors the existing
file-I/O adapter pattern — with a no-op and a Plausible-backed
implementation behind one flag, so removing it before public launch is
deleting a script tag and flipping the flag, not a codebase search. What to
log beyond default pageviews (aggregate, cookieless, no PII either way) —
e.g. feature-usage events like "sweep run" or "plot created" — is still
open; whatever set gets chosen should be documented in one place so "what
does this log" has a single answer.

**Fuzzy find in the catalogue palette.** The reusable fuzzy-search helper
already powers Quick Add. Add palette search over node/formula name, symbol,
description, and citation; with an empty query the palette retains its normal
catalogue grouping. This is UI state and rendering work, not a new search
mechanism.

**A wired optional/default port overrides its typed default.** A threshold
with a typed default currently blocks a wire of another unit even while its
main `value` port is unconnected. A connected wire must establish the port's
current unit and override the default; once `value` is connected, the two
ports must agree. Removing the wire restores the authored default and its
unit. This is connection/type resolution, not just an editor display change.

**Autosave restore notification appears twice.** Reproduced behavior: after
restoring an autosave, two notifications appear at once. Trace the duplicate
creation path and retain one clear restore notice.

**Header branding and GitHub link.** The header already has an issue link in
its feedback text. Add a GitHub repository icon to the right of the NodeBooks
title and before the version, in the right-hand header group.

**Docs and editor titles.** Nodebooks docs and NodeBooks respectively. Also add a simple favicon.

**Section frame hover accent is too subtle.** Increase border width too.

**Nodes expose preferred display units.** Dimensions do not have one global
presentation unit: values evaluate canonically, while each exposed node port
can state the unit it prefers to show and display boundaries convert to it. A
frequency port should prefer `Hz` over bare `s⁻¹`; a general pressure port can
prefer `Pa`; and a machine-design stress port can legitimately prefer
`N/mm²`. The preference is a node/port default, not a dimension-wide rewrite:
other nodes remain free to choose the unit that fits their domain, and output
nodes retain the user's existing display-unit override. This replaces global
SI normalisation, which would make the right answer unreadable in the wrong
domain. **First implementation:** generic and derived frequency ports now
default to `Hz`; fixed catalogue ports already use their declared display unit,
and the belt sample's frequency output now chooses `Hz` explicitly.

**Use parentheses around units in labels.** Whenever a parameter and its unit
form one interface label, render `parameter (unit)`, including input and
output ports; omit parentheses if no unit is shown. Implement this through
shared presentation components/styles, not node-by-node patches.

**Typeset mathematical notation in node titles.** KaTeX already renders
equations. Preserve raw title text in documents and render TeX-like notation
such as `c_2` or `\\sigma` for display, with a plain-text fallback. Add a
setting to opt out of title math rendering. Do not silently rewrite or
normalise titles during validation; ordinary prose must remain safe to enter
and round-trip unchanged.

## Commit conventions and release tooling

Done. `v0.1.0` is cut — first tagged release, marked pre-release on GitHub
(project is alpha). `.github/workflows/release.yml` is manual-trigger only
(`workflow_dispatch`, optional patch/minor/major override, defaults to
pre-release) — no auto-publish on push, a release is still something Thomas
decides to cut. It builds, tests, then runs `pnpm release`
(`commit-and-tag-version`, config in `.versionrc.json`), pushes the
version-bump commit and tag, fast-forwards `production` to that same tagged
commit, and cuts a GitHub Release from the new `CHANGELOG.md` section. Netlify
must use `production` as its configured production branch; the action creates
that branch on the first release. `main` remains the development branch.

`.github/workflows/ci.yml` (build+test on every push/PR to `main`) exists
but its triggers are disabled — solo work already runs build/test locally,
and `release.yml` has its own gate before it'll cut a release, so the
per-push run wasn't catching anything extra. Left as `workflow_dispatch` so
it can be run by hand or have its triggers restored later.

The running app now shows its build's version in the ribbon
(`packages/editor/vite.config.ts` injects it from the root `package.json`
at build time), flagged `alpha ·` while the major version is `0` — the live
Netlify app therefore identifies the exact version whose tagged commit was
promoted to `production`.

Commit messages move to Conventional Commits — the rule and its allowed
types/scopes are codified in CLAUDE.md's Conventions section, not
duplicated here. History before this point isn't in that format, so the
first changelog's coverage of older commits will be thin; that's expected,
not a bug in the tooling.

**No commit-msg hook enforces the format, and none is planned.** A
misformatted commit doesn't error — it just doesn't get a CHANGELOG section,
or lands in the wrong one, at release time. Decided: that's an acceptable
outcome for solo work, not a gap to close with `commitlint`/`husky`.
