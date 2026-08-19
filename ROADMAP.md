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

**How bound to machine design is this, actually?** JoveWorks originates from
machine design, but nothing in the kernel is: a catalogue is dimensioned
formulas with citations, and the editor is a graph over them. Signal
processing, thermodynamics, anything with units and formulas would fit the
same machinery. The generic name is settled, as is the description of its
documents as NodeBooks; what remains open is whether to position the product
generically or keep machine design as the front door and let other domains
arrive as catalogues.

**Notebook themes, for classroom use.** A course or an instructor should be
able to put the notebook in their own visual key — school colours, a print-
friendly variant for handouts, a high-contrast variant for a projector.
Open beyond the styling itself: where a theme comes from. A file the student
imports alongside the catalogue works with no backend; auto-loading a
course's theme (so every student in a class gets it without a manual step)
does not, and so folds into the backend decision above. Ships fine as
importable-only if the backend never happens.

**A read-only NodeBook viewer.** Mobile is an intentional documentation
destination, not a reduced graph editor: wiring, direct node editing, and the
three-column workspace require a desktop-sized viewport. A later viewer could
make a finished NodeBook pleasant to read on a phone — sections, prose,
values, checks, tables, and plots — without exposing graph editing controls or
formula expressions. Start with published examples and a portable, safe
report artefact rather than trying to open another device's browser storage.
Its source format, sharing route, and whether it remains file-based or needs
the separately undecided backend are product decisions to make before work
begins.

## Editor backlog

**1. Plot node's remaining options.** A first slice landed: three axis slots
(`x`, `series`, `facet`), auto-assigned from whatever axes the wired value
varies along. Still open: marking specific values on a curve, and a fourth
axis (facet-row × facet-col) if that turns out to be needed.
Instead of setting options on the node, we can set them in the notebook and
store it in the node. The same goes for the table output. More complex settings should be set in the notebook. Number of decimal digits per column, highlighted values, drag and drop columns to reorder (and remove that option from the node)

