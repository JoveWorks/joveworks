import { describe, expect, it } from 'vitest';

import { EXIF_DESCRIPTIONS, readExif } from './exif';
import type { ReadField } from './readers';

/**
 * A CR3 built byte by byte, rather than a real photograph checked into the
 * repository: a raw frame is tens of megabytes, and a fixture whose every
 * tag is written on purpose here is the one that can say what happens when
 * a tag is *missing*.
 */

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  for (let i = 0; i < 4; i += 1) bytes[4 + i] = type.charCodeAt(i);
  bytes.set(payload, 8);
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

interface Entry {
  readonly tag: number;
  readonly type: number;
  /** Out-of-line payload, or the inline value written straight into the entry. */
  readonly data: Uint8Array;
  readonly count: number;
}

const short = (tag: number, value: number): Entry => {
  const data = new Uint8Array(2);
  new DataView(data.buffer).setUint16(0, value, true);
  return { tag, type: 3, data, count: 1 };
};

const long = (tag: number, value: number): Entry => {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value, true);
  return { tag, type: 4, data, count: 1 };
};

const rational = (tag: number, numerator: number, denominator: number): Entry => {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setUint32(0, numerator, true);
  view.setUint32(4, denominator, true);
  return { tag, type: 5, data, count: 1 };
};

const ascii = (tag: number, text: string): Entry => {
  const data = new Uint8Array(text.length + 1);
  for (let i = 0; i < text.length; i += 1) data[i] = text.charCodeAt(i);
  return { tag, type: 2, data, count: text.length + 1 };
};

/** A complete little-endian TIFF block: header, one IFD, and its out-of-line data. */
function tiffBlock(entries: readonly Entry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const directory = 2 + sorted.length * 12 + 4;
  const inlineOnly = sorted.filter((entry) => entry.data.length > 4);
  const size = 8 + directory + inlineOnly.reduce((total, entry) => total + entry.data.length, 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, sorted.length, true);

  let data = 8 + directory;
  sorted.forEach((entry, i) => {
    const at = 8 + 2 + i * 12;
    view.setUint16(at, entry.tag, true);
    view.setUint16(at + 2, entry.type, true);
    view.setUint32(at + 4, entry.count, true);
    if (entry.data.length <= 4) {
      bytes.set(entry.data, at + 8);
    } else {
      view.setUint32(at + 8, data, true);
      bytes.set(entry.data, data);
      data += entry.data.length;
    }
  });
  return bytes;
}

const CANON_UUID = new Uint8Array([
  0x85, 0xc0, 0xb6, 0x87, 0x82, 0x0f, 0x11, 0xe0, 0x81, 0x11, 0xf4, 0xce, 0x46, 0x2b, 0x6a, 0x48,
]);

