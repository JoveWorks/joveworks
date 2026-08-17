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
above puts in doubt. The editor display name is **NodeBook**, leaning on
the two generic parts of the product (nodes and the notebook); the open
question is whether the repository, deployed URL, package names, and docs
should follow it. A full rename touches all of those surfaces, so do it once
after the scope question is answered, not twice.

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

**Table columns do not broadcast over multi-axis sweeps.** A table that mixes
input-axis values with results over a grid currently renders each column at its
native length: for example, a five-value chip-load input and four-value radial-
engagement input stop after five and four rows, while their calculated columns
continue across all 20 combinations. Build table results over the union of their
axes and broadcast every column onto that shared grid before the notebook
renders it. Determine the dependency from each series' existing `axes`
metadata—axis identity and order—not from its data length, since two unrelated
axes can have the same length. A column varying only along the outer axis
repeats each value across the inner axis; a column varying only along the inner
axis rolls over for every outer-axis value; scalars repeat on every row; and a
column already carrying every table axis remains unchanged. Each row should
then carry the coordinates and results for one complete design point, with no
blank axis cells.

**Axis labels do not typeset mathematical symbols consistently.** A range
node's title renders `f_z` as mathematics, but its “5 along chip load f_z”
summary shows the raw symbol. Use the same math treatment wherever an axis
label appears: input, formula, and closure-node summaries; plot axis selectors;
plot axis, legend, and facet labels; and quick-add or context-menu labels.

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

**Minimap visibility.** Put a Show/Hide minimap toggle in the ribbon's
**View** menu and let a right-click on the minimap close it. Persisting that
choice is already implemented locally; the broader settings-persistence item
below is specifically about panel widths and other remaining preferences.

**Extensive worked examples**, beyond the one belt lab sample. Waits on
breadth — more chapters, or more graphs within belt — rather than being an
editor feature on its own. Revisit once the second slice is in.

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

**Persist the remaining settings.** Number format, colour theme, and minimap
visibility already persist locally. Palette and notebook widths do not; store
them as local, per-device UI preferences rather than graph-file state.
I want all logical settings persistent.

**Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the
public repo's node library, not the private catalogue — and should be
referenceable from the notebook the way Plot nodes already are. A bigger
design question than most items here: how it's parametrized, what rendering
approach draws the diagram from port values, and which diagram to build
first. Needs its own discussion before building.

**Color palette for contours is ugly** Let me choose in settings, default to viridis. Also, the plots don't have a legend when a colourmap is active.

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
Largely implemented, but R&M catalogue needs updating.

**What about migration to newer versions?** I'm thinking notebooks and catalogues that the user made before.
