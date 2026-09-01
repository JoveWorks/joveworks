# Tips and tricks

Small things about the editor that aren't obvious from just clicking around.
See [What this is](./getting-started) for the first-time workflow,
[Sweeps](./sweeps) for turning an input into a study, and
[Units](./units) for how dimensions are enforced.

## Keyboard shortcuts

All of these use your platform's primary modifier — `Ctrl` on Windows/Linux,
`⌘` on Mac — and are ignored while you're typing in a text field, so they
never fight with what you're editing.

| Shortcut | Does |
|---|---|
| `Ctrl/⌘ + S` | Save the document to a file |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` or `Ctrl/⌘ + Y` | Redo |
| `Ctrl/⌘ + A` | Select every node |
| `Ctrl/⌘ + C` | Copy the current selection |
| `Ctrl/⌘ + V` | Paste (as a fresh, repositioned copy) |
| `Ctrl/⌘ + D` | Duplicate the current selection directly, no clipboard needed |
| `Ctrl/⌘ + F` | Open find-in-canvas — search by title, id, or port name |
| `Backspace` / `Delete` | Delete the selected node(s) or wire(s) |
| `Escape` | Close find-in-canvas |

Undo/redo cover more than you'd expect: dragging a node, typing a value, and
resizing a panel each fold into one undo step rather than one step per
keystroke, so undo takes back a whole gesture at a time, not one character.

## Canvas navigation

- **Scroll to zoom, drag to pan.** Two-finger trackpad pinch also zooms.
- **Box-select** by dragging on empty canvas; **shift-click** to add or
  remove individual nodes from a selection.
- **Right-click** almost anything for a context menu: a node offers pin
  open/allow auto-collapse, duplicate, delete, and (for equation nodes) save
  to the palette; a wire offers delete; empty canvas offers add-input,
  add-output, group into section, and auto-arrange; a multi-node selection
  adds align/space-evenly/auto-arrange-selection.
- **Drag a wire onto empty canvas** and release: a search menu pops up
  offering every formula, node kind, or existing on-canvas node with a
  compatible port to finish the connection — you don't have to place a node
  first and wire it up second.
- **Auto-arrange** (right-click empty canvas, or the Edit menu) runs a proper
  layered layout — it's a good first move on a graph that's turned into a
  tangle, and it respects section frames as compound blocks rather than
  scattering their contents.
- A bad connection **refuses silently** rather than half-connecting — watch
  the small status message that appears near the canvas edge; it's the
  kernel's own reason (dimension mismatch, would create a cycle, etc.), not a
  generic error.
- Help → "Show canvas controls" prints the shortcut legend directly on the
  canvas — handy if you'd rather not come back to this page.
- Every node shows its state by colour, with a small fixed vocabulary: not
  yet connected, quarantined, waiting on an earlier node, or refused (an
  actual error) — a node with nothing to report just reads as normal/ok.
  Hover or select a node to expand its detail; "Keep open" (its pin button)
  overrides that so it stays expanded regardless of hover/selection —
  "Allow auto-collapse" undoes it.

## The palette

- **Search matches more than names** — equation numbers, symbols, and *what
  a formula computes* (port names, descriptions) are all searched at once,
  fuzzily, so partial or out-of-order typing still finds things.
- **Favourite anything** — right-click a palette entry (a formula, a saved
  equation, or a built-in like Input/Output/Compare) and pick "Add to
  favourites". Favourites get their own section at the top so your most-used
  nodes for the current assignment don't require scrolling or re-searching.
- **Quarantined formulas are still there.** They're visibly marked and can
  still be dragged onto the canvas — they just can't be evaluated yet, and
  the node says why. This is intentional: hidden and quarantined are
  different things.
- **Click *or* drag** to add a node — click drops it in the centre of your
  current view (with a small random offset so repeated clicks don't stack
  exactly on top of each other); drag places it exactly where you release.
- **Save an equation node to the palette** (right-click it → "Save equation
  to palette") to reuse a hand-typed expression across a document, or across
  sessions — it's kept in "My equations" and persists in your browser.

## Titles and math

Node and section titles typeset recognizable math notation live: an
underscore or caret makes a true subscript/superscript (`d_1`, `x^2`), and a
trailing apostrophe renders as a prime (`F'`). Plain prose is left exactly as
typed — this only fires for tokens that are unambiguously math, so you don't
need to escape ordinary text. Turn it off in Settings if you'd rather see raw
text everywhere (also affects the notebook).

