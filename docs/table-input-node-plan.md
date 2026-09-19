# Table input node

**Status: discussion, not yet a build contract.** The approach below is
settled enough to argue with; the open decisions at the end are not settled at
all, and several of them change the shape of the work. Do not start
implementing from this document until they are closed.

## Context

`ROADMAP.md:12` is item 3: *"What is the {table XX} notation in R&M catalogue?
Decide how to integrate tables as catalogue lookup items."* This plan answers
it for the table shapes photographed in `ref/RM16` (Roloff & Matek chapter 16,
belt drives), and proposes a node that makes those tables **visible and
selectable** on the canvas rather than something you must already know the
answer to in order to query.

The request, in Thomas's words: *"include those tables as Table input node.
Select values from table by selecting cells in the nodes. Selected fields are
the output. Multiple selections result in ranges for every output port."*

Most of the machinery this needs already exists. What is genuinely missing is
a view, a row-subset selection, and categorical lookup columns.

### What already exists

- **`FormulaLookup`** (`packages/schema/src/formula.ts:86`) is already a dense
  typed table: ordered axes, numeric axes snapping to the first upper bound
  at or above the input, categorical axes matching exactly, and **one column
  per output port over shared axes**. That last property is already the
  request's "selected fields are the output" — a lookup formula names its axis
  values once and answers with every property of the row selected.
- **`TableColumnRange`** (`packages/schema/src/value.ts:176`) exists end to
  end. `ValueEditor.tsx:336` offers it as a sweep kind, `graph.ts:514`
  resolves it against the catalogue index, `graph.ts:233` types it, and
  `evaluate.ts:1104` turns it into an axis. It references a table by
  **catalogue formula id plus column name** and never embeds data.
- **`FileNode`** (`packages/schema/src/document.ts:815`) is the precedent for a
  node with declared, typed, constant outputs whose origin the kernel knows
  nothing about, and whose several `sources` become one sweep axis.
- **`SelectNode`** (`packages/kernel/src/select.ts`) already reduces along an
  axis. `firstPassing` over a table node's row axis is *"the smallest profile
  that passes"* with no new kernel work at all.

### The composition that already works today

Worth stating plainly, because it bounds how much of this is genuinely new: a
`categoricalList` input wired into a lookup formula's axis port **already**
sweeps a set of table rows and already yields every output column as a
correlated series. What a table node adds over that composition is
discoverability (you can see the table), selection by pointing rather than by
typing row keys you must already know, and one node instead of two.

That is a real gain — the current path is unusable for a table like 16-21
without the book open beside the screen — but it means the centre of gravity
is a NodeView, not an evaluation concept. Keep it there.

## The correction: rows and columns are two selections, not one

"Select cells" needs splitting, or it breaks the invariant that a table row is
one part.

A free rubber-band cell selection would let you take `b₁` from profile SPA and
`e` from profile SPB. The result is two series with no shared axis — nothing
`unionAxes`/`gridSize` (`packages/kernel/src/series.ts`) can do anything
sensible with — and, worse, it silently mixes two designs into what looks like
one answer. R&M's tables are *records*: the row is the part.

So:

- **Columns select which output ports exist.** A projection. Table 16-21 has
  around twenty columns and nobody wants a twenty-port node.
- **Rows select the value.** One row gives scalars on every port. Several rows
  give **one shared axis** keyed by the row, and every output port becomes a
  series over it. `b₁` and `e` in the same grid cell then always come from the
  same profile.

This is exactly the requested *"multiple selections result in ranges for every
output port"*; the only change is that the selection is row-shaped, so the
ranges share an axis. The interaction can still read as cell selection —
clicking a cell takes its row and its column — but the model underneath is
rows × columns.

## Which R&M chapter-16 tables actually fit

The photographs in `ref/RM16` contain three different shapes, and one of them
is not a table.

**Fits well.** *Table 16-21* (surface-cooled three-phase motors, DIN 42673 T1)
is the ideal case: rows are frame sizes (71, 80, 90S, 90L, 100L, …), columns
are `h`, `a`, `b`, `w₁`, `s`, shaft end, `P` at four synchronous speeds, `J`,
`T_Ki/T_N`, permissible shaft load `F₀`/`F₁`, V-belt pulley profile and `d_dk`,
groove count `z`, and coupling sizes. Select 132S…200L and sweep the motor
choice through an entire drive calculation.

**Fits, but transposed.** *Table 16-13* (V-belt pulley dimensions, DIN 2211)
has quantities as rows (`b₁`, `c`, `e`, `f`, `t`, `d_dmin`, groove angle α) and
profiles as columns (Y/Z/A/B/C/D/E and SPZ/SPA/SPB/SPC). Either transcribe it
in the other orientation in the private catalogue repo, or carry an
orientation flag. Its α rows are genuinely two-axis (profile × a `≤63` /
`>63` / `≤80` diameter band); see the multi-axis open decision below.

