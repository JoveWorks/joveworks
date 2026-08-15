# Editor UX spec

Written from the first browser pass over the milestone-1 editor
(`packages/editor/TESTING.md`). Organised by area rather than by the order
findings came in. Each item is a requirement, not a suggestion — where a
finding was a judgement call rather than a clear defect, it says so.

Two items are called out separately at the end rather than folded into the
spec: a **known bug** (a stack trace, not a UX opinion) and a **backlog
item** (an explicitly deferred feature, not milestone-1 scope).

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
  nodes differently by kind, consistent with colour-means-state (S49) —
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

---

## Backlog (post-MVP, explicit — do not pull into milestone 1)

**Plot node needs a real options pass** — multiple series per plot, marking
specific values, and likely more. This is a big enough feature to warrant
its own session after MVP, not a line item here.

**A plot's threshold as an optional port, overriding the hardcoded value** —
today `output.threshold` is a quantity a student types on the node (S58);
this would let a wired value override it instead, so the threshold can
itself come from upstream (a formula's own limit, a swept comparison) rather
than only ever being retyped by hand. Needs its own discussion first: this
is the first case of an optional port that *overrides* an authored value
rather than just filling one in, and nothing in the port model distinguishes
those two cases yet.

**A range's two bounds showing different units** — `10 mm ... 1 m`, each
bound keeping its own unit rather than both sharing one. Two ways to build
it were weighed: editor-only display state (doesn't survive save/reload) or
a schema change to carry a unit per bound (persists properly, but widens
`ValueSpec` and ripples into the kernel and everywhere else that assumes a
range has one unit). Neither was picked; parked here rather than decided
under scope pressure.

**A waypoint node, to bundle and redirect edges** — a passive routing point
on the canvas: straight connections in and out, and an always-available open
slot to join another wire, the same ghost-port interaction `minimum` already
has (S71). Deleting one does not break what passed through it — the nodes on
either side end up connected by a single direct edge, as if the waypoint had
never been there. Needs a discussion before building: is it one channel
per waypoint (several waypoints bundled visually) or genuinely multiple
independent pass-through channels sharing one waypoint, each its own
source/destination pair? The "bundle" and "ghost ports" language points at
the second — several *unrelated* wires routed through one point, not values
merged into one — but that is a different kind of node than anything in the
schema today (no formula, no input, no output; edges in are not reduced,
they are relayed), and the delete-time splice (find each channel's own
source and destination, reconnect them directly) has no precedent to build
from either.
