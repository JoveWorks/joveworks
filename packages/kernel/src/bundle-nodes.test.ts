/**
 * `waypoint`, `pack` and `unpack` — quarantined pending a redesign
 * (ROADMAP.md's "Waypoint/pack/unpack" entry): `resolveGraph` refuses all
 * three unconditionally, the same gate `formula.ts`'s `assertEvaluable`
 * gives a quarantined formula. Every fixture here is invented (CLAUDE.md's
 * distribution restriction): plain lengths and forces, never a Roloff &
 * Matek quantity.
 */

import { describe, expect, it } from 'vitest';

import { KernelError } from './errors.js';
import { evaluateDocument } from './evaluate.js';
import { resolveGraph } from './graph.js';
import {
  documentOf,
  input,
  outputNode,
  packNode,
  scalar,
  unpackNode,
  waypointNode,
  wire,
} from './invented.fixtures.js';

describe('waypoint / pack / unpack — quarantined', () => {
  it('refuses to resolve a waypoint, wired or not', () => {
    const wired = documentOf(
      [input('w', scalar(20, 'mm')), waypointNode('via'), outputNode('readout', { kind: 'print' })],
      [wire('w.value', 'via.in'), wire('via.out', 'readout.value')],
    );
    expect(() => resolveGraph(wired, [])).toThrow(/'via' is quarantined/);

    const bare = documentOf([waypointNode('via')], []);
    expect(() => resolveGraph(bare, [])).toThrow(KernelError);
  });

  it('refuses to resolve a pack', () => {
    const document = documentOf(
      [input('length', scalar(20, 'mm')), packNode('bundle')],
      [wire('length.value', 'bundle.in0')],
    );
    expect(() => resolveGraph(document, [])).toThrow(/'bundle' is quarantined/);
  });

  it('refuses to resolve an unpack', () => {
    const document = documentOf([unpackNode('split')], []);
    expect(() => resolveGraph(document, [])).toThrow(/'split' is quarantined/);
  });

  it('evaluateDocument refuses the same way, since it resolves first', () => {
    const document = documentOf([waypointNode('via')], []);
    expect(() => evaluateDocument(document, [])).toThrow(/quarantined/);
  });
});
