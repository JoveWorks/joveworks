# Catalogue authoring

A catalogue is a formula library — the expressions, ports, units, citations
and status behind the nodes in the palette. JoveWorks ships with a few
unrestricted ones; anyone can write another. That covers a course pack from a
source other than a restricted textbook, a personal set of formulas for a
project, or — just as often — a student's own derivation that goes beyond
what a course catalogue provides.

Two ways to write one:

- **The catalogue author app**, in a browser, no install and no repository
  checkout. This is the way to reach for first, and covers everything a
  straightforward formula needs.
- **Hand-written YAML**, for scripting many records at once or for the few
  things the app's forms don't yet expose (a formula with several outputs, a
  table-backed lookup, or a table of standard sizes). Covered further down.

Either way, `restricted` is a statement of intent, not an access control: set
it `false` only for content you actually have the right to redistribute. It
does not by itself stop a file from being shared — a repository or LMS
boundary does that.

## Build one in the browser

Open the catalogue author app at **`/author/`**, alongside this
documentation. It has no connection to any account or course material — it
only ever reads a file you choose and writes one back.

1. **New** starts an empty catalogue, or **Import…** opens an existing
   `.json`/`.yaml`/`.yml` file to keep extending — your own from a previous
   session, or one someone else wrote.
2. Fill in the catalogue's **id** and **Name** at the top. The id needs to be
   unique among every catalogue you'll ever load alongside this one.
3. **+ Add formula**, then give it an **id** in your own namespace (e.g.
   `myname.topic.formula` — formula ids are global across every catalogue, so
   pick a prefix and stick to it), a **Version**, and a **Status**
   (`unverified` is the honest default; see below).
4. Add **Inputs** with **+ Numeric input** or **+ Categorical input**. A
   numeric port takes a **Unit** (`N`, `mm/s`, `''` for dimensionless), an
   optional **Default**, a **Valid range**, and — rarely needed — **Monotonic**
   or **Variadic**. A categorical port takes a comma-separated **Domain**
   (`H7, H8, K7`) and an optional **Default**.
5. Write the **Expression** — plain algebra over the input names, e.g.
   `F / A`. See [Using catalogues](./catalogues) for what a wired formula
   node does with it, and the reference further down for exactly which
   functions and operators are allowed.
6. Add a **Description** — this is the prose a reader actually sees on the
   node — and, only for an invented formula that has a source worth citing, a
   **Citation**. Leave it blank for something you derived yourself.

Every formula validates as you type, the same dimension check the rest of
JoveWorks runs, listed at the bottom of the page with a click-through to the
offending formula. **Export** stays disabled until the whole catalogue is
clean — there is no way to save out something that fails its own dimension
check. Export writes a `<catalogue-id>.yaml` file to your downloads.

