import type { ReactElement } from 'react';

import { DEFAULT_SLIDER_FIGURES, type InputNode, type SliderValue } from '@joveworks/schema';
import type { NumberFormat } from '@joveworks/units';

import { SliderControl, type SliderReading } from '../present/SliderControl';

export type ExposedSliderNode = InputNode & { readonly value: SliderValue };

/** The readings a slider node offers a control — the whole of what one needs. */
export function sliderReading(node: ExposedSliderNode): SliderReading {
  return {
    label: node.label ?? node.id,
    value: node.value.value,
    min: node.value.min,
    max: node.value.max,
    unit: node.value.unit,
    figures: node.value.figures ?? DEFAULT_SLIDER_FIGURES,
  };
}

/** The editor's slider: a graph node, drawn by the shared control. */
export function NotebookSliderControl({
  node,
  format,
  onLiveChange,
  onCommit,
  onExactChange,
}: {
  readonly node: ExposedSliderNode;
  readonly format: NumberFormat;
  readonly onLiveChange: (value: number) => void;
  readonly onCommit: () => void;
  readonly onExactChange: (value: number) => void;
}): ReactElement {
  return (
    <SliderControl
      slider={sliderReading(node)}
      format={format}
      onLiveChange={onLiveChange}
      onCommit={onCommit}
      onExactChange={onExactChange}
    />
  );
}
