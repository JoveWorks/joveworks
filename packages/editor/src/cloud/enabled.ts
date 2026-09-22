/**
 * Whether this build talks to a JoveWorks Hub at all.
 *
 * Hub is optional. A school that hosts the editor itself — the case
 * `HOSTING.md` is written for — generally runs no Hub, and every cloud
 * affordance in the interface is then a dead end: a Cloud menu whose every
 * item fails, a connect dialog with nothing to connect to. Off by default is
 * the honest default for that reader, so the flag *enables* cloud rather than
 * disabling it, exactly like `VITE_ANALYTICS` in `analytics.ts`.
 *
 * The consequence for our own deploys is that they must opt in: Netlify's
 * nightly and the release workflow's stable bundle both set
 * `VITE_CLOUD=hub`. A build that forgets it loses the Cloud menu, which is
 * visible immediately rather than subtly wrong.
 *
 * This gates the *interface*, not the module graph: hub.ts and the dialogs
 * are still imported and still in the bundle. Keeping them out of the build
 * needs the cloud surface behind a lazy boundary the way `main.tsx` already
 * splits the editor from the viewer — worth doing, but a refactor rather
 * than a flag, and not required for the interface to be honest.
 */
export const CLOUD_ENABLED = import.meta.env.VITE_CLOUD === 'hub';
