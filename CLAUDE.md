# CLAUDE.md

Shared repository guidance lives in [AGENTS.md](AGENTS.md). Read it before
making changes; it defines the public/restricted-content boundary, architecture
invariants, validation commands, and working rules for every coding agent.

## Claude Code notes

- Do not launch, stop, or operate `pnpm dev`. Thomas keeps the editor session
  running and performs browser checks himself.
- Work directly on `main` unless explicitly assigned an isolated worktree.
  `production` is advanced only by the manual release workflow and is never a
  development branch. Worktree agents may commit only to their own branch;
  merging requires a review of the actual diff and `pnpm build && pnpm test`
  on the merge result.
- When reporting editor work, state what changed and what Thomas should verify
  in the browser.

## Orchestrating worktree agents

Thomas often sends several small editor fixes at once and asks for them to be
farmed out in parallel. The orchestrator stays on `main`, spawns one Sonnet
subagent per fix, reviews each diff, and merges.

### Worktrees are siblings of the checkout

Create them at `../joveworks-<task>`, never under `/tmp` and never nested
inside the repository:

```sh
git worktree add -b <task> ../joveworks-<task> HEAD
```

The subagent tool's own `isolation: "worktree"` places worktrees in
`.claude/worktrees/agent-<id>/` under opaque names, so do not use it here.
Create the worktree explicitly as above, then tell the agent, as the first
instruction in its brief, to call `EnterWorktree` with the absolute path. That
pins its working directory for the rest of the run. Entering a sibling path
this way works because the agent starts in the launch directory and the path is
already registered in `git worktree list`.

Clean up merged branches afterwards:

```sh
git worktree remove ../joveworks-<task> && git branch -d <task>
```

### Split the work so the merges cannot collide

Give each agent files no other agent will touch, and say so in the brief —
name the sibling agent's files and forbid editing them. Two fixes that both
land in the same component belong in one brief, not two worktrees. Shared
files worth checking before splitting: `styles.css`, `PlotFigure.tsx` (exports
`typesetChartLabels`, `chartTip` and `pointedRow`, which the other figures all
call).

### What a brief needs

Beyond the bug report itself:

- **The root-cause lead**, if there is one. Investigating from the parent
  session first and handing the agent a specific hypothesis to confirm-or-refute
  is worth far more than the tokens it costs — Observable Plot's DOM in
  particular is full of traps that a cold agent burns its run rediscovering.
- **A scope fence**: the files it owns, and what it must not touch.
- **The `node_modules` situation** from AGENTS.md — a fresh worktree has none,
  the symlink workaround gives false failures in project-reference and React
  tests, and the agent should report that shape of failure as an environment
  artefact rather than chasing it.
- **Test expectations**: extend the existing Vitest files, invented formulas
  only, and prefer a test that fails before the fix.
- **Conventional Commits**, commit to its own branch only, never to `main`.
- **A report** listing the commit SHA, what it ran, and what Thomas should
  verify in the browser.

### Merging

Review the real diff (`git diff main...<branch>`), not the agent's summary of
it, then `git merge --no-ff` and run `pnpm build && pnpm test` on the merge
result. Merge sequentially, so a failure is attributable to one branch.

Experiments Thomas has asked to look at before merging stay on their branch:
report the worktree path and branch name so he can check it out.
