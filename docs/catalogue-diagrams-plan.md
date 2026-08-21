# Catalogue-defined diagrams: a generic drawing DSL for visualization nodes

## Context

The photography catalogue's thin-lens group (`photography.lens.*`) is a good
first case for a long-standing roadmap idea: some formulas beg for a picture,
not just a number — a ray diagram for a lens, eventually a free-body diagram,
a linkage sketch, a Mohr's circle. The wrong way to build this is one React
component per domain (`LensDiagram.tsx`, `FreeBodyDiagram.tsx`, ...) that the
editor must grow every time someone wants a new picture. Everything else in
this codebase keeps domain content out of the editor — formulas are data the
kernel interprets generically, and the editor never special-cases an R&M
chapter or a machining formula by id. A visualization should follow the same
rule: catalogue authors describe a diagram as data, the editor ships **one**
generic interpreter, and adding a new diagram is a JSON change, not a code
change.

This is a planning document, not an implementation — it exists to pin down
the design before touching schema/kernel/editor code, the same role
`docs/let-s-plan-the-implementation-glowing-cherny.md` played for the
Feasibility/Sensitivity output nodes.

## The scoping problem that shapes the whole design

The first sketch was "attach a `diagram` field to one `Formula`, whose
coordinate expressions reference that formula's own input/output ports."
That fails on the motivating case: a satisfying lens ray diagram wants focal
length, object distance, image distance, object height *and* magnification
all at once — but no single `photography.lens.*` formula has all of those as
its own ports, because this codebase deliberately keeps one output per
formula (`AGENTS.md`: "Evaluation is forward-only... do not add a solver").
Each lens formula solves for exactly one unknown. A rich diagram needs
values that live on *several different nodes* in a real graph.

So a diagram cannot be a decoration on an existing formula. It has to be
**its own catalogue-defined thing that a student wires up like any other
node** — inputs the student connects from wherever those quantities already
live in their graph, the same way a formula node's inputs are wired today.

## Design decision: a diagram is a formula-shaped record with no expression

A new catalogue record type, sibling to `Formula`:

```ts
interface DiagramTemplate {
  readonly id: string;          // global, namespaced, like a formula id
  readonly version: number;
  readonly inputs: readonly Port[];   // wired exactly like a formula's inputs
  readonly diagram: DiagramSpec;      // the drawing, see below
  readonly label?: LocalizedText;
  readonly description: LocalizedText;
  readonly citation?: string;
}
```

No `output`, no `expression` — a diagram produces a picture, not a value, so
it is a graph **sink**, the same role Check/Print/Table already play. This
reuses essentially all of the existing formula-node machinery instead of
inventing new plumbing:

- **Wiring**: identical to a formula node's inputs — drag an edge from any
  compatible output port. No new connection-checking logic.
- **Sweeps and broadcasting**: a diagram node's inputs can be swept exactly
  like a formula's; the diagram renders one representative cell (index 0),
  matching the convention `packages/editor/src/model/values.ts`'s
  `summarise()` already uses for a swept formula node's compact reading.
- **Catalogues stay the single source of truth**: `Catalogue` gains a
  parallel `diagrams: readonly DiagramTemplate[]` array; the palette lists
  them the same way it already lists formulas, so a new diagram template
  shows up in the palette from JSON alone.

Document/schema side: a new `GraphNode` kind, `'diagram'`, referencing a
`DiagramTemplate` by id + version + hash — the same `FormulaRef` shape
formula nodes already use, for the same reason (graphs never embed catalogue
content, and a changed/missing template is reported the same three-way
`match`/`changed`/`missing` way `matchRef` already reports it for formulas).

## The drawing DSL

```ts
interface DiagramSpec {
  readonly padding?: number;              // viewBox margin, fraction of extent; default e.g. 0.15
  readonly elements: readonly DiagramElement[];
}

type Coord = readonly [string, string];   // [x-expression, y-expression]

type DiagramElement =
  | { kind: 'line';   from: Coord; to: Coord; style?: 'axis' | 'ray' | 'construction' }
  | { kind: 'arrow';  from: Coord; to: Coord }
  | { kind: 'circle'; at: Coord; radius: string }
  | { kind: 'point';  at: Coord }
  | { kind: 'label';  at: Coord; text?: string; valueOf?: string };  // valueOf: format a port's live value+unit
```

