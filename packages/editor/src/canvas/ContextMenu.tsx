/**
 * A generic right-click menu: a list of actions at a screen position.
 *
 * One component backs every surface that gets a context menu (nodes, edges,
 * frames, the empty canvas, notebook sections) rather than one popup
 * implementation per surface — the actions differ, the chrome does not.
 */

import type { ReactElement } from 'react';

export interface ActionItem {
  readonly label: string;
  readonly onClick: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Renders a checkmark and reserves its space, for a group of mutually
   * exclusive choices (e.g. the view menu's Light/Dark/System). Omit for an
   * ordinary action item — its label stays flush left, unaffected. */
  readonly checked?: boolean;
}

/** A section label within a menu — text, not a control, so it never looks clickable. */
export interface HeadingItem {
  readonly heading: string;
}

export type MenuItem = ActionItem | HeadingItem;

function isHeading(item: MenuItem): item is HeadingItem {
  return 'heading' in item;
}

interface Props {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
  /** Ribbon-style callers (App.tsx) use these to keep the menu open while the
   * cursor crosses the gap between its button and the dropdown, then close it
   * on a short delay rather than the instant the cursor leaves — plain
   * right-click callers leave these unset and keep click-to-close only. */
  readonly onMouseEnter?: () => void;
  readonly onMouseLeave?: () => void;
}

export function ContextMenu({ x, y, items, onClose, onMouseEnter, onMouseLeave }: Props): ReactElement {
  return (
    <>
      {/* Catches a click anywhere else, since the menu can be opened from any
          panel and none of them share a single "click missed everything" handler. */}
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={onClose} />
      <div
        className="context-menu"
        style={{ left: x, top: y }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {items.map((item, i) =>
          isHeading(item) ? (
            <div key={`heading-${i}`} className="menu-heading">
              {item.heading}
            </div>
          ) : (
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
              {item.checked !== undefined && (
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
              )}
              {item.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
