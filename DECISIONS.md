# Decisions

Companion to [PLAN.md](PLAN.md). Records what is settled and why. Last updated
2026-08-14.

**Nothing blocks the first commit.** S1–S33 are settled and D1–D12 are closed.
What remains:

- **D14 and D15** — two sweep/plot details that touch the schema, so they want
  settling before step 2 rather than at the UI stage.
- **Content sign-off** — the known defects and the junk unit tags. Gates
  individual formulas via the S19/S20 quarantine, never a build step.
- **D13, the licence** — open, but only bites at publication.

---

## Settled

| # | Decision | Rationale |
|---|---|---|
| S1 | **Build a node-editor design tool**, not a library | The graph expresses "define the calculation, then solve" natively |
| S2 | **No runtime CAS** | Measured across the old repo's 23 worked-example notebooks (the 22 in `notebooks/` plus the archived contour notebook; `tools/VerifyExpressions.ipynb` is tooling and excluded): `EqPrint` 410 calls, `substitute` 84, `evaluate` 38, `MyHelp` 38, and `reorderEquation` — the only genuine symbolic algebra — **0 calls, and broken**. The symbolic layer was inherited habit |
| S3 | **React Flow for the UI** | Verified below |
| S4 | **Formulas are data**; the editor is the authoring tool | Removes docstring-vs-code drift by construction |
| S5 | **Canonical units mm, N, s, rad, K**; convert at the boundary; undeclared unit is a hard error | Matches R&M's own N/mm² convention; Kelvin keeps everything multiplicative |
| S6 | **Dimensions are port types** | A force output will not connect to a length input |
| S7 | **Old notebooks frozen as verification fixtures** | 46 of 539 methods covered, ~95 numeric goldens |
| S8 | **Defects reported, never silently carried across** | ~12 confirmed wrong formulas in the old library. **Amended by S19**: this originally read "`DEFECTS.md` *before* migration". Extraction is mechanical and need not wait — the `status` quarantine keeps defects away from students without gating the run |
| S9 | **Engine/content split**; R&M catalogue stays restricted | Distribution restriction on the textbook expressions |
| S10 | **Formulas carry a citation field**; multiple sources plus custom formulas supported | Preserves textbook traceability once source files are no longer read |
| S11 | **New repository; no code reuse** | The scope exceeded a refactor. `mechanical-design` is a reference for formula content, fixtures and known defects — nothing else |
| S12 | **Name: `machine-design-studio`**, at `~/source/machine-design-studio` | Descriptive: names the domain and signals an application rather than a library |
| S13 | **Kernel in TypeScript** (was D1), standalone package with no React dependency | Workload is sub-millisecond in JS; WASM's per-call boundary cost likely exceeds its gain for many small evaluations. Keep the package seam clean so a hot path can move later. Escalate to Web Workers before WASM |
| S14 | **Pure client-side, no backend** (was D2) | A server cannot protect formulas a client-side kernel must evaluate anyway — it only adds an auth gate. The LMS-file route satisfies S9 honestly: the public app ships zero textbook content, and it exercises S10's multi-source path as a first-class case |
| S15 | **Web delivery, static hosting; Tauri wrapper left open** (was D3) | Students open a link. Consequences: no Node-only APIs in app code, and file load/save sits behind an adapter so a Tauri fs backend can drop in without touching call sites |
| S16 | **Forward evaluation only; no solving code** (was D5) | R&M numbers its own rearranged forms (`E17_1A/B/C`), so rearrangements are migrated content, not computed. The rearranged formula is the thing being taught — a root-finder hides it. Gaps are closed by authoring the inverse in the editor (S4 makes this cheap) or by a range sweep |
| S17 | **Schema leaves room for per-node numeric inversion** (from D5) | So adding a 1-D root-find later needs no schema migration. Requires: `variantOf` grouping of equation forms, per-port valid range treated as load-bearing (it is the bracketing interval), and an optional per-(output,input) monotonicity hint |
| S18 | **Cycles forbidden, rejected at connect time** (was D4) | One consistent rule with S6: invalid connections do not attach. The graph is always evaluable; no unevaluable state for the UI to represent. Cycle check per candidate connection is trivial at this graph size |
| S19 | **Every formula carries a `status`; migration is not gated on sign-off** (was D6) | Extraction runs over all 539; anything flagged is quarantined and cannot reach a student until signed off. Decouples ~22 manual textbook lookups from the critical path without letting a defect cross the boundary. Triage first — the dimension check catches misplaced operators unaided, and the six `C14_BallBearing` `is list` bugs are Python type-test errors with no R&M question attached |
| S20 | **Unparseable unit tags quarantine their formula** (was D7) | Same gate as S19. S5 holds — an undeclared unit really is a hard error and the formula is unusable — but 30 content questions no longer block 539 extractions |
| S21 | **Revolutions are a dimensionless count with a 10⁶ display scale** (from D7) | Bearing life L₁₀ is not stored as an angle. Matches ISO 281 and R&M presentation, keeps the displayed value the one students expect, and leaves the canonical base at the five units S5 fixes |
| S22 | **pnpm workspaces only**; no Turborepo/Nx (was D12) | Orchestrators solve problems six packages and one developer do not have. TypeScript project references do the load-bearing work: they enforce dependency direction at compile time, which is what keeps React out of the kernel (S13) and keeps the restricted catalogue (S9) unimportable from anything published. Vitest for tests, Vite for the editor |
| S23 | **Graphs reference formulas by ID + version + content hash**; never embed them (was D9) | Graph files circulate — email, repos, submissions — so an embedded formula snapshot would leak R&M content past S9 by construction. The hash means opening against a different catalogue version warns instead of silently recomputing. Consequence: a graph requires the catalogue to open |
| S24 | **IndexedDB autosave, plus explicit file export/import** (was D9) | A closed tab must not lose a term's work. Export gives a real artefact for submission and sharing. File System Access API as progressive enhancement only; all of it behind the S15 adapter so a Tauri fs backend can replace it |
| S25 | **Integer schema version, forward migration chain N→N+1** (was D9) | Applies to catalogue and graph documents independently. One saved fixture per historical version is kept in the repo and asserted to still load — that test is what makes the compatibility promise real rather than aspirational |
| S26 | **Observable Plot for sweeps, `d3-contour` for contours** (was D8) | Contour is *not* the discriminator the earlier note assumed: it is one chart in the whole corpus, and since the kernel vectorises ranges we already own the grid, so marching squares over it is a small component we control. Library chosen on the line-sweep majority instead. Rules out dragging a heavyweight bundle into a client-side app for a single plot. Verify the contour path against the key-design case before committing |
| S27 | **Narrative attaches to the graph document, never the catalogue** (was D10) | The notebooks' prose is per-assignment, not per-formula — "estimate the gear ratio first" belongs to the chain example, not to `E17_1A`. Keeps lecturer explanation clear of the S9 restriction |
| S28 | **Titled group frames with markdown notes; reserved in schema now, built at step 6** (from D10) | Reproduces notebook prose in reading order using React Flow group nodes. First-class rather than decoration, because the same mechanism is how a student documents their reasoning — and that argument, not the number, is the assessable artefact. Reserving it now avoids an S25 migration later. **Upgraded by S30**: frames are no longer decoration deferrable to step 6 — they are the notebook's section structure, and therefore load-bearing |
| S29 | **Range nodes support linear, logarithmic, explicit-list and table-column kinds**; point count is the primary control, not step size | Sweeps are the primary use of the tool, not an add-on. **Log spacing is required for teaching**, not a convenience: Wöhler S–N curves are log–log and bearing life is a power law (`L₁₀ ∝ (C/P)^p`, p = 3 or 10/3), so linear sampling across decades leaves the knee unresolved and makes the straight line a student should recognise look curved. A log range defaults its plot axis to log. Explicit lists matter because machine design picks from standard series — stock diameters, available bores, preferred numbers — not from a continuum. `linspace(a, b, n)` avoids the floating-point endpoint ambiguity of step form, makes sweep cost predictable, and makes a two-input grid exactly `n × m` |
| S30 | **The notebook is a view over the graph; group frames are its sections** | The graph replaces the *computation*, not the *document* — the old deliverable was prose, result, plot in reading order, and that is still what gets handed in. A frame renders as a section: its markdown note is the prose, the output nodes inside it are the results. No new concepts beyond S28, and the canvas layout *is* the document outline, so arranging the graph arranges the report |
| S31 | **Notebook is a live, collapsible side panel** | The document takes shape while the graph is built, rather than being discovered at export time. Collapsible because node editors want horizontal room |
| S32 | **Export shows citation and values by default; expressions only behind a marked toggle** | S23 keeps *graph files* clean of R&M content, but an exported PDF showing `τ_t = T/W_t` would put the textbook expression straight back into a circulating file. Default export carries citation plus numbers and is safe to submit; revealing expressions stays possible for personal use and is explicitly flagged as restricted |
| S33 | **Four first-class output node kinds**: value readout, check/constraint, plot, table | The check kind (`S ≥ 1.5 → pass`) is what turns the notebook from a list of numbers into a dimensioning report, and is the scalar counterpart of the threshold overlay on a swept curve. Table is the natural form when a range is an explicit list of standard sizes (S29) rather than a continuum |

