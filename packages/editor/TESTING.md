# Checking the editor by hand

`pnpm test` covers the model layer — document edits, readiness, and the belt lab
reproducing its golden values through the editor's own path. What it cannot
reach is whether the thing behaves like a tool: whether a wire refuses to attach
*visibly*, whether a sweep reads as a sweep, whether a twenty-node graph is
legible. That is this list.

Run it after any change to the canvas, and record what you found in the commit
that follows.

## Launch

```sh
cd ~/source/machine-design-studio
pnpm install    # first time on a new machine
pnpm dev        # → http://localhost:5173/
```

It opens on the **pad pressure sweep**: a base-node-only sample with one range
input, one check and one plot. No catalogue is needed for it, and it carries no
textbook content — which is also the point of it existing (S42).

For the belt half, load the catalogue through the toolbar's `load catalogue`
button and pick:

```
~/source/machine-design-catalogue/formulas/c16-belt.json
```

There is no autosave yet, so that is a per-refresh step.

The headless side, for completeness:

```sh
pnpm build      # tsc -b, and the dependency-direction check
pnpm test
MDS_CATALOGUE=~/source/machine-design-catalogue/formulas/c16-belt.json pnpm test
```

## What the colours mean

Colour is spent on state and nothing else (S49), so most of what follows is
really asking whether the right border lit up.

| Appearance | Meaning |
|---|---|
| Dashed grey border | A required input is not connected (S50) |
| Flat grey, dimmed | Blocked — something upstream is unfinished |
| Amber border | Quarantined: cannot be evaluated by anyone (S19/S20) |
| Red border, red banner | The kernel refused this node or this wire |
| Green / red badge | A check that passes / fails (S33) |

## The checklist

### Layout and node density (S46, S50)

- [ ] Three columns, canvas dominant; both side toggles collapse and restore
      their panel. There is no properties panel anywhere, and there should not be.
- [ ] Nodes are compact at rest — ports are bare dots — and open on hover or
      selection.
- [ ] The ▣ button pins a node open while you work elsewhere, and unpins it.
- [ ] A twenty-node graph is still readable. Load the belt lab and come back to
      this one.

### Editing on the node (S47, S5)

- [ ] Open *Pad load F*, change it to `15 kN`. Everything downstream updates,
      plot included.
- [ ] Type a nonsense unit — `15 kilonewton`. The field goes red, keeps your
      text, and says why underneath. Escape restores the old value; Enter commits.
- [ ] Type a bare `15` into a field that wants a force. Note where the complaint
      lands — it should be visible somewhere, not silently computed.
- [ ] Rename a node by clicking its title. Backspace inside a field edits text
      rather than deleting the node.

### The sweep (S29, S43)

- [ ] Open *Pad width w*: the kind selector offers value, linear range, log
      range, list.
- [ ] Switch it to **list** and type `20, 30, 40`. Sparklines downstream shrink
      to three points and the plot redraws with three.
- [ ] Switch to **log range**. The plot's x-axis becomes logarithmic on its own.
- [ ] Set *Pad length L* to a range too, then set it as the plot's *series*
      axis: one line per length, with no rewiring.
- [ ] Tick *contour* on that two-axis plot. It draws — whether it draws *well*
      is the open question S26 left.

### Wiring, and what refuses to attach (S6, S18, S64)

- [ ] Drag a wire out of a port: incompatible targets visibly go dead while the
      wire is in the air.
- [ ] Drop a genuinely impossible wire — a pressure into a length input. A red
      banner appears at the top of the canvas in the kernel's own words, and no
      edge attaches.
- [ ] Try to close a loop, back into something upstream. Refused as a cycle.
- [ ] Wire a second source into an input that already has one. The old wire is
      replaced, not doubled.
- [ ] Add a `multiply` from the palette and leave it unwired: dashed border,
      "not connected: a, b", and the rest of the graph keeps its numbers.

### Outputs and the notebook (S30, S33, S48)

- [ ] The check node reads as failing on the sample, and says at how many
      points. Raise its threshold until it turns green.
- [ ] Switch an output node between value, check and plot; the notebook entry
      changes with it.
- [ ] The notebook's section title and note come from the frame on the canvas;
      the note and each caption are editable in place.
- [ ] Drag an output node out of the frame: it moves to "Not in a section" in
      the notebook. Drag it back.
- [ ] `+ section` draws a frame around the ungrouped nodes and gives it a title
      you can edit.

### Files (S23, S24)

- [ ] `save` downloads a `.mds.json`; `open` brings it back with positions,
      ranges and captions intact.
- [ ] Grep the saved file: it holds formula ids, versions and hashes, and **no
      expression of any kind**. Worth doing on a belt graph specifically.

### The belt half — needs the catalogue (S19, S45, S66)

- [ ] Before loading anything, the `belt lab` button is disabled and its tooltip
      says why.
- [ ] After loading, the palette gains a second section marked *restricted*, and
      the button enables.
- [ ] Open the belt lab. Values match PLAN.md's golden table. The editor's own
      test already asserts this, so here you are checking that it *reads* right —
      labels, units, figures.
- [ ] Search the palette for `16.24`: listed, marked quarantined, with the reason
      on hover rather than hidden.
- [ ] Drag it in and wire its three inputs. The node goes amber with its reason,
      anything downstream reads as blocked, and no number appears. That is what
      D20 cost, made visible.
- [ ] Turn a belt input into a range — the small pulley, say — and plot something
      against it. This is the first time the belt chapter has been swept rather
      than evaluated once.

## Known and deliberate — not bugs

- **No autosave, and no stored catalogue.** A refresh loses the graph and the
  catalogue both. S24's IndexedDB layer is settled but not built; it was not in
  step 8's scope.
- **Frames do not carry their nodes.** Dragging a frame moves the frame;
  membership is decided by where a node sits (S69).
- **Table outputs render but cannot be created.** Their columns are extra input
  ports, which belongs with the full notebook view (PLAN.md step 11).
- **Contour is unverified.** It draws from the kernel's grid, and a
  non-uniformly spaced axis is stretched onto a uniform one. S26 asks for it to
  be checked against the key-design case before it is trusted.
- **No categorical or table inputs.** Nothing in milestone 1 has a port to
  receive one; they arrive with the second slice (S37, S38).
- **No formula authoring (S51), and no export (S32).** The notebook is a live
  panel only.
