import { describe, expect, it } from 'vitest';

import { documentFileName, userEquationsFileName } from './files';

describe('JoveWorks file names', () => {
  it('uses the JoveWorks suffix for NodeBooks', () => {
    expect(documentFileName('belt-drive')).toBe('belt-drive.jove.json');
  });

  it('uses the JoveWorks equation-library name', () => {
    expect(userEquationsFileName).toBe('joveworks-equations.json');
  });
});
