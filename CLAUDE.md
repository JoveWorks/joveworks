# CLAUDE.md

Shared repository guidance lives in [AGENTS.md](AGENTS.md). Read it before
making changes; it defines the public/restricted-content boundary, architecture
invariants, validation commands, and working rules for every coding agent.

## Claude Code notes

- Do not launch, stop, or operate `pnpm dev`. Thomas keeps the editor session
  running and performs browser checks himself.
- Work directly on `main` unless explicitly assigned an isolated worktree.
  Worktree agents may commit only to their own branch; merging requires a review
  of the actual diff and `pnpm build && pnpm test` on the merge result.
- When reporting editor work, state what changed and what Thomas should verify
  in the browser.
