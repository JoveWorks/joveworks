// @vitest-environment jsdom

/**
 * `saveTextFile` hands the browser a Blob to download. The only thing this
 * module decides on our behalf is the MIME type that goes on that Blob, so
 * that is the only thing worth asserting here: JSON stays the default for
 * any caller that does not say otherwise, and a caller that does pass a
 * type (the catalogue-author YAML export) gets exactly that type, not
 * `application/json` regardless of what is inside the file.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { saveTextFile } from './files';

// jsdom does not implement `URL.createObjectURL`/`revokeObjectURL` at all
// (not even as an unimplemented stub), so there is no existing property for
// `vi.spyOn` to wrap — the calls are stubbed directly and put back after.
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe('saveTextFile', () => {
  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  function captureBlobType(): { type: string | undefined } {
    const captured: { type: string | undefined } = { type: undefined };
    URL.createObjectURL = ((blob: Blob) => {
      captured.type = blob.type;
      return 'blob:mock';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    return captured;
  }

  it('defaults to application/json when no MIME type is given', () => {
    const captured = captureBlobType();

    saveTextFile('invented.json', '{}');

    expect(captured.type).toBe('application/json');
  });

  it('uses the MIME type passed by the caller, e.g. for a YAML export', () => {
    const captured = captureBlobType();

    saveTextFile('invented.yaml', 'id: invented\n', 'application/yaml');

    expect(captured.type).toBe('application/yaml');
  });
});
