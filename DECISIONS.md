# Decisions

Companion to [PLAN.md](PLAN.md). Records what is settled and why. Last updated
2026-08-14.

**Every decision is closed.** S1–S52 are settled; D1–D19 are all resolved.

The only work left that is not code is **content sign-off** — the known defects
and the junk unit tags — which needs Roloff & Matek in hand. It gates individual
formulas through the S19/S20 quarantine, never a build step.

One thing to verify outside this repo before publishing: **whether KU Leuven
claims rights over course-derived material** (see S44).

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
| S25 | **Integer schema version stamped from day one; migration chain deferred** (was D9) | **Amended 2026-08-14**: originally specified the full N→N+1 chain plus a stored fixture per version. That machinery protects existing user graphs, and there are none — until then the format can change and documents are regenerated. The *stamp* stays, because it costs one integer field and without it a file written today cannot be identified later. The chain and its fixtures arrive when real student graphs exist; that test is still what will make the promise real rather than aspirational |
| S26 | **Observable Plot for sweeps, `d3-contour` for contours** (was D8) | Contour is *not* the discriminator the earlier note assumed: it is one chart in the whole corpus, and since the kernel vectorises ranges we already own the grid, so marching squares over it is a small component we control. Library chosen on the line-sweep majority instead. Rules out dragging a heavyweight bundle into a client-side app for a single plot. Verify the contour path against the key-design case before committing |
| S27 | **Narrative attaches to the graph document, never the catalogue** (was D10) | The notebooks' prose is per-assignment, not per-formula — "estimate the gear ratio first" belongs to the chain example, not to `E17_1A`. Keeps lecturer explanation clear of the S9 restriction |
| S28 | **Titled group frames with markdown notes; reserved in schema now, built at step 6** (from D10) | Reproduces notebook prose in reading order using React Flow group nodes. First-class rather than decoration, because the same mechanism is how a student documents their reasoning — and that argument, not the number, is the assessable artefact. Reserving it now avoids an S25 migration later. **Upgraded by S30**: frames are no longer decoration deferrable to step 6 — they are the notebook's section structure, and therefore load-bearing |
| S29 | **Range nodes support linear, logarithmic, explicit-list and table-column kinds**; point count is the primary control, not step size | Sweeps are the primary use of the tool, not an add-on. **Log spacing is required for teaching**, not a convenience: Wöhler S–N curves are log–log and bearing life is a power law (`L₁₀ ∝ (C/P)^p`, p = 3 or 10/3), so linear sampling across decades leaves the knee unresolved and makes the straight line a student should recognise look curved. A log range defaults its plot axis to log. Explicit lists matter because machine design picks from standard series — stock diameters, available bores, preferred numbers — not from a continuum. `linspace(a, b, n)` avoids the floating-point endpoint ambiguity of step form, makes sweep cost predictable, and makes a two-input grid exactly `n × m` |
| S30 | **The notebook is a view over the graph; group frames are its sections** | The graph replaces the *computation*, not the *document* — the old deliverable was prose, result, plot in reading order, and that is still what gets handed in. A frame renders as a section: its markdown note is the prose, the output nodes inside it are the results. No new concepts beyond S28, and the canvas layout *is* the document outline, so arranging the graph arranges the report |
| S31 | **Notebook is a live, collapsible side panel** | The document takes shape while the graph is built, rather than being discovered at export time. Collapsible because node editors want horizontal room |
| S32 | **Export shows citation and values by default; expressions only behind a marked toggle** | S23 keeps *graph files* clean of R&M content, but an exported PDF showing `τ_t = T/W_t` would put the textbook expression straight back into a circulating file. Default export carries citation plus numbers and is safe to submit; revealing expressions stays possible for personal use and is explicitly flagged as restricted |
| S33 | **Four first-class output node kinds**: value readout, check/constraint, plot, table | The check kind (`S ≥ 1.5 → pass`) is what turns the notebook from a list of numbers into a dimensioning report, and is the scalar counterpart of the threshold overlay on a swept curve. Table is the natural form when a range is an explicit list of standard sizes (S29) rather than a continuum |
| S34 | **Expressions are stored as strings, parsed to an AST at load, evaluated by composed closures** (was D16) | The stored form stays readable, diffable and directly editable, matching S4 — and a parser is needed regardless, to accept what the editor's formula field receives. Compiling each AST once into nested closures keeps a 40 000-point sweep fast without walking the tree per evaluation. **Never `eval` or `new Function`**: catalogues are files students load from the LMS and from each other, so that path would make any shared catalogue arbitrary code execution in the browser |
| S35 | **Broader function whitelist than the corpus uses**, plus `sum`/`prod` reductions; no piecewise (was D17) | Corpus usage is only `cos` 94, `sqrt` 89, `tan` 72, `cbrt` 37, `sin` 21, `abs` 15, `acos` 5, `log` 4, `atan` 4, `asin` 2, `exp` 2, with `pi` and `**`. The whitelist also carries `min`, `max`, `floor`, `ceil`, `round` and the hyperbolics for student- and non-R&M-authored formulas. Dimensional rules: trig, log and exp **require a dimensionless argument**; `min`/`max` require identical dimensions across arguments; rounding preserves dimension. **No conditionals inside a value expression** — every one of the 550 methods returns a single arithmetic expression, and its 8 `if`s are all Python list guards, 6 of them the known `C14` defects. **Corrected by S39/S40**: this was first recorded as "the corpus has no branching", which was wrong. Branching exists — it selects *which equation applies* and never appears within one |
| S36 | **Aggregation over a series is a first-class need**, distinct from sweeping (from D17) | The `C14` list guards concealed real reductions: `P = (Σ Pᵢᵖ·nᵢ/n_m·qᵢ/100)^(1/p)` over a load spectrum, and `Σ segments_delta` in `C8`. A sweep *produces* a series; an aggregation *consumes* one — opposite shapes. A spectrum input is therefore its own port kind taking an explicit list, and **cannot itself be swept**; that nesting is forbidden initially |
| S37 | **Tables are banded-numeric × categorical lookups; no interpolation by default, opt-in per table; a missing entry is a hard error** (was D18) | `FitAndTolerance.py` crosses a diameter band (first band whose upper bound exceeds `d`) with a categorical class (`'H'`, `'k6'`, IT grade `'7'`), in µm — which is what the `[E-6m]` tag of D7 was. ISO fit tables are step functions by definition, so interpolating them would invent values the standard does not define; the per-table opt-in exists for genuinely continuous data from other sources. `None` means the fit is undefined and must **raise**, never propagate — exactly the silent-zero class of bug this project exists to remove |
| S38 | **Ports are either dimensioned-numeric or categorical**; categorical ports declare an enumerated domain (was D19) | Table lookups need `'H7'`, which is not a dimensioned number, so S6 alone does not cover them. A declared domain rejects a typo like `'H07'` at entry and stops a hole class being wired into a shaft-class input. Categoricals are **sweepable by explicit list only** — there is no spacing between `H7` and `K7`, so no `linspace`/`logspace` — and render on an ordinal axis. The valuable case is mixing them: sweep diameter numerically and fit class categorically to get one curve per fit class on a shared numeric axis. Modelling the class as a node parameter would have made that impossible |
| S39 | **A boolean predicate layer over the expression language**: comparisons plus `and`/`or` | Three things needed the same small feature and were being treated as three: the check output node (S33, `S ≥ 1.5`), the plot threshold overlay (D15), and formula applicability (S40). One predicate layer serves all three. Predicates are boolean-valued and live *outside* value expressions, so S35's "no piecewise" is unaffected |
| S40 | **Formulas carry a machine-readable `appliesWhen` predicate; violation warns** | R&M expresses case distinctions by numbering separate equations, with the condition stated in prose — `E8_9A/B/C` select on where `D_A` falls relative to `d_w` and `d_w + l_k`; `E2_4A/B` on the nominal-size band; `E8_32B/C` on thinned vs threaded. Seven such conditions survive in docstrings, and the old library **never read any of them**: a student could use `E8_9B` while `D_A < d_w` and get a confident wrong number. That is the same silent-drift class S4 removed by construction. Pairs with S17's `variantOf`, which already groups the variants — `appliesWhen` says which member you should be on. **Capture during migration**, while the equation numbers and docstrings are still in front of us |
| S41 | **First milestone is a vertical slice: a base node library plus `C16_Belt` only** — not all 539 formulas | A thin slice validates the schema before 539 formulas are committed to it. Getting the schema wrong after 55 formulas is a morning's rework; after 539 it is an S25 migration. Belt is the right slice on the evidence: **self-contained** (imports only `sympy` and `MySymbol` — no `Table`, no other chapter), **55 formulas** with ~78 symbols, and it already has golden-value notebooks (`Lab_belt.ipynb`, `Lab_belt_incl_Fa.ipynb`). It also exercises the hardest units case deliberately — `[kg/dm³]` is the density trap, and `C16_Belt.py:155` already fudges it as `1E-6 * 1E3 * rho` — plus `[%]`, which needs the dimensionless-with-display-scale treatment of S21. **Accepted gap**: belt uses no tables and no categoricals, so S37 and S38 stay unvalidated until a second slice (tolerance or press-fit) exercises them |
| S42 | **A base node library — literal inputs, arithmetic and math operations, output nodes — ships unrestricted** | It contains no textbook content, so it is not under the S9 restriction and is part of the public app. Three consequences: the app is demonstrable and testable with **zero restricted content**; the kernel can be exercised end to end before any catalogue exists; and it makes S10's multi-source path real from the first milestone rather than retrofitted |
| S43 | **Values carry labelled axes; a range node introduces one; operations broadcast over the union** (was D14) | Cartesian grids fall out for free — two ranges give `n × m`, three give `n × m × k`, with no grid node and no re-wiring when a sweep is added. The plot node then just picks which axis is x, which is colour, which pair forms a contour. Less kernel complexity than special-casing 1-D and 2-D. Zip semantics does not compete for this slot: S36 already routes paired lists like `(P_list, n_list, q_list)` through a spectrum port into an aggregation. **Guard**: warn when the product of axis lengths grows large, so a stray range cannot freeze the UI |
| S44 | **MIT for engine and editor** (was D13) | Short, permissive, universally understood, and the same licence as React Flow which the editor builds on. Lowest friction for a teaching tool other courses may fork. **Unaffected**: the R&M catalogue remains restricted and not redistributable. *Check whether KU Leuven claims rights over course-derived material before publishing — that is a question for them, and could constrain this.* |
| S45 | **The restricted catalogue lives in its own private repository** (was D13) | The distribution restriction is then enforced by a repository boundary, not by a `.gitignore` that one `git add -A` defeats, and not by build configuration that must stay correct forever. A history leak in a single-repo layout would expose the content permanently. This repo holds engine, editor and the unrestricted base nodes (S42); the catalogue is built and delivered to the LMS separately. **Shapes the workspace layout**, so it lands before the directories exist |
| S46 | **Screen layout: collapsible palette left, canvas centre, collapsible notebook right. No permanent inspector** | Canvas stays dominant; both side panels collapse when width is wanted. A standing properties panel is rejected because it would mean the canvas shows a diagram while the real work happens beside it — which contradicts "the graph is the calculation" |
| S47 | **Node-first editing**: values, units and ranges are edited inline on the node; citation, description and applicability sit in a popover | Keeps the thing you change most often in the place you are looking. The popover carries what a student should be able to *read* off a graph without opening an editor |
| S48 | **Prose at two levels: frame section notes and per-output captions**, both editable in place in the notebook, plus a docked panel for longer writing | Extends S28/S30, which had only frame-level section prose. A report needs figure captions too — "the 1.5 threshold is crossed at 38 mm" belongs to a specific plot, not to its section. In-place editing means the writing surface is the reading surface, with the rendered context visible; the docked panel serves sustained writing |
| S49 | **Ports show their unit as text; colour is reserved for state** | Belt alone spans `N`, `mm`, `N/mm²`, `W`, `Nm`, `m/s`, `rpm`, `%`, `mm²`, `kg/dm³` — colour-coding a dozen-plus dimensions produces a palette nobody can learn, and spends the one channel that should mean *look here*. Colour marks quarantined (S19/S20), out-of-applicability (S40), failing check (S33) and error |
| S50 | **Node density: compact by default, expanding on selection or hover; pinnable open; series shown as a sparkline; unconnected required inputs marked even when compact** | A twenty-node belt graph is unreadable if every node shows every port. The sparkline makes a sweep visible *propagating* — which nodes became series, along which axis (S43). Marking missing inputs while compact makes an incomplete graph visible at a glance rather than at evaluation |
| S51 | **No formula-authoring UI in milestone 1; the catalogue is a regenerated build artefact of the extraction script** | Belt's 55 formulas come from migration, not from typing, so the authoring surface earns nothing yet and its docking question is better answered from real use than guessed. **Consequence**: a correction found during belt verification is made by re-running extraction, not by editing in-app — which suits a scripted, re-runnable script (S52). The authoring UI returns before students need formulas the book does not supply (S16) |
| S52 | **Extraction is a one-off script per chapter, not a migration tool; the differential test is kept regardless** | "AST extraction plus a differential harness" describes something sized for 539 formulas across ten chapters. For `C16_Belt` it is ~100 lines reading docstrings that already carry the formula in near-readable form (`\"\"\" F_t = P/(v*eta) \"\"\"`) and a symbol dict already carrying `'[unit] description'`. Promote it to something general at milestone 2 only if the remaining chapters justify it. **The differential test is the half that earns its keep at any size** — hand transcription is exactly how the original acquired its ~12 defects, so running the old Python and the new kernel on the same random inputs is what proves the transcription faithful. Also resolves the coupling with S51: with no authoring UI, something has to produce the 55 records, and hand-written JSON is the smell CLAUDE.md names |

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

