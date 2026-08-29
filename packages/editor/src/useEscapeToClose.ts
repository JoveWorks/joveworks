/**
 * Escape closes whichever popup — tutorial overlay, dialog, dropdown, or
 * context menu — is currently open, regardless of what has DOM focus. A
 * `keydown` listener on the container `<div>` only ever fires if that div (or
 * a focusable descendant of it) already has focus; a menu's backdrop and most
 * dialog panels never do. Listening on `document` instead catches Escape no
 * matter where focus sits.
 *
 * Stacking: several of these can be mounted at once (e.g. a context menu
 * opened while a dialog is showing). Escape must close only the top-most one.
 * DOM listeners on the same target fire in the order they were added — the
 * first-mounted (bottom) instance's listener runs *before* the last-mounted
 * (top) one's, verified with a plain `EventTarget` — so by the time the top
 * instance's handler runs and calls `stopPropagation`, an earlier handler has
 * already run and would already have closed the thing underneath. Relying on
 * propagation order is therefore not enough; each instance instead checks a
 * shared stack and only the most-recently-mounted active instance acts.
 */

import { useEffect, useRef } from 'react';

/** Mounted (and `active`) instances, oldest first. Only the last one acts on Escape. */
const stack: symbol[] = [];

/**
 * @param onClose Called once when Escape is pressed and this is the
 *   top-most active instance.
 * @param active Gate for a component that stays mounted but is only
 *   sometimes open (`Tutorial`'s `active` prop) — an inactive instance is
 *   removed from the stack so it can neither act nor block one beneath it.
 *   Defaults to always active, for components only ever mounted while open.
 */
export function useEscapeToClose(onClose: () => void, active = true): void {
  const idRef = useRef<symbol | undefined>(undefined);
  if (idRef.current === undefined) idRef.current = Symbol('escapeToClose');
  const id = idRef.current;

  // Latest `onClose` without re-running the effect (and re-ordering the
  // stack) on every render a caller passes a fresh closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    stack.push(id);

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (stack[stack.length - 1] !== id) return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const at = stack.lastIndexOf(id);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [active, id]);
}