---

## Framework research (verified 2026-08-14)

### React Flow (`@xyflow/react`)

- MIT licensed **core**; ~38k stars; ~90 open issues; actively maintained by a
  small Berlin team.
- Open-core model: the Pro tier sells **examples, priority bug fixes and email
  support — not features**. The library is fully MIT.
- They offer free Pro access to students and non-commercial projects on request.
  Not pursued — see D11.
- Note: npm-trends comparisons showing Rete ahead are measuring the **legacy
  `reactflow` v11 package**. The current package is `@xyflow/react` v12.

### Rete.js

~12k stars, multi-framework (React/Vue/Angular/Svelte/Lit), ships **built-in
dataflow and control-flow engines**. That is the deciding difference: its engine
overlaps the kernel we are building, so we would work around it. React Flow is
purely graph UI and leaves evaluation to us.

### Python node editors (rejected with S3)

| Library | State |
|---|---|
| DearPyGui | Node editor is real and actively maintained, but ImGui immediate-mode primitives — the surrounding editor machinery is yours to build |
| NodeGraphQt | More complete, Qt-bound, quieter development |
| Ryven | Describes *itself* as experimental |

Every path to a good node editor means writing TypeScript, since React Flow and
Rete are TS libraries. "Stay in Python" only buys a Python backend behind a TS
frontend.

