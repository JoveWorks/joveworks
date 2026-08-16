/**
 * The first-load walkthrough: a spotlight over one real UI element at a
 * time, plus a caption. Self-contained — the only state it needs is which
 * step it's on, so it stays decoupled from `AppShell`'s state the way
 * `SettingsDialog` is.
 *
 * A step's target can be off-screen, unmounted (the notebook panel closed,
 * no input node open) or moving under React Flow's pan/zoom. Rather than
 * chase that, a target that can't be measured just means no spotlight for
 * that step — the caption still shows, centered, and the tour keeps going.
 */

import { useEffect, useState, type ReactElement } from 'react';

import { TUTORIAL_STEPS } from './steps';
import { saveTutorialSeen } from './tutorialSettings';

interface Props {
  readonly active: boolean;
  readonly onClose: () => void;
}

const MARGIN = 12;

function measure(target: string | undefined): DOMRect | undefined {
  if (target === undefined) return undefined;
  return document.querySelector(target)?.getBoundingClientRect();
}

export function Tutorial({ active, onClose }: Props): ReactElement | null {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | undefined>(undefined);
  const step = TUTORIAL_STEPS[stepIndex];

  useEffect(() => {
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

  if (!active || step === undefined) return null;

  const close = (): void => {
    saveTutorialSeen(true);
    onClose();
  };
  const last = stepIndex === TUTORIAL_STEPS.length - 1;
  const advance = (): void => (last ? close() : setStepIndex((current) => current + 1));

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
        className={`tutorial-caption placement-${rect === undefined ? 'center' : step.placement}`}
        style={
          rect === undefined
            ? undefined
            : captionStyle(rect, step.placement)
        }
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

function captionStyle(
  rect: DOMRect,
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center',
): { top?: string; left?: string; right?: string; bottom?: string; transform?: string } {
  switch (placement) {
    case 'right':
      return { top: `${rect.top}px`, left: `${rect.right + MARGIN * 2}px` };
    case 'left':
      return { top: `${rect.top}px`, right: `${window.innerWidth - rect.left + MARGIN * 2}px` };
    case 'top':
      return {
        left: `${rect.left}px`,
        bottom: `${window.innerHeight - rect.top + MARGIN * 2}px`,
      };
    case 'bottom':
      return { left: `${rect.left}px`, top: `${rect.bottom + MARGIN * 2}px` };
    case 'center':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}
