# Authoring a formula catalogue by hand

A catalogue is a JSON file of `Formula` records read by `@joveworks/schema`
(`packages/schema/src/formula.ts`, `port.ts`). This is a guide to writing one
directly, for the cases where there is no source script to extract from — an
invented or textbook-independent catalogue, a demo, a course pack from a
source other than R&M.

**This is a workaround, not the intended path.** The in-editor
authoring UI is deferred out of milestone 1; until it exists, hand-written JSON is
"the smell" — the right tool is missing, not the right approach.
Fine for a few dozen records; if you are writing hundreds by hand, that itself
is the signal the authoring UI is now worth building.

For an R&M chapter specifically, do not use this guide — see
`tools/extract/c16_belt.py` and write a per-chapter extraction script instead.
This guide is for catalogues with no such source.

## File shape

```json
{
  "schemaVersion": 1,
  "id": "my-catalogue",
  "name": "Human-readable name",
  "restricted": false,
  "formulas": [ /* Formula records */ ]
}
```

`restricted` is a statement of intent inside the app — the app refuses
to export a restricted catalogue's expressions. Set it `false` only for
content you actually have the right to redistribute; it is not what enforces
distribution restrictions — a repository boundary does that.

## Formula ids are global

A graph names a formula by id + version + hash, with no catalogue field, so
ids must not collide across every catalogue that might ever be loaded
together — R&M's `rm.*`, the base nodes, and yours. Pick a namespace prefix
for your catalogue and stick to it, e.g. `basic.<n>` or `<catalogue-id>.<n>`.

## A formula record

```json
{
  "id": "basic.1",
  "version": 1,
  "output": { "kind": "numeric", "name": "sigma", "unit": "N/mm²" },
  "inputs": [
    { "kind": "numeric", "name": "F", "unit": "N", "validRange": { "min": 0 } },
    { "kind": "numeric", "name": "A", "unit": "mm²", "validRange": { "min": 0 } }
  ],
  "expression": "F / A",
  "description": "Normal stress under axial load.",
  "status": "unverified"
}
```

Fields:

- **id, version** — version bumps whenever the record's *meaning* changes; a
  graph pins to a specific version + content hash, so editing an
  existing record's expression or ports without bumping version is a silent
  break for anyone who already referenced it.
- **output, inputs** — ports, see below. Output first is the drawing order,
  not a schema requirement.
- **expression** — a string, parsed and compiled by the kernel, never
  evaluated here. See the expression rules below.
- **description** — what it computes and when it applies. This is the only
  prose most users read; write it as such.
- **citation** — optional. Omit it entirely for invented formulas — base
  nodes cite nothing; do not invent a fake one.
- **variantOf** — links rearranged forms of one relation. Skip unless
  you are actually authoring more than one arrangement of the same equation.
- **appliesWhen** — a boolean predicate over this formula's own input port
  names, e.g. `"d < 50"`, for the case where a relation only holds under some
  condition. Omit if it always applies.
- **status** — `verified`, `unverified`, or `quarantined`. Be honest,
  not optimistic:
  - `unverified` is the correct default for a formula you derived and did not
    check end to end against an independent numeric example. It is not a
    lesser status to avoid — it is what "I did not test this specific
    record" means, and the schema deliberately makes that a visible, ordinary
    state rather than a rare failure.
  - `verified` should mean an independent worked example reproduces the
    formula's output, ideally pinned as a test fixture the way
    `test/belt-goldens.test.ts` pins the belt lab's values.
  - `quarantined` needs a `quarantineReason` and makes the record unusable
    (`isEvaluable` returns false). Use it for a formula you know is wrong or
    whose unit tag you could not resolve — never delete or silently fix such
    a record; quarantine keeps it visible.

## Ports

Three kinds (`packages/schema/src/port.ts`):

- **numeric** — `{ kind, name, unit, preferredUnit?, default?, validRange?, monotonic? }`.
  `unit` is a display-unit string like `N/mm²`, `mm`, `rad`, or `""` for
  dimensionless; the dimension is derived from it, never declared
  separately. `preferredUnit` is an optional same-dimension display preference
  for this node's port — for example, a source tagged `s-1` can display as
  `Hz`; omit it when the authored unit is already the right presentation.
  `validRange` is load-bearing — it bounds sweeps, not just a UI
  hint — so set it wherever a formula only makes physical sense over part of
  the number line (`F >= 0`, an angle in `[0, pi]`).
- **categorical** — `{ kind, name, domain, default? }`. An enumerated set of
  strings, e.g. `["H7", "H8", "K7"]`. Sweeps by explicit list only.
- **spectrum** — `{ kind, name, unit }`, input-only. A whole series consumed
  at once by `sum`/`prod`/`least`/`greatest` — you will not need this
  for straightforward single-value formulas.

A port's `name` is the symbol used in `expression` — keep it the way you'd
write it in the formula (`sigma`, `F`, `A`), not a display label; a longer
label belongs in `description`.

## Units are canonical internally: mm, N, s, rad, K

Write every port's display unit however is natural for a reader (`kN`,
`MPa`, `deg`), but **every bare number written inside `expression`** is
interpreted in canonical units regardless of a port's display unit —
`d < 50` means 50 mm even if `d`'s display unit is `m`. Angles are radians
internally and degrees only at the display boundary; if a port is an
angle, its unit should be `rad` or `deg`, and trig functions inside the
expression accept either an angle-dimensioned or a dimensionless argument.

## Expression rules

- A string, never `eval`'d — parsed to an AST, compiled to closures.
- No conditionals inside an expression. Branching selects *which formula
  applies* (`appliesWhen`, `variantOf`), never lives inside one.
- Allowed functions (`packages/kernel/src/functions.ts`): `abs`, `sqrt`,
  `cbrt`, `min`, `max`, `floor`, `ceil`, `round`, `sin`, `cos`, `tan`, `asin`,
  `acos`, `atan`, `sinh`, `cosh`, `tanh`, `log`, `exp`, plus the constant
  `pi`. Reductions `sum`, `prod`, `least`, `greatest` apply only to a
  spectrum port's whole series.
- `sin`/`cos`/`tan` accept an angle or a dimensionless argument;
  `asin`/`acos`/`atan` always *return* an angle; `log`/`exp`/`sinh` etc.
  require a dimensionless argument. `min`/`max` require identical dimensions
  across arguments. Rounding preserves dimension.
- A bare numeric literal facing a dimensioned value takes that dimension, in
  canonical units — so `F < 1000` in a newton context is 1000 N. Two
  *ports* with disagreeing declared units is still a hard error.

## Validate what you wrote

`@joveworks/schema`'s `loadCatalogue` parses and throws on a malformed record.
`@joveworks/kernel`'s `checkFormulaDimensions` checks every evaluable formula's
expression against its declared ports — this is what catches a `+` that
should have been a `*`, or a port unit that does not match what the
expression actually produces. Point `test/catalogue-check.test.ts` at your
file:

```
JOVEWORKS_CATALOGUE=/path/to/your-catalogue.json pnpm test
```

It parses the file, runs the dimension check over every non-quarantined
formula, and fails loudly with every offending formula's id and message —
not just the first — because a hand-authored batch fails the same way a
scripted extraction does: see every problem at once, not one at a time.

## What this guide does not cover

Distribution restrictions on *specific content* (R&M, or anything else under
a similar constraint) are a repository-boundary problem, not a schema
problem — see `CLAUDE.md`'s "Distribution restriction" section. This guide is
about the mechanics of writing a valid catalogue; whether you may write and
share a *particular* formula's content is a separate question this file does
not answer.
