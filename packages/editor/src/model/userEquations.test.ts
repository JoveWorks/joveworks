import { describe, expect, it } from 'vitest';

import { equationId, parseUserEquations, saveUserEquations } from './userEquations';

describe('user equation libraries', () => {
  it('round trips student-owned expressions', () => {
    const equations = [{ id: 'load', label: 'Load', expression: 'a*b + c' }];
    const saved = saveUserEquations(equations);
    expect(JSON.parse(saved)).toMatchObject({ schemaVersion: 1, kind: 'joveworks-user-equations' });
    expect(parseUserEquations(saved)).toEqual(equations);
  });

  it('rejects invalid expressions on import', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      kind: 'joveworks-user-equations',
      equations: [{ id: 'bad', label: 'Bad', expression: 'a +' }],
    });
    expect(() => parseUserEquations(text)).toThrow('expected a value');
  });

  it('creates stable, collision-free local ids', () => {
    expect(equationId('Bearing load!', [{ id: 'bearing-load', label: 'Old', expression: 'a' }])).toBe(
      'bearing-load-2',
    );
  });
});
