import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
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
 * import into it and runs `tsc -b`. The copy keeps a failed run from leaving a
 * broken file behind in the real tree.
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

function workspaceCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'joveworks-refs-'));
  scratch.push(dir);
  for (const entry of ['packages', 'tsconfig.json', 'tsconfig.base.json', 'node_modules']) {
    cpSync(join(root, entry), join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  return dir;
}

function build(dir: string): boolean {
  // TypeScript 5.9 can return before diagnostics flush through synchronous
  // child-process pipes. The exit status is the dependency barrier this test
  // needs to exercise, so do not make the assertion depend on captured text.
  const result = spawnSync(
    process.execPath,
    [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', '--force'],
    { cwd: dir, stdio: 'ignore' },
  );
  return result.status === 0;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe('dependency direction', () => {
  it('builds the workspace as it stands', () => {
    expect(build(workspaceCopy())).toBe(true);
  }, 120_000);

  it('fails the build when units imports schema — a package below its layer', () => {
    const dir = workspaceCopy();
    writeFileSync(
      join(dir, 'packages/units/src/illegal.ts'),
      `import { DOCUMENT_SCHEMA_VERSION } from '@joveworks/schema';\nexport const x = DOCUMENT_SCHEMA_VERSION;\n`,
    );
    expect(build(dir)).toBe(false);
  }, 120_000);

  it('fails the build when the kernel imports the editor — React would follow', () => {
    const dir = workspaceCopy();
    writeFileSync(
      join(dir, 'packages/kernel/src/illegal.ts'),
      `import { EDITOR } from '@joveworks/editor';\nexport const x = EDITOR;\n`,
    );
    expect(build(dir)).toBe(false);
  }, 120_000);

  it('does not catch an illegal import that binds nothing', () => {
    // A side-effect-only import of an unresolvable module is not reported by
    // tsc. It still fails at bundle time, and it imports no names, so it cannot
    // be how a dependency creeps in — but it is not caught here.
    const dir = workspaceCopy();
    writeFileSync(join(dir, 'packages/kernel/src/illegal.ts'), `import '@joveworks/editor';\n`);
    expect(build(dir)).toBe(true);
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
    expect(build(dir)).toBe(true);
  }, 120_000);
});
