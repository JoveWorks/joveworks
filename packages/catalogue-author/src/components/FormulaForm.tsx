import { FORMULA_STATUSES, type FormulaStatus } from '@joveworks/schema';

import { addPort, movePort, removePort, updatePort, type DraftFormula } from '../model/draft';
import type { FormulaValidation } from '../model/validation';
import { LocalizedTextField } from './LocalizedTextField';
import { PortEditor } from './PortEditor';

interface Props {
  readonly formula: DraftFormula;
  readonly validation: FormulaValidation | undefined;
  readonly onChange: (next: DraftFormula) => void;
}

export function FormulaForm({ formula, validation, onChange }: Props) {
  function set<K extends keyof DraftFormula>(key: K, value: DraftFormula[K]) {
    onChange({ ...formula, [key]: value });
  }

  return (
    <section className="formula-form">
      <div className="formula-form-grid">
        <label>
          Formula id
          <input
            type="text"
            value={formula.id}
            onChange={(e) => set('id', e.target.value)}
            placeholder="e.g. mechanics.stress.normal — pick a namespace and stick to it"
          />
        </label>
        <label>
          Version
          <input type="text" inputMode="numeric" value={formula.version} onChange={(e) => set('version', e.target.value)} />
        </label>
        <label>
          Status
          <select value={formula.status} onChange={(e) => set('status', e.target.value as FormulaStatus)}>
            {FORMULA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Citation
          <input
            type="text"
            value={formula.citation}
            onChange={(e) => set('citation', e.target.value)}
            placeholder="e.g. R&M 17.1B — omit for an invented formula"
          />
        </label>
        <label>
          Variant of
          <input type="text" value={formula.variantOf} onChange={(e) => set('variantOf', e.target.value)} />
        </label>
        <label>
          Applies when
          <input
            type="text"
            value={formula.appliesWhen}
            onChange={(e) => set('appliesWhen', e.target.value)}
            placeholder="e.g. d < 50 — omit if it always applies"
          />
        </label>
      </div>

      {formula.status === 'quarantined' && (
        <LocalizedTextField
          label="Quarantine reason (required)"
          value={formula.quarantineReason}
          onChange={(next) => set('quarantineReason', next)}
        />
      )}

      <label className="expression-field">
        Expression
        <textarea value={formula.expression} onChange={(e) => set('expression', e.target.value)} rows={2} placeholder="e.g. F / A" />
      </label>

      <LocalizedTextField label="Label (optional)" value={formula.label} onChange={(next) => set('label', next)} />
      <LocalizedTextField label="Description" value={formula.description} onChange={(next) => set('description', next)} />

      <h3>{formula.outputs.length === 1 ? 'Output' : 'Outputs'}</h3>
      {formula.outputs.map((port) => (
        <PortEditor
          key={port.key}
          port={port}
          allowedKinds={['numeric', 'categorical']}
          removable={false}
          onChange={(patch) => onChange(updatePort(formula, port.key, patch))}
        />
      ))}

      <h3>Inputs</h3>
      {formula.inputs.map((port, index) => (
        <PortEditor
          key={port.key}
          port={port}
          allowedKinds={['numeric', 'categorical']}
          removable
          onChange={(patch) => onChange(updatePort(formula, port.key, patch))}
          onRemove={() => onChange(removePort(formula, port.key))}
          {...(index > 0 ? { onMoveUp: () => onChange(movePort(formula, port.key, -1)) } : {})}
          {...(index < formula.inputs.length - 1
            ? { onMoveDown: () => onChange(movePort(formula, port.key, 1)) }
            : {})}
        />
      ))}
      <div className="add-port-buttons">
        <button type="button" onClick={() => onChange(addPort(formula, 'numeric'))}>
          + Numeric input
        </button>
        <button type="button" onClick={() => onChange(addPort(formula, 'categorical'))}>
          + Categorical input
        </button>
      </div>

      {validation !== undefined && (validation.errors.length > 0 || validation.quarantineNote !== undefined) && (
        <div className="formula-form-messages">
          {validation.errors.map((error, i) => (
            <p className="message error" key={i}>
              {error.message}
            </p>
          ))}
          {validation.quarantineNote !== undefined && <p className="message note">{validation.quarantineNote}</p>}
        </div>
      )}
    </section>
  );
}
