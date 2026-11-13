/**
 * Load and Distributed load nodes: one load per node, on one typed wire.
 *
 * Numbers are invented; nothing here is textbook content.
 */

import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@joveworks/schema';

import { evaluateDocument, valueAt } from './evaluate.js';
import { resolveGraph } from './graph.js';
import {
  CATALOGUE,
  compareNode,
  documentOf,
  formulaNode,
  input,
  list,
  outputNode,
  rangeNode,
  refTo,
  scalar,
  waypointNode,
  wire,
} from './invented.fixtures.js';
import type { LoadValue, PortValue } from './series.js';

const quantity = (value: number, unit: string): JsonObject => ({ value, unit });

const loadNode = (id: string, fields: JsonObject): JsonObject => ({
  kind: 'load',
  id,
  position: { x: 0, y: 0 },
  at: quantity(0, 'mm'),
  ...fields,
});

const spanNode = (id: string, fields: JsonObject): JsonObject => ({
  kind: 'distributedLoad',
  id,
  position: { x: 0, y: 0 },
  from: quantity(0, 'mm'),
  to: quantity(10, 'mm'),
  ...fields,
});

function load(value: PortValue | undefined): LoadValue {
  if (value?.kind !== 'load') throw new Error(`expected a load, got ${value?.kind}`);
  return value;
}

describe('load nodes', () => {
  it('evaluate to a load value in canonical units, a field left out reading zero', () => {
    const document = documentOf(
      [
        loadNode('gear', {
          at: quantity(0.06, 'm'),
          Fx: quantity(-1.5, 'kN'),
          torque: quantity(30, 'Nm'),
          Cy: quantity(250, 'Nmm'),
        }),
      ],
      [],
    );
    const gear = load(valueAt(evaluateDocument(document, []), 'gear', 'load'));
    if (gear.shape !== 'point') throw new Error('expected a point load');
    expect(gear.at.data[0]).toBeCloseTo(60, 9);
    expect(gear.Fx.data).toEqual([-1500]);
    expect(gear.Fy.data).toEqual([0]);
    expect(gear.torque.data).toEqual([30_000]);
    expect(gear.Cx.data).toEqual([0]);
    expect(gear.Cy.data).toEqual([250]);
  });

  it('take a wired field over the typed one', () => {
    const document = documentOf(
      [input('F', scalar(-700, 'N')), loadNode('gear', { Fx: quantity(5, 'N') })],
      [wire('F.value', 'gear.Fx')],
    );
    const gear = load(valueAt(evaluateDocument(document, []), 'gear', 'load'));
    expect(gear.shape === 'point' ? gear.Fx.data : undefined).toEqual([-700]);
  });

  it('broadcast a range wired into the position: one load at each point of the sweep', () => {
    const document = documentOf(
      [rangeNode('z', 'linear', 0, 100, 5, 'mm'), loadNode('moving', { Fy: quantity(-10, 'N') })],
      [wire('z.value', 'moving.at')],
    );
    const moving = load(valueAt(evaluateDocument(document, []), 'moving', 'load'));
    if (moving.shape !== 'point') throw new Error('expected a point load');
    expect(moving.at.axes.map((axis) => axis.id)).toEqual(['z']);
    expect(moving.at.data).toEqual([0, 25, 50, 75, 100]);
    expect(moving.Fy.axes).toEqual([]);
  });

  it('carry a span as its ends and its rate per plane', () => {
    const document = documentOf([spanNode('weight', { qy: quantity(-2, 'kN/m') })], []);
    const weight = load(valueAt(evaluateDocument(document, []), 'weight', 'load'));
    if (weight.shape !== 'span') throw new Error('expected a span');
    expect([weight.from.data, weight.to.data, weight.qx.data, weight.qy.data]).toEqual([[0], [10], [0], [-2]]);
  });

  it("refuse a span whose end lies before its start, even when only a wire makes it so", () => {
    const document = documentOf(
      [input('ends', list([5, 20], 'mm')), spanNode('weight', { from: quantity(8, 'mm') })],
      [wire('ends.value', 'weight.to')],
    );
    expect(() => evaluateDocument(document, [])).toThrow(/weight\.to: 'to' lies before 'from'/u);
  });

  it('refuse a wire of the wrong kind of quantity into a field', () => {
    const document = documentOf(
      [input('length', scalar(3, 'mm')), loadNode('gear', {})],
      [wire('length.value', 'gear.Fx')],
    );
    expect(() => resolveGraph(document, [])).toThrow(/gear\.Fx/u);
  });

  it("refuse a load wired into a formula's numeric port", () => {
    const document = documentOf(
      [loadNode('gear', {}), formulaNode('sum', refTo('addTwo'))],
      [wire('gear.load', 'sum.a')],
    );
    expect(() => resolveGraph(document, [CATALOGUE])).toThrow(/carries a load, but the port it lands on takes a number/u);
  });

  it('refuse a load wired into a node that takes anything, such as an output or a compare', () => {
    const intoOutput = documentOf(
      [loadNode('gear', {}), outputNode('show', { kind: 'print' })],
      [wire('gear.load', 'show.value')],
    );
    expect(() => resolveGraph(intoOutput, [])).toThrow(/show\.value: this wire carries a load/u);

    const intoCompare = documentOf(
      [loadNode('gear', {}), compareNode('ok', '>=', quantity(0, 'N'))],
      [wire('gear.load', 'ok.value')],
    );
    expect(() => resolveGraph(intoCompare, [])).toThrow(/ok\.value: this wire carries a load/u);
  });

  it('pass through a waypoint, and are still refused where they land', () => {
    const routed = documentOf(
      [loadNode('gear', { Fy: quantity(3, 'N') }), waypointNode('via')],
      [wire('gear.load', 'via.in0')],
    );
    expect(load(valueAt(evaluateDocument(routed, []), 'via', 'out0')).shape).toBe('point');

    const document = documentOf(
      [loadNode('gear', {}), waypointNode('via'), outputNode('show', { kind: 'print' })],
      [wire('gear.load', 'via.in0'), wire('via.out0', 'show.value')],
    );
    expect(() => resolveGraph(document, [])).toThrow(/show\.value: this wire carries a load/u);
  });
});