/** `ftyp` + `moov` → Canon `uuid` → the CMT blocks, then a stand-in for the frame. */
function cr3(blocks: Readonly<Record<string, readonly Entry[]>>): ArrayBuffer {
  const inner = Object.entries(blocks).map(([name, entries]) => box(name, tiffBlock(entries)));
  const canon = box('uuid', concat([CANON_UUID, ...inner]));
  const bytes = concat([
    box('ftyp', new Uint8Array([...'crx '].map((char) => char.charCodeAt(0)))),
    box('moov', canon),
    box('mdat', new Uint8Array(16)),
  ]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const MODEL = 0x0110;
const EXPOSURE_TIME = 0x829a;
const F_NUMBER = 0x829d;
const ISO_SPEED = 0x8827;
const FOCAL_LENGTH = 0x920a;
const PIXEL_X = 0xa002;
const PIXEL_Y = 0xa003;
const FOCAL_PLANE_X = 0xa20e;
const FOCAL_PLANE_Y = 0xa20f;
const FOCAL_PLANE_UNIT = 0xa210;
const LENS_MODEL = 0xa434;
const GPS_LATITUDE = 0x0002;
const CANON_SERIAL = 0x000c;

const frame = cr3({
  CMT1: [ascii(MODEL, 'Canon EOS R6m3')],
  CMT2: [
    rational(EXPOSURE_TIME, 1, 250),
    rational(F_NUMBER, 28, 10),
    short(ISO_SPEED, 400),
    rational(FOCAL_LENGTH, 50, 1),
    long(PIXEL_X, 6960),
    long(PIXEL_Y, 4640),
    rational(FOCAL_PLANE_X, 4924, 1),
    rational(FOCAL_PLANE_Y, 4924, 1),
    short(FOCAL_PLANE_UNIT, 2),
    ascii(LENS_MODEL, 'RF24-105mm F4 L IS USM'),
  ],
  CMT3: [long(CANON_SERIAL, 123_456_789)],
  CMT4: [rational(GPS_LATITUDE, 5087, 100)],
});

const valueOf = (fields: readonly ReadField[], name: string): number | string | null =>
  fields.find((field) => field.name === name)?.value ?? null;

describe('reading a photograph', () => {
  it('reads the settings a photograph was taken at', () => {
    const fields = readExif(frame);
    expect(valueOf(fields, 'f')).toBe(50);
    expect(valueOf(fields, 'N')).toBeCloseTo(2.8, 10);
    expect(valueOf(fields, 't')).toBeCloseTo(1 / 250, 10);
    expect(valueOf(fields, 'ISO')).toBe(400);
    expect(valueOf(fields, 'px')).toBe(6960);
    expect(valueOf(fields, 'py')).toBe(4640);
  });

  it('reads the names the body gives itself and its lens', () => {
    const fields = readExif(frame);
    expect(valueOf(fields, 'camera')).toBe('Canon EOS R6m3');
    expect(valueOf(fields, 'lens')).toBe('RF24-105mm F4 L IS USM');
  });

  it('derives the sensor size, which no tag records directly', () => {
    const fields = readExif(frame);
    // 6960 px over 4924 per inch is a hair under 36 mm across.
    expect(valueOf(fields, 'w')).toBeCloseTo(35.9, 1);
    expect(valueOf(fields, 'h')).toBeCloseTo(23.9, 1);
  });

  it('carries a unit on every quantity, and none on a name', () => {
    const fields = readExif(frame);
    const unitOf = (name: string): string | undefined =>
      fields.find((field) => field.name === name)?.unit?.symbol;
    expect(unitOf('f')).toBe('mm');
    expect(unitOf('t')).toBe('s');
    expect(unitOf('N')).toBe('');
    expect(unitOf('camera')).toBeUndefined();
  });

  it('answers the same ten fields whatever the file left out', () => {
    const bare = cr3({ CMT1: [ascii(MODEL, 'Canon EOS R6m3')], CMT2: [rational(FOCAL_LENGTH, 85, 1)] });
    const fields = readExif(bare);
    expect(fields.map((field) => field.name)).toEqual([
      'f', 'N', 't', 'ISO', 'px', 'py', 'w', 'h', 'camera', 'lens',
    ]);
    expect(valueOf(fields, 'f')).toBe(85);
    // Nothing to derive a sensor size from, and no lens name recorded.
    expect(valueOf(fields, 'w')).toBeNull();
    expect(valueOf(fields, 'lens')).toBeNull();
  });

  it('never reads the maker note or the GPS block, which the fixture both carries', () => {
    // The privacy claim, as a test rather than a comment: this frame holds a
    // body serial number and a latitude, and neither can reach a document.
    const fields = readExif(frame);
    expect(fields.map((field) => field.value)).not.toContain(123_456_789);
    expect(fields.map((field) => field.value)).not.toContain(50.87);
  });

  it('describes every field it answers with, so no port hovers blank', () => {
    for (const field of readExif(frame)) {
      expect(EXIF_DESCRIPTIONS.get(field.name)).toBeTruthy();
    }
  });

  it('says so when the bytes are not a Canon raw at all', () => {
    const notCr3 = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => readExif(notCr3.buffer as ArrayBuffer)).toThrow(/not a Canon CR3/u);
  });

  it('says so when a CR3 carries no metadata box', () => {
    const empty = cr3({});
    expect(() => readExif(empty)).toThrow(/no readable metadata/u);
  });
});
