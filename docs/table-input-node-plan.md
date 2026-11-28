# Catalogue tables and the table node

**Status: build contract.** The design decisions are closed (recorded under
*Decisions* at the end). The first version of the node — `TableNode` bound to
a single-axis lookup formula, row and column selection, per-column units —
shipped in `fe81b91`. This plan finishes it: tables become their own catalogue
entity, each one is a palette entry, and the node's interface is rebuilt
around one predictable set of click rules.

## Context

`ROADMAP.md` item 3 asks how R&M's `{table XX}` notation becomes something
the editor can use. The tables photographed in `ref/RM16` (Roloff & Matek
chapter 16, belt drives) are records: a row is a part — a motor frame size, a
belt profile — and its columns are that part's properties. Table 16-21 has
about 25 rows by 20 columns.

The thing a student is missing is not evaluation. A categorical list wired
into a lookup formula already sweeps rows and yields correlated columns. What
is missing is **seeing the table and picking from it**, without the book open
beside the screen. The node is the interface, and the interface is the
feature.

## Two nodes, two jobs

The table node and the lookup formula node stay separate, and the line
between them is who chooses the row:

| | Lookup formula node | Table node |
|---|---|---|
| Who chooses the row | **the graph**: the key is an input port | **you**: the node has no inputs |
| Typical use | a computed `d` fetches its key width; a small library (camera, lens) picked from a dropdown | choosing motor frames, belt profiles, standard sizes from a large table |
| Axes | any number | exactly one |
| Shows the table | no | yes |

Merging them was considered and rejected: on a large table, a grid you click
in next to an axis that a wire overrides gives two competing ideas of which
row is selected. A table node is never driven. To have a computed value
choose the row, select all rows and read them through an **Interpolate** node
(*next row up* or *exact match*), or use a lookup formula.

The typed-in **lookup table** (`LutNode`) is unrelated: it holds the
student's own rows for building ranges and interpolation curves, not values
from a catalogue. It is not touched by this plan, and does not share the
table node's view.

## 1. Catalogue: a `tables` entity

A table is not a formula — it has no expression and no inputs — so it gets its
own top-level array on `Catalogue`, beside `formulas`:

```json
{
  "tables": [
    {
      "id": "example.motor-frames",
      "version": 1,
      "label": { "en": "Motor frame sizes" },
      "description": { "en": "…" },
      "citation": "Table 16-21",
      "href": "#tab-16-21",
      "key": { "name": "frame" },
      "columns": [
        { "name": "h", "unit": "mm" },
        { "name": "P", "unit": "kW", "description": { "en": "…" } },
        { "name": "profile" }
      ],
      "rows": [
        ["71", 71, 0.37, "SPZ"],
        ["80", 80, 0.75, "SPZ"]
      ]
    }
  ]
}
```

- **One key column, by construction.** A multi-axis table cannot be written
  here; it stays a lookup formula. This replaces `selectableTables`'s runtime
  filter with a schema rule.
- A column with no `unit` holds **names** (categorical), the same convention
  as `LutColumn` and `FileField`. The key column likewise. `null` in a row is
  a cell the table leaves undefined.
- Every row has one entry for the key and one per column; anything else is a
  parse error with a path.
- Ids share **one namespace with formulas** across the catalogue index, so a
  reference resolves without saying which kind it points at.
- **Hash**: `tableHash`, computed like `formulaHash` over what changes a
  calculation (key, column names and units, rows) and not over prose (label,
  description, citation), so a translator can correct text without
  invalidating saved documents.
- **Parsing** builds the kernel's existing one-axis lookup shape
  (`FormulaLookup`-like axis plus columns), so evaluation does not change.
  The kernel keeps a single code path for "a table of rows".

Adding `tables` is additive: older builds ignore the unknown key.

**Moving a lookup formula into `tables` is not additive** for any build that
reads the new catalogue file but predates this change: it loses that formula.
That is accepted for the private R&M catalogue — the editor is deployed, not
installed, so students run the current build — and it is the user's call per
AGENTS.md. Public catalogues follow the same rule: move only after the
release that can read `tables`.

**Catalogue author** (`packages/catalogue-author`): tables round-trip
untouched in this pass, the way `lookupJson` already does. There is no table
editor; tables are written as JSON in the catalogue repository.

## 2. Palette: one entry per table

- Every table in a loaded, browsable catalogue is its own palette entry,
  listed **in that catalogue's section, below its formulas**, as a separate
  *Tables* group. A catalogue without tables shows no such group. Entries are
  searchable by id, label and citation (`16-21`, "motor"); a search result
  keeps the same placement, below the catalogue's matching formulas. Each
  entry carries a table marker so it reads as different from a formula.
- Dropping it creates a `table` node bound to that table, with nothing
  selected and the grid expanded.
- The bare **catalogue table** entry (`builtin:input:table`, `copy.catalogueTable`)
  is removed, along with its "needs a loaded catalogue" disabled state.
- Lookup formulas never appear as table nodes, even single-axis ones. Whether
  something is a table is the catalogue author's decision.

## 3. Document: what the node stores

