# What this is

JoveWorks is a node editor for dimensioning machine parts. You
wire inputs, equations and outputs together on a canvas, and the graph is
the calculation.

It's built for the KU Leuven machine-parts course. Formulas come from
*Roloff & Matek, 6th ed.*, and every one carries a citation back to its
equation number. The catalogue itself is distributed separately through the
course — this site, like the app, ships no textbook content.

## How a student works with it

1. **Open a link.** It's a static web app — nothing to install, no account.
2. **Load the catalogue** file handed out through the course LMS. Once
   loaded it stays in browser storage; this is a first-run step, not a
   per-session chore. Some catalogues ship bundled with the app but locked —
   those need a one-time password from your course before their formulas
   are usable.
3. **Drag in formulas** by equation number or by what they compute. Each
   arrives as a node with typed ports — inputs on one side, the result on
   the other.
4. **Wire them up.** Bad connections don't attach: a force output won't
   enter a length input, and neither will a link that would create a cycle.
5. **Set the knowns.** Type `250 kW`, `1450 rpm` — units are explicit and
   converted at the boundary. An undeclared unit is an error, never a guess.
6. **Turn an input into a range** and the whole graph becomes a study — see
   [Sweeps](./sweeps).
7. **Group related nodes into titled frames** and write a note on each. The
   frames are the sections of your report, not just tidying.
8. **Export the notebook** — prose, values, checks and plots in reading
   order — as the thing you hand in.

See [Units](./units) for how dimensions and canonical units work under the
hood, and [Tips and tricks](./tips-and-tricks) once you're past the basics —
shortcuts, right-click menus, and interface details that don't fit this
overview.
