/**
 * The catalogue examples in the authoring docs, loaded exactly as a file
 * would be. Every fenced YAML block that starts with `schemaVersion:` is a
 * whole catalogue, so a doc whose example stops loading — a renamed field, a
 * rule the parser now enforces — fails here instead of misleading the next
 * person who copies it.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '@joveworks/schema';

const DOCS = [
  'docs/authoring-catalogues.md',
  'packages/docs-site/docs/guide/catalogue-authoring.md',
] as const;

function catalogueBlocks(path: string): readonly string[] {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  return [...text.matchAll(/```yaml\n(schemaVersion:[\s\S]*?)```/gu)].map((match) => match[1] as string);
}

describe('the catalogue examples in the authoring docs', () => {
  for (const path of DOCS) {
    describe(path, () => {
      const blocks = catalogueBlocks(path);

      it('has at least one whole-catalogue example', () => {
        expect(blocks.length).toBeGreaterThan(0);
      });

      for (const [i, block] of blocks.entries()) {
        it(`example ${i + 1} loads`, () => {
          expect(() => loadCatalogue(block, 'yaml')).not.toThrow();
        });
      }

      it('shows a table that loads, empty cells and quoted keys included', () => {
        const tables = blocks.flatMap((block) => loadCatalogue(block, 'yaml').tables ?? []);
        expect(tables.length).toBeGreaterThan(0);
        const [table] = tables;
        expect(table?.rows[0]?.[0]).toBe('71');
        expect(table?.rows.some((row) => row.includes(null))).toBe(true);
      });
    });
  }
});
