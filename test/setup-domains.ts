/**
 * Registers the domains a test may meet (ROADMAP item 19) before the test
 * file runs. A test that imports a schema module directly — `./document.js`
 * rather than `@joveworks/schema` — would otherwise never load a domain's
 * registration, and a shaft in its fixture would read as an unknown kind.
 * The shafts still register from the schema package itself; when they move
 * to `domains/examples/`, this is where their registration is imported.
 */
import '@joveworks/schema';