---

## Outstanding

D1–D12 are all closed. What remains, in the order it will bite:

- **D14, D15** — schema-touching sweep and threshold details. Wanted before
  step 2.
- **Two content sign-off tasks** — neither gates a build step; both gate an
  individual formula reaching a student through the S19/S20 quarantine, and both
  need Roloff & Matek in hand.
- **D13** — the licence, never captured as a `D*` until the 2026-08-14 revision
  pass. Only bites at publication.

### Defect sign-off (from D6)

~12 confirmed and ~10 suspected wrong formulas. Triage before opening the book —
it should shrink the list to a handful of genuine content questions:

1. Run the dimensional check over the extracted set first. Misplaced parentheses
   and a `*` typed as `-` usually break dimensions, and are caught unaided.
2. Drop the six `C14_BallBearing` `is list` defects. They are Python type-test
   bugs that return `0`; the expression is fine and the guard is wrong. There is
   no textbook question to answer.
3. Take only what survives to R&M.

### The ~30 junk unit tags (from D7)

Likely a dozen confirmations rather than 30 reconstructions. Proposed readings,
each needing sign-off — these are *not* to be written into the catalogue on the
strength of the guess alone:

| Tag | Proposed reading |
|---|---|
| `[1E6rotatons]`, `[1e6revolutions]` | Millions of revolutions — bearing life L₁₀, ISO 281. See S21. The typo'd spelling and the case-variant duplicate are consistent with one quantity typed twice |
| `[E-6m]` | Micrometres — surface roughness, or a fit/tolerance deviation |
| `[__O]`, `[__o]` | Degrees; `°` mangled by an encoding round-trip |