## Sections and groups (frames)

Grouping nodes into a titled section isn't just visual tidying — a section
becomes a heading with a prose note in the exported notebook, in the same
order it appears on the canvas. Right-click a selection → "Group into new
section", or drag nodes into an existing section's boundary. Reorder sections
from the notebook panel; delete a section from its own right-click menu
without deleting the nodes inside it.

Use **Group into new group** when you only want to organise the canvas. Groups
do not add a NodeBook heading or note. They can nest inside sections, other
groups, or around a section; repeated grouping of the same nodes adds a small
inset so the hierarchy remains visible. A group’s arrow collapses it into a
macro node: its crossing wires stay attached to named input and output ports,
and hovering either a port or a wire highlights the complete connection.

## Units, per port

Every numeric port can show its value in any unit that shares its dimension
— not just the one the formula's author picked. Use the small unit dropdown
next to a port's value to switch display units (e.g. show a stress result in
`MPa` instead of `N/mm²`); this only changes what you *see*, never what's
stored or computed. Whatever unit you type when entering a value is
converted at that boundary, so `1450 rpm`, `12 kg/dm³`, or `250 kW` are all
fine typed directly.

## Table outputs

A table node's columns aren't declared up front — wire a value onto its
empty "ghost" slot and a column is created and named after whatever you
wired, on the spot. Rewiring a column later relabels it to match, and
columns can be dragged left/right in the notebook to reorder them.

Each column header also carries its own decimal-figure box, so a mass
column can read to two places while a safety factor reads to one, without
touching the number format for the rest of the app.

## Marking a design, and the link between table and plot

Clicking a table row or a point on a plot marks that design **everywhere**
— every figure in the NodeBook calls it out with the same letter. It's the
fastest way to make a report say *why this one*, and the full story is on
[Candidates and marks](/guide/candidates). The parts worth knowing before
you go looking:

- **A table row is a design**, not a row number. Click it: the row
  highlights, its letter lands in the first column, and the matching point
  is ringed on every plot, feasibility map and Pareto front that shares an
  axis with it. Click again to unmark.
- **Marking from a table pins one design; marking from a one-axis plot pins
  a slice.** A plot of deflection against diameter can only record
  `d = 40`, so a two-axis feasibility map will light that entire column —
  correct, and rarely what you wanted. Mark from the table, the feasibility
  map or the Pareto front when you want *one* design.
- **That's also what makes the numbers appear.** A mark that pins exactly
  one design adds a lettered reading under each Check and Print output
  (`A: S = 1.8 ✓`). No line under your checks means the mark identifies a
  whole row, and there's no single number to print.
- **Mark two, not one.** A and B side by side under every check turns "we
  chose this" into a comparison the reader can check.
- **On a contour the ring sits on the second swept axis** — a contour puts
  the plotted value on colour, so the ring's height is the other input, and
  its value is the colour under it.
- **Marks are saved with the document** and print in the exported PDF, so a
  section note can say "candidate B" and rely on it. Removing a mark
  re-letters the ones after it, so unmark from the end if your prose
  already names letters.

## Monte Carlo

A Monte Carlo generator draws samples from a distribution the same way an
input's range introduces a sweep axis — wire it in like any other value.
Every receiver on the same document shares one playback position, so
stepping or scrubbing samples anywhere advances the whole document's Monte
Carlo view together rather than one receiver at a time.

