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
(already true, Backspace/Delete), anything else?

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

**Are all nodes addable in the quick add?**

**Settings should be persistent.** Panel widths are not stored.

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

**Fuzzy find in the catalogue palette too!** There is precedent in the quick add menu.

**Optional ports should change the unit when it is connected with a port.** Now it blocks connections.

**Ctrl+A does not select all nodes.** It follows browser default. Maybe we need more shortcut overrides?

**Restore notification pops up twice**

**Add Github link to app header.**

**Docs title and editor are the same.** Both `machine-design-studio`

**s^-1 unit should be Hz when it is bare**

**Unit on output port should be in parentheses.** Like in all other parts of the UX, e.g. tables. Now it is just besides the parameter, and is confusing. This should be the case for all combinations of [parameter] [unit], explore and discuss.

## Commit conventions and release tooling

Done. `v0.1.0` is cut — first tagged release, marked pre-release on GitHub
(project is alpha). `.github/workflows/release.yml` is manual-trigger only
(`workflow_dispatch`, optional patch/minor/major override, defaults to
pre-release) — no auto-publish on push, a release is still something Thomas
decides to cut. It builds, tests, then runs `pnpm release`
(`commit-and-tag-version`, config in `.versionrc.json`), pushes the
version-bump commit and tag, and cuts a GitHub Release from the new
`CHANGELOG.md` section.

`.github/workflows/ci.yml` (build+test on every push/PR to `main`) exists
but its triggers are disabled — solo work already runs build/test locally,
and `release.yml` has its own gate before it'll cut a release, so the
per-push run wasn't catching anything extra. Left as `workflow_dispatch` so
it can be run by hand or have its triggers restored later.

The running app now shows its build's version in the ribbon
(`packages/editor/vite.config.ts` injects it from the root `package.json`
at build time), flagged `alpha ·` while the major version is `0` — visible
on every Netlify deploy of `main`, including the one a release's
version-bump commit triggers.

Commit messages move to Conventional Commits — the rule and its allowed
types/scopes are codified in CLAUDE.md's Conventions section, not
duplicated here. History before this point isn't in that format, so the
first changelog's coverage of older commits will be thin; that's expected,
not a bug in the tooling.

**No commit-msg hook enforces the format, and none is planned.** A
misformatted commit doesn't error — it just doesn't get a CHANGELOG section,
or lands in the wrong one, at release time. Decided: that's an acceptable
outcome for solo work, not a gap to close with `commitlint`/`husky`.