Two current limits. The app edits one output per formula: a formula that
needs to answer with several values at once (or read from a lookup table)
still round-trips through **Import**/**Export** untouched, but editing it
means writing YAML by hand. And the app has no editor for
[tables](#tables) at all: it keeps a catalogue's tables untouched when it
exports, so you write tables by hand and keep using the app for the
formulas — see below.

## Load it into JoveWorks

Back in the editor, **File → Load catalogue…** and pick the file you just
exported. It appears as its own section in the palette, cached in this
browser so it survives a reload. See [Using catalogues](./catalogues#load-a-catalogue)
for the full picture, including loading catalogues through a course's Hub.

A catalogue is just a file: nothing stops you emailing it to yourself,
keeping it in a personal notes folder, or handing it to a teammate the same
way you'd hand them anything else you made.

## Writing YAML by hand instead

The same schema, without the app. A catalogue is:

```yaml
schemaVersion: 2
id: my-catalogue
name:
  en: Human-readable name
restricted: false
formulas:
  - id: my.topic.formula
    version: 1
    output:
      kind: numeric
      name: sigma
      unit: N/mm²
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
      en: Normal stress under axial load.
    status: unverified
```

Each formula declares one or more outputs, its inputs, a safely parsed
expression, description, status, and optional citation, applicability
predicate, and variant group. Numeric ports declare units; categorical ports
declare their allowed domain. Valid ranges are functional data: they also
bound sweeps.

A record answering with several outputs writes `expression` as an object
keyed by output name, and may key `appliesWhen` the same way where only some
outputs stop applying. Outputs are computed in declared order and each may
name any output declared before it, so a total is written as the difference
of the two limits above it rather than restating their algebra.

### Tables

A table of standard sizes — motor frames, belt profiles, bearing bores — goes
in `tables`, beside `formulas`. Each table becomes its own entry in the
palette, under your catalogue and below its formulas, and drops a
[catalogue table](./node-reference#catalogue-table) node: the student sees
the whole table and clicks the rows and columns they want.

```yaml
schemaVersion: 2
id: my-catalogue
name:
  en: Human-readable name
restricted: false
formulas: []
tables:
  - id: my.motors.frames
    version: 1
    label:
      en: Motor frame sizes
    description:
      en: Standard motor frame sizes.
    citation: Table 2-4
    key:
      name: frame
    columns:
      - name: h
        unit: mm
      - name: P
        unit: W
        preferredUnit: kW
      - name: profile
      - name: z
        unit: ""
    rows:
      - ["71", 71, 370, ~, ~]
      - ["80", 80, 750, SPZ, 1]
      - ["90S", 90, 1100, SPZ, 2]
```

**The fields.** `id`, `version`, `description`, `key`, `columns` and `rows`
are required. `label` is the palette entry's name (without one it shows the
`citation`, or else the id), `citation` is searchable in the palette, and
`href` links the table into your catalogue's book exactly as it does for a
formula. `key` and each column are `{ name, unit?, description? }`, and a
column may add a `preferredUnit` to be shown in first.

**The rows.** Each row lists the key first, then one cell per column, in the
order `columns` declares them.

- A column **with a `unit`** holds numbers in that unit; `unit: ""` is a
  plain number, such as a count.
- A column **without a `unit`** holds names — a profile, a designation.
- **`~` is an empty cell** (`null` in JSON). Use it where the book prints a
  dash: a dash typed as text is refused in a column of numbers, and becomes a
  real name in a column of names.

**The key** names each row. Every row has one and no two share one; a key
with a `unit` is a number and must rise from row to row. **Quote keys that
look like numbers** — YAML reads a bare `71` as a number, which a key of
names refuses; `"71"` and `90S` are names. The rows stay in the order you
write them, and that is the order a student's sweep runs in, so write them
the way the book does.

**Table or lookup formula?** A table is for rows *the student picks*. When a
computed value should choose the row — a diameter fetching its key width —
the student can pick all rows and read them through an
[Interpolate](./node-reference#interpolate) node, so a table still works.
Use a lookup formula only for a table keyed by **two** things, such as a
profile and a diameter band; a table cannot hold that.

**Versions.** Tables need `schemaVersion: 2`; a version-1 catalogue still
loads, it just cannot hold tables. A saved NodeBook pins a table by its id,
`version` and content: changing the label, description or citation leaves
it alone, while changing a row, the key or a column's name or unit flags it
as changed — so bump the table's `version` when you do.

The complete field-by-field guide, including a full worked example with
several formulas and a table record, lives in
[`docs/authoring-catalogues.md`](https://github.com/JoveWorks/joveworks/blob/main/docs/authoring-catalogues.md).

## Validate before distributing

The browser app already runs this check on every keystroke and refuses to
export until it passes. Reach for this instead when a catalogue was
hand-written, generated by a script, or needs a repeatable check outside the
app — from a checkout of the repository:

```sh
JOVEWORKS_CATALOGUE=/absolute/path/to/catalogue.json pnpm test
```

It parses every record, checks the dimensions of every evaluable expression,
reports all failures together, detects duplicate or unnamespaced ids, and flags
quarantined formulas whose dimension check now passes. A formula becomes
`verified` only after an independent numeric example is pinned as a golden test.

## Changes and in-flight graphs

Graph files never embed catalogue expressions. They pin each formula by global
id, integer version, and content hash. Therefore:

- Correcting metadata or an expression changes the hash; bump the formula's
  version whenever its meaning changes.
- Keep the old catalogue available while anyone still has a graph that pins
  it — a fellow student, or your own earlier assignment. Loading a changed
  record is detected, not silently accepted.
- Quarantine an ambiguous or defective record with a clear reason. Do not
  silently repair source material or delete the evidence.
- A document schema bump and a formula version bump solve different problems:
  the first migrates graph structure; the second identifies catalogue content.

There is currently no automatic migration from one formula version to another.
Publish corrected catalogues deliberately and tell whoever relies on them
which graphs need review; automatic remapping would conceal a changed
engineering calculation.
