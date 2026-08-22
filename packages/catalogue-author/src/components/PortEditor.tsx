import type { DraftPort, DraftPortKind } from '../model/draft';
import { LocalizedTextField } from './LocalizedTextField';

interface Props {
  readonly port: DraftPort;
  readonly allowedKinds: readonly DraftPortKind[];
  readonly removable: boolean;
  readonly onChange: (patch: Partial<DraftPort>) => void;
  readonly onRemove?: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
}

export function PortEditor({ port, allowedKinds, removable, onChange, onRemove, onMoveUp, onMoveDown }: Props) {
  return (
    <div className="port-editor">
      <div className="port-editor-header">
        <input
          type="text"
          value={port.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="symbol, e.g. F"
        />
        <select value={port.kind} onChange={(e) => onChange({ kind: e.target.value as DraftPortKind })}>
          {allowedKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        {onMoveUp !== undefined && (
          <button type="button" onClick={onMoveUp} title="Move up">
            ↑
          </button>
        )}
        {onMoveDown !== undefined && (
          <button type="button" onClick={onMoveDown} title="Move down">
            ↓
          </button>
        )}
        {removable && onRemove !== undefined && (
          <button type="button" onClick={onRemove} title="Remove">
            ✕
          </button>
        )}
      </div>

      {port.kind === 'categorical' ? (
        <div className="port-editor-fields">
          <label>
            Domain (comma-separated)
            <input
              type="text"
              value={port.domain}
              onChange={(e) => onChange({ domain: e.target.value })}
              placeholder="H7, H8, K7"
            />
          </label>
          <label>
            Default
            <input type="text" value={port.defaultValue} onChange={(e) => onChange({ defaultValue: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="port-editor-fields">
          <label>
            Unit
            <input
              type="text"
              value={port.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
              placeholder="e.g. N/mm² ('' for dimensionless)"
            />
          </label>
          <label>
            Preferred unit (optional)
            <input type="text" value={port.preferredUnit} onChange={(e) => onChange({ preferredUnit: e.target.value })} />
          </label>
          {port.kind === 'numeric' && (
            <>
              <label>
                Default
                <input
                  type="text"
                  value={port.defaultValue}
                  onChange={(e) => onChange({ defaultValue: e.target.value })}
                />
              </label>
              <label>
                Valid range min
                <input
                  type="text"
                  value={port.validRange.min}
                  onChange={(e) => onChange({ validRange: { ...port.validRange, min: e.target.value } })}
                />
              </label>
              <label>
                Valid range max
                <input
                  type="text"
                  value={port.validRange.max}
                  onChange={(e) => onChange({ validRange: { ...port.validRange, max: e.target.value } })}
                />
              </label>
              <label>
                Monotonic
                <select
                  value={port.monotonic}
                  onChange={(e) => onChange({ monotonic: e.target.value as DraftPort['monotonic'] })}
                >
                  <option value="">(none)</option>
                  <option value="increasing">increasing</option>
                  <option value="decreasing">decreasing</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}
      <LocalizedTextField label="Description (optional)" value={port.description} onChange={(next) => onChange({ description: next })} />
    </div>
  );
}
