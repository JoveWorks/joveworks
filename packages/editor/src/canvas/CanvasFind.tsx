import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react';

interface Props {
  readonly query: string;
  readonly matches: number;
  readonly onChange: (query: string) => void;
  readonly onClose: () => void;
}

export function CanvasFind({ query, matches, onChange, onClose }: Props): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') onClose();
    event.stopPropagation();
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>): void => onChange(event.target.value);

  return (
    <div className="canvas-find" role="search">
      <input
        className="search nodrag"
        autoFocus
        placeholder="find nodes by title, id, or port…"
        value={query}
        onChange={onInput}
        onKeyDown={onKeyDown}
      />
      <span className="canvas-find-count">{matches} match{matches === 1 ? '' : 'es'}</span>
      <button type="button" className="canvas-find-close" onClick={onClose} aria-label="Close find">
        ✕
      </button>
    </div>
  );
}
