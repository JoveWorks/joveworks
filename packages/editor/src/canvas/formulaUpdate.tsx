/**
 * Accepting a changed catalogue formula.
 *
 * A graph pins each formula by id, version and hash, and a corrected formula
 * shipping mid-semester leaves the node warning that it changed — while
 * already computing with the new one. Accepting rewrites the pin to what it
 * computes with, which clears the warning; it is an ordinary, undoable edit.
 * The maintainer's notes (`Formula.changes`) say what the student is
 * accepting.
 */

import { localize, type FormulaRef, type GraphDocument } from '@joveworks/schema';
import type { Warning } from '@joveworks/kernel';
import type { ReactElement } from 'react';

import { phrase, type AppLocale } from '../i18n';
import { updateNode } from '../model/document';

/** Re-pin the formula a formula or table node references. */
export function acceptFormulaUpdate(document: GraphDocument, nodeId: string, to: FormulaRef): GraphDocument {
  return updateNode(document, nodeId, (node) => {
    if (node.kind === 'formula' && node.formula.id === to.id) return { ...node, formula: to };
    if (node.kind === 'table' && node.table.id === to.id) return { ...node, table: to };
    return node;
  });
}

/** The warning's own message, then each note since the saved version, in the reader's language. */
export function formulaChangeText(warning: Warning, locale: AppLocale): string {
  const notes = (warning.formulaUpdate?.changes ?? []).map(
    (change) => `${phrase(locale, 'Version')} ${change.version}: ${localize(change.note, locale)}`,
  );
  return [warning.message, ...notes].join(' ');
}

export function FormulaUpdateButton({
  warning,
  locale,
  onAccept,
}: {
  readonly warning: Warning;
  readonly locale: AppLocale;
  readonly onAccept: (nodeId: string, to: FormulaRef) => void;
}): ReactElement | null {
  const update = warning.formulaUpdate;
  const { nodeId } = warning;
  if (update === undefined || nodeId === undefined) return null;
  return (
    <button type="button" className="formula-update nodrag" onClick={() => onAccept(nodeId, update.to)}>
      {phrase(locale, 'Update to version')} {update.to.version}
    </button>
  );
}
