/**
 * Registers the domains a test may meet (ROADMAP item 19) before the test
 * file runs, the way `packages/editor/src/domains.ts` does for the app. A
 * test imports the modules it exercises directly, so without this nothing
 * would load a domain's registrations, and a shaft in its fixture would read
 * as an unknown kind.
 */
import '../domains/shafts/kernel';
