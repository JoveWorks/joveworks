# Roadmap

What's actually open, in one place: the two content-sign-off tasks that need
Roloff & Matek in hand, the open product questions, and the backlog of
deferred or undecided editor ideas. An item is removed once it ships — the
reasoning behind a shipped change lives in its commit message, and
`docs/next-session.md` carries what the next session should pick up. This
file is only ever the answer to "what is still open".

## Open product questions

**A read-only NodeBook viewer.** Mobile is for reading finished work, not
editing a desktop graph. Decide the portable report format and sharing route
before expanding the course viewer into a general NodeBook viewer.

## Editor backlog

**2. A range's two bounds showing different units** — `10 mm ... 1 m`, each
bound keeping its own unit rather than both sharing one. The choice remains
editor-only display state (not persistent) versus a schema change carrying a
unit per bound (persistent but wider than `ValueSpec`).

**8. Visualization nodes** — cantilever beams, bending-moment diagrams and the
like. Generic mechanics content, not R&M-specific, so this lives in the public
repo's node library and should be referenceable from the notebook.

**11. Notebook export to Markdown**, for pasting a finished graph into an
external site. Citations and values by default, expressions only behind an
explicit toggle; keep it behind a console command for now.

**16. Nodes expose preferred display units.** Largely implemented, but the R&M
catalogue needs updating.

**17. What about migration to newer versions?** Documents have a migration path.
Catalogues still have no migration path and refuse an unknown schema version.

**30. Change: Should we use compiled notebooks to share in the notebook viewer?**

**33. Change: What is the {table XX} notation in RM catalogue?** Decide how to
integrate tables as catalogue lookup items.

**35. Change: equation R&M 16.3 uses betahat_1** The hat is currently not
present as a caret on the letter. Out of scope for this repo — R&M catalogue
content lives in the private `machine-design-catalogue` repository.