**Fits badly — a content problem, not a node problem.** *Tables 16-1 and 16-2*
(mechanical and physical properties of flat-belt materials; V-belt properties
and application examples) are not numeric matrices. Cells are intervals
(`350…1200` N/mm², `1,1…1,4`, `20…50` s⁻¹), several are footnote-qualified,
and an entire column is prose ("universele toepassing in de machinebouw…").
The honest handling is that an interval becomes **two columns** (`E_min`,
`E_max`) and a prose column never becomes a port. That is transcription work
and a content decision in the private catalogue repository, per AGENTS.md's
public/restricted boundary — the node design does not settle it.

**Does not fit at all.** *16-4* (belt force ratio *m* against utilisation κ),
*16-5* (factor *k*), *16-8* (the Extremultus nomogram for `F′_t`, `ε₁` and belt
type), and *16-16* (power increment `U_z` against speed, one chart per profile)
are nomograms and characteristic curves. They belong to
`docs/catalogue-diagrams-plan.md`, not here.

One trap to name explicitly, because it is tempting: `FormulaLookup` **snaps**
to the next bound and does **not** interpolate. That is correct for a table of
standard sizes and wrong for a digitised curve. Do not route the charts through
this mechanism to save effort — the silence is the danger, since a snapped
answer looks exactly like an interpolated one.

## Approach

### 1. Categorical lookup columns — `packages/schema/src/formula.ts`

`formula.ts:571` currently rejects a lookup whose output port is not concrete
numeric ("a lookup needs a concrete numeric output"), and
`FormulaLookup.columns` is typed `Readonly<Record<string, readonly (number |
null)[]>>`.

Table 16-21 needs it widened: its `profiel` column answers `SPZ`, `SPA`, `SPB`
and `−`, and its coupling columns answer type designations. Table 16-13's
groove-angle class is the same shape. A categorical column would let a table
node's profile output wire straight into the categorical axis port of the
pulley-dimension table — which is precisely the chain a real belt-drive
calculation walks.

