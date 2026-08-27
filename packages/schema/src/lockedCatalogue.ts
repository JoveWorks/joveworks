/**
 * A restricted catalogue, encrypted with one password shared by everyone who
 * should be able to read it — a course cohort, not one recipient — so
 * symmetric encryption is the whole mechanism (docs/password-shared-catalogues.md):
 * one password both encrypts (once, by the instructor) and decrypts (every
 * student who has it). Public-key crypto only earns its complexity when
 * different recipients need their own revocable keys, which is not this case.
 *
 * The ciphertext is meant to sit in the *public* repo, next to the
 * unrestricted bundled catalogues — publishing ciphertext is fine as long as
 * the password stays secret, because the risk moves entirely onto the
 * password, not the hosting. Only `id` and `name` are readable without the
 * password, so a locked catalogue can be listed before it is unlocked.
 *
 * AES-GCM's auth tag is what turns a wrong password into a clean rejection
 * instead of garbage output: a bad key fails to verify rather than producing
 * plausible-looking nonsense.
 */

import {
  fail,
  join,
  readJsonText,
  readObject,
  readInteger,
  readName,
  readString,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { CATALOGUE_SCHEMA_VERSION, readSchemaVersion } from './version.js';
import { parseLocalizedText, serializeLocalizedText, type LocalizedText } from './localization.js';
import { loadCatalogue, saveCatalogue } from './io.js';
import type { Catalogue } from './formula.js';

const KDF_ALGORITHM = 'PBKDF2';
const KDF_HASH = 'SHA-256';
const CIPHER_ALGORITHM = 'AES-GCM';
/** OWASP's current PBKDF2-SHA256 floor; re-derived once per unlock, not per formula lookup. */
export const DEFAULT_KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface LockedCatalogue {
  readonly schemaVersion: number;
  readonly id: string;
  /** Readable without the password, so the palette can list a locked entry by name. */
  readonly name: LocalizedText;
  readonly kdf: {
    readonly algorithm: 'PBKDF2';
    readonly hash: 'SHA-256';
    readonly iterations: number;
    readonly salt: string;
  };
  readonly cipher: {
    readonly algorithm: 'AES-GCM';
    readonly iv: string;
  };
  /** Base64 AES-GCM output (ciphertext and auth tag) of the catalogue's own saved text. */
  readonly ciphertext: string;
}

/** A wrong password and a corrupted file look identical to AES-GCM: both fail the auth tag. */
export class CatalogueUnlockError extends Error {
  override readonly name = 'CatalogueUnlockError';
  constructor() {
    super('wrong password, or this file is not a valid locked catalogue');
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string, path: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    fail(path, 'is not valid base64');
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), KDF_ALGORITHM, false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: KDF_ALGORITHM, salt: salt as BufferSource, iterations, hash: KDF_HASH },
    material,
    { name: CIPHER_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a catalogue's saved text under a fresh salt and iv. Run once, by the instructor. */
export async function encryptCatalogue(
  catalogue: Catalogue,
  password: string,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<LockedCatalogue> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const plaintext = new TextEncoder().encode(saveCatalogue(catalogue));
  const ciphertext = await crypto.subtle.encrypt({ name: CIPHER_ALGORITHM, iv: iv as BufferSource }, key, plaintext);
  return {
    // The envelope wraps a Catalogue and is distributed the same LMS/Hub way
    // (docs/password-shared-catalogues.md); it stamps the catalogue version
    // rather than one of its own so it stays keyed to the content it locks.
    // Locked catalogues are slated for removal in separate work (they move to
    // a backend) — this stays minimal rather than introducing a third,
    // soon-to-be-deleted constant.
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    id: catalogue.id,
    name: catalogue.name,
    kdf: { algorithm: KDF_ALGORITHM, hash: KDF_HASH, iterations, salt: bytesToBase64(salt) },
    cipher: { algorithm: CIPHER_ALGORITHM, iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypt with a candidate password. Rejects (never resolves with garbage) on a wrong one. */
export async function decryptCatalogue(locked: LockedCatalogue, password: string): Promise<Catalogue> {
  const salt = base64ToBytes(locked.kdf.salt, 'kdf.salt');
  const iv = base64ToBytes(locked.cipher.iv, 'cipher.iv');
  const ciphertext = base64ToBytes(locked.ciphertext, 'ciphertext');
  const key = await deriveKey(password, salt, locked.kdf.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: CIPHER_ALGORITHM, iv: iv as BufferSource }, key, ciphertext as BufferSource);
  } catch {
    throw new CatalogueUnlockError();
  }
  return loadCatalogue(new TextDecoder().decode(plaintext));
}

export function parseLockedCatalogue(value: JsonValue, path = ''): LockedCatalogue {
  const object = readObject(value, path);
  const schemaVersion = readSchemaVersion(object, path, CATALOGUE_SCHEMA_VERSION, 'locked catalogue');
  const kdfPath = join(path, 'kdf');
  const kdfObject = readObject(required(object, 'kdf', path), kdfPath);
  const algorithm = readString(required(kdfObject, 'algorithm', kdfPath), join(kdfPath, 'algorithm'));
  if (algorithm !== KDF_ALGORITHM) fail(join(kdfPath, 'algorithm'), `expected '${KDF_ALGORITHM}', got '${algorithm}'`);
  const hash = readString(required(kdfObject, 'hash', kdfPath), join(kdfPath, 'hash'));
  if (hash !== KDF_HASH) fail(join(kdfPath, 'hash'), `expected '${KDF_HASH}', got '${hash}'`);

  const cipherPath = join(path, 'cipher');
  const cipherObject = readObject(required(object, 'cipher', path), cipherPath);
  const cipherAlgorithm = readString(required(cipherObject, 'algorithm', cipherPath), join(cipherPath, 'algorithm'));
  if (cipherAlgorithm !== CIPHER_ALGORITHM) {
    fail(join(cipherPath, 'algorithm'), `expected '${CIPHER_ALGORITHM}', got '${cipherAlgorithm}'`);
  }

  return {
    schemaVersion,
    id: readName(required(object, 'id', path), join(path, 'id')),
    name: parseLocalizedText(required(object, 'name', path), join(path, 'name')),
    kdf: {
      algorithm: KDF_ALGORITHM,
      hash: KDF_HASH,
      iterations: readInteger(required(kdfObject, 'iterations', kdfPath), join(kdfPath, 'iterations'), 1),
      salt: readString(required(kdfObject, 'salt', kdfPath), join(kdfPath, 'salt')),
    },
    cipher: {
      algorithm: CIPHER_ALGORITHM,
      iv: readString(required(cipherObject, 'iv', cipherPath), join(cipherPath, 'iv')),
    },
    ciphertext: readString(required(object, 'ciphertext', path), join(path, 'ciphertext')),
  };
}

export function serializeLockedCatalogue(locked: LockedCatalogue): JsonObject {
  return {
    schemaVersion: locked.schemaVersion,
    id: locked.id,
    name: serializeLocalizedText(locked.name),
    kdf: { ...locked.kdf },
    cipher: { ...locked.cipher },
    ciphertext: locked.ciphertext,
  };
}

export function loadLockedCatalogue(text: string): LockedCatalogue {
  return parseLockedCatalogue(readJsonText(text));
}

/** Indented, because these files are read and diffed by people (same as `saveCatalogue`). */
export function saveLockedCatalogue(locked: LockedCatalogue): string {
  return `${JSON.stringify(serializeLockedCatalogue(locked), null, 2)}\n`;
}
