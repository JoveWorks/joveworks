/**
 * The content hash a graph carries alongside a formula's id and version.
 *
 * Its job is to notice that a formula changed under a graph that was saved
 * against it, so opening the graph warns instead of quietly recomputing
 * different numbers. That is a *collision-by-accident* problem, not an
 * adversarial one: a student who edits a catalogue to defeat the check has only
 * fooled themselves, and nothing here is a security boundary.
 *
 * So FNV-1a over the canonical JSON, and not SHA-256 — `crypto.subtle` is async
 * and would make every parse of a document async with it, and Node's `crypto` is
 * not available in the browser. 64 bits is ample for telling apart the
 * revisions of one formula.
 */

import { canonicalJson, type JsonValue } from './json.js';

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * Over UTF-16 code units rather than UTF-8 bytes, so it needs no `TextEncoder`
 * and stays identical in Node and in a browser. The distinction is invisible
 * here — the hash only ever has to agree with itself.
 */
export function fnv1a64(text: string): string {
  let hash = OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    hash = ((hash ^ BigInt(code & 0xff)) * PRIME) & MASK;
    hash = ((hash ^ BigInt(code >> 8)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Hash a record by its canonical JSON, so field order never changes the result.
 *
 * Everything serialized is included, description and citation among it. A
 * description-only edit therefore invalidates the hash — which is the
 * conservative direction: a spurious "the catalogue changed" prompt is a
 * nuisance, a missed one is a wrong number in a submitted report.
 */
export function hashRecord(record: JsonValue): string {
  return fnv1a64(canonicalJson(record));
}
