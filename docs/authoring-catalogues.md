# Authoring a formula catalogue by hand

A catalogue is a YAML or JSON file of `Formula` records read by `@joveworks/schema`
(`packages/schema/src/formula.ts`, `port.ts`). This is a guide to writing one
directly, for the cases where there is no source script to extract from — an
invented or textbook-independent catalogue, a demo, a course pack from a
source other than R&M. Every example here is written in YAML — it is the
easier format to hand-edit, with no trailing-comma or quote-every-key
ceremony — and a short note at the end of the next section covers writing the
same schema as JSON instead.

**This is a workaround, not the intended path.** The in-editor
authoring UI is deferred out of milestone 1; until it exists, hand-written JSON is
"the smell" — the right tool is missing, not the right approach.
Fine for a few dozen records; if you are writing hundreds by hand, that itself
is the signal the authoring UI is now worth building.

For an R&M chapter specifically, do not use this guide — see
`tools/extract/c16_belt.py` and write a per-chapter extraction script instead.
This guide is for catalogues with no such source.

## File shape

```yaml
schemaVersion: 1
id: my-catalogue
name:
  en: Human-readable name
  nl: Leesbare naam
restricted: false
formulas: []
```

`packages/editor/src/catalogues/running.yaml` is a complete bundled example
covering pace, race-time projection, grade, and climbing rate. The next
section builds a second one from scratch, field by field.

`restricted` is a statement of intent inside the app — the app refuses
to export a restricted catalogue's expressions. Set it `false` only for
content you actually have the right to redistribute; it is not what enforces
distribution restrictions — a repository boundary does that.

JoveWorks uses YAML 1.2, requires unique string keys, and rejects custom tags,
merge keys, anchors, and aliases. Quote a scalar when YAML punctuation could
change its meaning — expressions containing `#` or `:`, for example.

> **JSON works too, in a short note.** The editor and catalogue-author app
> accept `.json` files as well as `.yaml`/`.yml` — same schema, same
> validation, the same file just written with braces and quoted keys instead
> of indentation:
> ```json
> { "schemaVersion": 1, "id": "my-catalogue", "name": { "en": "Human-readable name" }, "restricted": false, "formulas": [] }
> ```
> JSON remains the canonical export and browser-cache format; YAML is an input
> syntax over the same data model, not a second one. Every example from here
> on is YAML, and it translates key for key.

## A complete example

A small catalogue, start to finish — four invented, unverified fastener
formulas, not vetted for real design use. The point is the schema, not the
engineering. Field meanings are explained in the sections below; skim this
once for shape, then come back to it after reading them.