Every coordinate is an **expression string in the same language formulas
already use** — `packages/kernel/src/parse.ts` + `compileExpression`
(`packages/kernel/src/compile.ts`, already exported from
`@joveworks/kernel`). This is the load-bearing reuse: no new geometry
language to design, parse, or maintain. The scope resolving names in a
diagram's expressions is exactly the `DiagramTemplate`'s own `inputs` — plain
arithmetic (`-d_o`, `m * h_o`, `f`), same operators and functions as any
formula.

Coordinates are evaluated against each port's **canonical numeric value**
(mm, s, rad, dimensionless — whatever the kernel already carries
internally), so mm-valued ports compose in one shared geometric space with no
extra unit-stripping step. There is deliberately **no dimension-checking of
diagram coordinates** — mixing a mm-valued and a dimensionless input in one
picture is a normal thing to want (plotting magnification against a distance
axis), so this is an authoring convention, not something the schema
enforces. What *is* checked (see Validation) is that every name used in an
element actually resolves to a declared input.

The renderer computes every element's numeric points, takes the bounding box
across the whole diagram, and auto-fits an SVG `viewBox` with `padding` — no
per-template pixel scale to author by hand.

## Kernel: the one real gap

`evaluateFormula` already builds a per-cell `env: Record<string, number>`
from a formula's wired inputs to evaluate its expression
(`packages/kernel/src/evaluate.ts` ~line 566-608) — this is precisely the
`Env` a diagram's coordinate expressions need. But it is discarded after
producing the output; nothing stores a node's own *input* port values under
its own id (`values` is keyed by `endpointKey`, and today only a node's
*output*-shaped port ever gets recorded under the node's own id — see
`evaluateDocument`'s `case 'formula'`, `values.set(endpointKey(node.id,
formula.output.name), output)`).

A `'diagram'` node case in `evaluateDocument` needs the equivalent: read its
wired inputs (reusing the existing `regularInputs`/`reader()` machinery,
extracted into a small shared helper rather than duplicated), broadcast them
onto the node's own axes, and `values.set(endpointKey(node.id, port.name),
...)` for every input port — there is no output port to store instead. This
is a genuinely new node kind for `evaluateDocument`'s switch, not a
formula-evaluation variant; a diagram node is closer in spirit to how
Check/Table read their wired inputs and terminate than to how a formula
computes one.

## Validation

A new `checkFormulaDiagram`-equivalent, run the same way
`checkFormulaDimensions` is today (`test/catalogue-check.test.ts`, "every
offending record's id and message at once, not just the first"): parse every
element's coordinate/radius expressions, confirm every referenced name is a
declared input of that `DiagramTemplate`, and that `label.valueOf` (if
present) names a real input too. No dimension algebra needed here — just
name resolution, which is cheap and catches the actual authoring mistake
(a typo'd port name, a leftover reference to a renamed port).

## Editor

- **Schema** (`packages/schema/src/document.ts`): new `DiagramNode` in the
  `GraphNode` union, parse/serialize, a `DiagramRef` mirroring `FormulaRef`.
- **Palette**: diagrams list alongside formulas from each loaded catalogue —
  reuses the existing "catalogue formulas populate the palette" path with
  `diagrams` added as a second source.
- **`DiagramNodeView.tsx`** (new): renders like a formula node for its input
  ports (same missing-required-input visibility `FormulaNodeView.tsx`
  already gives formulas), but instead of a numeric reading, an SVG built
  from the template's `elements` against cell-0 of `values` for this node's
  own ports.
- **Notebook**: out of scope for a first cut. The canvas rendering is the
  useful slice to prove the DSL; a report-view rendering of the same SVG is
  a follow-up once the DSL itself has been used on real content.

## Rollout

Once the plumbing exists, add a `photography.lens.ray-diagram`
`DiagramTemplate` with inputs `f`, `d_o`, `d_i`, `h_o`, `m` (wired from the
existing `photography.lens.*` formula nodes' outputs) drawing: the optical
axis, a lens marker at x = 0, an object arrow at x = -d_o, an image arrow at
x = d_i with height -m·h_o (inverted for a real image), and focal-point
labels at x = ±f. That is the concrete artifact this whole plan is in
service of — everything above is sized to make that one diagram buildable
without a lens-shaped special case in the editor.

## Scope check

This is comparable in size to the Feasibility/Sensitivity plan: a new
`GraphNode`/catalogue-record kind, a kernel evaluation case, one new editor
view component, palette wiring. It is *not* smaller than that plan, despite
"just a picture" sounding lighter — the reuse of the expression compiler and
the formula-node wiring model is what keeps it from being much larger.
Recommend treating this as its own implementation pass (schema → kernel →
editor, in that order, per `AGENTS.md`'s layering), not folded into the
photography catalogue work.
