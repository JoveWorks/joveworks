/**
 * A generic right-click menu: a list of actions at a screen position.
 *
 * One component backs every surface that gets a context menu (nodes, edges,
 * frames, the empty canvas, notebook sections) rather than one popup
 * implementation per surface — the actions differ, the chrome does not.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

import { TitleText } from './TitleField';

/** Kept clear of the viewport edge so the menu never touches the browser chrome. */
const VIEWPORT_MARGIN = 8;

export interface ActionItem {
  readonly label: string;
  readonly onClick: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Renders a trailing checkmark for a selected toggle or choice. Omit for
   * an ordinary action item. Labels stay aligned in either case. */
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
  const menuRef = useRef<HTMLDivElement>(null);
  // Rendered hidden at the click point first so its real size can be
  // measured, then clamped onto screen — a right-click near the bottom or
  // right edge would otherwise open a menu whose lower rows sit off-viewport.
  const [style, setStyle] = useState<CSSProperties>({ left: x, top: y, visibility: 'hidden' });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const { width, height } = menu.getBoundingClientRect();
    const left = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
    setStyle({ left, top, visibility: 'visible' });
  }, [x, y]);

  return (
    <>
      {/* Catches a click anywhere else, since the menu can be opened from any
          panel and none of them share a single "click missed everything" handler. */}
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={onClose} />
      <div
        ref={menuRef}
        className="context-menu"
        style={style}
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
              className={`${item.danger === true ? 'danger' : ''}${item.checked !== undefined ? ' checkable' : ''}`.trim()}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.checked !== undefined && (
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
              )}
              <TitleText value={item.label} />
            </button>
          ),
        )}
      </div>
    </>
  );
}