```yaml
schemaVersion: 1
id: workshop-fasteners
name:
  en: Workshop fasteners (example)
restricted: false
formulas:
  - id: workshop.stress.normal
    version: 1
    output:
      kind: numeric
      name: sigma
      unit: MPa
      validRange:
        min: 0
    inputs:
      - kind: numeric
        name: F
        unit: N
        validRange:
          min: 0
      - kind: numeric
        name: A
        unit: mm²
        validRange:
          min: 0
    expression: F / A
    description:
      en: Normal (axial) stress from a force spread over a cross-sectional area.
    status: unverified

  - id: workshop.stress.shear
    version: 1
    output:
      kind: numeric
      name: tau
      unit: MPa
      validRange:
        min: 0
    inputs:
      - kind: numeric
        name: F
        unit: N
        validRange:
          min: 0
      - kind: numeric
        name: A
        unit: mm²
        validRange:
          min: 0
    expression: F / A
    description:
      en: Average shear stress from a force acting across a cross-sectional area.
    status: unverified

  - id: workshop.stress.normal-solve-for-area
    version: 1
    output:
      kind: numeric
      name: A
      unit: mm²
      validRange:
        min: 0
    inputs:
      - kind: numeric
        name: F
        unit: N
        validRange:
          min: 0
      - kind: numeric
        name: sigma
        unit: MPa
        validRange:
          min: 0
    expression: F / sigma
    description:
      en: >-
        The same relation as workshop.stress.normal, solved for the
        cross-sectional area needed to keep stress at or below a target.
    variantOf: workshop.stress.normal
    status: unverified

  - id: workshop.bolt.preload-and-utilization
    version: 1
    output:
      - kind: numeric
        name: F_clamp
        unit: N
        validRange:
          min: 0
      - kind: numeric
        name: sigma_bolt
        unit: MPa
        validRange:
          min: 0
      - kind: numeric
        name: utilization
        unit: ""
        validRange:
          min: 0
    inputs:
      - kind: numeric
        name: T
        unit: Nm
        validRange:
          min: 0
      - kind: numeric
        name: d
        unit: mm
        validRange:
          min: 0
      - kind: numeric
        name: K
        unit: ""
        default: 0.2
        validRange:
          min: 0.1
          max: 0.3
      - kind: numeric
        name: A_s
        unit: mm²
        validRange:
          min: 0
      - kind: numeric
        name: sigma_yield
        unit: MPa
        validRange:
          min: 0
    expression:
      F_clamp: T / (K * d)
      sigma_bolt: F_clamp / A_s
      utilization: sigma_bolt / sigma_yield
    description:
      en: >-
        Estimated bolt preload from tightening torque, the resulting stress
        over the bolt's stress area, and how much of the yield strength that
        uses. K is the joint's dimensionless friction/nut factor.
    appliesWhen:
      sigma_bolt: T > 0
      utilization: T > 0
    status: unverified
```

What each record is doing, beyond its own physics:

- **`workshop.stress.normal`** and **`workshop.stress.shear`** are the
  plainest shape a formula gets: one output, a couple of numeric inputs, a
  one-line expression. They compute the same algebra for a reason —
  identical arithmetic is still two different formulas when it means two
  different things, so it gets two different ids and descriptions rather than
  one record reused.
- **`workshop.stress.normal-solve-for-area`** is the same relation rearranged
  to solve for a different variable, linked back with `variantOf` — this is
  the shape a `variantOf` group takes when you author one yourself, the same
  way R&M's `17.1A`/`B`/`C` are one relation in three arrangements.
- **`workshop.bolt.preload-and-utilization`** answers with three outputs from
  one record. `expression` becomes an object keyed by output name, computed
  in declared order, and `sigma_bolt`'s expression names `F_clamp` — an
  earlier output in the same record — rather than repeating its algebra.
  `appliesWhen` is keyed the same way to guard only the two outputs that
  depend on the joint actually being tightened. `K` and `utilization` both
  declare `unit: ""` — dimensionless, quoted because an empty YAML scalar
  needs the quotes to stay a string rather than parse as null.

Save it as `workshop-fasteners.yaml` and point `JOVEWORKS_CATALOGUE` at it
(see "Validate what you wrote" below) to confirm it loads and passes the
dimension check before you build on it.

## Formula ids are global

A graph names a formula by id + version + hash, with no catalogue field, so
ids must not collide across every catalogue that might ever be loaded
together — R&M's `rm.*`, the base nodes, and yours. Pick a namespace prefix
for your catalogue and stick to it, e.g. `mechanics.stress.normal` or `<domain>.<category>.<name>`.

## A formula record

```yaml
id: mechanics.stress.normal
version: 1
output:
  kind: numeric
  name: sigma
  unit: N/mm²
inputs:
  - kind: numeric
    name: F
    unit: N
    validRange:
      min: 0
  - kind: numeric
    name: A
    unit: mm²
    validRange:
      min: 0
expression: F / A
description:
  en: Normal stress under axial load.
  nl: Normale spanning bij axiale belasting.
status: unverified
```

Fields:

- **id, version** — version bumps whenever the record's *meaning* changes; a
  graph pins to a specific version + content hash, so editing an
  existing record's expression or ports without bumping version is a silent
  break for anyone who already referenced it.
