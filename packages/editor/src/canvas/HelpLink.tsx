/**
 * A node's "?": a link to its help — the docs entry for the node kind, or the
 * page of the book a catalogue formula cites.
 *
 * Only a page the catalogue names is previewed; the docs entry stays a plain
 * link with a tooltip. With `preview`, resting on the "?" shows a small
 * snapshot of the target, scrolled to its anchor, so a student can glance at
 * the equation the node computes without leaving the canvas; a click opens it
 * in a new tab, as before. The snapshot is an iframe drawn at a reading width
 * and scaled down, with pointer events off: it is a picture of the page, and
 * the card around it is the link.
 *
 * The card is portalled to the body. Inside the node it would inherit the
 * canvas zoom and be clipped by the node's own box.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

/** Long enough that sweeping the pointer across a node does not load a page. */
const OPEN_DELAY_MS = 350;
/** Long enough to move from the "?" onto the card without it closing. */
const CLOSE_DELAY_MS = 150;

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 448;
const SCALE = 0.625;
const CARD_WIDTH = FRAME_WIDTH * SCALE;
const GAP = 8;

interface Props {
  readonly href: string;
  /** What the link opens: "Help for this node", "Open this formula in the photography book". */
  readonly label: string;
  /** Show the snapshot card on hover. Off, the "?" is a plain link with a tooltip. */
  readonly preview: boolean;
}

interface Placement {
  readonly left: number;
  readonly top: number;
}

/** Beside the "?", flipped left or nudged up where the window runs out. */
function place(anchor: DOMRect): Placement {
  const height = FRAME_HEIGHT * SCALE + 32;
  const right = anchor.right + GAP;
  const left = right + CARD_WIDTH <= window.innerWidth - GAP ? right : Math.max(GAP, anchor.left - GAP - CARD_WIDTH);
  const top = Math.max(GAP, Math.min(anchor.top - 12, window.innerHeight - height - GAP));
  return { left, top };
}

export function HelpLink({ href, label, preview }: Props): ReactElement {
  const anchor = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [placement, setPlacement] = useState<Placement | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const later = (delay: number, action: () => void): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(action, delay);
  };
  const show = (): void =>
    later(OPEN_DELAY_MS, () => {
      const box = anchor.current?.getBoundingClientRect();
      if (box !== undefined) setPlacement(place(box));
    });
  const stay = (): void => window.clearTimeout(timer.current);
  const hide = (): void => later(CLOSE_DELAY_MS, () => setPlacement(undefined));
  const close = (): void => {
    window.clearTimeout(timer.current);
    setPlacement(undefined);
  };

  return (
    <>
      {/* Tabbed past, not out of the header — a student tabbing from the
          label toward a node's value and unit fields should not land on
          these icon buttons first (ROADMAP.md: "Tab in node should go
          from label-value-unit"). Still reachable by click. */}
      <a
        ref={anchor}
        className="help"
        href={href}
        target="_blank"
        rel="noopener"
        aria-label={label}
        {...(preview ? { onMouseEnter: show, onMouseLeave: hide, onClick: close } : { title: label })}
        tabIndex={-1}
      >
        ?
      </a>
      {placement === undefined
        ? null
        : createPortal(
            <a
              className="help-preview"
              href={href}
              target="_blank"
              rel="noopener"
              style={{ left: placement.left, top: placement.top, width: CARD_WIDTH }}
              onMouseEnter={stay}
              onMouseLeave={hide}
              onClick={close}
            >
              <span className="help-preview-label">
                {label}
                <span aria-hidden="true"> ↗</span>
              </span>
              <span className="help-preview-page" style={{ height: FRAME_HEIGHT * SCALE }}>
                <iframe
                  src={href}
                  title={label}
                  tabIndex={-1}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${SCALE})` }}
                />
              </span>
            </a>,
            document.body,
          )}
    </>
  );
}
