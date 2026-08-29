/**
 * A panel size (width, or — pinned to the bottom — height) the user can
 * drag, clamped to a sane range.
 *
 * `sign` says which way growing the panel moves the pointer: `1` when the
 * drag handle sits on the panel's trailing edge (dragging right grows it, as
 * for the palette), `-1` when it sits on the leading edge (dragging left, or
 * — on the `y` axis — up, grows it, as for the notebook and a bottom-pinned
 * palette).
 *
 * `axis` defaults to `'x'` so every existing width call site is unaffected;
 * pass `'y'` to track `clientY` instead, for a panel resized by height.
 */

import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

export function useResizableWidth(
  initial: number,
  min: number,
  max: number,
  sign: 1 | -1,
  onCommit?: (width: number) => void,
  axis: 'x' | 'y' = 'x',
): readonly [number, (event: ReactMouseEvent) => void] {
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(width);
  const start = useRef<{ readonly pos: number; readonly width: number } | null>(null);

  const pointerPos = (event: { readonly clientX: number; readonly clientY: number }): number =>
    axis === 'x' ? event.clientX : event.clientY;

  const onPointerDown = (event: ReactMouseEvent): void => {
    event.preventDefault();
    start.current = { pos: pointerPos(event), width };

    const onMove = (moveEvent: MouseEvent): void => {
      if (start.current === null) return;
      const delta = (pointerPos(moveEvent) - start.current.pos) * sign;
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
