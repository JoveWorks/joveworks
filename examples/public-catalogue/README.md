# Public showcase catalogue

`basic-mechanics.json` — 37 textbook-independent formulas (stress/strain,
beams, torsion, columns, springs, rigid-body dynamics, basic machine
elements), written by hand rather than extracted from a source. Not from
Roloff & Matek, not from any single textbook — standard, freely restatable
mechanics. `restricted: false`; safe to load, share, and demo the editor with.

Written following [`docs/authoring-catalogues.md`](../../docs/authoring-catalogues.md).
Ids are namespaced `basic.*` so they cannot collide with `rm.*` (the R&M
catalogue) or the base node library (S65). Every formula's `status` is
`unverified` — none is backed by a pinned golden value yet, and the schema is
meant to say that honestly rather than imply coverage that isn't there (S19).

Validate after editing:

    MDS_CATALOGUE=examples/public-catalogue/basic-mechanics.json pnpm test
