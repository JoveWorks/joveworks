import type { DraftFormula } from '../model/draft';
import type { FormulaValidation } from '../model/validation';

interface Props {
  readonly formulas: readonly DraftFormula[];
  readonly validations: readonly FormulaValidation[];
  readonly selectedKey: string | undefined;
  readonly onSelect: (key: string) => void;
  readonly onAdd: () => void;
  readonly onDuplicate: (key: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onMove: (key: string, direction: -1 | 1) => void;
}

export function FormulaList({
  formulas,
  validations,
  selectedKey,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onMove,
}: Props) {
  return (
    <aside className="formula-list">
      <div className="formula-list-header">
        <span>Formulas</span>
        <button type="button" onClick={onAdd}>
          + Add
        </button>
      </div>
      {formulas.length === 0 && <p className="empty-hint">No formulas yet — add one to get started.</p>}
      <ul>
        {formulas.map((formula, index) => {
          const validation = validations.find((entry) => entry.key === formula.key);
          const hasErrors = (validation?.errors.length ?? 0) > 0;
          return (
            <li key={formula.key} className={formula.key === selectedKey ? 'selected' : ''}>
              <button type="button" className="formula-list-item" onClick={() => onSelect(formula.key)}>
                <span className={hasErrors ? 'status-dot error' : 'status-dot ok'} />
                {formula.id.trim().length > 0 ? formula.id : '(untitled formula)'}
              </button>
              <div className="formula-list-actions">
                <button type="button" onClick={() => onMove(formula.key, -1)} disabled={index === 0} title="Move up">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(formula.key, 1)}
                  disabled={index === formulas.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <button type="button" onClick={() => onDuplicate(formula.key)} title="Duplicate">
                  ⧉
                </button>
                <button type="button" onClick={() => onRemove(formula.key)} title="Delete">
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
