/**
 * The first-load walkthrough: a spotlight over one real UI element at a
 * time, plus a caption. Reads/writes `pinned` because a step that points
 * inside a node (its detail, its value-kind select) needs that node open —
 * open is `selected || hovered || pinned` (`NodeShell.tsx`), and a scripted
 * step controls none of the first two.
 *
 * A step's target can be off-screen, unmounted (the notebook panel closed)
 * or moving under React Flow's pan/zoom. Rather than chase that, a target
 * that can't be measured just means no spotlight for that step — the
 * caption still shows, centered, and the tour keeps going. The caption
 * itself is measured after every render and nudged back on-screen if its
 * preferred position would run off any edge — a nearby handle or a wide
 * side panel can otherwise place it (or its buttons) out of reach.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

import { TUTORIAL_STEPS, type TutorialStep } from './steps';
import { saveTutorialSeen } from './tutorialSettings';

interface Props {
  readonly active: boolean;
  readonly onClose: () => void;
  readonly pinned: ReadonlySet<string>;
  readonly setPinned: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
}

const MARGIN = 12;

function measure(target: string | undefined): DOMRect | undefined {
  if (target === undefined) return undefined;
  return document.querySelector(target)?.getBoundingClientRect();
}

function preferredStyle(rect: DOMRect | undefined, placement: TutorialStep['placement']): CSSProperties {
  if (rect === undefined || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
  switch (placement) {
    case 'right':
      return { top: `${rect.top}px`, left: `${rect.right + MARGIN * 2}px` };
    case 'left':
      return { top: `${rect.top}px`, left: `${rect.left - MARGIN * 2}px`, transform: 'translateX(-100%)' };
    case 'top':
      return { left: `${rect.left}px`, top: `${rect.top - MARGIN * 2}px`, transform: 'translateY(-100%)' };
    case 'bottom':
      return { left: `${rect.left}px`, top: `${rect.bottom + MARGIN * 2}px` };
  }
}

export function Tutorial({ active, onClose, pinned, setPinned }: Props): ReactElement | null {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | undefined>(undefined);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const captionRef = useRef<HTMLDivElement>(null);
  const originalPinned = useRef<ReadonlySet<string> | undefined>(undefined);
  const step = TUTORIAL_STEPS[stepIndex];

  useLayoutEffect(() => {
    if (!active) return;
    setRect(measure(step?.target));
    const update = (): void => setRect(measure(step?.target));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    // Polls rather than hooking React Flow's viewport events — a spotlighted
    // node can move under pan/zoom, and this is the simplest way to follow
    // it without coupling the tour to the canvas's internals.
    const frame = step?.target === undefined ? undefined : window.setInterval(update, 100);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      if (frame !== undefined) window.clearInterval(frame);
    };
  }, [active, step?.target]);

  // A step that points inside a node needs it open; restores whatever was
  // pinned before the tour started once it closes, rather than leaving its
  // own pins behind.
  useLayoutEffect(() => {
    if (!active) return;
    if (originalPinned.current === undefined) originalPinned.current = pinned;
    const base = originalPinned.current;
    setPinned(() => new Set([...base, ...(step?.pinIds ?? [])]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  useLayoutEffect(() => {
    if (!active && originalPinned.current !== undefined) {
      setPinned(() => originalPinned.current ?? new Set());
      originalPinned.current = undefined;
    }
  }, [active, setPinned]);

  // Resets before measuring the new step's natural position, so a large
  // correction from a previous step doesn't linger into this one.
  useLayoutEffect(() => setOffset({ dx: 0, dy: 0 }), [stepIndex]);

  useLayoutEffect(() => {
    const el = captionRef.current;
    if (el === null) return;
    const box = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (box.left < MARGIN) dx = MARGIN - box.left;
    else if (box.right > window.innerWidth - MARGIN) dx = window.innerWidth - MARGIN - box.right;
    if (box.top < MARGIN) dy = MARGIN - box.top;
    else if (box.bottom > window.innerHeight - MARGIN) dy = window.innerHeight - MARGIN - box.bottom;
    if (dx !== offset.dx || dy !== offset.dy) setOffset({ dx, dy });
  });

  if (!active || step === undefined) return null;

  const close = (): void => {
    saveTutorialSeen(true);
    onClose();
    // So the next run (Help → Take the tour) starts over rather than
    // resuming wherever this one left off.
    setStepIndex(0);
  };
  const last = stepIndex === TUTORIAL_STEPS.length - 1;
  const advance = (): void => (last ? close() : setStepIndex((current) => current + 1));

  const base = preferredStyle(rect, step.placement);
  const nudge = offset.dx !== 0 || offset.dy !== 0 ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined;
  const style: CSSProperties = {
    ...base,
    transform: [base.transform, nudge].filter((value) => value !== undefined).join(' ') || undefined,
  };

  return (
    <>
      {rect === undefined ? (
        <div className="tutorial-backdrop" onClick={close} />
      ) : (
        <div
          className="tutorial-cutout"
          style={{
            top: rect.top - MARGIN,
            left: rect.left - MARGIN,
            width: rect.width + MARGIN * 2,
            height: rect.height + MARGIN * 2,
          }}
        />
      )}
      <div
        ref={captionRef}
        className="tutorial-caption"
        style={style}
        role="dialog"
        aria-label="Tutorial"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tutorial-progress">
          {stepIndex + 1} / {TUTORIAL_STEPS.length}
        </div>
        <div className="tutorial-actions">
          <button type="button" onClick={close}>
            Skip
          </button>
          {stepIndex > 0 ? (
            <button type="button" onClick={() => setStepIndex((current) => current - 1)}>
              Back
            </button>
          ) : null}
          <button type="button" onClick={advance}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
