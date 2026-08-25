#!/usr/bin/env node
/**
 * Encrypt a catalogue JSON or YAML file into the locked-catalogue format the editor
 * unlocks with a password (docs/password-shared-catalogues.md,
 * packages/schema/src/lockedCatalogue.ts). Run once per course offering by
 * whoever holds the catalogue and the password — typically from the private
 * catalogue repository, not this one, since the plaintext content usually
 * lives there. Requires `pnpm build` to have produced packages/schema/dist.
 *
 * Usage:
 *   node tools/encrypt-catalogue/encrypt-catalogue.mjs <in.json|yaml> <out.json>
 *
 * The password is read from the JOVEWORKS_CATALOGUE_PASSWORD environment
 * variable, never from an argument — arguments end up in shell history and
 * process listings.
 */

import { readFile, writeFile } from 'node:fs/promises';

import {
  catalogueFormatFromFileName,
  encryptCatalogue,
  loadCatalogue,
  saveLockedCatalogue,
} from '../../packages/schema/dist/index.js';

const [, , inPath, outPath] = process.argv;

if (inPath === undefined || outPath === undefined) {
  console.error('Usage: node encrypt-catalogue.mjs <in.json|yaml> <out.json>');
  process.exit(1);
}

const password = process.env.JOVEWORKS_CATALOGUE_PASSWORD;
if (password === undefined || password.length === 0) {
  console.error('Set JOVEWORKS_CATALOGUE_PASSWORD to the password this catalogue will be locked with.');
  process.exit(1);
}

const catalogue = loadCatalogue(
  await readFile(inPath, 'utf8'),
  catalogueFormatFromFileName(inPath),
);
const locked = await encryptCatalogue(catalogue, password);
await writeFile(outPath, saveLockedCatalogue(locked));
console.log(`Wrote ${outPath} — locked catalogue '${locked.id}', ${catalogue.formulas.length} formulas.`);
