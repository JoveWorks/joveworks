# What this is

JoveWorks is a node editor for dimensioning machine parts. You
wire inputs, equations and outputs together on a canvas, and the graph is
the calculation.

Formula libraries are catalogues. JoveWorks includes unrestricted catalogues
and can load another catalogue supplied for a course or project. Every formula
keeps its source citation, typed ports, valid ranges, and verification status
with it. The workflow is the same whichever catalogue is loaded.

## How a student works with it

1. **Open a link.** It's a static web app — nothing to install, no account.
2. **Load any supplied catalogue** — from a file, or from a connected Hub.
   Once loaded it stays in browser storage; this is a first-run step, not a
   per-session chore. See [Using catalogues](./catalogues).
3. **Drag in formulas** by reference or by what they compute. Each
   arrives as a node with typed ports — inputs on one side, the result on
   the other.
4. **Wire them up.** Bad connections don't attach: a force output won't
   enter a length input, and neither will a link that would create a cycle.
5. **Set the knowns.** Type `250 kW`, `1450 rpm` — units are explicit and
   converted at the boundary. An undeclared unit is an error, never a guess.
6. **Turn an input into a range** and the whole graph becomes a study — see
   [Sweeps](./sweeps).
7. **Organise related nodes with frames.** A titled **section** frame and its
   note become part of your report; a lighter **group** frame is canvas-only
   organisation. Groups can nest in sections or other groups, can wrap a
   section, and can collapse to a compact box with its incoming and outgoing
   wires still visible.
8. **Export the NodeBook** — prose, values, checks and plots in reading order
   — as the thing you hand in. See [Creating a NodeBook](./nodebooks).

See [Units](./units) for how dimensions and canonical units work under the
hood, and [Tips and tricks](./tips-and-tricks) once you're past the basics —
shortcuts, right-click menus, and interface details that don't fit this
overview.
