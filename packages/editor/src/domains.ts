/**
 * The domains this build includes (ROADMAP item 19), registered before
 * anything opens a document or a catalogue — `main.tsx` imports this first,
 * ahead of both routes, so the editor and the published-NodeBook viewer see
 * the same kinds.
 *
 * The shafts domain (`domains/shafts/`) is still named here directly, and
 * built into every build: the editor's own shaft views import it until its
 * editor part moves into the domain too. After that, domains are found by
 * glob and chosen by name (ROADMAP item 19, step 6).
 */
import '../../../domains/shafts/kernel';
