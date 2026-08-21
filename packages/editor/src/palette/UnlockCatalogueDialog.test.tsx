import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UnlockCatalogueDialog } from './UnlockCatalogueDialog';

const locked = {
  schemaVersion: 1,
  id: 'demo-restricted',
  name: { en: 'Demo restricted set' },
  kdf: { algorithm: 'PBKDF2' as const, hash: 'SHA-256' as const, iterations: 1, salt: 'AA==' },
  cipher: { algorithm: 'AES-GCM' as const, iv: 'AA==' },
  ciphertext: 'AA==',
};

describe('UnlockCatalogueDialog', () => {
  it('lists every locked catalogue with its own password form', () => {
    const markup = renderToStaticMarkup(
      <UnlockCatalogueDialog locked={[locked]} locale="en" onUnlock={() => Promise.resolve()} onClose={() => undefined} />,
    );
    expect(markup).toContain('Demo restricted set');
    expect(markup).toContain('<input');
  });

  it('says so when nothing is left to unlock', () => {
    const markup = renderToStaticMarkup(
      <UnlockCatalogueDialog locked={[]} locale="en" onUnlock={() => Promise.resolve()} onClose={() => undefined} />,
    );
    expect(markup).toContain('No locked catalogues');
    expect(markup).not.toContain('<input');
  });
});