## Outstanding — content sign-off only

**No decision is open.** D1–D19 are closed as S13–S45. What remains are two
content tasks. Neither gates a build step; both gate an individual formula
reaching a student through the S19/S20 quarantine, and both need Roloff & Matek
in hand, so both are the user's.

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

### Resolved late, recorded here for the trail

**D13 — licence.** Surfaced only by the 2026-08-14 revision pass; README had
carried "to be decided" with no `D*` behind it. Settled as S44 (MIT) and S45
(catalogue in its own private repository).

**D14 — grid sweeps.** Settled as S43: labelled axes make cartesian the natural
default, so no grid node is needed and three sweeps work like two.

**D15 — threshold binding.** Resolved by S39 while correcting S35. It is one
concept with three renderings: a pass/fail badge on a scalar, a threshold line
on a series, and an applicability warning on a formula (S40).

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
| 2026-08-14 | **S52 settled and S25 amended**, both narrowing scope for early development. Extraction is a per-chapter script rather than a migration tool, though the differential test is kept at any size. Schema versioning keeps the version stamp but defers the migration chain until real student graphs exist to protect |
| 2026-08-14 | **S46–S51 settled: editor layout.** Collapsible palette left, canvas centre, collapsible notebook right, and no permanent inspector — editing happens on the nodes. Ports carry unit text, colour is reserved for state. Nodes are compact by default with sparklines for swept values. **S48 extends S28/S30**: prose exists at two levels, frame section notes *and* per-output captions, edited in place in the notebook. Formula authoring is deferred out of milestone 1, making the catalogue a regenerated artefact of the extraction script |
| 2026-08-14 | **D13, D14 settled as S43–S45; every decision now closed.** Multi-input sweeps use labelled axes so grids are cartesian by default with no grid node. MIT for engine and editor. The restricted catalogue moves to its own private repository — a boundary a `git add -A` cannot defeat — which reshapes the workspace before the directories exist |
| 2026-08-14 | **S41–S42 settled**: milestone 1 narrowed to a vertical slice — base node library plus `C16_Belt`'s 55 self-contained formulas — rather than all 539. The base node library carries no textbook content and ships unrestricted |
| 2026-08-14 | **S39–S40 settled, correcting S35.** "The corpus has no branching" was wrong: branching selects *which equation applies* and never appears inside one. R&M numbers case variants and states the condition in prose, which the old library never read — 7 such conditions found. A shared boolean predicate layer now serves check nodes, plot thresholds and `appliesWhen` alike, which also **resolves D15** |
| 2026-08-14 | **D16–D19 opened and settled as S34–S38**, from a survey of the predecessor corpus. Expressions stored as strings and parsed to closures, never `eval`. The corpus contains **zero mathematical branching** — all 8 `if`s are Python list guards, 6 of them the known `C14` defects — so no piecewise; what those guards hid is **aggregation** over a load spectrum, now first-class. Tables are banded-numeric × categorical step lookups with missing entries raising. Categorical ports added, sweepable by explicit list |
| 2026-08-14 | **D14–D15 opened** — grid-sweep expression and threshold binding both touch the schema, so they are wanted before step 2, not at the UI stage |
| 2026-08-14 | **S30–S33 settled**: the notebook is a live side-panel view over the graph with group frames as its sections, four output node kinds including check/constraint, and export defaulting to citation-plus-values so submitted reports carry no R&M expressions. S28 upgraded from deferrable decoration to load-bearing structure |
| 2026-08-14 | OVERVIEW.md added as the one-read introduction. **S29 settled**: range kinds — linear, logarithmic, explicit list, table column — with point count as the primary control. Log spacing recorded as a teaching requirement (Wöhler curves, bearing life power law), not a convenience |
| 2026-08-14 | Revision pass across README, PLAN, DECISIONS and CLAUDE for consistency with S13–S28. S8 amended by S19; stale D4/D5 text removed from PLAN; notebook counts (22 vs 23) reconciled against the predecessor repo; **D13 opened** — the engine/editor licence was never captured as a decision |
