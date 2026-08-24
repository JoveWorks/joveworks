# Feature review

Exploratory product ideas beyond the features already implemented in
JoveWorks. This is a review, not a commitment or replacement for
[`ROADMAP.md`](../ROADMAP.md).

JoveWorks already has substantial calculation machinery: typed units,
catalogue and user-authored equations, multi-axis sweeps, Renard sizes,
spectra, feasibility maps, sensitivity plots, Monte Carlo analysis, shaft
diagrams, file-derived inputs, and notebook reports. The strongest direction
for the next generation of features is therefore not simply adding more
arithmetic. It is helping someone compare alternatives, select a design, and
explain why it was selected.

## Strongest opportunities

### Best Design node

Feed a Best Design node a set of candidates, checks, and an objective such as
mass, cost, diameter, efficiency, or machining time. It would:

- discard candidates that fail any referenced check;
- minimize or maximize the selected objective;
- emit the winning axis values and calculated metrics;
- identify the governing constraint;
- render a compact decision card in the notebook.

For example: "Smallest R20 shaft diameter that passes strength, deflection,
and critical-speed checks: 45 mm; deflection governs."

This remains forward-only. It searches the finite study the graph has already
evaluated rather than rearranging equations or introducing a solver.

Related nodes could include:

- `argMin` and `argMax`;
- first passing standard size;
- top N candidates;
- closest to target;
- governing constraint.

### Threshold-crossing and intersection nodes

Plots already let a student visually read where a curve crosses a threshold.
That result could become first-class data:

- every threshold crossing, rather than an arbitrarily selected root;
- interpolated crossing coordinates;
- intersections between two swept curves;
- the nearest available catalogue size above a crossing;
- a warning when the sweep is too coarse for reliable interpolation.

This would turn "roughly 38 mm" into "the sampled curve crosses at 37.6 mm;
the next available size is 40 mm."

### Pareto-front output

Mechanical design is rarely a single-objective problem. A Pareto output could
show candidates that are not dominated across objectives such as:

- mass versus safety;
- cost versus lifetime;
- machining time versus surface finish;
- stiffness versus material use;
- depth of field versus diffraction.

Selecting a point could mark the same candidate in every linked table, plot,
check, and diagram. This would be a particularly natural and visually useful
extension of the existing sweep machinery.

### Named load cases and envelopes

A linked Load Cases input could represent each operating condition as one
coherent row:

| Case | Force | Torque | Speed | Temperature |
| --- | ---: | ---: | ---: | ---: |
| Startup | ... | ... | ... | ... |
| Nominal | ... | ... | ... | ... |
| Emergency | ... | ... | ... | ... |

Unlike independent sweeps, values in a row stay paired. Associated operations
could provide:

- minimum, maximum, and absolute-maximum envelopes;
- the name of the governing case at every point;
- overlays of all cases on a shaft or beam diagram;
- duty-cycle aggregation;
- rainflow counting as a later specialist extension.

This would fill an important gap between an independent sweep and a spectrum
that is consumed as one collection.

### Reliability reports for Monte Carlo

Monte Carlo generators and receivers already exist. Richer outputs could turn
them into complete reliability studies:

- histograms;
- empirical cumulative distribution functions;
- percentiles and quantiles;
- probability of failure;
- confidence intervals;
- reliability indices;
- convergence plots as samples accumulate.

Additional triangular, lognormal, discrete, and empirical distributions would
cover more engineering inputs. Correlation groups would allow dependent
quantities to be sampled honestly. A tolerance study could then report an
estimated interference probability instead of only displaying individual
samples.

## New node families

### Selection and series operations

- Filter values using a wired verdict.
- Sort and rank candidates.
- Return the coordinate at which a maximum or minimum occurs.
- Calculate a percentile or quantile.
- Calculate a cumulative sum or numerical integral.
- Calculate a numerical derivative, including the corresponding unit change.
- Apply moving-average or smoothing operations to imported measurements.
- Resample or interpolate values onto a selected axis.
- Find an envelope across one axis while retaining its governing coordinate.
- Zip several values into linked rows instead of broadcasting them into a
  cross-product study.

### Engineering decision operations

- Normalized margin: `(capacity - demand) / capacity`.
- Utilization: `demand / capacity`.
- Governing margin across several failure modes.
- Reserve factor.
- Robustness score: how far a candidate remains from failure under uncertainty.
- Convergence check: whether increasing sweep resolution materially changes
  the decision.

Normalized margins are especially useful because failure modes with unrelated
units can then be compared on a common scale.

### Geometry and section-property nodes

A public geometry catalogue could provide:

- solid and hollow circular sections;
- rectangles and tubes;
- I-, U-, L-, and T-sections;
- parallel-axis composition;
- centroid and neutral-axis calculations;
- area, second moment of area, polar moment, and section modulus;
- mass per length and surface area.

