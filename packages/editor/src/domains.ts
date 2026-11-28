/**
 * The domains this build includes (ROADMAP item 19), registered before
 * anything opens a document or a catalogue — `main.tsx` imports this first,
 * ahead of both routes, so the editor and the published-NodeBook viewer see
 * the same kinds.
 *
 * The shafts in `domains/examples/` are still named here directly, and
 * built into every build: the editor's own shaft views import them until
 * their editor part moves into the domain too. After that, domains are
 * found by glob and the examples follow `VITE_EXAMPLE_CATALOGUES`.
 */
import '../../../domains/examples/kernel';
