/**
 * A file node: pick a file, wire what it recorded.
 *
 * Shaped like the library nodes it is meant to sit next to — one choice made
 * on the node, many typed outputs read off it — except the choice is a file
 * rather than an entry in a dropdown. The rows below the picker are the same
 * reading/sparkline/pin rows a lookup-backed formula draws for its outputs,
 * for the same reason: they are outputs.
 *
 * The file itself is never held. Picking one reads it, keeps the values, and
 * lets the bytes go; the button afterwards says which file the values on the
 * node came from, not that the file is still there. Re-picking is how a node
 * follows a different frame.
 */

import { useState, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { FileNode, FileSource } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import { axisLabel, reading, summarise } from '../model/values';
import { openBinaryFiles } from '../io/files';
import { acceptOf, fieldsFrom, readFile, readerById, DEFAULT_READER, type ReadField } from '../files/readers';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { TitleField, TitleText } from './TitleField';
import { DisplayUnitPicker } from './DisplayUnitPicker';

/** `24.1 MB` — a size a student recognises from their own file manager. */
function fileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`;
  return `${bytes} B`;
}

function sourceSummary(sources: readonly FileSource[], readerLabel: string): string {
  if (sources.length === 0) return `pick a ${readerLabel}…`;
  if (sources.length === 1) return (sources[0] as FileSource).name;
  return `${sources.length} files`;
}

/** `reading 2 of 7…` — a raw frame takes long enough that silence reads as a hang. */
function progressLabel(done: number, total: number): string {
  return total === 1 ? 'reading…' : `reading ${done + 1} of ${total}…`;
}

export function FileNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  /** How far through a pick we are, or `undefined` when nothing is being read. */
  const [progress, setProgress] = useState<{ readonly done: number; readonly total: number }>();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'file') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const reader = readerById(node.reader) ?? DEFAULT_READER;

  const pick = async (): Promise<void> => {
    const picked = await openBinaryFiles(acceptOf(reader));
    if (picked.length === 0) return;
    setProgress({ done: 0, total: picked.length });
    try {
      const reads: (readonly ReadField[])[] = [];
      const sources: FileSource[] = [];
      // One file's bytes at a time, and only as much of each as the reader
      // needs: a raw frame is tens of megabytes, and they are wanted only
      // for as long as it takes to read a few dozen tags.
      for (const [i, file] of picked.entries()) {
        setProgress({ done: i, total: picked.length });
        reads.push(await readFile(reader, file));
        sources.push({ name: file.name, size: file.size, modified: file.modified });
      }
      setFailure(undefined);
      edit((current) =>
        updateNode<FileNode>(current, id, (entry) => ({
          ...entry,
          sources,
          fields: fieldsFrom(reads),
        })),
      );
    } catch (error) {
      // A file that cannot be read leaves the node exactly as it was — the
      // values already on it are still the ones their own file gave.
      setFailure(error instanceof Error ? error.message : 'this file could not be read');
    } finally {
      setProgress(undefined);
    }
  };

  const setDisplayUnit = (name: string, unit: Parameters<typeof DisplayUnitPicker>[0]['unit']): void =>
    edit((current) =>
      updateNode<FileNode>(current, id, (entry) => ({
        ...entry,
        displayUnits: { ...entry.displayUnits, [name]: unit },
      })),
    );

  return (
    <NodeShell
      kind="file"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      {...(failure === undefined ? {} : { warning: failure })}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      dataTour={`file-${id}`}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) => {
              const oldLabel = nodeLabel(node);
              const renamed = updateNode<FileNode>(current, id, (entry) => {
                // Same as an input node's rename: an axis label that was
                // following the node's name keeps following it.
                const { axisLabel: _stale, ...rest } = entry;
                return { ...rest, label };
              });
              return syncColumnLabels(renamed, id, oldLabel, label);
            })
          }
        />
      }
      subtitle={reader.label}
      detail={
        <>
          <ul className="file-sources">
            {node.sources.map((source) => (
              <li key={source.name}>
                <span className="file-source-name">{source.name}</span>
                <span className="file-source-size">{fileSize(source.size)}</span>
              </li>
            ))}
          </ul>
          <p className="file-accepts">Supported file types: {reader.extensions.join(', ')}</p>
        </>
      }
    >
      <div className="node-file-pick">
        <button
          type="button"
          className="nodrag"
          disabled={progress !== undefined}
          onClick={() => void pick()}
        >
          {progress === undefined
            ? sourceSummary(node.sources, reader.label)
            : progressLabel(progress.done, progress.total)}
        </button>
      </div>

      {node.fields.map((field) => {
        const value = reading(analysis, id, field.name);
        const unit = analysis.resolution?.sources.get(`${id}.${field.name}`)?.unit;
        const highlighted = highlightedPorts.has(field.name);
        const missing = field.values.some((entry) => entry === null);
        // What the field means, and — where a file left it out — why the row
        // reads as nothing. Same hover target a formula node's outputs have:
        // the whole row, not the one-letter name at its right end.
        const description = [
          reader.descriptions.get(field.name),
          missing ? 'This file did not record it.' : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(' ');
        return (
          <div
            key={field.name}
            className="node-value"
            {...(description === '' ? {} : { title: description })}
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: field.name })}
            onMouseLeave={() => data?.onPortHover?.()}
          >
            <span className={`reading${highlighted ? ' port-highlighted' : ''}`}>
              {value === undefined ? '—' : summarise(value, 4, format)}
            </span>
            {value === undefined ? null : <Sparkline reading={value} />}
            {value === undefined ? null : (
              <span className={`axis${highlighted ? ' port-highlighted' : ''}`}>
                <TitleText value={axisLabel(value) ?? ''} />
              </span>
            )}
            <span className={`port-out${highlighted ? ' port-highlighted' : ''}`}>
              <ParameterLabel name={field.name} />
              {unit === undefined ? null : (
                <DisplayUnitPicker unit={unit} onChange={(next) => setDisplayUnit(field.name, next)} />
              )}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={field.name}
              className={highlighted ? 'port-highlighted' : ''}
            />
          </div>
        );
      })}
    </NodeShell>
  );
}