**2. A range's two bounds showing different units** — `10 mm ... 1 m`, each
bound keeping its own unit rather than both sharing one. Two ways to build
it were weighed: editor-only display state (doesn't survive save/reload) or
a schema change to carry a unit per bound (persists properly, but widens
`ValueSpec` and ripples into the kernel and everywhere else that assumes a
range has one unit). Neither was picked; parked here rather than decided
under scope pressure.

**3. Minimap visibility.** Put a Show/Hide minimap toggle in the ribbon's
**View** menu and let a right-click on the minimap close it. Persisting that
choice is already implemented locally; the broader settings-persistence item
below is specifically about panel widths and other remaining preferences.

**4. Extensive worked examples**, beyond the one belt lab sample. Waits on
breadth — more chapters, or more graphs within belt — rather than being an
editor feature on its own. Revisit once the second slice is in.

**5. Spectrum-editing UI.** A load spectrum (a hand-typed collection consumed
whole by an aggregation, not swept) exists in the schema, but nothing in the
editor can create or edit one yet. Surfaced while adding the palette's Input
shortcuts — left out of that pass on purpose.

**6. `list` vs `spectrum` naming.** Both are a hand-typed collection of values,
but `list` sweeps (one point per value) and `spectrum` is consumed whole,
never swept — the names don't say which is which. Leaning toward renaming
`spectrum` instead of `list`, since `spectrum` is the outlier in the
`ValueSpec` family (every other kind sweeps) — but not urgent.

**7. Gear calculations and their effect on shafts.** Especially angled gears,
which complicate calculations via the combination of normal and bending
loads. Catalogue content, for when that chapter is designed — not an editor
question.

**8. Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the
public repo's node library, not the private catalogue — and should be
referenceable from the notebook the way Plot nodes already are. A bigger
design question than most items here: how it's parametrized, what rendering
approach draws the diagram from port values, and which diagram to build
first. Needs its own discussion before building.

**9. Standard-deviation node.** Fits and tolerance calculations need the standard
deviation that underlies a tolerance. Add it as a public base node, with its
input shape and its relationship to spectra settled when the ISO fit/table
slice is designed; there is no node for it today.

**10. Vertical spacing does not take actual node height into account**
Widths are constant, but heights vary per node. The spacing should add same width space between bottom and top of each node, based on the total height from top of top node to bottom of bottom node. Also spacing should take into account rows of nodes and collumns of nodes for vertical and horizontal spacing respectively. There should be some error margin where nodes are considered aligned, and they will be aligned exactly.
Question: How should we integrate this spacing in grid-snap mode?
Implemented on `feat/canvas-layout-interaction-polish` — auto-arrange now uses
each node's real measured height instead of a nominal constant. Awaiting
review before merge.
Feedback: Does this follow collapsed or expanded height? It should be collapsed (unless pinned)

**11. Notebook export to Markdown**, for pasting a finished graph into an
external site. Checked against `~/source/website`'s Astro content
collections: entries are Markdown/MDX with frontmatter (`title`, `subtitle`,
`summary`, `date`, `tags`) under `src/content/{articles,projects,...}` — an
export matching that shape drops straight in. Same rule as any other export:
citations and values by default, expressions only behind the explicit
toggle. Gate it behind a hidden console command for now rather than a UI
button — personal-use export, not a student-facing feature yet.

**12. Tutorial guides** The tutorial seems to break when the viewport was moved/zoomed. It should check in each step if the target is visible, and adapt the viewport. Actually, maybe zooming and moving should just be part of the steps to clarify the nodes and controls?

**13. Press fit example** Update it to use ISO fit LUT based on categorical input. I also want to have a new section that showcases plotting and sweep functionality.

**16. Nodes expose preferred display units.** Dimensions do not have one global
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

**17. What about migration to newer versions?** I'm thinking notebooks and
catalogues that the user made before.

**19. Bug: Text can be clipped when the textbox is full** Text should be
wrapped so it is always fully visible. Occurs in node titles (in node and in
notebook). Captions in nodes (not in notebooks)
Implemented on `feat/canvas-layout-interaction-polish`. Awaiting review before merge.
Feedback: Now the alignment of the check node is not correct. Check label sticks out above the line. Rest seems ok.

**20. Change: Range input shows `range` as node id** instead of `input`.

**21. Bug: Table column** Input has no entries. Is this the look up table being not finished?

**22. Bug: Units are enforced too soon when dragging an input port with quick
add** Input nodes are not addable because they do not have a unit yet. We can
enforce their unit though, so they should be addable.

**23. Change: Switching from list to range input should take min and max as bounds**.

**24. Bug: Switching from m to mm is not possible after switching from mm to m.**
In the output port unit dropdown in the multiply node. Maybe in others too.

**25. Change: When the unit is implied on data entry, the unit should be
explicitly added** e.g. when changing the threshold value

**26. Feature: We need more array nodes.** Sum and product are in. We need length, mean, median, sdev, etc. Combine them in a catalogue, what should we name this?

**27. Feature: Can we share private catalogues with a password?** Maybe encrypt them and share public key?

**28. Bug: Opening an example link on mobile does not redirect to the mobile landing page**. It just shows a blank screen.

**29. Change: Should we use compiled notebooks to share in the notebook viewer?** To save mobile processing power, they can't edit anyway.

## Suggested backlog session groupings

Numbers refer to the Editor backlog list above. Grouped by shared code area,
so one Claude/Codex session can work a cluster without two sessions
colliding on the same files.

**A. Unit handling & display units.** #2, #16, #24, #25, #22 — all sit in the
kernel's unit/dimension conversion and the port-unit dropdown UI.

**B. Input-node behaviour & naming.** #23, #20, #6, #5 — input-node schema
and UI; settle the `list`/`spectrum` naming (#6) before building the
spectrum editor (#5).

**D. Plot/Table node output config.** #1, #21 — #1 explicitly covers both
Plot and Table output settings, and #21's lookup-table bug is likely the
same table code.

**E. Examples & tutorial content.** #12, #13, with #4 riding along if there's
room — #13 depends on the ISO fit LUT work, so schedule after B lands.

**F. Needs a product/design decision first — don't bundle.** #7, #8, #9, #11, #17. Each waits on a decision (catalogue design, node-viz approach, ISO fit/table slice, export scope, or migration strategy) before it's
session-ready. #27's product questions (seed story, receiver visual,
playback transport, trial-count control) are now settled — see #27 — but it
still needs a short design pass on how the sample cap interacts with the
generator's eager evaluation model before it's session-ready, so it isn't
folded into A–E yet either.

Suggested order: A and B first (independent of each other, could run as
parallel sessions), then C and D (also independent of A/B and each other),
then E once B has landed. Pull an item from F only after deciding its open
question with Thomas.
