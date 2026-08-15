# NOTES.md

The documentation is getting a bit chaotic and probably stale in a lot of points. Let's review first, then discuss the rest of this file. Discuss.

## Findings in UX and talking points

Should the `list` range kind keep that name, or become `sweep`? A load spectrum is also a hand-typed list of values (just consumed whole, not swept — see the spectrum-editing backlog item below), so "list" alone doesn't say which behaviour a student is choosing. Discuss.

This error when dragging the output of `Simple supported beam` labeled as M Nm to the quick-add and selecting e.g. multiply: "p_check.value: a check compares a value against a threshold of the same dimension (S58): 1/mm² and stress (N/mm²) are different dimensions". `Divide` gives this error: "p_check.value: a check compares a value against a threshold of the same dimension (S58): N/mm and stress (N/mm²) are different dimensions"

## Add to backlog of ideas

What should a multi-node selection do? One concrete gap already found: "Group into new section" ignores the current selection entirely and wraps *every* ungrouped node in the document into one frame (App.tsx's `addSection`) — there's no way to select a handful of nodes and frame just those. Open beyond that: what else (if anything) should a selection enable — move together (already true, they're independent React Flow nodes), delete together (already true via Backspace/Delete), anything else?

Sliders as an input — the intent is quickly nudging a value to build intuition for its effect on the output, not precision entry. Needs a bound to travel between (the port's declared valid range, S17, when the formula has one) and a decision on whether it replaces or sits alongside the typed field.

Spectrum-editing UI: a load spectrum (a hand-typed list consumed whole by an aggregation, not swept) exists in the schema but nothing in the editor can create or edit one yet. Surfaced while adding Input's palette shortcuts — left out of that pass on purpose.

Gear calculations and their effect on shafts. Especially angled gears complicate calculations due to combination of normal and bending loads. Maybe for backlog when we design the formulas.

I want the users to be able do define custom closure nodes, they write an equation in a field and the ports are automatically populated based on the symbols used.

Add a button to auto arrange the graph. no overlaps of (open) nodes, frames should keep their contents, ignore edges for now, they are a future problem to present them neatly and untangled.