A composite-section node could accept several shapes with offsets and emit
both calculated properties and a cross-section sketch.

### Materials and purchasable parts

Tables could become practical engineering libraries containing:

- material properties, density, price, and embodied carbon;
- stock sections and sheet thicknesses;
- bearings, fasteners, seals, keys, and motors;
- supplier availability and lead time;
- preferred sizes and manufacturing constraints.

A part-selection node could filter table rows by typed requirements. A BOM
output could gather selected parts from the entire graph and total their mass,
cost, and carbon while preserving provenance. Only public or user-authored data
would belong in this repository; restricted R&M material would remain in the
private catalogue.

## Visual and interactive features

### Live engineering schematics

The shaft curves could grow into code-rendered SVG diagrams such as:

- a free-body diagram with supports, forces, couples, and dimensions;
- a stepped-shaft side view;
- cross-section previews;
- an exaggerated deflected shape overlaid on the undeformed shaft;
- stress or safety margin shown as a colour band;
- an animated load moving along a beam;
- bearing and gear positions linked to their source nodes.

Selecting an element in a diagram could select its source node on the canvas.
These would be public mechanics visualizations, not R&M formula content.

### Notebook controls

Selected inputs could appear in the notebook as interactive controls:

- sliders;
- categorical switches;
- standard-size steppers;
- scenario selectors;
- nominal, worst-case, and measured-value toggles.

This would create a presentation mode in which an instructor or reviewer can
change the important assumptions without navigating the calculation graph.

### Coordinated candidate selection

A marked point should be a document-wide candidate identity rather than a
plot-local row index. Selecting it could:

- highlight it on every plot;
- mark its table row;
- show its checks and margins;
- display its input parameters;
- identify it on the Pareto chart and geometry drawing.

This would extend the plot- and table-marking work already identified in the
roadmap into a shared interaction model.

## Reusable calculations

### Composite or subgraph nodes

A selected group could become a reusable component with:

- explicitly exposed input and output ports;
- collapse and expand controls;
- the original formula references intact;
- storage in a personal component library;
- versioning;
- optional expansion of its internal notebook sections.

Examples include a two-bearing shaft, bolted joint, belt stage, or
depth-of-field study. Reusable subgraphs would reduce canvas sprawl without
turning calculations into opaque hand-coded supernodes.

### Design templates

Templates could be more structured than example documents. They might define:

- required inputs;
- expected outputs and checks;
- explanatory starter frames;
- optional branches;
- completion status.

An instructor could distribute an unfinished NodeBook in which students fill
in the missing reasoning rather than starting from a blank canvas.

## Experimental data and model validation

The CSV reader proposed in the roadmap could become the start of a measurement
workflow:

- map columns to quantities and units;
- treat rows as linked observations;
- draw scatter and residual plots;
- perform linear or polynomial regression;
- compare predicted and measured values;
- estimate calibration factors;
- display tolerance bands;
- mark outliers;
- produce a validation section in the notebook.

This would connect textbook dimensioning to laboratory work without adding a
runtime computer algebra system.

## Review and explanation

A Design Review mode could answer:

- Which inputs influence this result?
- Which assumptions use fallbacks rather than wires?
- Which sweeps exceed a formula's applicability or valid range?
- Which checks are governing?
- Are any calculated results never checked or reported?
- Are there unused inputs or dead graph branches?
- What changed since the last accepted design snapshot?

A failure card could explain: "Fails at 35 mm because deflection exceeds 0.20
mm; strength still has 18% margin." This is more instructive than a red status
badge alone.

Versioned result snapshots could also make NodeBooks lightweight regression
tests by reporting which published values changed after a catalogue or input
update.

## Additional catalogue directions

The kernel is already largely domain-neutral. Public catalogues could explore:

- thermal networks, heatsinks, ovens, and cooling loops;
- hydraulics and pneumatics;
- electric drives, batteries, and duty cycles;
- bicycle gearing and rider power;
- drone endurance and payload trade-offs;
- loudspeaker enclosures;
- optics and astrophotography planning;
- workshop machining quotations;
- energy use and embodied-carbon comparisons.

The photography catalogue demonstrates that this expansion can coexist with
machine design remaining the product's front door.

## Suggested priority

1. Threshold crossing, first-passing size, governing constraint, and Best
   Design.
2. Pareto output with coordinated candidate marking.
3. Named load cases plus envelope and governing-case nodes.
4. Monte Carlo histograms, CDFs, percentiles, and failure probability.
5. Interactive shaft, free-body, and cross-section visualizations.
6. Reusable subgraphs.
7. CSV measurements and model-validation outputs.
8. Materials, components, BOM, cost, and carbon.

The unifying product progression is **calculate, compare, select, explain**.
