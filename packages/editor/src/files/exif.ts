/**
 * What a photograph knows about how it was taken.
 *
 * The field list is fixed: this reader always answers with the same eleven
 * ports, and a tag the file did not record answers `null` rather than
 * dropping the port. That keeps a file node's shape stable — the same wires
 * still land after re-reading a different frame — and it is the honest
 * report, since "this body does not write that tag" is a fact about the
 * photograph, not a reason to change the node.
 *
 * The list is also deliberately short, and that is the whole of the privacy
 * story: everything here is a quantity one of the photography catalogue's
 * formulas actually consumes, and a raw file carries far more — body and
 * lens serial numbers among them, in the ordinary EXIF block as much as in
 * the maker note. What keeps those out of a shared NodeBook is this list,
 * which names the tags it wants and reads nothing else. GPS is the one thing
 * held out structurally too: `bmff.ts` never walks that block at all.
 *
 * Two things a photograph cannot tell us, both worth knowing about:
 *
 * - **Sensor size is derived, not recorded.** `w` and `h` come from the
 *   focal-plane resolution against the pixel dimensions, which is what
 *   exiftool's crop-factor calculation does. It is close but not exact —
 *   the pixel count includes masked photosites on some bodies. The camera
 *   library node answers the same question from published figures, so the
 *   two are worth comparing when it matters.
 * - **Focus distance is a bracket, reported as its middle.** Standard EXIF
 *   `SubjectDistance` is not written by these bodies at all; Canon records
 *   the interval its focus encoder believes the subject sits in, and `s` is
 *   the midpoint of that interval. It is the one field read out of the maker
 *   note, and it is the same number ExifTool averages for its own
 *   depth-of-field figure. A frame focused past what the encoder can report
 *   answers with nothing rather than a saturated number; wire an input node
 *   for `s` when a reading matters more than convenience.
 */

import { DIMENSIONLESS_UNIT, parseUnit } from '@joveworks/units';

import { canonMetadataBlocks, isCr3 } from './bmff';
import { numberAt, packedAt, readTiffBlock, textAt, type TiffValue } from './tiff';
import type { ReadField } from './readers';

/** Image IFD (`CMT1`). */
const MODEL = 0x0110;

/**
 * Canon maker note (`CMT3`). Two packed `SHORT` blocks carry the same focus
 * bracket at different offsets, and the file may fill in either — the
 * Upper/Lower naming is even swapped between them, which does not matter to
 * a midpoint. Nothing else in this block is read.
 */
const SHOT_INFO = 0x0004;
const SHOT_INFO_DISTANCES = [19, 20] as const;
const FILE_INFO = 0x0093;
const FILE_INFO_DISTANCES = [20, 21] as const;

/** The encoder's "I cannot say" — the ceiling of the 16-bit field it is written in. */
const NO_READING = 65535;

/** EXIF IFD (`CMT2`). */
const EXPOSURE_TIME = 0x829a;
const F_NUMBER = 0x829d;
const ISO_SPEED = 0x8827;
const FOCAL_LENGTH = 0x920a;
const PIXEL_X = 0xa002;
const PIXEL_Y = 0xa003;
const FOCAL_PLANE_X_RESOLUTION = 0xa20e;
const FOCAL_PLANE_Y_RESOLUTION = 0xa20f;
const FOCAL_PLANE_RESOLUTION_UNIT = 0xa210;
const LENS_MODEL = 0xa434;

const MM = parseUnit('mm');
const METRE = parseUnit('m');
const SECOND = parseUnit('s');

/** What each field means, on the node itself — see `FileReaderDefinition.descriptions`. */
export const EXIF_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  ['f', 'Focal length the frame was taken at.'],
  ['N', 'Aperture the frame was taken at, as an f-number.'],
  ['t', 'Exposure time.'],
  ['ISO', 'Sensitivity the frame was recorded at.'],
  [
    's',
    'Where the lens was focused — the middle of the bracket the camera records, which is as precise as its focus encoder gets. Empty when the subject was beyond what that encoder can report; wire an input node for s when the exact distance matters.',
  ],
  ['px', 'Horizontal pixel count of the recorded frame.'],
  ['py', 'Vertical pixel count of the recorded frame.'],
  [
    'w',
    'Sensor width. Derived from the focal-plane resolution rather than recorded outright, so it is close but not exact — the camera library answers the same question from published figures.',
  ],
  [
    'h',
    'Sensor height. Derived from the focal-plane resolution rather than recorded outright, so it is close but not exact.',
  ],
  ['camera', 'The name the body writes for itself. Wires into the camera library, which knows that name.'],
  ['lens', 'The name the body writes for the lens it was taken with. Wires into the lens library.'],
]);

