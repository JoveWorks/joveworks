/**
 * Just enough ISO base media file format to find Canon's metadata.
 *
 * A CR3 is not a TIFF the way a CR2 was — it is the same box container an
 * MP4 uses, with the raw frame in `mdat` and everything describing it in
 * `moov`. Canon puts the EXIF inside a `uuid` box in `moov`, as four
 * self-contained TIFF blocks named `CMT1`..`CMT4`.
 *
 * Only the structure needed to reach those blocks is implemented, and
 * deliberately only two of them: `CMT1` (the image IFD) and `CMT2` (the
 * EXIF IFD). `CMT3` is the Canon maker note and `CMT4` is GPS — this walker
 * never descends into either, which is what keeps a shared NodeBook free of
 * a body's serial number and the coordinates a frame was taken at.
 */

/** One box's payload — `type` is its four-character name. */
export interface Box {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

const HEADER = 8;

/**
 * The boxes directly inside `[start, end)`, in file order.
 *
 * A box that runs past its parent, or claims a size smaller than its own
 * header, ends the walk: the alternative is looping forever on a truncated
 * download.
 */
export function boxes(view: DataView, start: number, end: number): readonly Box[] {
  const found: Box[] = [];
  let at = start;
  while (at + HEADER <= end) {
    const declared = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7),
    );
    let payload = at + HEADER;
    let size = declared;
    if (declared === 1) {
      // A 64-bit size follows the type. Sizes beyond 2^53 cannot be a file
      // anyone has, so the high word only has to not be silently truncated.
      if (payload + 8 > end) break;
      const high = view.getUint32(payload);
      const low = view.getUint32(payload + 4);
      size = high * 2 ** 32 + low;
      payload += 8;
    } else if (declared === 0) {
      size = end - at;
    }
    const finish = at + size;
    if (size < payload - at || finish > end) break;
    found.push({ type, start: payload, end: finish });
    at = finish;
  }
  return found;
}

/** The Canon metadata box: `85c0b687-820f-11e0-8111-f4ce462b6a48`. */
const CANON_UUID = [
  0x85, 0xc0, 0xb6, 0x87, 0x82, 0x0f, 0x11, 0xe0, 0x81, 0x11, 0xf4, 0xce, 0x46, 0x2b, 0x6a, 0x48,
];

function isCanonUuid(view: DataView, start: number): boolean {
  if (start + CANON_UUID.length > view.byteLength) return false;
  return CANON_UUID.every((byte, i) => view.getUint8(start + i) === byte);
}

/** Whether the file announces itself as a Canon raw v3 in its `ftyp` brand. */
export function isCr3(view: DataView): boolean {
  const top = boxes(view, 0, view.byteLength);
  const ftyp = top.find((box) => box.type === 'ftyp');
  if (ftyp === undefined || ftyp.start + 4 > ftyp.end) return false;
  const brand = String.fromCharCode(
    view.getUint8(ftyp.start),
    view.getUint8(ftyp.start + 1),
    view.getUint8(ftyp.start + 2),
    view.getUint8(ftyp.start + 3),
  );
  return brand === 'crx ';
}

/**
 * The `CMT1`/`CMT2` blocks, by name — `moov` → Canon's `uuid` → the CMT
 * boxes inside it. Absent when the file has no such box, which is every
 * file that is not a Canon raw.
 */
export function canonMetadataBlocks(view: DataView): ReadonlyMap<string, Box> {
  const blocks = new Map<string, Box>();
  const moov = boxes(view, 0, view.byteLength).find((box) => box.type === 'moov');
  if (moov === undefined) return blocks;
  for (const box of boxes(view, moov.start, moov.end)) {
    if (box.type !== 'uuid' || !isCanonUuid(view, box.start)) continue;
    for (const inner of boxes(view, box.start + CANON_UUID.length, box.end)) {
      if (inner.type === 'CMT1' || inner.type === 'CMT2') blocks.set(inner.type, inner);
    }
  }
  return blocks;
}
