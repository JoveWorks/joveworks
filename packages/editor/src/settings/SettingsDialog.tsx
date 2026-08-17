/**
 * App-wide preferences with no per-node home: how every number is written
 * and typed back (there is no per-node inspector to put it on, and no
 * per-port case for it the way there is for a display unit), and whether the
 * canvas minimap is drawn. A live preview is the point for the number
 * format: a student picking between "1.234,5" and "1,234.5" wants to see the
 * result, not guess from the label.
 */

import type { ReactElement } from 'react';

import { formatQuantity, parseUnit } from '@joveworks/units';

import {
  CONTOUR_PALETTES,
  type ContourPalette,
} from '../model/editorSettings';
import {
  NOTATION_LABELS,
  STYLE_LABELS,
  type NumberFormatSettings,
  type ThousandsStyle,
  toUnitsFormat,
} from '../model/numberFormat';
import type { NumberNotation } from '@joveworks/units';
import type { AppLocale } from '../model/editorSettings';
import { ui } from '../i18n';

interface Props {
  readonly locale: AppLocale;
  readonly onLocaleChange: (locale: AppLocale) => void;
  readonly settings: NumberFormatSettings;
  readonly onChange: (settings: NumberFormatSettings) => void;
  readonly minimapVisible: boolean;
  readonly onMinimapVisibleChange: (visible: boolean) => void;
  readonly titleMathRendering: boolean;
  readonly onTitleMathRenderingChange: (enabled: boolean) => void;
  readonly contourPalette: ContourPalette;
  readonly onContourPaletteChange: (palette: ContourPalette) => void;
  readonly onClose: () => void;
}

/** Values chosen to make every setting's effect visible at once. */
const SAMPLE = 1234567.891;
const SAMPLE_SMALL = 0.0004821;
/** Canonical stress: 250 in mm-N-s means 250 N/mm² = 2.5e8 Pa = 250 MPa. */
const SAMPLE_STRESS = 250;

export function SettingsDialog({
  locale,
  onLocaleChange,
  settings,
  onChange,
  minimapVisible,
  onMinimapVisibleChange,
  titleMathRendering,
  onTitleMathRenderingChange,
  contourPalette,
  onContourPaletteChange,
  onClose,
}: Props): ReactElement {
  const copy = ui(locale);
  const format = toUnitsFormat(settings);
  const unit = parseUnit('mm');
  const pa = parseUnit('Pa');

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Settings">
        <h2>Settings</h2>

        <label className="dialog-field">
          {copy.language}
          <select className="nodrag" value={locale} onChange={(event) => onLocaleChange(event.target.value as AppLocale)}>
            <option value="en">{copy.english}</option>
            <option value="nl">{copy.dutch}</option>
          </select>
        </label>

        <label className="dialog-field">
          thousands / decimal
          <select
            className="nodrag"
            value={settings.style}
            onChange={(event) =>
              onChange({ ...settings, style: event.target.value as ThousandsStyle })
            }
          >
            {(Object.entries(STYLE_LABELS) as [ThousandsStyle, string][]).map(([style, label]) => (
              <option key={style} value={style}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="dialog-field">
          notation
          <select
            className="nodrag"
            value={settings.notation}
            onChange={(event) =>
              onChange({ ...settings, notation: event.target.value as NumberNotation })
            }
          >
            {(Object.entries(NOTATION_LABELS) as [NumberNotation, string][]).map(
              ([notation, label]) => (
                <option key={notation} value={notation}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>

        <div className="dialog-preview">
          <span>{formatQuantity(SAMPLE, unit, 6, format)}</span>
          <span>{formatQuantity(SAMPLE_SMALL, unit, 4, format)}</span>
          {settings.notation === 'engineering' || settings.notation === 'si' ? (
            <span>{formatQuantity(SAMPLE_STRESS, pa, 4, format)}</span>
          ) : null}
        </div>

        <p className="dialog-note">
          Applies to every value shown or typed in the app. A per-print-node
          "figures" count still overrides how many significant figures a
          result shows.
        </p>

        <label className="dialog-field dialog-checkbox">
          <input
            type="checkbox"
            checked={minimapVisible}
            onChange={(event) => onMinimapVisibleChange(event.target.checked)}
          />
          show the canvas minimap
        </label>

        <label className="dialog-field dialog-checkbox">
          <input
            type="checkbox"
            checked={titleMathRendering}
            onChange={(event) => onTitleMathRenderingChange(event.target.checked)}
          />
          typeset mathematical notation in titles and notebook text
        </label>

        <label className="dialog-field">
          contour colour palette
          <select
            className="nodrag"
            value={contourPalette}
            onChange={(event) => onContourPaletteChange(event.target.value as ContourPalette)}
          >
            {(Object.entries(CONTOUR_PALETTES) as [ContourPalette, string][]).map(([palette, label]) => (
              <option key={palette} value={palette}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </div>
    </>
  );
}
