import { useMemo, useState } from 'react';

import {
  catalogueFormatFromFileName,
  loadCatalogue,
  saveCatalogue,
  SchemaError,
  type Catalogue,
} from '@joveworks/schema';

import { CatalogueMetaForm } from './components/CatalogueMetaForm';
import { FormulaForm } from './components/FormulaForm';
import { FormulaList } from './components/FormulaList';
import { ValidationSummary } from './components/ValidationSummary';
import { openTextFile, saveTextFile } from './io/files';
import {
  addFormula,
  draftCatalogueFromReal,
  duplicateFormula,
  emptyCatalogue,
  moveFormula,
  removeFormula,
  updateFormula,
  type DraftCatalogue,
  type DraftFormula,
} from './model/draft';
import { validateCatalogue } from './model/validation';

export function App() {
  const [catalogue, setCatalogue] = useState<DraftCatalogue>(emptyCatalogue());
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [fileError, setFileError] = useState<string | undefined>(undefined);

  const validation = useMemo(() => validateCatalogue(catalogue), [catalogue]);
  const selected = catalogue.formulas.find((formula) => formula.key === selectedKey);
  const selectedValidation = validation.formulas.find((formula) => formula.key === selectedKey);

  async function handleImport() {
    const picked = await openTextFile('application/json,.json,application/yaml,text/yaml,.yaml,.yml');
    if (picked === undefined) return;
    try {
      const loaded: Catalogue = loadCatalogue(
        picked.text,
        catalogueFormatFromFileName(picked.name),
      );
      const draft = draftCatalogueFromReal(loaded);
      setCatalogue(draft);
      setSelectedKey(draft.formulas[0]?.key);
      setFileError(undefined);
    } catch (error) {
      setFileError(error instanceof SchemaError ? error.message : String(error));
    }
  }

  function handleNew() {
    setCatalogue(emptyCatalogue());
    setSelectedKey(undefined);
    setFileError(undefined);
  }

  function handleExport() {
    if (validation.catalogue === undefined) return;
    saveTextFile(
      `${validation.catalogue.id}.yaml`,
      saveCatalogue(validation.catalogue, 'yaml'),
      'application/yaml',
    );
  }

  function handleAddFormula() {
    const next = addFormula(catalogue);
    setCatalogue(next);
    setSelectedKey(next.formulas[next.formulas.length - 1]?.key);
  }

  function handleDuplicateFormula(key: string) {
    const index = catalogue.formulas.findIndex((formula) => formula.key === key);
    const next = duplicateFormula(catalogue, key);
    setCatalogue(next);
    setSelectedKey(next.formulas[index + 1]?.key);
  }

  function handleRemoveFormula(key: string) {
    setCatalogue(removeFormula(catalogue, key));
    if (selectedKey === key) setSelectedKey(undefined);
  }

  function handleMoveFormula(key: string, direction: -1 | 1) {
    setCatalogue(moveFormula(catalogue, key, direction));
  }

  function handleFormulaChange(next: DraftFormula) {
    setCatalogue(updateFormula(catalogue, next.key, next));
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>JoveWorks catalogue author</h1>
        <div className="app-header-actions">
          <button type="button" onClick={handleNew}>
            New
          </button>
          <button type="button" onClick={() => void handleImport()}>
            Import…
          </button>
          <button type="button" onClick={handleExport} disabled={validation.catalogue === undefined}>
            Export
          </button>
        </div>
      </header>

      {fileError !== undefined && <div className="file-error">{fileError}</div>}

      <CatalogueMetaForm catalogue={catalogue} onChange={setCatalogue} />

      <main className="app-main">
        <FormulaList
          formulas={catalogue.formulas}
          validations={validation.formulas}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onAdd={handleAddFormula}
          onDuplicate={handleDuplicateFormula}
          onRemove={handleRemoveFormula}
          onMove={handleMoveFormula}
        />
        {selected === undefined ? (
          <div className="formula-form-placeholder">Select a formula on the left, or add a new one.</div>
        ) : (
          <FormulaForm formula={selected} validation={selectedValidation} onChange={handleFormulaChange} />
        )}
      </main>

      <ValidationSummary validation={validation} formulas={catalogue.formulas} onSelectFormula={setSelectedKey} />
    </div>
  );
}
