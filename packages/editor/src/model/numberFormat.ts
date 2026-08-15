/**
 * How a value looks on screen and how it is typed back in — a global
 * preference, not a per-node one. `figures` (significant figures) already had
 * a home per print node (S60's `output.figures`); this only gives the
 * grouping/decimal punctuation and the notation a home, since nothing in the
 * document owns those today.
 *
 * Persisted the same way a cached catalogue is (`io/catalogueCache.ts`):
 * `localStorage`, wrapped in try/catch so private browsing or a full quota
 * degrades to the default rather than failing the app.
 */

import { PLAIN_NUMBER_FORMAT, type NumberFormat, type NumberNotation } from '@mds/units';

/**
 * Thousands grouping and the decimal point move together, as one style — a
 * student picks "how Belgium writes it" or "how the US writes it", not two
 * independent characters that could collide (`,` cannot be both).
 */
export type ThousandsStyle = 'plain' | 'comma-thousands' | 'dot-thousands' | 'space-thousands';

export interface NumberFormatSettings {
  readonly style: ThousandsStyle;
  readonly notation: NumberNotation;
}

export const DEFAULT_NUMBER_FORMAT_SETTINGS: NumberFormatSettings = {
  style: 'plain',
  notation: 'auto',
};

export const STYLE_LABELS: Readonly<Record<ThousandsStyle, string>> = {
  plain: '1234.5 (none)',
  'comma-thousands': '1,234.5',
  'dot-thousands': '1.234,5',
  'space-thousands': '1 234.5',
};

export const NOTATION_LABELS: Readonly<Record<NumberNotation, string>> = {
  auto: 'automatic',
  fixed: 'fixed',
  scientific: 'scientific (1.23e+4)',
  engineering: 'engineering (12.3e+3)',
  si: 'SI prefixes (12.3 kPa)',
};

const STYLE_PUNCTUATION: Readonly<Record<ThousandsStyle, Pick<NumberFormat, 'thousands' | 'decimal'>>> =
  {
    plain: { thousands: '', decimal: '.' },
    'comma-thousands': { thousands: ',', decimal: '.' },
    'dot-thousands': { thousands: '.', decimal: ',' },
    'space-thousands': { thousands: ' ', decimal: '.' },
  };

export function toUnitsFormat(settings: NumberFormatSettings): NumberFormat {
  return { notation: settings.notation, ...STYLE_PUNCTUATION[settings.style] };
}

const KEY = 'mds:settings:numberFormat';

function isThousandsStyle(value: unknown): value is ThousandsStyle {
  return typeof value === 'string' && value in STYLE_PUNCTUATION;
}

function isNotation(value: unknown): value is NumberNotation {
  return (
    value === 'auto' ||
    value === 'fixed' ||
    value === 'scientific' ||
    value === 'engineering' ||
    value === 'si'
  );
}

/** Falls back to the default on anything unexpected — a stale or hand-edited entry is not a crash. */
export function loadNumberFormatSettings(): NumberFormatSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_NUMBER_FORMAT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_NUMBER_FORMAT_SETTINGS;
    const { style, notation } = parsed as Partial<NumberFormatSettings>;
    return {
      style: isThousandsStyle(style) ? style : DEFAULT_NUMBER_FORMAT_SETTINGS.style,
      notation: isNotation(notation) ? notation : DEFAULT_NUMBER_FORMAT_SETTINGS.notation,
    };
  } catch {
    return DEFAULT_NUMBER_FORMAT_SETTINGS;
  }
}

export function saveNumberFormatSettings(settings: NumberFormatSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Same convenience-not-requirement stance as catalogueCache.ts.
  }
}

export { PLAIN_NUMBER_FORMAT };
