/**
 * A panel width the user can drag, clamped to a sane range.
 *
 * `sign` says which way growing the panel moves the pointer: `1` when the
 * drag handle sits on the panel's trailing edge (dragging right grows it, as
 * for the palette), `-1` when it sits on the leading edge (dragging left
 * grows it, as for the notebook).
 */

import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

export function useResizableWidth(
  initial: number,
  min: number,
  max: number,
  sign: 1 | -1,
  onCommit?: (width: number) => void,
): readonly [number, (event: ReactMouseEvent) => void] {
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(width);
  const start = useRef<{ readonly x: number; readonly width: number } | null>(null);

  const onPointerDown = (event: ReactMouseEvent): void => {
    event.preventDefault();
    start.current = { x: event.clientX, width };

    const onMove = (moveEvent: MouseEvent): void => {
      if (start.current === null) return;
      const delta = (moveEvent.clientX - start.current.x) * sign;
      const next = Math.min(max, Math.max(min, start.current.width + delta));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = (): void => {
      if (start.current !== null) onCommit?.(widthRef.current);
      start.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return [width, onPointerDown];
}
