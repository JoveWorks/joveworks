# Decisions

Companion to [PLAN.md](PLAN.md). Records what is settled, and what still needs a
call before work can proceed. Last updated 2026-08-14.

---

## Settled

| # | Decision | Rationale |
|---|---|---|
| S1 | **Build a node-editor design tool**, not a library | The graph expresses "define the calculation, then solve" natively |
| S2 | **No runtime CAS** | Measured across the old repo's 23 notebooks: `EqPrint` 410 calls, `substitute` 84, `evaluate` 38, `MyHelp` 38, and `reorderEquation` — the only genuine symbolic algebra — **0 calls, and broken**. The symbolic layer was inherited habit |
| S3 | **React Flow for the UI** | Verified below |
| S4 | **Formulas are data**; the editor is the authoring tool | Removes docstring-vs-code drift by construction |
| S5 | **Canonical units mm, N, s, rad, K**; convert at the boundary; undeclared unit is a hard error | Matches R&M's own N/mm² convention; Kelvin keeps everything multiplicative |
| S6 | **Dimensions are port types** | A force output will not connect to a length input |
| S7 | **Old notebooks frozen as verification fixtures** | 46 of 539 methods covered, ~95 numeric goldens |
| S8 | **`DEFECTS.md` before migration**; defects reported, never silently carried across | ~12 confirmed wrong formulas in the old library |
| S9 | **Engine/content split**; R&M catalogue stays restricted | Distribution restriction on the textbook expressions |
| S10 | **Formulas carry a citation field**; multiple sources plus custom formulas supported | Preserves textbook traceability once source files are no longer read |
| S11 | **New repository; no code reuse** | The scope exceeded a refactor. `mechanical-design` is a reference for formula content, fixtures and known defects — nothing else |
| S12 | **Name: `machine-design-studio`**, at `~/source/machine-design-studio` | Descriptive: names the domain and signals an application rather than a library |

---

## Framework research (verified 2026-08-14)

### React Flow (`@xyflow/react`)

- MIT licensed **core**; ~38k stars; ~90 open issues; actively maintained by a
  small Berlin team.
- Open-core model: the Pro tier sells **examples, priority bug fixes and email
  support — not features**. The library is fully MIT.
- They offer **free Pro access to students and non-commercial projects on
  request** — likely applicable to a university course. See D11.
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

## Open — needs a decision

### D1. Kernel language — **blocking**

TypeScript, or Rust compiled to WASM?

| | TypeScript | Rust → WASM |
|---|---|---|
| Performance | Ample (see below) | Faster in principle |
| Boundary cost | None | Per-call JS↔WASM overhead, often **slower** for small frequent calls |
| Languages in stack | 1 | 3 including the toolchain |
| Reuse outside browser | Node | Anywhere |

The workload does not justify it. The heaviest computation in the old material
is the safety-factor contour in `archive/session5_1_KeyDesign_contourplot.ipynb`:
14 key lengths × 8 diameters = **112 evaluations**. A dense 200×200 contour is
40,000, each a handful of arithmetic operations — sub-millisecond in JavaScript.
Rendering will cost more than computing.

**Recommendation: TypeScript**, as a standalone package with no React
dependency, keeping the seam so a hot path can move to WASM later without
touching the UI. Revisit only for brute-force design-space optimisation in the
millions of evaluations — and even then try **Web Workers** first.

### D2. Is there a backend at all? — **blocking**

Pure client-side static app, or a server?

Client-side avoids hosting, ops and latency, and works offline. A server would
only be needed for accounts, shared graphs, or keeping restricted content off
the client.

**Recommendation: pure client-side**, with the R&M catalogue distributed as a
file through the course LMS. The public app then ships **no textbook content**,
which satisfies the distribution restriction without auth infrastructure, and
exercises the multi-source capability from S10.

### D3. Delivery — **blocking**, follows D2

Web URL, or desktop binary (Tauri / Electron)?

Web means students open a link — a real difference in how many are working by
week one. Desktop keeps restricted content entirely off the network but adds
per-platform packaging. Both use React Flow.

**Recommendation: web**, given D2's catalogue-via-LMS approach removes the
motivation for desktop.

### D4. Are graph cycles allowed? — **blocking kernel design**

Forbidding cycles means the kernel is a topological sort and nothing more.
Allowing them requires a numeric root-finder and convergence handling, plus UI
for non-convergence.

**Recommendation: forbid initially.** Add later if a real design case needs it.

### D5. Is runtime solving needed at all? — **blocking kernel design**

Does the tool need to rearrange a formula to solve for an input, or is forward
evaluation enough? R&M often supplies rearranged forms as separately numbered
equations (`E17_1A/B/C` are three forms of the same gear ratio), which suggests
forward-only may suffice.

Research on this was deferred. **It should be resolved before the kernel is
built** — it determines whether D4 matters and whether any solving code exists.

### D6. Textbook verification of the defects — **blocking migration**

`DEFECTS.md` will list ~12 confirmed and ~10 suspected wrong formulas. Per S8
they are reported, not fixed. Needed: who checks each against Roloff & Matek,
and when. Migration should not start until the answers exist, or the defects
cross into the new system.

### D7. The ~30 junk unit tags — **blocking units work**

Tags like `[__O]`, `[__o]`, `[1E6rotatons]`, `[1e6revolutions]`, `[E-6m]` cannot
be machine-parsed and cannot be guessed. Each needs a content decision. Roughly
500 further tags need normalising, but those are mechanical
(`[N/mm²]`/`[N/mm**2]`/`[MPa]`; `[rpm]`/`[1/min]`/`[min-1]`; `[deg]`/`[°]`).

### D8. Plotting library — **soon**

The old notebooks lean on sweeps and contour plots, so this is not optional.
Candidates: Plotly.js (batteries included, heavy), uPlot (very fast, minimal),
Observable Plot (concise, good defaults), ECharts. Contour support is the
discriminator — not all handle it well.

### D9. Persistence and schema versioning — **soon**

Where user graphs are saved (file download, browser storage) and how the schema
version is stamped so old files keep loading. Matters early because the schema
is the contract between kernel, catalogue and editor.

### D10. What happens to the teaching narrative? — **unresolved from earlier**

The old notebooks' markdown explains the engineering reasoning between steps
("we need an initial estimate of the gear ratio…"). A node graph shows structure
but not argument. Decide deliberately whether that content is carried into the
tool (node annotations? a guided mode?) or intentionally dropped.

### D11. Request React Flow Pro for education — **cheap, do early**

xyflow offers free Pro to students and non-commercial projects on request. Worth
asking before building, in case the professional examples save time.

### D12. Monorepo tooling — **soon**

pnpm workspaces, and whether Turborepo/Nx earns its keep at this size. The
"where does the legacy Python live" half of this question is answered by S11: it
stays in its own repository, and this one starts clean.

---

## Decision log

| Date | Change |
|---|---|
| 2026-08-14 | S1–S10 settled; D1–D12 opened (in the predecessor repo) |
| 2026-08-14 | S11 no code reuse, S12 name and location; repository created; D12 narrowed to tooling only |
