import type { DraftFormula } from '../model/draft';
import type { CatalogueValidation } from '../model/validation';

interface Props {
  readonly validation: CatalogueValidation;
  readonly formulas: readonly DraftFormula[];
  readonly onSelectFormula: (key: string) => void;
}

export function ValidationSummary({ validation, formulas, onSelectFormula }: Props) {
  const problemFormulas = validation.formulas.filter(
    (formula) => formula.errors.length > 0 || formula.quarantineNote !== undefined,
  );

  if (validation.catalogueErrors.length === 0 && problemFormulas.length === 0) {
    return <div className="validation-summary ok">Catalogue is valid and ready to export.</div>;
  }

  return (
    <div className="validation-summary">
      {validation.catalogueErrors.map((error, i) => (
        <p className="message error" key={`catalogue-${i}`}>
          {error.message}
        </p>
      ))}
      {problemFormulas.map((formulaValidation) => {
        const formula = formulas.find((entry) => entry.key === formulaValidation.key);
        const label = formula !== undefined && formula.id.trim().length > 0 ? formula.id : '(untitled formula)';
        return (
          <div className="validation-summary-formula" key={formulaValidation.key}>
            <button type="button" onClick={() => onSelectFormula(formulaValidation.key)}>
              {label}
            </button>
            {formulaValidation.errors.map((error, i) => (
              <p className="message error" key={i}>
                {error.message}
              </p>
            ))}
            {formulaValidation.quarantineNote !== undefined && (
              <p className="message note">{formulaValidation.quarantineNote}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
