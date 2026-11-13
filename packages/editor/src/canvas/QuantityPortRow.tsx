/**
 * One wireable field of a shaft-modelling node (Load, Distributed load,
 * Support, Shaft): a port, its unit, an optional sign arrow, and the typed
 * value beside it — `CompareNode.threshold`'s idiom, the wire winning
 * outright once one arrives.
 */

import type { ReactElement } from 'react';
import { Handle, Position } from '@xyflow/react';

import { dimensionsEqual, isDimensionless, type Unit } from '@joveworks/units';
import type { Edge, Quantity } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { formatAuthored, parseAuthored } from '../model/quantity';
import { reading, summarise } from '../model/values';
import { ParameterLabel } from '../ParameterLabel';
import { slotHandleId } from './portSlots';
import { TextField } from './fields';
import type { CanvasFlowNode } from './node-data';

export interface QuantityPortRowProps {
  readonly nodeId: string;
  readonly port: string;
  /** How the port is written: `F_x` typesets as F with a subscript x. */
  readonly symbol: string;
  readonly typed: Quantity | undefined;
  /** The field's reference unit — its dimension is what may be typed or wired. */
  readonly reference: Unit;
  readonly hint: string;
  readonly arrow?: string;
  /** Cannot be left empty; an optional field left empty reads zero. */
  readonly mandatory?: boolean;
  readonly data: CanvasFlowNode['data'] | undefined;
  readonly onCommit: (quantity: Quantity | undefined) => void;
}

/**
 * A bare number keeps the unit the field already shows; a typed unit must be
 * the field's kind of quantity. Anything else is left as it was — the field
 * reverts to the stored value. `undefined` clears an optional field.
 */
export function readQuantity(
  text: string,
  shown: Unit,
  reference: Unit,
  format: ReturnType<typeof toUnitsFormat>,
): Quantity | undefined | 'invalid' {
  if (text.trim().length === 0) return undefined;
  let parsed: Quantity;
  try {
    parsed = parseAuthored(text, format);
  } catch {
    return 'invalid';
  }
  if (isDimensionless(parsed.unit.dimension) && !isDimensionless(reference.dimension)) return { value: parsed.value, unit: shown };
  if (!dimensionsEqual(parsed.unit.dimension, reference.dimension)) return 'invalid';
  return parsed;
}

export function QuantityPortRow({
  nodeId, port, symbol, typed, reference, hint, arrow, mandatory = false, data, onCommit,
}: QuantityPortRowProps): ReactElement {
  const { document, analysis } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const edge: Edge | undefined = document.edges.find((candidate) => candidate.to.node === nodeId && candidate.to.port === port);
  const supplied = edge === undefined ? undefined : reading(analysis, edge.from.node, edge.from.port);
  const unit = analysis.resolution?.targets.get(`${nodeId}.${port}`)?.unit ?? typed?.unit ?? reference;
  const missing = mandatory && edge === undefined && typed === undefined;
  const highlighted = (data?.highlightedPorts ?? []).includes(port);
  return (
    <li
      className={`port${missing ? ' missing' : ''}${highlighted ? ' port-highlighted' : ''}`}
      title={hint}
      onMouseEnter={() => data?.onPortHover?.({ nodeId, port })}
      onMouseLeave={() => data?.onPortHover?.()}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={slotHandleId(port, 0)}
        className={`${missing ? 'missing' : ''}${highlighted ? ' port-highlighted' : ''}`}
      />
      <ParameterLabel name={symbol} unit={unit} nameClassName="port-name" unitClassName="port-unit" />
      {arrow === undefined ? null : (
        <span className="load-sign" aria-label={hint}>
          {arrow}
        </span>
      )}
      <span className="quantity-split port-quantity">
        <TextField
          className="quantity"
          value={
            edge !== undefined
              ? supplied === undefined ? '' : summarise(supplied, 4, format)
              : typed === undefined ? '' : formatAuthored(typed, format)
          }
          placeholder={mandatory ? '' : '0'}
          autoSize={4}
          disabled={edge !== undefined}
          title={
            edge !== undefined
              ? 'Set by the wire — unplug it to type one by hand again.'
              : `${hint} Type a number, with its unit if it differs.`
          }
          onCommit={(text) => {
            const read = readQuantity(text, typed?.unit ?? reference, reference, format);
            if (read === 'invalid' || (read === undefined && mandatory)) return;
            onCommit(read);
          }}
        />
      </span>
    </li>
  );
}
