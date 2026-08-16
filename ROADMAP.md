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

## Milestone 2 — breadth

Milestone 1 was a vertical slice, one chapter end to end. Milestone 2 is
breadth:

1. **DEFECTS.md** across the whole corpus. Runs alongside migration, not
   ahead of it — flagged formulas are quarantined by `status`, not blocked
   on being found first.
2. **Extract the remaining chapters.** Generalise the per-chapter script only
   if their number justifies it. A second slice should be chosen to exercise
   tables and categorical ports, which belt does not touch — `C2_Tolerance`
   or the press-fit material in `C12` are the candidates. The kernel raises
   on both today rather than half-supporting them.
3. **Full notebook view.** Group frames already carry its section structure,
   reserved in the schema since the schema package was built.

Ask Thomas which chunk to start before picking one; nothing here decides it
for you.

## Editor backlog

Deferred or explicitly parked features from the hand-testing passes
(`docs/UX-SPEC.md`) and later sessions — not milestone-1 scope, not
necessarily milestone-2 either.

**Plot node's remaining options.** A first slice landed: three axis slots
(`x`, `series`, `facet`), auto-assigned from whatever axes the wired value
varies along. Still open: marking specific values on a curve, and a fourth
axis (facet-row × facet-col) if that turns out to be needed.

**A plot's threshold as an optional port**, overriding the hardcoded value —
today `output.threshold` is a quantity typed on the node; this would let a
wired value override it, so the threshold could come from upstream (a
formula's own limit, a swept comparison) instead of only ever being retyped
by hand. Needs its own discussion first: this is the first case of an
optional port that *overrides* an authored value rather than just filling
one in, and nothing in the port model distinguishes those two cases yet.

**A range's two bounds showing different units** — `10 mm ... 1 m`, each
bound keeping its own unit rather than both sharing one. Two ways to build
it were weighed: editor-only display state (doesn't survive save/reload) or
a schema change to carry a unit per bound (persists properly, but widens
`ValueSpec` and ripples into the kernel and everywhere else that assumes a
range has one unit). Neither was picked; parked here rather than decided
under scope pressure.

**A waypoint node**, to bundle and redirect edges — a passive routing point
on the canvas: straight connections in and out, and an always-available open
slot to join another wire, the same ghost-port interaction `minimum` already
has. Deleting one does not break what passed through it — the nodes on
either side end up connected by a single direct edge, as if the waypoint had
never been there. Needs a discussion before building: is it one channel per
waypoint, or genuinely multiple independent pass-through channels sharing
one waypoint, each its own source/destination pair? That is a different kind
of node than anything in the schema today, and the delete-time splice has no
precedent to build from.

**A short first-load tutorial for students** — the app opens on the pad
pressure sample today, which demonstrates a sweep and a plot but explains
nothing. A guided first run — what a wire means, how to turn an input into a
range, where the notebook comes from — would replace "here is a sample
graph, figure it out" with an actual first five minutes. Mechanism is
decided: a scripted overlay walkthrough, not a static page (that's for a
future docs companion app), reachable again afterwards from the ribbon's
existing help menu rather than shown once and gone.

**Autosave.** Save/load already exists (File menu → `Open…`/`Save`,
`io/files.ts`) as an explicit action; what's missing is recovery from an
accidental tab close. A periodic snapshot of the current document to
localStorage/IndexedDB, with a "restore unsaved work?" prompt on next load —
a safety net alongside the explicit save, not a replacement for it.

**An Equation output node**, wired to a single upstream formula node's
output port, that renders that node's `Formula.expression` as typeset math
rather than a value. This is the mechanism for showing equations in the
notebook ("expressions only behind an explicitly marked toggle") —
the node itself is the marked toggle, opt-in by construction, rather than a
global setting. Citation defaults to the caption, overridable like any other
node's caption. Needs an AST→LaTeX printer (new, but not a CAS — expressions
are already parsed to an AST for evaluation) and a renderer dependency (e.g.
KaTeX) in the editor.

**Bundled catalogues should auto-populate from a directory** instead of the
one hardcoded file (`packages/editor/src/catalogues/basic-mechanics.json`,
loaded by name in `model/catalogues.ts`) — glob a `catalogues/` directory at
build time so dropping a new JSON file in is enough. External import via
`Load catalogue…` stays as-is alongside it. Small and mechanical; not
discussed further, just needs doing.

**Catalogue authoring should be easier for contributors.** Today a
catalogue is authored by running the extraction script (`tools/extract/`,
R&M content only) or hand-writing JSON against the schema — a real authoring
UI was deferred out of milestone 1. Unscoped for now: could mean better
docs for hand-writing JSON, a schema validator with useful errors, a
scaffold CLI, or eventually the authoring UI itself. Revisit later; keep in
mind rather than build toward yet.

**Extensive worked examples**, beyond the one belt lab sample. Waits on
breadth — more chapters, or more graphs within belt — rather than being an
editor feature on its own. Revisit once the second slice is in.

**Documentation for teachers** — how to author a catalogue formula (today
that path is the extraction script, not an editor UI), how
`appliesWhen`/quarantine/status work, what a schema version bump means for a
course's in-flight graphs. Distinct audience from the student tutorial
above: instructor-facing, about the tool's authoring and versioning model.

**What should a multi-node selection do?** One concrete gap already found:
"Group into new section" ignores the current selection entirely and wraps
*every* ungrouped node in the document into one frame (`App.tsx`'s
`addSection`) — there's no way to select a handful of nodes and frame just
those. Open beyond that: what else, if anything, should a selection enable —
move together (already true, independent React Flow nodes), delete together
(already true, Backspace/Delete), anything else?

**Sliders as an input** — the intent is quickly nudging a value to build
intuition for its effect on the output, not precision entry. Needs a bound
to travel between (the port's declared valid range, when the formula has
one) and a decision on whether it replaces or sits alongside the typed
field.

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

**Catalogue source should be clear on the nodes.**

**Are all nodes addable in the quick add?**

**Custom closure nodes are built** — a student writes an equation on the
node itself (`ClosureNodeView.tsx`) and its ports populate from whatever
free names the expression uses (`packages/kernel/src/closure.ts`), each its
own generic dimension, proven live against this node's own wiring rather
than a reusable template (`graph.ts`'s `closure` branch) — see that file's
own comment for why a template can't express this correctly. Still open: it
is reachable only from the palette, not from `QuickAddMenu`'s drag-a-wire
flow — a fresh closure has no ports until it is written, so finishing a
dropped wire onto one would need a "type first, then wire" interaction this
pass didn't build.

**Auto-arrange the graph** — no overlaps of (open) nodes, frames keep their
contents, edges ignored for now (untangling them neatly is a future
problem).

## Commit conventions and release tooling

Triggered by being past MVP and ready to share the public repo — not
speculative infra. There is no CI, changelog, or release process today (no
`.github`, no `CHANGELOG.md`, no release scripts).

Commit messages move to Conventional Commits (`type(scope): subject`),
scope enforced against the package boundaries (`schema`, `kernel`, `units`,
`nodes`, `editor`, `tools`) — codified in CLAUDE.md's Conventions section as
a standing rule, not just tracked here. Changelog and version bumps are
generated from that history with a manual-trigger tool (e.g.
`standard-version`/`commit-and-tag-version`), not one that auto-publishes on
every push — a release is something Thomas decides to cut. Needs a GitHub
Actions workflow to run it, to be added alongside this.