`TableNode` keeps its shape. Every change is an optional field, so no
`DOCUMENT_SCHEMA_VERSION` bump and no migration step:

```ts
interface TableNode extends NodeBase {
  kind: 'table';
  table: FormulaRef;        // { id, version, hash } — now resolves to a table or a lookup formula
  rows: (number | string)[];
  columns: string[];
  allRows?: true;           // new: every row, following the catalogue
  axisLabel?: string;
  displayUnits?: Record<string, Unit>;
}
```

- **`table`** keeps the `FormulaRef` shape (aliased as `TableRef` in code).
  The kernel resolves its id against `tables` first, then against lookup
  formulas. A document saved before the R&M tables moved still opens: the id
  resolves to the new table, and the version/hash mismatch raises the
  existing changed-reference warning once. That warning is honest — the
  reference did change underneath it — and needs no special case.
- **`allRows: true`** selects every row, *including rows the catalogue adds
  later*. It is stored with `rows: []`, so an older build that ignores the
  field opens the node with nothing selected rather than failing. While it is
  set, `rows` is ignored.
- The in-node table switcher is removed: a node is bound to its table at
  drop time, like a formula node. `bindTable` and the `<select>` go.

## 4. The node's interface

### Two states

- **Compact** (the default once anything is selected): the node reads like
  every other source — the key port and one port per projected column, each
  with its reading, sparkline and handle — plus one summary line:
  `3 of 25 rows · 132S…200L`, or `all 25 rows`.
- **Expanded**: the full grid, grown in place, about 600 px wide, scrolling
  inside the card with the header row and the key column sticky. It uses the
  shell's existing expand toggle (`expanded` / `toggleExpanded`), not a local
  `showAll`. Clicking in the grid never changes the state; only the toggle
  does. A freshly dropped node starts expanded, since an empty table has
  nothing else to show.

The local `showAll` state and the "show the N selected / show all N rows"
button are removed. The current behaviour — the grid collapsing to the picked
row on the first click — is the main thing this pass fixes.

### Click rules

Rows follow spreadsheet conventions; columns only accumulate from cells.

| Gesture | Rows | Columns |
|---|---|---|
| plain click on a cell or row key | select **only** this row | add the cell's column if not projected |
| Ctrl/Cmd-click | toggle this row | add the cell's column when the row is added |
| Shift-click | select the range from the anchor row to this one, in table order | add the cell's column |
| click the key column's header, or Ctrl/Cmd+A in the grid | toggle **all rows** (`allRows`) | — |
| click a column header | — | toggle that column's port |

- The **anchor** for Shift is the last row clicked without Shift. It is view
  state, not stored.
- A cell click **never removes a column**. A column is a port, possibly with a
  wire on it, so dropping one is an explicit act on its header.
- A plain click on a highlighted cell narrows the selection to that row; when
  it is already the only row, nothing changes. Ctrl-click on it removes the
  row.
- Any click that makes an explicit row selection clears `allRows`.
- Rows are always held in the **table's order**, never click order, so the
  sweep runs the way the catalogue is written ("the next size up").

### What the grid shows

- The selection is drawn as its true shape: every selected row × every
  projected column is highlighted, because that is what the node answers
  with. Picking two cells in different rows and columns lights four.
- A **wired column** shows a lock (or wire) mark in its header, not only a
  tooltip; clicking it does nothing and the title says why.
- Each numeric header keeps its unit picker; the cells are respelled in the
  picked unit, as now.
- The citation and description stay in the node's detail.
- The grid gets its own class (`node-table-grid` becomes catalogue-table
  only). `LutNodeView` currently reuses that class; it gets its own so the
  lookup table's appearance does not change.

### Ports

- The key port always exists. One row selected gives scalars; several rows
  (or `allRows`) give one shared axis and every port is a series over it.
- Projected columns are ports, in the table's column order. A wired column
  cannot be un-projected (`columnsAfterClick`, unchanged).

## 5. The table-column range is retired

`TableColumnRange` (`{ kind: 'tableColumn', table, column }`, an Input node
value kind) sweeps every key of a lookup table. A table node with `allRows`
now does the same and more, so:

- "table column" is **removed from the Input node's kind dropdown**
  (`ValueEditor.tsx`). New documents cannot create one.
- Existing documents keep working: the kernel resolves `table` against
  `tables` (where `column` must be the key column) and then lookup formulas,
  exactly as the node does.
- They are **not** rewritten into table nodes on load: that would change the
  node's kind and port names and require rewiring edges inside a silent
  migration.
- The Jupyter export's `tableColumn` branch (`jupyter.ts:654`) stays for
  those old documents.

## Files

- `packages/schema/src/formula.ts` — `CatalogueTable`, `parseCatalogueTable`,
  serialisation, `tableHash`, `Catalogue.tables` (optional on read, defaulting
  to `[]`), shared id namespace in the catalogue validation.
- `packages/schema/src/document.ts` — `TableNode.allRows` parse/serialise;
  `TableRef` alias.
- `packages/kernel/src/graph.ts` — the formula index learns tables;
  `resolveTable` and the `tableColumns` block resolve against tables first,
  then lookup formulas; `allRows` resolves to every row.
