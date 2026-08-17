# Catalogue authoring for teachers

NodeBooks loads formula catalogues as data. Public, textbook-independent
catalogues may ship with the editor; restricted course content belongs in a
separate private repository and should be distributed through the course LMS.
Never use the `restricted` flag as a substitute for that repository boundary.

## Start with the schema

A catalogue has an integer `schemaVersion`, a globally unique `id`, a display
`name`, a `restricted` flag, and a list of formulas. Formula ids are global too:
a graph stores the formula id, version, and content hash, but no catalogue id.
Use a durable namespace such as `course-name.topic.formula`.

Each formula declares one output, its inputs, a safely parsed expression,
description, status, and optional citation, applicability predicate, and
variant group. Numeric ports declare units; categorical ports declare their
allowed domain. Valid ranges are functional data: they also bound sweeps.

The complete field-by-field guide and an invented example live in
[`docs/authoring-catalogues.md`](https://github.com/ThomasVanRiel/machine-design-studio/blob/main/docs/authoring-catalogues.md).

## Validate before distributing

Run the repository's catalogue check against the file:

```sh
MDS_CATALOGUE=/absolute/path/to/catalogue.json pnpm test
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
- Keep the old catalogue available while students still have graphs that pin
  it. Loading a changed record is detected, not silently accepted.
- Quarantine an ambiguous or defective record with a clear reason. Do not
  silently repair source material or delete the evidence.
- A document schema bump and a formula version bump solve different problems:
  the first migrates graph structure; the second identifies catalogue content.

There is currently no automatic migration from one formula version to another.
Publish corrected catalogues deliberately and tell students which graphs need
review; automatic remapping would conceal a changed engineering calculation.
