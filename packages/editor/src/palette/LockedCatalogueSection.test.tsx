import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LockedCatalogueSection } from './LockedCatalogueSection';

const locked = {
  schemaVersion: 1,
  id: 'demo-restricted',
  name: { en: 'Demo restricted set' },
  kdf: { algorithm: 'PBKDF2' as const, hash: 'SHA-256' as const, iterations: 1, salt: 'AA==' },
  cipher: { algorithm: 'AES-GCM' as const, iv: 'AA==' },
  ciphertext: 'AA==',
};

describe('LockedCatalogueSection', () => {
  it('names the catalogue and marks it locked without exposing its content', () => {
    const markup = renderToStaticMarkup(
      <LockedCatalogueSection locked={locked} locale="en" onUnlock={() => Promise.resolve()} />,
    );
    expect(markup).toContain('Demo restricted set');
    expect(markup).toContain('locked');
    expect(markup).not.toContain('<input');
  });
});
