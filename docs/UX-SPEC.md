# Editor UX spec

Historical record, not a live requirements list — every item below was found
during the hand passes over the milestone-1 editor in a browser, and every
one has since been fixed. Kept as the record of what those passes found and
why each was judged a requirement rather than a preference; nothing here is
still open. [ROADMAP.md](../ROADMAP.md) carries what's still open, including
the post-MVP backlog this file used to end with.

Organised by area rather than by the order findings came in.

## Node cards

- **Input node boxes are too small**, and the output port sits mid-box
  instead of on the side edge. Port placement should be consistent with
  other node kinds regardless of box size.
- **Hover-to-expand must not reflow the card.** Today expanding a node on
  hover resizes the box and shifts all its contents; instead the card should
  stay put and grow *downward*, appending the extra detail below what is
  already visible.
- **Nodes need a delete control** on the card itself (not only a keyboard
  shortcut) — and possibly other per-node actions; which ones is open.
- **Right-click context menu is unused.** Either wire it up or remove the
  affordance; leaving it inert is worse than either.
- **Hovering a node should bring it to the foreground**, above overlapping
  neighbours.
- **Output ports must line up with the value line they belong to.** This is
  cosmetic today with single-output nodes but becomes a correctness signal
  once multi-output nodes exist — the wrong port next to the wrong value
  would be actively misleading.
- **Collapsed nodes must still show port names.** At least one node
  (`rm.16.29`) currently hides them when not expanded.
- **Input nodes should be editable inline on the canvas**, not only through
  the hover popover. Bounds, list contents and values need to be quick to
  change during iteration; the input *kind* (list / value / range) does not
  need to be changeable from this surface.

## Notebook

- **Section frames must be resizable.**
- **Sections must be reorderable by dragging** in the notebook view.
- **Notebook and catalogue panels must be resizable**, notebook especially.
- **Notebooks need image support**, alongside the existing prose and output
  captions.

## Output nodes

- **`value` is a misnomer.** Split it into `print` and `plot` — the check
  output is already its own node. `print` and `plot` should sit in the
  catalogue's first section, ahead of the base nodes, with their own `+`
  section button.

## Messages and feedback

- **Messages (errors, warnings, refusals) must overlay the canvas**, not
  push other UI elements down. A pushed layout is disruptive and makes a
  refusal harder to correlate with the action that caused it.

## Units display

- **Some units over-expand.** `W` rendering as `Nmm/s` after a multiply node
  is the observed case. Needs either a better canonical-form-to-display
  simplification, or a user override exposed on hover (a dropdown of
  equivalent unit spellings). Which of the two — or both — is open; flagging
  as a design question rather than deciding it here.

## Visual system

- **More use of colour overall.** Candidate: tint input / calc / output
  nodes differently by kind, consistent with colour-means-state —
  kind is a form of state.
- **UI chrome font is too small**, and both font size and the colour
  palette should be parametrised so they're easy to change later — this
  reads as a settings/theming concern, not a one-off tweak.
- **Dark mode is required.**

## File menu

- **Open/save belong top-left, in a conventional ribbon** — `File`, `Edit`,
  `View`, etc. — rather than wherever they currently live.

## Catalogue loading

- **Catalogues are not cached in local storage.** To update a catalogue the
  user should be able to just reload it; the webapp checks its version and
  updates in place rather than requiring a fresh manual load every time.

## Keyboard shortcuts

- **Backspace is currently the only deletion shortcut.** Delete should work
  too — ideally both, not one or the other.
