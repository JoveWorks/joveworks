import { describe, expect, it } from 'vitest';

import { basePortName, slotHandleId } from './spectrumSlots';

describe('spectrum slot handle ids', () => {
  it('round-trips a slot id back to the bare port name', () => {
    expect(basePortName(slotHandleId('a', 0))).toBe('a');
    expect(basePortName(slotHandleId('a', 3))).toBe('a');
    expect(basePortName(slotHandleId('a', 'open'))).toBe('a');
  });

  it('gives every slot of one port a distinct id, so React Flow does not collide them', () => {
    const ids = [slotHandleId('a', 0), slotHandleId('a', 1), slotHandleId('a', 'open')];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves an id with no slot separator unchanged', () => {
    expect(basePortName('a')).toBe('a');
  });
});