## Reading answers off a sweep

- A [**Select**](/guide/node-reference#select) node needs **two** wires, not
  one: `value` (what to search) and `along` (which axis to search it over).
  Forgetting `along` is the usual mistake — the node marks itself "not
  connected: along" rather than guessing an axis.
- Its four modes are one node kind. Switching mode from the node's panel
  keeps `value` and `along` wired, so trying "where is this least?" after
  "where does this cross?" costs one dropdown.
- **First passing size** never interpolates, and that is the feature: point
  it at a list or Renard sweep and the answer is a value you can actually
  set or order — an f-stop, a stocked diameter. **Threshold crossing** does
  interpolate, so use it for "where is the requirement genuinely met", not
  "what do I dial in".
- A **smallest at** / **largest at** answer landing on the *end* of the
  sweep usually means the objective is monotonic over it — the node is
  telling you a constraint, not the objective, decides this. That is what
  Best Design is for.
- If a Select node warns that the sweep is too coarse, add points and see
  whether the answer moves. If it does, the earlier answer was
  interpolation rather than analysis.
- A [**Best Design**](/guide/node-reference#best-design) output references
  **Check** nodes by name, exactly like Feasibility — so build your
  acceptance criteria as Checks once and both can reuse them. Ticking no
  checks at all is legal and means an unconstrained smallest/largest.

## Saving, autosave, and recovery

- **Ctrl/⌘+S** or File → Save writes a document file directly — there's no
  server-side project store, so the file you save is the whole project.
- The editor **autosaves to your browser's local storage** every 30 seconds
  and whenever you close the tab, as a safety net against an accidental
  close — separate from an explicit save. If you come back to find "Restored
  unsaved work from the last session", that's this — it's not a substitute
  for saving deliberately, since it's tied to this browser, not portable
  like a saved file.
- **File → Recent** lists documents you've opened or saved before, by name,
  so you don't have to re-navigate a file picker for something you were just
  in.
- New/Open/loading a sample all check for unsaved changes first and ask
  before discarding — so it's safe to explore the Help menu's bundled
  examples without losing current work by accident.

## The notebook panel

The notebook isn't a separate document — it's a read-order view over your
canvas's section frames and their output nodes. Reordering sections here
reorders them on the canvas and vice versa. **Export** uses the browser's
own print-to-PDF (the export button in the notebook panel) rather than a
separate PDF renderer, so what you see in the panel — collapsed sections
excluded — is what prints; exporting temporarily expands every section so
nothing you'd forgotten was collapsed goes missing from the PDF.

See [Creating a NodeBook](./nodebooks) for the complete reporting workflow.

## Settings worth knowing about

Open via File → Settings (or the gear icon):

- **Number format** — thousands/decimal style and notation (auto, fixed,
  scientific, engineering, SI-prefixed), with a live preview, applies to
  every value shown or typed across the whole app.
- **Locale** — English or Dutch, for the app UI.
- **Minimap**, **snap-to-grid**, and **contour palette** (for two-input sweep
  plots) are all here too.

The notebook panel has its own separate language setting (its own gear
icon, in the panel itself) — it defaults to following the app language but
can be pinned to English or Dutch independently, useful if you're writing a
report in one language while working in another.

## Desktop only

Below about 900px wide, the editor doesn't render at all — you'll see a
landing screen instead, with a link to a read-only course-material viewer.
This is deliberate, not a bug: the canvas/palette/notebook layout is
desktop-only by design, so don't expect to edit a graph on a phone.

## If you get lost

- `Ctrl/⌘+F` (find-in-canvas) beats scrolling around a large graph looking
  for one node.
- Help → "Take the tour" replays the first-run walkthrough at any time — it
  loads the pad-pressure sample to do it, so save first if you have unsaved
  work.
- Help → Examples has several bundled sample documents (some need a specific
  catalogue loaded); they're a fast way to see a working pattern — sweeps,
  checks, plots — before building your own.
