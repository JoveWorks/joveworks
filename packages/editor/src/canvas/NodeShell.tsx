/**
 * The chrome every node shares: a title, a state, and a body that opens.
 *
 * Nodes are compact by default, preview their detail on selection or hover,
 * and can be kept open while working elsewhere. Colour means state and nothing else:
 * quarantined, blocked, incomplete, error, failing check. Units are text.
 */

import { useState, type ReactElement, type ReactNode } from 'react';
import { useNodeId } from '@xyflow/react';
import type { Catalogue, Formula, GraphNode, NodeKind } from '@joveworks/schema';

import { NODE_HELP_URLS } from '../help-links';
import { useGraph } from '../graph-context';
import type { NodeState } from '../model/analysis';
import { updateNode } from '../model/document';
import { formulaSource } from '../model/catalogues';
import type { AppLocale } from '../model/editorSettings';
import { useSettings } from '../settings-context';
import { phrase, ui } from '../i18n';
import { TextField } from './fields';
import { HelpLink } from './HelpLink';

const STATE_LABELS: Readonly<Record<NodeState, string>> = {
  ok: '',
  incomplete: 'not connected',
  quarantined: 'quarantined',
  blocked: 'waiting on an earlier node',
  error: 'refused',
};

interface Props {
  readonly kind: NodeKind;
  /** Overrides `NODE_HELP_URLS[kind]` — an output node needs a link specific to its own `output.kind`. */
  readonly helpUrl?: string;
  /** Overrides the "?" tooltip — a link into a catalogue's book is not our help page. */
  readonly helpTitle?: string;
  /** Preview the help on hover: only for a page the catalogue itself names, see `formulaHelp`. */
  readonly helpPreview?: boolean;
  readonly state: NodeState;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Why the node is not `ok`, in the kernel's words. */
  readonly problem?: ReactNode;
  readonly warning?: string;
  readonly selected?: boolean;
  readonly highlighted?: boolean;
  readonly expanded?: boolean;
  readonly onToggleExpanded?: () => void;
  readonly onDelete: () => void;
  /** Always drawn — the value, and the handles a wire attaches to. */
  readonly children: ReactNode;
  /** Drawn only when the node is open: ports with units, editors, description. */
  readonly detail?: ReactNode;
  /** A hook for the tutorial walkthrough to spotlight this node by. */
  readonly dataTour?: string;
  /** An extra class on the card itself — e.g. a formula that behaves like an
   * input (nothing to wire, just a choice made on the node) borrowing
   * input's kind stripe without actually becoming a different node kind. */
  readonly extraClassName?: string;
}

/**
 * The "?" of a node built on a catalogue formula: the page of the book it
 * cites, when the catalogue links there — for a catalogue formula that is
 * the help a student actually needs — else the node kind's own docs entry.
 */
export function formulaHelp(
  catalogues: readonly Catalogue[],
  formula: Formula | undefined,
  locale: AppLocale,
): { readonly helpUrl?: string; readonly helpTitle?: string; readonly helpPreview?: boolean } {
  const source = formula === undefined ? undefined : formulaSource(catalogues, formula, locale);
  if (source === undefined) return {};
  const copy = ui(locale);
  return {
    helpUrl: source.href,
    helpPreview: true,
    helpTitle: source.title === undefined ? copy.openSource : `${copy.openSourceIn} ${source.title}`,
  };
}

export function NodeShell({
  kind,
  helpUrl,
  helpTitle,
  helpPreview = false,
  state,
  title,
  subtitle,
  problem,
  warning,
  selected = false,
  highlighted,
  expanded = false,
  onToggleExpanded,
  onDelete,
  children,
  detail,
  dataTour,
  extraClassName,
}: Props): ReactElement {
  const { locale } = useSettings();
  const { marqueeActive, document, edit } = useGraph();
  const copy = ui(locale);
  const stateLabel = phrase(locale, STATE_LABELS[state]);
  const [hovered, setHovered] = useState(false);
  // React Flow's own node-id context — every node view here is rendered as a
  // registered node type, so this is always populated in practice. Reading it
  // rather than taking an `id` prop is what lets one `NodeShell` edit carry
  // the note field to every node kind without touching any of their eleven
  // view components (CompareNodeView.tsx and friends stay untouched).
  const nodeId = useNodeId();
  const self = nodeId === null ? undefined : document.nodes.find((candidate) => candidate.id === nodeId);
  // A marquee drag hit-tests each node's current DOM box (Canvas.tsx), so
  // hover or the marquee's own live selection opening a node mid-drag would
  // grow that box out from under the very rectangle it was fully inside of.
  // Freeze at collapsed-or-pinned for the drag; a pin (`expanded`) still wins.
  const open = expanded || (!marqueeActive && (selected || hovered));
  const help: string | undefined = helpUrl ?? NODE_HELP_URLS[kind];
  return (
    <div
      className={`node node-${kind} state-${state}${open ? ' open' : ''}${highlighted ? ' highlighted' : ''}${extraClassName === undefined ? '' : ` ${extraClassName}`}`}
      data-tour={dataTour}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header>
        <span className="node-title">{title}</span>
        {help === undefined ? null : <HelpLink href={help} label={helpTitle ?? copy.nodeHelp} preview={helpPreview} />}
        {detail === undefined ? null : (
          <button
            type="button"
            className={`node-pin${expanded ? ' on' : ''}`}
            title={expanded ? copy.unpinNode : copy.keepNodeOpen}
            aria-label={expanded ? copy.unpinNode : copy.keepNodeOpen}
            aria-pressed={expanded}
            tabIndex={-1}
            onClick={onToggleExpanded}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3h10v2l-2 2v4l3 3v1H6v-1l3-3V7L7 5V3Z" />
              <path d="M12 15v6" />
            </svg>
          </button>
        )}
        <button type="button" className="delete" title={copy.deleteNode} tabIndex={-1} onClick={onDelete}>
          ✕
        </button>
      </header>
      {subtitle === undefined ? null : <div className="node-subtitle">{subtitle}</div>}

      {children}

      {state === 'ok' ? null : (
        <div className={`node-state ${state}`}>
          {stateLabel}
          {problem === undefined ? null : <span className="reason">{problem}</span>}
        </div>
      )}
      {warning === undefined ? null : <div className="node-warning">{warning}</div>}

      {open && detail !== undefined ? (
        <div className="node-detail">
          {detail}
          {self === undefined ? null : (
            <label className="node-note-field">
              {copy.nodeNote}
              <TextField
                className="node-note"
                value={self.note ?? ''}
                placeholder={copy.nodeNotePlaceholder}
                multiline
                onCommit={(note) =>
                  edit((current) =>
                    updateNode<GraphNode>(current, nodeId as string, (entry) => {
                      const { note: _cleared, ...rest } = entry;
                      return note.trim().length === 0 ? rest : { ...rest, note };
                    }),
                  )
                }
              />
            </label>
          )}
        </div>
      ) : null}
    </div>
  );
}
