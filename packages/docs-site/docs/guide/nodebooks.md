# Creating a NodeBook

A NodeBook is the report view of the graph. It is not a second document and it
does not contain a separate copy of the calculation. Section frames provide the
reading order; output nodes provide the results and figures.

## Make sections on the canvas

Select related nodes and choose **Edit → Group into new section**. Give the
section a title and write the note that should introduce its part of the
calculation. Moving a node into or out of the frame changes whether its output
belongs to that section.

A **section** becomes part of the NodeBook. A **group** only organises the
canvas. Groups can nest inside sections or other groups, and they can collapse
without changing the calculation or report.

The section order is shared between canvas and NodeBook. Reordering it in one
place changes the other.

## Choose what the reader sees

Only output nodes inside sections appear as report results. Use the output that
matches the claim you need to support:

- **Print** records a value or swept series.
- **Check** states a requirement and whether it passes.
- **Plot** and **Table** show how results vary across a study.
- **Equation** includes a deliberately selected formula expression.
- Analysis outputs such as **Feasibility**, **Best Design**, **Pareto**, and
  **Reliability** explain the engineering decision rather than only displaying
  intermediate numbers.

Give each output a useful title and caption. A result called “Minimum shaft
diameter” with a sentence explaining the governing check tells the reader more
than a node id or an unexplained plot.

## Use candidate marks consistently

Click a candidate in a supported table or plot to mark it A, B, or C. The same
candidate receives the same letter in every compatible figure, so prose can
refer to “candidate B” without relying on colour or position. See
[Candidates and marks](./candidates) for matching rules and edge cases.

## Preview and export

The NodeBook panel is a live preview. Editing section notes, titles, captions,
or figure controls there updates the same graph document. Its language can
follow the application or be set independently from the panel's settings.

Use **Export** in the NodeBook panel to open the browser's print workflow and
save a PDF. Export temporarily expands every section so a collapsed canvas
frame cannot accidentally omit part of the report. What appears in the panel
is what prints.

Before exporting, check that:

- every section explains its purpose rather than merely naming a calculation;
- units and number formats are appropriate for the audience;
- each requirement is represented by a Check;
- plots and tables identify their axes and choices;
- marked candidates and the final decision agree across sections; and
- intermediate values are included only when they help the reader follow the
  reasoning.

The saved graph remains the editable calculation. The exported NodeBook is its
reading copy.
