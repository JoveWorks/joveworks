/**
 * Registers the domains a test may meet (ROADMAP item 19) before the test
 * file runs. A test that imports a module directly — `./document.js` or
 * `./evaluate.js` rather than its package — would otherwise never load a
 * domain's registrations, and a shaft in its fixture would read as an
 * unknown kind. The shafts still register from the schema and kernel
 * packages themselves; when they move to `domains/examples/`, this is where
 * their registration is imported.
 */
import '@joveworks/schema';
import '@joveworks/kernel';
