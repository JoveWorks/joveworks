import { describe, expect, it } from 'vitest';

/** Invented content only — see formula.test.ts for why. */
import { parseCatalogue } from './formula.js';
import {
  CatalogueUnlockError,
  DEFAULT_KDF_ITERATIONS,
  decryptCatalogue,
  encryptCatalogue,
  loadLockedCatalogue,
  parseLockedCatalogue,
  saveLockedCatalogue,
  serializeLockedCatalogue,
} from './lockedCatalogue.js';

const catalogue = parseCatalogue({
  schemaVersion: 1,
  id: 'demo-restricted',
  name: { en: 'Demo restricted set' },
  restricted: true,
  formulas: [
    {
      id: 'demo.product',
      version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'N' },
      inputs: [
        { kind: 'numeric', name: 'a', unit: 'N' },
        { kind: 'numeric', name: 'b', unit: '' },
      ],
      expression: 'a*b',
      description: { en: 'An invented formula.' },
      status: 'unverified',
    },
  ],
});

// A low iteration count keeps this suite fast; production catalogues use DEFAULT_KDF_ITERATIONS.
const FAST_ITERATIONS = 100;

describe('locked catalogues', () => {
  it('decrypts back to the original catalogue with the right password', async () => {
    const locked = await encryptCatalogue(catalogue, 'correct horse battery staple', FAST_ITERATIONS);
    const decrypted = await decryptCatalogue(locked, 'correct horse battery staple');
    expect(decrypted.id).toBe(catalogue.id);
    expect(decrypted.formulas).toEqual(catalogue.formulas);
  });

  it('rejects a wrong password instead of returning garbage', async () => {
    const locked = await encryptCatalogue(catalogue, 'correct horse battery staple', FAST_ITERATIONS);
    await expect(decryptCatalogue(locked, 'wrong password')).rejects.toBeInstanceOf(CatalogueUnlockError);
  });

  it('exposes id and name without the password', async () => {
    const locked = await encryptCatalogue(catalogue, 'a password', FAST_ITERATIONS);
    expect(locked.id).toBe('demo-restricted');
    expect(locked.name).toEqual({ en: 'Demo restricted set' });
    expect(locked.ciphertext).not.toContain('demo.product');
  });

  it('round-trips through parse/serialize and load/save text', async () => {
    const locked = await encryptCatalogue(catalogue, 'a password', FAST_ITERATIONS);
    const text = saveLockedCatalogue(locked);
    const reparsed = loadLockedCatalogue(text);
    expect(reparsed).toEqual(locked);
    expect(parseLockedCatalogue(serializeLockedCatalogue(locked))).toEqual(locked);
  });

  it('defaults to a real-world iteration count when the caller does not choose one', async () => {
    const locked = await encryptCatalogue(catalogue, 'a password');
    expect(locked.kdf.iterations).toBe(DEFAULT_KDF_ITERATIONS);
  });

  it('rejects an unsupported KDF or cipher algorithm', () => {
    const base = {
      schemaVersion: 1,
      id: 'x',
      name: { en: 'x' },
      kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 1, salt: 'AA==' },
      cipher: { algorithm: 'AES-GCM', iv: 'AA==' },
      ciphertext: 'AA==',
    };
    expect(() => parseLockedCatalogue({ ...base, kdf: { ...base.kdf, algorithm: 'scrypt' } })).toThrow();
    expect(() => parseLockedCatalogue({ ...base, cipher: { ...base.cipher, algorithm: 'AES-CBC' } })).toThrow();
  });
});
