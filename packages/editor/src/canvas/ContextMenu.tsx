/**
 * A generic right-click menu: a list of actions at a screen position.
 *
 * One component backs every surface that gets a context menu (nodes, edges,
 * frames, the empty canvas, notebook sections) rather than one popup
 * implementation per surface — the actions differ, the chrome does not.
 */

import type { ReactElement } from 'react';

export interface MenuItem {
  readonly label: string;
  readonly onClick: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
}

interface Props {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props): ReactElement {
  return (
    <>
      {/* Catches a click anywhere else, since the menu can be opened from any
          panel and none of them share a single "click missed everything" handler. */}
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={onClose} />
      <div className="context-menu" style={{ left: x, top: y }}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled ?? false}
            className={item.danger === true ? 'danger' : ''}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
