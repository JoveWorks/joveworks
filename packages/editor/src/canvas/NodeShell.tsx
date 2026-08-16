/**
 * The chrome every node shares: a title, a state, and a body that opens.
 *
 * Nodes are compact by default and open on selection or hover, and can be pinned
 * open while working elsewhere. Colour means state and nothing else:
 * quarantined, blocked, incomplete, error, failing check. Units are text.
 */

import { useState, type ReactElement, type ReactNode } from 'react';

import { NODE_HELP_URLS } from '../help-links';
import type { NodeState } from '../model/analysis';

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
    | 'unpack';
  readonly state: NodeState;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Why the node is not `ok`, in the kernel's words. */
  readonly problem?: ReactNode;
  readonly warning?: string;
  readonly selected: boolean;
  readonly highlighted?: boolean;
  readonly pinned: boolean;
  readonly onTogglePin: () => void;
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
  selected,
  highlighted,
  pinned,
  onTogglePin,
  onDelete,
  children,
  detail,
  dataTour,
}: Props): ReactElement {
  const [hovered, setHovered] = useState(false);
  const open = selected || hovered || pinned;

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
            title="Help for this node"
          >
            ?
          </a>
        )}
        <button
          type="button"
          className={`pin${pinned ? ' on' : ''}`}
          title={pinned ? 'Unpin this node' : 'Keep this node open'}
          onClick={onTogglePin}
        >
          ▣
        </button>
        <button type="button" className="delete" title="Delete this node" onClick={onDelete}>
          ✕
        </button>
      </header>
      {subtitle === undefined ? null : <div className="node-subtitle">{subtitle}</div>}

      {children}

      {state === 'ok' ? null : (
        <div className={`node-state ${state}`}>
          {STATE_LABELS[state]}
          {problem === undefined ? null : <span className="reason">{problem}</span>}
        </div>
      )}
      {warning === undefined ? null : <div className="node-warning">{warning}</div>}

      {open && detail !== undefined ? <div className="node-detail">{detail}</div> : null}
    </div>
  );
}