- `packages/kernel/src/evaluate.ts` — no change expected beyond what the
  resolved table feeds it; confirm.
- `packages/editor/src/palette/Palette.tsx` — one entry per table; remove
  `builtin:input:table`. `packages/editor/src/i18n.ts` — drop
  `catalogueTable`/`catalogueTableSummary`, add the table marker and summary
  line strings in both languages.
- `packages/editor/src/canvas/TableNodeView.tsx` — compact/expanded, the
  click rules, the lock mark, removal of `bindTable`/`showAll`;
  `rowsAfterClick` gains replace, toggle and range modes.
- `packages/editor/src/canvas/LutNodeView.tsx` and `styles.css` — separate
  grid classes.
- `packages/editor/src/canvas/ValueEditor.tsx` — hide `tableColumn`.
- `packages/editor/src/canvas/QuickAddMenu.tsx` — check what it offers for
  the removed palette entry.
- `packages/catalogue-author/src/model/draft.ts` — round-trip `tables`
  untouched.
- `packages/docs-site/docs/guide/node-reference.md` — rewrite *Table column*
  (deprecated) and the catalogue table section; state the two-nodes rule.
  `packages/docs-site/docs/guide/catalogue-authoring.md` — document `tables`.
- `docs/file-guide.md`, `OVERVIEW.md`, `ROADMAP.md` (item 3 closes).

## Verification

**Invented tables only** — AGENTS.md forbids real R&M content as a fixture,
table data included. A four-row table with a categorical key, two numeric
columns and one categorical column covers everything.

- Schema: a catalogue with `tables` round-trips; a row of the wrong length, a
  duplicate id between a table and a formula, and a column with an unknown
  unit are rejected with paths; a catalogue without `tables` still parses;
  `tableHash` ignores label/description/citation and changes with a cell.
- Document: `allRows` round-trips; a document without it parses unchanged;
  a fixture of a pre-change table node still loads.
- Kernel:
  - a table node bound to a table: one row gives scalars, several rows one
    shared axis with correlated columns, `allRows` every row in table order;
  - a row added to the table joins an `allRows` sweep but not an explicit one;
  - a reference whose id now resolves to a table instead of a lookup formula
    evaluates and warns once;
  - a `tableColumn` range resolves against a table's key column;
  - a `firstPassing` reduction over an `allRows` axis picks the right row.
- Editor: `rowsAfterClick` for plain, Ctrl and Shift, including Shift across
  an unsorted click history and a plain click on the only selected row;
  `columnsAfterClick` unchanged; the palette lists tables and not the bare
  entry.
- `pnpm build && pnpm test`. Catalogue-dependent tests skip without
  `JOVEWORKS_CATALOGUE`, which is expected.

**For Thomas in the browser** (the view changes are not committed until he
has seen them):

1. The palette lists the invented table under its own catalogue, below that
   catalogue's formulas, and search finds it by name and by citation; the old
   *catalogue table* entry is gone.
2. Dropped, the node opens expanded on the full grid.
3. A plain click on a cell selects that row and projects its column, and the
   grid stays as it was. A second plain click on another row replaces the
   first.
4. Shift-click selects a range; Ctrl-click adds and removes single rows; the
   key header selects all, and the summary reads `all N rows`.
5. Highlighting covers selected rows × projected columns.
6. Wire a column out: its header shows the lock and refuses to drop it.
7. Collapse: the node shows ports and the summary line only; expand brings
   the grid back unchanged.
8. The lookup table node looks exactly as before.
9. An old NodeBook with a table node or a table-column input still opens and
   evaluates.

## Decisions

Closed in discussion on 2026-11-28:

1. **Tables are a separate catalogue entity**, not a flag on lookup formulas.
2. **Each table is a palette entry**, in its own catalogue's section below
   that catalogue's formulas; there is no bare table node in the palette and
   no switching tables inside a node.
3. **The table node and the lookup formula node stay separate.** The formula
   node is driven by the graph; the table node is picked by the user and has
   no inputs. Merging was rejected because driving inputs next to a large
   grid are confusing.
4. **Row clicks follow spreadsheet rules**: plain replaces, Shift extends,
   Ctrl/Cmd toggles.
5. **The grid expands in place**, using the shell's expand toggle.
6. **A cell click never removes a column**; columns drop from their header.
   A plain click on a highlighted cell narrows to its row.
7. **"All rows" follows the catalogue**, stored as `allRows`.
8. **The lookup table is out of scope** — it builds ranges from the user's
   own values and does not share this view.
9. **The table-column range is retired from the UI** and kept readable for
   old documents, without rewriting them.
10. **Single-axis only.** Two-axis tables (16-13's groove angle) stay lookup
    formulas.
11. **Selection, not filter.** "All profiles with `P_max` ≥ 5 kW" is the
    part-selection node of `docs/feature-review.md`, a later piece of work.

Content questions for the private catalogue repository, not this plan:
interval-valued cells (16-1's `350…1200 N/mm²`, probably two columns), prose
columns (16-2's application examples, probably a column description or left
in the book), and transposed tables (16-13, transcribed with profiles as
rows).