The remaining ~500 tags normalise mechanically and need no sign-off
(`[N/mm²]`/`[N/mm**2]`/`[MPa]`; `[rpm]`/`[1/min]`/`[min-1]`; `[deg]`/`[°]`).

### D13. Licence for engine and editor — **open, surfaced 2026-08-14**

README says "to be decided, intended to be open"; no `D*` ever recorded it. Not
urgent, but it should be settled before anything is published, and it interacts
with S9: whatever licence the engine and editor carry, the **R&M catalogue is
restricted and not redistributable**, so the split must be explicit in the
repository rather than implied by a single top-level `LICENSE`.

Worth deciding alongside it: whether the repository is public at all, and if so
whether `packages/catalogue/` lives in it.

### D14. How a two-input grid sweep is expressed on the canvas — **before step 2**

Two range nodes feeding one graph could mean a paired sweep (zip, `n` points) or
a cartesian grid (`n × m`). The key-design notebook wants the grid — 14 key
lengths × 8 diameters — but nothing in the graph says which is meant.

Candidates: an explicit grid node combining two ranges; a flag on the plot node;
or a rule that two independent ranges always mean cartesian and pairing needs an
explicit zip. Touches the schema, so settle it before the schema is written.

### D15. How a threshold is bound to a plot or check — **before step 2**

`S ≥ 1.5` appears twice: as a check node on a scalar (S33) and as an overlay
line on a swept curve. Whether those are one concept with two renderings, or two
unrelated node types, decides whether the schema carries one acceptance-criterion
record or two. One concept is the obvious guess — a criterion attached to a port,
rendered as a pass/fail badge for a scalar and a line for a series — but it needs
confirming rather than assuming.

### Closed without action

**D11 — React Flow Pro for education.** Not requested. Pro sells examples,
priority bug fixes and email support — **not features** — and the core is fully
MIT, so nothing in the editor is affected. Do not reopen as a blocker.

---

## Decision log

| Date | Change |
|---|---|
| 2026-08-14 | S1–S10 settled; D1–D12 opened (in the predecessor repo) |
| 2026-08-14 | S11 no code reuse, S12 name and location; repository created; D12 narrowed to tooling only |
| 2026-08-14 | D1–D5 resolved as S13–S18: TypeScript kernel, no backend, web delivery, forward-only evaluation, cycles rejected at connect time |
| 2026-08-14 | D6–D7 resolved as S19–S21: formula `status` quarantine replaces sign-off-before-migration (**amending S8**), unparseable unit tags quarantine likewise, revolutions modelled as a dimensionless count. All kernel-, migration- and units-blocking decisions closed |
| 2026-08-14 | D12 resolved as S22, D9 as S23–S25: pnpm workspaces with TS project references, graphs reference formulas rather than embedding them, IndexedDB autosave plus file export, integer schema version with a tested migration chain |
| 2026-08-14 | D8 resolved as S26, D10 as S27–S28: Observable Plot with `d3-contour`, narrative as graph-level group frames reserved in the schema now |
| 2026-08-14 | D11 declined — not requesting React Flow Pro; the core is MIT and Pro sells support, not features. **All twelve original questions closed** |
| 2026-08-14 | **D14–D15 opened** — grid-sweep expression and threshold binding both touch the schema, so they are wanted before step 2, not at the UI stage |
| 2026-08-14 | **S30–S33 settled**: the notebook is a live side-panel view over the graph with group frames as its sections, four output node kinds including check/constraint, and export defaulting to citation-plus-values so submitted reports carry no R&M expressions. S28 upgraded from deferrable decoration to load-bearing structure |
| 2026-08-14 | OVERVIEW.md added as the one-read introduction. **S29 settled**: range kinds — linear, logarithmic, explicit list, table column — with point count as the primary control. Log spacing recorded as a teaching requirement (Wöhler curves, bearing life power law), not a convenience |
| 2026-08-14 | Revision pass across README, PLAN, DECISIONS and CLAUDE for consistency with S13–S28. S8 amended by S19; stale D4/D5 text removed from PLAN; notebook counts (22 vs 23) reconciled against the predecessor repo; **D13 opened** — the engine/editor licence was never captured as a decision |
