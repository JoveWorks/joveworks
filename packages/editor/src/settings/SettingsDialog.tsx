/**
 * How every number in the app is written and typed back — global (S46 has no
 * per-node inspector to put this on, and there is no per-port case for it the
 * way there is for a display unit). A live preview is the point: a student
 * picking between "1.234,5" and "1,234.5" wants to see the result, not guess
 * from the label.
 */

import type { ReactElement } from 'react';

import { formatQuantity, parseUnit } from '@mds/units';

import {
  NOTATION_LABELS,
  STYLE_LABELS,
  type NumberFormatSettings,
  type ThousandsStyle,
  toUnitsFormat,
} from '../model/numberFormat';
import type { NumberNotation } from '@mds/units';

interface Props {
  readonly settings: NumberFormatSettings;
  readonly onChange: (settings: NumberFormatSettings) => void;
  readonly onClose: () => void;
}

/** Values chosen to make every setting's effect visible at once. */
const SAMPLE = 1234567.891;
const SAMPLE_SMALL = 0.0004821;
/** Canonical stress: 250 in mm-N-s means 250 N/mm² = 2.5e8 Pa = 250 MPa. */
const SAMPLE_STRESS = 250;

export function SettingsDialog({ settings, onChange, onClose }: Props): ReactElement {
  const format = toUnitsFormat(settings);
  const unit = parseUnit('mm');
  const pa = parseUnit('Pa');

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Settings">
        <h2>Settings</h2>

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

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
