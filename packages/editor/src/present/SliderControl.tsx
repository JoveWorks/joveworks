import type { ReactElement, SyntheticEvent } from 'react';

import { formatPlainNumber, type NumberFormat, type Unit } from '@joveworks/units';

import { NumberField } from '../canvas/fields';
import { roundToDecimalFigures } from '../canvas/ValueEditor';
import { TitleText } from '../canvas/TitleField';

export interface SliderReading {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit: Unit;
  readonly figures: number;
}

interface SliderControlProps {
  readonly slider: SliderReading;
  readonly format: NumberFormat;
  readonly onLiveChange: (value: number) => void;
  readonly onCommit: () => void;
  readonly onExactChange: (value: number) => void;
  /**
   * A first touch on a published NodeBook's control, before there is anything
   * to drive: the viewer loads its calculation on demand and swallows this
   * gesture rather than moving a handle that would snap back.
   */
  readonly onInteract?: (event: SyntheticEvent) => void;
}

/**
 * One of potentially several synchronized views over an authored slider
 * input — on the canvas, in the NodeBook, and on a published NodeBook, which
 * has no node behind it and passes the same readings straight through.
 */
export function SliderControl({
  slider,
  format,
  onLiveChange,
  onCommit,
  onExactChange,
  onInteract,
}: SliderControlProps): ReactElement {
  const { label, value, min, max, unit, figures } = slider;
  const shown = `${formatPlainNumber(value, format)}${unit.symbol.length === 0 ? '' : ` ${unit.symbol}`}`;

  return (
    <label className="notebook-control">
      <span className="notebook-control-label"><TitleText value={label} /></span>
      <span className="notebook-control-reading">
        <NumberField
          value={value}
          autoSize={1}
          format={format}
          title="Type an exact value."
          onCommit={onExactChange}
        />
        {unit.symbol.length === 0 ? null : <span className="unit">{unit.symbol}</span>}
      </span>
      <input
        type="range"
        className="slider-track notebook-control-track"
        min={min}
        max={max}
        step="any"
        value={Math.min(Math.max(value, min), max)}
        aria-label={`${label}${unit.symbol.length === 0 ? '' : ` (${unit.symbol})`}`}
        aria-valuetext={shown}
        {...(onInteract === undefined ? {} : { onPointerDown: onInteract, onKeyDown: onInteract })}
        onChange={(event) => onLiveChange(roundToDecimalFigures(Number(event.target.value), figures))}
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      <span className="notebook-control-print">{shown}</span>
    </label>
  );
}
