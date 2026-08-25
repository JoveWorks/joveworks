import type { ReactElement } from 'react';

import {
  DEFAULT_SLIDER_FIGURES,
  type InputNode,
  type SliderValue,
} from '@joveworks/schema';
import { formatPlainNumber, type NumberFormat } from '@joveworks/units';

import { NumberField } from '../canvas/fields';
import { roundToDecimalFigures } from '../canvas/ValueEditor';
import { TitleText } from '../canvas/TitleField';

export type ExposedSliderNode = InputNode & { readonly value: SliderValue };

interface NotebookSliderControlProps {
  readonly node: ExposedSliderNode;
  readonly format: NumberFormat;
  readonly onLiveChange: (value: number) => void;
  readonly onCommit: () => void;
  readonly onExactChange: (value: number) => void;
}

/** One of potentially several synchronized views over an authored slider input. */
export function NotebookSliderControl({
  node,
  format,
  onLiveChange,
  onCommit,
  onExactChange,
}: NotebookSliderControlProps): ReactElement {
  const { value } = node;
  const label = node.label ?? node.id;
  const shown = `${formatPlainNumber(value.value, format)}${value.unit.symbol.length === 0 ? '' : ` ${value.unit.symbol}`}`;

  return (
    <label className="notebook-control">
      <span className="notebook-control-label"><TitleText value={label} /></span>
      <span className="notebook-control-reading">
        <NumberField
          value={value.value}
          autoSize={1}
          format={format}
          title="Type an exact value."
          onCommit={onExactChange}
        />
        {value.unit.symbol.length === 0 ? null : <span className="unit">{value.unit.symbol}</span>}
      </span>
      <input
        type="range"
        className="slider-track notebook-control-track"
        min={value.min}
        max={value.max}
        step="any"
        value={Math.min(Math.max(value.value, value.min), value.max)}
        aria-label={`${label}${value.unit.symbol.length === 0 ? '' : ` (${value.unit.symbol})`}`}
        aria-valuetext={shown}
        onChange={(event) =>
          onLiveChange(
            roundToDecimalFigures(Number(event.target.value), value.figures ?? DEFAULT_SLIDER_FIGURES),
          )
        }
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      <span className="notebook-control-print">{shown}</span>
    </label>
  );
}