The kernel already carries categorical series everywhere (`CategoricalSeries`
in `series.ts`, `ResolvedTableColumn`'s categorical arm at `graph.ts:173`), so
this is a schema/parse/serialise change and a relaxed validation rule, not an
evaluation change. `null` keeps meaning "undefined for this row".

### 2. The node itself

Two candidate shapes, and this is the largest open decision (see below):

- **A — authoring sugar.** The palette drops a table-browsing panel that
  *creates the existing composition*: an input node carrying a
  `categoricalList`/`list` over the chosen rows, wired into the lookup formula
  node. Zero kernel change, zero schema change, no new document kind, and
  every downstream feature works on day one because nothing downstream is new.
  The cost is two nodes on the canvas where the user asked for one, and a
  selection that cannot be revisited as a selection once it is expanded.
- **B — a `TableNode` kind.** A node storing the catalogue formula reference,
  the selected row keys, and the projected columns; resolved in `graph.ts`
  beside the existing `tableColumns` resolution and evaluated into one axis
  plus one series per projected column. One node, a durable selection the view
  can round-trip, and the row axis is the node's own — but it is a new node
  kind touching schema, kernel, editor, notebook and docs.

B is what was asked for and is the better end state. A is worth pricing
because it may be a genuinely useful first step that answers the discoverability
problem in a fraction of the work.

### 3. The view

The part that carries the feature either way. A scrollable grid inside the node
showing the table's own row keys and column headers, with the selected rows and
projected columns highlighted, in the inferred-unit style of
`CompareNodeView`/`FormulaNodeView` rather than a fixed-unit layout. Column
headers carry the port name and unit; row keys carry the axis coordinate.

Table 16-21 is around twenty-five rows by twenty columns, so the view needs
scroll in both directions and a sane collapsed state — probably "selected rows
only" once a selection exists, with an expand affordance to re-open the whole
table.

### 4. What it unlocks

Sweeping a table node's row axis and reducing it with `SelectNode`'s
`firstPassing` is *"the smallest motor frame whose permissible shaft load still
passes"*. That is the front half of the part-selection node sketched at
`docs/feature-review.md:176`, and it arrives without new kernel work. The
Pareto/candidate work (`docs/pareto-and-candidate-marking-plan.md`) also names
the catalogue-of-sizes case as where candidate marking earns its keep — a table
node is where those candidates would come from.

## The public/restricted boundary shapes the UX

R&M table content is restricted (AGENTS.md), so this node **cannot be "a table
you paste into the document"**. It has to be bound to a catalogue lookup
formula by global id, version and hash, with the document storing only the
selection. `TableColumnRange` already anticipated exactly this.

That means two features are hiding inside one request, and they should not be
merged:

| | Catalogue table node | User table node |
|---|---|---|
| Content lives | private catalogue repository | in the document |
| Document stores | id + version + hash + selection | rows inline, or a CSV import |
| Precedent | `TableColumnRange`, lookup formulas | `FileNode` |
| Answers | R&M chapter 16 | a student's own supplier data |

Same view, different storage. R&M is the ask and the boundary forces the
order, so the catalogue one comes first. The user table node is a noted
extension, not this pass.

## Open decisions

None of these are settled. They are roughly in order of how much they change
the work.

1. **Sugar or a node kind?** Approach A or B in §2 above. If the real problem
   is "I cannot find the row without the book open", A may solve it outright.
   If the selection is meant to be a durable, revisitable part of the document
   — and marking, reporting and Pareto all suggest it is — B is the answer.

2. **Multi-axis tables.** 16-13's α is profile × diameter band. If a table node
   preselects the profile, the second axis is still an unresolved input. Either
   restrict v1 to single-axis tables (16-21, most of 16-13) and leave the
   two-axis rows as ordinary formula nodes, or let a table node carry **input
   ports** for its unresolved axes — which makes it not purely a source and
   complicates the "table input node" framing considerably. Current lean:
   restrict v1.

3. **Selection or filter?** *"All profiles with `P_max` ≥ 5 kW"* is the
   part-selection node of `docs/feature-review.md:176` and needs predicate
   storage of roughly `appliesWhen`'s shape. Explicit selection is far
   cheaper and is what was asked for. Current lean: selection now, filter
   noted as the successor.

4. **Port stability under column projection.** If projecting columns creates
   and destroys ports, deselecting a projected column strands its wire —
   against the stable-ports rule both `docs/selection-and-best-design-plan.md`
   and `docs/reliability-reports-plan.md` state for `select`. Three ways out:
   a wired column cannot be deselected; or every column is always a port and
   projection is display-only; or deselection warns and disconnects
   explicitly. Current lean: forbid deselecting a wired column, which is the
   only one with no silent data loss.

5. **What the row axis's coordinate is.** For 16-21 it is the frame size,
   which reads as ordinal but is written `90S`/`90L` — a categorical axis with
   a meaningful order, not a numeric one. For 16-13 it is the profile name.
   Both axis kinds exist in the kernel, but the choice decides whether
   `firstPassing` walks the rows in catalogue order (which is what an engineer
   means by "the next size up") and it should be stated rather than inherited.

6. **Interval-valued cells.** Whether 16-1's `350…1200 N/mm²` becomes two
   columns, a single conservative value, or stays out of the catalogue
   entirely. A content question for the private repository, but the node
   design should not assume it away.

7. **Does the whole-axis `tableColumn` sweep survive?** Today a `tableColumn`
   range sweeps a lookup's **entire** axis, unfiltered (`graph.ts:514`). A
   table node with all rows selected is the same thing with a view attached.
   Decide whether the two coexist or whether one retires into the other before
   there are two ways to express one study in a saved document.

8. **Does 16-2's prose column have any home?** The application-example text is
   genuinely useful to a student choosing a belt and is genuinely not a port.
   A description surfaced in the view but never wired is one option; leaving
   it in the book is another.

## Files

Not enumerated in the usual detail, because decision 1 moves most of them.
Under approach B the shape would be:

- `packages/schema/src/formula.ts` — categorical lookup columns.
- `packages/schema/src/document.ts` — `TableNode`, its parse/serialise, its
  entry in `NODE_KINDS` and in `documentAxes`' multi-value rule
  (`document.ts:929`, beside the `file` node's own).
- `packages/kernel/src/graph.ts` — resolution and port inventory, beside the
  existing `tableColumns` block.
- `packages/kernel/src/evaluate.ts` — the row axis and the projected series.
- `packages/editor/src/canvas/TableNodeView.tsx` — the view, plus palette
  registration and `Canvas.tsx` wiring.
- `docs/file-guide.md`, `OVERVIEW.md` (the range-kind table at `OVERVIEW.md:91`
  gains a neighbour), `ROADMAP.md` (item 3 closes).

## Verification

To be written against the closed decisions. The constraints that already
apply, whatever shape it takes:

- **Invented tables only in tests.** AGENTS.md forbids real R&M content as a
  fixture, and that covers table data as much as expressions. A three-row,
  three-column invented table with one categorical column exercises everything.
- Kernel tests for: one row selected giving scalars; several rows giving one
  shared axis with every column correlated on it; a categorical column
  resolving; a row key absent from the table failing with a real message;
  and a `firstPassing` reduction over the row axis.
- Schema round-trip tests including a rejected unknown column and a selection
  naming a row the catalogue no longer has — the hash-changed warning path of
  `graph.ts:178` is the model for how that should degrade.
- `pnpm build` and `pnpm test`; catalogue-dependent tests skip without
  `JOVEWORKS_CATALOGUE`, which is expected.

**For Thomas in the browser** (I will not touch `pnpm dev`): drop a table node
bound to an invented catalogue table, select three rows, confirm every output
port reports three values on one shared axis and that a plot downstream shows
them as one series rather than three unrelated ones; then reduce with a Select
node and confirm the named row is the one the table says it should be.
