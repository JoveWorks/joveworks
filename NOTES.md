# NOTES.md

The documentation is getting a bit chaotic and probably stale in a lot of points. Let's review first, then discuss the rest of this file. Discuss.

## Findings in UX and talking points

I occasionally notice literal "mm^4" in the table output header instead of superscript 4. In the `Newton's second law` node, acceleration unit also has literal "m/s^2" instead of superscript 2.

Dragging the section frames should also move the contents. They should furthermore be the last selection filter. When one is selected now, it is presented on top of the other nodes, prohibiting selection of the contents unless first clicking elsewhere.

There is an additional box behind input and output nodes. Why? I prefer a different style for node types, not this box.

The check node should print how many points fail the check in the notebook. Now it fails the whole range when one value fails.

The `examples` label in the ribbon>help looks like a button.

`Settings` should be under file in the ribbon instead of edit. Is it stored in localstorage?

Some nodes, especially basic math nodes, can have a default value like the threshold in compare. I would like this default to be next to the port instead of in the dropdown.

make the minimap toggleable in settings, default off.

I don't need the four squares in the corner of the section frames to indicate resize anchors. It's self explanatory with the lines and cursor change.

This error when dragging the output of `Simple supported beam` labeled as M Nm to the quick-add and selecting e.g. multiply: "p_check.value: a check compares a value against a threshold of the same dimension (S58): 1/mm² and stress (N/mm²) are different dimensions". `Divide` gives this error: "p_check.value: a check compares a value against a threshold of the same dimension (S58): N/mm and stress (N/mm²) are different dimensions"

## Add to backlog of ideas

Sliders as an input — the intent is quickly nudging a value to build intuition for its effect on the output, not precision entry. Needs a bound to travel between (the port's declared valid range, S17, when the formula has one) and a decision on whether it replaces or sits alongside the typed field.

Spectrum-editing UI: a load spectrum (a hand-typed list consumed whole by an aggregation, not swept) exists in the schema but nothing in the editor can create or edit one yet. Surfaced while adding Input's palette shortcuts — left out of that pass on purpose.

Gear calculations and their effect on shafts. Especially angled gears complicate calculations due to combination of normal and bending loads. Maybe for backlog when we design the formulas.

I want the users to be able do define custom closure nodes, they write an equation in a field and the ports are automatically populated based on the symbols used.

Add a button to auto arrange the graph. no overlaps of (open) nodes, frames should keep their contents, ignore edges for now, they are a future problem to present them neatly and untangled.