- **output, inputs** — ports, see below. Output first is the drawing order,
  not a schema requirement. Write `output` as a bare object for one output, or
  as a list where one record answers with several — a camera picked once
  returning its whole spec sheet, a focus distance returning near limit, far
  limit and total together.
- **expression** — a string, parsed and compiled by the kernel, never
  evaluated here. See the expression rules below. A record with several
  outputs writes an object keyed by output name instead:

  ```yaml
  expression:
    D_n: (H * s) / (H + (s - f))
    D_f: (H * s) / (H - (s - f))
    DoF: D_f - D_n
  ```

  Outputs are computed **in declared order, and each may name any output
  declared before it** — `DoF` above is the difference of the two limits
  rather than a second copy of their algebra, which is one fewer place for
  the two to drift apart. Naming a *later* output is refused, so a record
  cannot hold a cycle.
- **name, description, port description, quarantineReason and optional label** —
  localized text maps. Every map must contain `en`; add `nl` or any other
  BCP-47 language tag when available. Missing translations fall back to English.
  **description** says what it computes and when it applies. This is the only
  prose most users read; write it as such.
- **citation** — optional. Omit it entirely for invented formulas — base
  nodes cite nothing; do not invent a fake one.
- **variantOf** — links rearranged forms of one relation. Skip unless
  you are actually authoring more than one arrangement of the same equation.
- **appliesWhen** — a boolean predicate over this formula's own input port
  names, e.g. `d < 50`, for the case where a relation only holds under some
  condition. Omit if it always applies. Where a record answers with several
  outputs whose ranges differ, key it by output name the way `expression` is
  — past the hyperfocal distance a far limit is infinite while the near limit
  is still meaningful, so only the guarded outputs warn:

  ```yaml
  appliesWhen:
    D_f: s < H
    DoF: s < H
  ```

  A bare string guards every output, which is what it has always meant.
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

Two kinds a hand-authored formula uses (`packages/schema/src/port.ts`):

- **numeric** — `{ kind, name, unit, preferredUnit?, default?, validRange?, monotonic?, variadic? }`.
  `unit` is a display-unit string like `N/mm²`, `mm`, `rad`, or `""` for
  dimensionless; the dimension is derived from it, never declared
  separately. `preferredUnit` is an optional same-dimension display preference
  for this node's port — for example, a source tagged `s-1` can display as
  `Hz`; omit it when the authored unit is already the right presentation.
  `validRange` is load-bearing — it bounds sweeps, not just a UI
  hint — so set it wherever a formula only makes physical sense over part of
  the number line (`F >= 0`, an angle in `[0, pi]`).
  `default` is what the port's field on the node starts at while nothing is
  wired to it. Every numeric port takes a value typed there whether or not you
  declare one, so declare it only where a conventional starting value exists (a
  sharpness divisor of 1500, a friction coefficient) — never merely to make the
  port editable. `variadic: true` marks an input that takes several wires
  instead of one, consumed whole by a reduction such as `sum`/`prod`/`least`/
  `greatest`; a straightforward formula with a fixed set of named inputs will
  not need it.
- **categorical** — `{ kind, name, domain, default? }`. An enumerated set of
  strings, e.g. `["H7", "H8", "K7"]`. Sweeps by explicit list only. Its
  `default` reads the same way: with none declared, the port's dropdown starts
  on no choice rather than silently on the domain's first entry. A categorical
  port only participates in `expression` through a `lookup` table — a
  table-backed formula is a separate, more advanced mechanism this guide
  doesn't cover; every formula here is expression-only and uses numeric ports
  exclusively.

There is a third kind, `bundle`, but no catalogue formula declares one — it
is what `pack`/`unpack` synthesize for themselves at resolve time.

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
  variadic port's whole set of wires.
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
JOVEWORKS_CATALOGUE=/path/to/your-catalogue.yaml pnpm test
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
not answer. Table-backed (`lookup`) formulas, needed for a categorical input
or a data-table output, are also out of scope here.
