/**
 * Reading and writing files, behind an adapter.
 *
 * The app is a static page with no backend, so a "file" is whatever the
 * browser will give us: a picked file in, a download out. Both sit behind these
 * two functions so a Tauri build can replace them with real filesystem calls
 * without touching a single call site — which is the whole reason for an
 * adapter rather than for `input[type=file]` scattered through the UI.
 *
 * The File System Access API is a progressive enhancement and is not used
 * here: it would add a second code path for save-in-place before there is
 * anything to save in place.
 */

export interface PickedFile {
  readonly name: string;
  readonly text: string;
}

export const userEquationsFileName = 'joveworks-equations.json';

export function documentFileName(id: string): string {
  return `${id}.jove.json`;
}

/** Ask for a file and read it as text. Resolves `undefined` if nothing is picked. */
export function openTextFile(accept = 'application/json,.json'): Promise<PickedFile | undefined> {
  return new Promise((resolve) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = accept;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (file === undefined) {
        resolve(undefined);
        return;
      }
      void file.text().then((text) => resolve({ name: file.name, text }));
    });
    // Cancelling a file dialog fires nothing in some browsers, so the promise is
    // left pending rather than resolved wrongly; the picker is discarded either
    // way and nothing downstream waits on it.
    picker.click();
  });
}

/**
 * A picked file: what a file node records about where its values came from,
 * and a way to get at the bytes.
 *
 * The bytes are behind a call rather than already read, so a sweep over ten
 * raw frames holds one frame in memory at a time. They are wanted only long
 * enough to read a few dozen tags out of them, and nothing keeps them
 * afterwards — the document stores the values, never the file.
 */
export interface PickedBinaryFile {
  readonly name: string;
  readonly size: number;
  readonly modified: number;
  /** `limit` reads only the first that many bytes — see `FileReaderDefinition.prefixBytes`. */
  readonly bytes: (limit?: number) => Promise<ArrayBuffer>;
}

/** Ask for one or more files. Resolves an empty list if nothing is picked. */
export function openBinaryFiles(accept: string): Promise<readonly PickedBinaryFile[]> {
  return new Promise((resolve) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = accept;
    picker.multiple = true;
    picker.addEventListener('change', () => {
      resolve(
        [...(picker.files ?? [])].map((file) => ({
          name: file.name,
          size: file.size,
          modified: file.lastModified,
          bytes: (limit?: number) =>
            limit === undefined || limit >= file.size
              ? file.arrayBuffer()
              : file.slice(0, limit).arrayBuffer(),
        })),
      );
    });
    // Same as `openTextFile`: a cancelled dialog fires nothing in some
    // browsers, so the promise is left pending rather than resolved wrongly.
    picker.click();
  });
}

/** Hand the text back as a download — the export half of file I/O. */
export function saveTextFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
