# Using catalogues

A catalogue is a formula library. It gives JoveWorks the expressions, ports,
dimensions, units, citations, valid ranges, and status needed to place and
evaluate formula nodes. JoveWorks ships with unrestricted catalogues; a course
or project can supply additional public or restricted ones.

The contents change from one catalogue to another. Loading, finding, wiring,
and analysing their formulas works the same way.

## Load a catalogue

For a catalogue file, choose **File → Load catalogue…** and select the JSON or
YAML file you were given. A valid catalogue appears as its own section in the
palette. JoveWorks caches it in this browser, so it remains available after a
reload; loading the same catalogue again replaces the cached revision with the
newly selected one.

For material supplied through a Hub:

1. Choose **Cloud → Connect cloud…** and enter the connection details supplied
   with the material.
2. Under that cloud's heading, choose **Load cloud catalogues**.
3. Open a published NodeBook or cloud workspace from the same menu when the
   course or project supplies one.

Cloud access credentials are not kept after a reload. Cached catalogues remain,
but JoveWorks asks you to reconnect before it fetches restricted material
again.

## Find a formula

Every loaded catalogue gets a section in the palette. Search covers more than
the visible title: it also reads formula ids, citations, descriptions, and port
names. Search for the quantity you need to compute when you do not know the
formula's title or reference.

Drag a result into the canvas, or click it to place it in the centre of the
visible graph. Formula nodes use the same connections and evaluation rules as
the unrestricted formulas bundled with JoveWorks.

## Read a formula node

Inputs are on the left and results are on the right. A port carries a numeric
dimension, a categorical domain, or a generic dimension that becomes concrete
when connected. Incompatible ports do not connect. Units can be changed at the
input or display boundary without changing the graph's internal value.

The node also carries information authored with the formula:

- **Citation** identifies the source location without copying the source
  expression into the graph document.
- **Descriptions** explain the formula and its ports in the selected language
  when a translation is available.
- **Valid ranges** tell JoveWorks when an input leaves the formula's stated
  domain.
- **Applicability** selects which explicit variant applies to the current
  categorical or numeric inputs.
- **Variants** group separately authored forms of one relation, including forms
  solved for different outputs when the catalogue provides them.

JoveWorks evaluates formulas forwards. It does not rearrange a catalogue
expression to solve for another port. Choose an authored variant or
[sweep an input](./sweeps) and select the point that meets the requirement.

## Understand formula status

Status describes the evidence attached to a catalogue record, not the
importance of the formula:

- **Verified** has an independent numeric example pinned as a golden test.
- **Unverified** has passed the available structural and dimensional checks but
  has not been checked against an independent worked value.
- **Quarantined** has a recorded ambiguity or defect. It stays visible so the
  problem is not hidden, but it cannot evaluate; the palette and node show the
  reason.

Do not treat a golden value as proof that a formula is physically appropriate
for the present design. Applicability, assumptions, and valid ranges still
matter.

## Use catalogue data in a study

A catalogue formula behaves like any other node downstream of an input range.
Turn one input into a linear or logarithmic range, an explicit list, a preferred
number series, or a categorical list, and every dependent formula evaluates
over that axis. Two independent ranges form a grid.

Catalogues can also provide table columns. A table-column input follows the
catalogue's own rows, which is useful for standard sizes or named choices: the
study explores values that actually exist instead of inventing intermediate
ones.

Once values are moving through the graph, add **Check** outputs for the
requirements. Then use [Analysis](./analysis) to choose the right question:
find a threshold, show the feasible region, select a buildable candidate,
compare trade-offs, or model justified random variation.

## Documents depend on catalogue revisions

A graph document does not embed formula bodies. It records each formula's
global id, version, and content hash, so opening a graph can detect missing or
changed catalogue content instead of silently recalculating with a different
formula.

If a document reports a missing catalogue or revision mismatch, load the exact
catalogue revision used to create it. Do not substitute a newer file unless the
person who supplied the material has explicitly migrated the graph.

If you create catalogues rather than use them — including a small one of your
own formulas — see [Catalogue authoring](./catalogue-authoring).
