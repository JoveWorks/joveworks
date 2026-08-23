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

## Sections (frames)

Grouping nodes into a titled section isn't just visual tidying — a section
becomes a heading with a prose note in the exported notebook, in the same
order it appears on the canvas. Right-click a selection → "Group into new
section", or drag nodes into an existing section's boundary. Reorder sections
from the notebook panel; delete a section from its own right-click menu
without deleting the nodes inside it.

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

## Password-locked catalogues

A restricted catalogue can ship with the app locked, showing only its name
until someone enters the password (File → Unlock catalogue…, or directly
from its section in the palette). Unlocking is entirely client-side and,
once done, behaves exactly like a catalogue loaded from a file — no
difference in how its formulas show up or work afterward.

## Monte Carlo

A Monte Carlo generator draws samples from a distribution the same way an
input's range introduces a sweep axis — wire it in like any other value.
Every receiver on the same document shares one playback position, so
stepping or scrubbing samples anywhere advances the whole document's Monte
Carlo view together rather than one receiver at a time.

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
