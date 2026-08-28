import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * This leans on the workspace to enforce the dependency direction — that is the
 * whole reason there is no Turborepo here. A configuration that quietly fails
 * to enforce it is worse than none, because it is trusted. So this checks the
 * enforcement rather than the configuration.
 *
 * Each case copies the workspace to a scratch directory, drops one illegal
 * import into it and builds the package that holds the import. The copy keeps a
 * failed run from leaving a broken file behind in the real tree.
 *
 * That the workspace builds clean as it stands is not a case here: `pnpm build`
 * is the validation command and CI runs it in its own step, so asserting it
 * again would mean a second full `tsc -b` — the most expensive thing this file
 * could do — to learn what the step before already reported.
 *
 * What the last case records is that the enforcement is **pnpm's isolated
 * `node_modules` plus each package's `dependencies`**, surfacing through the
 * compiler as TS2307. TypeScript's `references` list orders the build and keeps
 * `composite` honest; it does not by itself refuse an import. Adding a bad
 * dependency is therefore a deliberate edit to a `package.json`, not something
 * that can happen by reaching for the wrong import.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch: string[] = [];

/** Build outputs. Copying them costs IO and leaves stale `.tsbuildinfo` behind. */
const OUTPUT = /(?:^|[/\\])(?:dist|build)$/;

function workspaceCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'joveworks-refs-'));
  scratch.push(dir);
  for (const entry of ['packages', 'tsconfig.json', 'tsconfig.base.json']) {
    cpSync(join(root, entry), join(dir, entry), {
      recursive: true,
      verbatimSymlinks: true,
      // Every case compiles from source, so the ~7 MiB of `dist`/`build` in a
      // tree that has already been built is pure copying cost — and omitting
      // the `.tsbuildinfo` inside them is what lets the build run without
      // `--force`.
      filter: (src) => !OUTPUT.test(src),
    });
  }
  // Dependencies are read-only during `tsc -b`. Copying pnpm's 200+ MiB store
  // once per case saturates a small CI runner and can starve Vitest's worker
  // RPC long enough to hit its fixed 60-second reporting timeout. Package-local
  // workspace links were copied with `packages`; sharing only the root install
  // preserves the resolution boundary this suite exercises.
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

/**
 * Build one package and its references, not the whole workspace.
 *
 * The barrier under test is raised while compiling the package that holds the
 * illegal import, so nothing downstream of it needs to compile. Skipping the
 * editor — the largest project by a wide margin, and never the one being
 * edited — is most of the difference on a two-core runner.
 */
function build(dir: string, ...pkgs: readonly string[]): boolean {
  // TypeScript 5.9 can return before diagnostics flush through synchronous
  // child-process pipes. The exit status is the dependency barrier this test
  // needs to exercise, so do not make the assertion depend on captured text.
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-b',
      ...pkgs.map((pkg) => join('packages', pkg)),
    ],
    { cwd: dir, stdio: 'ignore' },
  );
  return result.status === 0;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe('dependency direction', () => {
  it('fails the build when units imports schema — a package below its layer', () => {
    const dir = workspaceCopy();
    writeFileSync(
      join(dir, 'packages/units/src/illegal.ts'),
      `import { DOCUMENT_SCHEMA_VERSION } from '@joveworks/schema';\nexport const x = DOCUMENT_SCHEMA_VERSION;\n`,
    );
    expect(build(dir, 'units')).toBe(false);
  }, 120_000);

  it('fails the build when the kernel imports the editor — React would follow', () => {
    const dir = workspaceCopy();
    writeFileSync(
      join(dir, 'packages/kernel/src/illegal.ts'),
      `import { EDITOR } from '@joveworks/editor';\nexport const x = EDITOR;\n`,
    );
    expect(build(dir, 'kernel')).toBe(false);
  }, 120_000);

  it('does not catch an illegal import that binds nothing', () => {
    // A side-effect-only import of an unresolvable module is not reported by
    // tsc. It still fails at bundle time, and it imports no names, so it cannot
    // be how a dependency creeps in — but it is not caught here.
    const dir = workspaceCopy();
    writeFileSync(join(dir, 'packages/kernel/src/illegal.ts'), `import '@joveworks/editor';\n`);
    expect(build(dir, 'kernel')).toBe(true);
  }, 120_000);

  it('records that a project reference is not itself a permission check', () => {
    // Declared as a dependency, so pnpm links it and node resolution succeeds;
    // the `references` entry is removed. The build still passes — references
    // order the build, they do not gate imports. The barrier that holds is the
    // one exercised above: a package that is not a declared dependency does not
    // resolve at all.
    const dir = workspaceCopy();
    const tsconfig = join(dir, 'packages/kernel/tsconfig.json');
    writeFileSync(
      tsconfig,
      JSON.stringify(
        {
          extends: '../../tsconfig.base.json',
          compilerOptions: {
            rootDir: 'src',
            outDir: 'dist',
            tsBuildInfoFile: 'dist/.tsbuildinfo',
          },
          include: ['src/**/*.ts'],
          exclude: ['src/**/*.test.ts'],
          references: [{ path: '../units' }],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, 'packages/kernel/src/illegal.ts'),
      `import { DOCUMENT_SCHEMA_VERSION } from '@joveworks/schema';\nexport const x = DOCUMENT_SCHEMA_VERSION;\n`,
    );
    // Schema is named on the command line because the reference that would
    // have ordered its build is the very thing this case removes — which is
    // the distinction being drawn: references schedule work, they do not
    // grant or withhold the right to import.
    expect(build(dir, 'schema', 'kernel')).toBe(true);
  }, 120_000);
});
