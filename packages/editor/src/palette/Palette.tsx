/**
 * The palette: every formula the loaded catalogues carry, and the two node kinds
 * that are not formulas at all (S60).
 *
 * A student finds a formula by equation number or by what it computes, so the
 * search reads ids, citations, descriptions and port names alike. Quarantined
 * records are listed, marked, and can still be dragged in: S19 says quarantine is
 * **visible and not silently usable**, which is a different thing from hidden —
 * the node lands on the canvas and says why it cannot be evaluated.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useReactFlow } from '@xyflow/react';

import { parseUnit } from '@mds/units';
import { formulaRef, type Formula, type Output, type Position } from '@mds/schema';

import { useGraph } from '../graph-context';
import { addNode, uniqueId } from '../model/document';
import { entries, search, type PaletteEntry } from '../model/catalogues';

/** Where a node dropped from the palette lands: the middle of what you can see. */
function useDropPosition(): () => Position {
  const flow = useReactFlow();
  return () => {
    const centre = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const { x, y } = flow.screenToFlowPosition(centre);
    // A small cascade so successive additions do not stack exactly.
    const jitter = (Math.random() - 0.5) * 60;
    return { x: Math.round(x + jitter), y: Math.round(y + jitter) };
  };
}

export function Palette(): ReactElement {
  const { document, catalogues, edit } = useGraph();
  const [query, setQuery] = useState('');
  const position = useDropPosition();

  const all = useMemo(() => entries(catalogues), [catalogues]);
  const found = useMemo(() => search(all, query), [all, query]);

  const grouped = useMemo(() => {
    const byCatalogue = new Map<string, PaletteEntry[]>();
    for (const entry of found) {
      const list = byCatalogue.get(entry.catalogue.id);
      if (list === undefined) byCatalogue.set(entry.catalogue.id, [entry]);
      else list.push(entry);
    }
    return [...byCatalogue.entries()];
  }, [found]);

  const addFormula = (formula: Formula): void =>
    edit((current) =>
      addNode(current, {
        kind: 'formula',
        id: uniqueId(current, formula.id.replace(/[^\w.]/gu, '_')),
        formula: formulaRef(formula),
        position: position(),
      }),
    );

  const addInput = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'input');
      return addNode(current, {
        kind: 'input',
        id,
        label: id,
        value: { kind: 'scalar', value: 1, unit: parseUnit('') },
        position: position(),
      });
    });

  const addOutput = (kind: Output['kind']): void =>
    edit((current) => {
      const id = uniqueId(current, kind === 'value' ? 'result' : kind);
      const output: Output =
        kind === 'check'
          ? { kind, comparison: '>=', threshold: { value: 1, unit: parseUnit('') } }
          : { kind: 'value' };
      return addNode(current, { kind: 'output', id, label: id, output, position: position() });
    });

  return (
    <div className="palette">
      <div className="palette-add">
        <button type="button" onClick={addInput}>
          + input
        </button>
        <button type="button" onClick={() => addOutput('value')}>
          + value
        </button>
        <button type="button" onClick={() => addOutput('check')}>
          + check
        </button>
      </div>

      <input
        className="search"
        value={query}
        placeholder="equation number, symbol, or what it computes"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="palette-list">
        {grouped.map(([catalogueId, list]) => (
          <section key={catalogueId}>
            <h3>
              {list[0]?.catalogue.name ?? catalogueId}
              {list[0]?.catalogue.restricted === true ? (
                <span className="restricted" title="Restricted content — never exported (S32).">
                  restricted
                </span>
              ) : null}
            </h3>
            <ul>
              {list.map(({ formula }) => (
                <li key={formula.id}>
                  <button
                    type="button"
                    className={`entry ${formula.status}`}
                    title={
                      formula.status === 'quarantined'
                        ? `Quarantined: ${formula.quarantineReason ?? ''}`
                        : formula.description
                    }
                    onClick={() => addFormula(formula)}
                  >
                    <span className="entry-id">{formula.citation ?? formula.id}</span>
                    <span className="entry-output">{formula.output.name}</span>
                    {formula.status === 'quarantined' ? (
                      <span className="entry-status">quarantined</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {found.length === 0 ? <p className="empty">Nothing matches “{query}”.</p> : null}
      </div>

      <p className="palette-footer">
        {document.nodes.length} nodes · {catalogues.length} catalogue
        {catalogues.length === 1 ? '' : 's'} loaded
      </p>
    </div>
  );
}
