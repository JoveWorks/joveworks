import { describe, expect, it } from 'vitest';

import { primaryModifierLabel } from './platform';

describe('primaryModifierLabel', () => {
  it('uses Command on Apple platforms', () => {
    expect(primaryModifierLabel('MacIntel')).toBe('⌘');
    expect(primaryModifierLabel('iPad')).toBe('⌘');
  });

  it('uses Ctrl on Windows and Linux', () => {
    expect(primaryModifierLabel('Win32')).toBe('Ctrl');
    expect(primaryModifierLabel('Linux x86_64')).toBe('Ctrl');
  });
});