/** Millimetres per unit of `FocalPlaneResolutionUnit`: inches unless told otherwise. */
function millimetresPer(code: number | undefined): number {
  if (code === 3) return 10; // centimetres
  if (code === 4) return 1; // millimetres
  return 25.4; // inches, and the default every Canon body writes
}

/** Sensor extent in mm from a pixel count over its focal-plane resolution. */
function sensorExtent(pixels: number | undefined, resolution: number | undefined, scale: number): number | null {
  if (pixels === undefined || resolution === undefined) return null;
  if (pixels <= 0 || resolution <= 0) return null;
  return (pixels / resolution) * scale;
}

function positive(value: number | undefined): number | null {
  return value === undefined || value <= 0 ? null : value;
}

/**
 * Where the lens was focused, in metres: the middle of the bracket Canon
 * records, in centimetres, in whichever of its two blocks carries it.
 *
 * Either bound reading as the field's ceiling means the subject was further
 * away than the encoder can express, and averaging a real bound with a
 * ceiling would answer with a confident number that is nothing of the kind —
 * so a bracket with a saturated end reports nothing at all.
 */
function focusDistance(makerNote: ReadonlyMap<number, readonly TiffValue[]>): number | null {
  for (const [tag, [first, second]] of [
    [SHOT_INFO, SHOT_INFO_DISTANCES],
    [FILE_INFO, FILE_INFO_DISTANCES],
  ] as const) {
    const near = packedAt(makerNote, tag, first);
    const far = packedAt(makerNote, tag, second);
    if (near === undefined || far === undefined) continue;
    if (near <= 0 || far <= 0 || near >= NO_READING || far >= NO_READING) continue;
    return (near + far) / 2 / 100;
  }
  return null;
}

/**
 * Reads one CR3. Throws when the bytes are not a Canon raw v3 at all — that
 * is worth saying out loud, unlike a missing tag, which is just a `null`.
 */
export function readExif(bytes: ArrayBuffer): readonly ReadField[] {
  const view = new DataView(bytes);
  if (!isCr3(view)) {
    throw new Error('this is not a Canon CR3 file');
  }
  const blocks = canonMetadataBlocks(view);
  const image = blockTags(view, blocks.get('CMT1'));
  const exif = blockTags(view, blocks.get('CMT2'));
  const makerNote = blockTags(view, blocks.get('CMT3'));
  if (image.size === 0 && exif.size === 0) {
    throw new Error('this CR3 carries no readable metadata');
  }

  const px = positive(numberAt(exif, PIXEL_X));
  const py = positive(numberAt(exif, PIXEL_Y));
  const scale = millimetresPer(numberAt(exif, FOCAL_PLANE_RESOLUTION_UNIT));

  return [
    { name: 'f', unit: MM, value: positive(numberAt(exif, FOCAL_LENGTH)) },
    { name: 'N', unit: DIMENSIONLESS_UNIT, value: positive(numberAt(exif, F_NUMBER)) },
    { name: 't', unit: SECOND, value: positive(numberAt(exif, EXPOSURE_TIME)) },
    { name: 'ISO', unit: DIMENSIONLESS_UNIT, value: positive(numberAt(exif, ISO_SPEED)) },
    { name: 's', unit: METRE, value: focusDistance(makerNote) },
    { name: 'px', unit: DIMENSIONLESS_UNIT, value: px },
    { name: 'py', unit: DIMENSIONLESS_UNIT, value: py },
    {
      name: 'w',
      unit: MM,
      value: sensorExtent(px ?? undefined, numberAt(exif, FOCAL_PLANE_X_RESOLUTION), scale),
    },
    {
      name: 'h',
      unit: MM,
      value: sensorExtent(py ?? undefined, numberAt(exif, FOCAL_PLANE_Y_RESOLUTION), scale),
    },
    { name: 'camera', value: textAt(image, MODEL) ?? null },
    { name: 'lens', value: textAt(exif, LENS_MODEL) ?? null },
  ];
}

function blockTags(
  view: DataView,
  block: { readonly start: number; readonly end: number } | undefined,
): ReadonlyMap<number, readonly TiffValue[]> {
  return block === undefined ? new Map() : readTiffBlock(view, block.start, block.end);
}
