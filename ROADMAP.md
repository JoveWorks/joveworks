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
varies along. The table half of "complex settings live in the notebook, not
the node panel" has landed too: a table's column order, per-column decimal
figures and marked rows are now edited directly in the rendered notebook
table (drag a header to reorder, a small figures field per column, click a
row to mark it) and only stored on the node (`TableOutput.figures`,
`TableOutput.marks`); the node panel keeps just rename and remove. Marks are
row-index based for now, not axis-value based, so a sweep that changes shape
can leave a mark pointing at the wrong row — an accepted gap until this is
unified with the plot's own version below.

Still open, on the plot side: marking specific values on a curve (the same
"mark a value" affordance as the table's, extended to a curve — and the
natural point to revisit index- vs. axis-value-based marks so both share one
representation), a fourth axis (facet-row × facet-col) if that turns out to
be needed, and a settable plot height. Plot width was raised too but folded
into the larger "whole notebook redesign" and postponed rather than picked up
here.

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

**11. Notebook export to Markdown**, for pasting a finished graph into an
external site. Checked against `~/source/website`'s Astro content
collections: entries are Markdown/MDX with frontmatter (`title`, `subtitle`,
`summary`, `date`, `tags`) under `src/content/{articles,projects,...}` — an
export matching that shape drops straight in. Same rule as any other export:
citations and values by default, expressions only behind the explicit
toggle. Gate it behind a hidden console command for now rather than a UI
button — personal-use export, not a student-facing feature yet.

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

**29. Bug: Opening an example link on mobile does not redirect to the mobile landing page**. It just shows a blank screen.
Fixed: `?example=<id>` unconditionally auto-started the example tour
(`App.tsx`'s `tutorial` state), regardless of viewport width. On mobile,
`.desktop-editor` — the tour's overlay included — is CSS-hidden in favour of
`MobileLanding`, so the spotlighted caption never actually lays out:
`getBoundingClientRect()` on a `display:none` ancestor always reads zero,
so `Tutorial.tsx`'s self-correction effect kept computing the same non-zero
nudge forever. Before the correction cap added for item 12's crash, that was
an unbounded `setState` loop — "Maximum update depth exceeded" — and with no
error boundary anywhere in the app, it took down the whole React root,
`MobileLanding` included, which is the blank screen. The cap now bounds it to
20 wasted renders instead of a crash, but the tour still had no reason to run
behind a page nobody can see, so `tutorial` now starts `undefined` outright
on a mobile-width viewport (same `(max-width: 899px)` check `MobileLanding`
itself uses) — no wasted 100ms polling interval, no correction effect to
trip. Awaiting a look in the browser to confirm.

**30. Change: Should we use compiled notebooks to share in the notebook viewer?** To save mobile processing power, they can't edit anyway.

**32. Feature: We need a tool to quickly author catalogues and/or formulas** Import and export to json catalogue. It should be as straightforward as possible for authors. It can be a separate app like the /docs app.
Built as `packages/catalogue-author`, a companion app alongside `packages/docs-site`, served at `/author/` next to `/docs/`. A catalogue-metadata form plus a form per formula (ports, expression, description, status, citation, etc.); import/export is the plain-JSON round trip `docs/authoring-catalogues.md` already documents by hand, now with live, aggregate validation against the real `@joveworks/schema` parser and `@joveworks/kernel`'s dimension check — every problem surfaces at once, not just the first, and export is disabled until the catalogue is clean. Lookup-table editing, cross-catalogue id checking, and the password-locking workflow stay out of scope; see `docs/file-guide.md`'s entry for the package. Awaiting a look in the browser to confirm.

**33. Change: What is the {table XX} notation in RM catalogue?** E.g. in eq 16.1. There must be a better way to integrate the tables in the catalogue. Actually, since we will have a LUT node, can we just have the table as catalogue items?

**35. Change: equation R&M 16.3 uses betahat_1** The hat is currently not present as a caret on the letter
Out of scope for this repo — R&M catalogue content (equation 16.3) lives in
the private `machine-design-catalogue` repository, not here.

**41. Bug: Fuzzy finding in quick add is still very slow**
Root cause found: `compatiblePort` — a document clone plus a full `resolveGraph`/`canConnect` through the kernel — was run on *every* fuzzy match, not just the ones the menu shows. A common query matches most of the catalogue, so each keystroke paid for hundreds of full graph resolutions. Fixed in `QuickAddMenu.tsx` by capping to the top `MAX_FORMULA_RESULTS` (30, matching what was already the render slice) before running the kernel check, not after. Awaiting a look in the browser to confirm it feels fast now.

**46. Bug: Feasibility heatmap's axis title, tick labels, and ticks overlap.** The non-faceted branch of `FeasibilityFigure.tsx` fixes its plot width at a flat `360` (`packages/editor/src/notebook/FeasibilityFigure.tsx:78`) regardless of how many x-axis ticks the swept range produces or how long their coordinate labels are — unlike the faceted branch, already fixed to size each facet panel from its own tick count (`perFacetWidth`, line 76, commit 897e2f6). A two-input sweep with many points and long decimal coordinates (e.g. `66.667`, `73.333`, …) crowds ten-plus tick labels into a ~300px plot area, so they collide with each other and with the x-axis title sitting below them. Same class of bug as the one already fixed for facets, just not extended to the single-panel case — likely wants the same tick-count-aware width logic.

Separately, worth having but a distinct piece of work: interpolating/smoothing between a Feasibility node's sampled grid cells, since each cell is currently solved independently — the feasibility branch ANDs every referenced Check node's verdict cell-by-cell (`packages/kernel/src/evaluate.ts:926-980`) with no interpolation, so a true pass/fail boundary that doesn't line up with the sampled grid can show as scattered single-cell islands rather than a contiguous region. Should be an opt-in per-node setting rather than a default, the same pattern as item 1's per-node display settings (table figures/marks stored on the node, not forced) — smoothing implies a claim about what happens between samples that not every check can back up, so the node author should choose it rather than have it assumed.
