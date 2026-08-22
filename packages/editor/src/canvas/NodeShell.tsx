/**
 * The chrome every node shares: a title, a state, and a body that opens.
 *
 * Nodes are compact by default, preview their detail on selection or hover,
 * and can be kept open while working elsewhere. Colour means state and nothing else:
 * quarantined, blocked, incomplete, error, failing check. Units are text.
 */

import { useState, type ReactElement, type ReactNode } from 'react';

import { NODE_HELP_URLS } from '../help-links';
import { useGraph } from '../graph-context';
import type { NodeState } from '../model/analysis';
import { useSettings } from '../settings-context';
import { phrase, ui } from '../i18n';

const STATE_LABELS: Readonly<Record<NodeState, string>> = {
  ok: '',
  incomplete: 'not connected',
  quarantined: 'quarantined',
  blocked: 'waiting on an earlier node',
  error: 'refused',
};

interface Props {
  readonly kind:
    | 'input'
    | 'formula'
    | 'output'
    | 'compare'
    | 'closure'
    | 'waypoint'
    | 'pack'
    | 'unpack'
    | 'monteCarloGenerator'
    | 'monteCarloReceiver';
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
}

export function NodeShell({
  kind,
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
}: Props): ReactElement {
  const { locale } = useSettings();
  const { marqueeActive } = useGraph();
  const copy = ui(locale);
  const stateLabel = phrase(locale, STATE_LABELS[state]);
  const [hovered, setHovered] = useState(false);
  // A marquee drag hit-tests each node's current DOM box (Canvas.tsx), so
  // hover or the marquee's own live selection opening a node mid-drag would
  // grow that box out from under the very rectangle it was fully inside of.
  // Freeze at collapsed-or-pinned for the drag; a pin (`expanded`) still wins.
  const open = expanded || (!marqueeActive && (selected || hovered));
  return (
    <div
      className={`node node-${kind} state-${state}${open ? ' open' : ''}${highlighted ? ' highlighted' : ''}`}
      data-tour={dataTour}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header>
        <span className="node-title">{title}</span>
        {NODE_HELP_URLS[kind] === undefined ? null : (
          <a
            className="help"
            href={NODE_HELP_URLS[kind]}
            target="_blank"
            rel="noopener"
            title={copy.nodeHelp}
          >
            ?
          </a>
        )}
        {detail === undefined ? null : (
          <button
            type="button"
            className={`node-pin${expanded ? ' on' : ''}`}
            title={expanded ? copy.unpinNode : copy.keepNodeOpen}
            aria-label={expanded ? copy.unpinNode : copy.keepNodeOpen}
            aria-pressed={expanded}
            onClick={onToggleExpanded}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3h10v2l-2 2v4l3 3v1H6v-1l3-3V7L7 5V3Z" />
              <path d="M12 15v6" />
            </svg>
          </button>
        )}
        <button type="button" className="delete" title={copy.deleteNode} onClick={onDelete}>
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

      {open && detail !== undefined ? <div className="node-detail">{detail}</div> : null}
    </div>
  );
}
