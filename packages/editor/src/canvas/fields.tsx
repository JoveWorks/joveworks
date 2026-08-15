/**
 * The small editable fields nodes are made of (S47).
 *
 * There is no inspector panel to put these in — values, units and ranges are
 * edited where they are read, because a canvas that showed a diagram while the
 * real work happened beside it would stop being the calculation (S46).
 *
 * Both fields below commit on blur and on Enter, and hold their text while it is
 * being typed. That matters more than it looks: the document stores a parsed
 * quantity, and re-parsing on every keystroke would delete the unit the moment
 * someone typed a space after the number.
 */

import { useEffect, useState, type ReactElement } from 'react';

import { messageOf } from '../model/quantity';

interface TextFieldProps {
  readonly value: string;
  readonly onCommit: (text: string) => void;
  readonly placeholder?: string;
  readonly title?: string;
  readonly className?: string;
}

/**
 * A field whose commit may be refused: the parse error is shown in place and the
 * text is kept, so a mistyped unit is corrected rather than lost.
 */
export function TextField({
  value,
  onCommit,
  placeholder,
  title,
  className,
}: TextFieldProps): ReactElement {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | undefined>(undefined);

  // The document is the source of truth: an edit from anywhere else — loading a
  // file, opening a sample — replaces what is in the field.
  useEffect(() => {
    setText(value);
    setError(undefined);
  }, [value]);

  const commit = (): void => {
    if (text === value) return;
    try {
      onCommit(text);
      setError(undefined);
    } catch (problem) {
      setError(messageOf(problem));
    }
  };

  return (
    <span className="field">
      <input
        className={className}
        value={text}
        placeholder={placeholder}
        title={error ?? title}
        aria-invalid={error !== undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setText(value);
            setError(undefined);
            event.currentTarget.blur();
          }
          // React Flow deletes the selected node on Backspace; inside a field
          // that key belongs to the text.
          event.stopPropagation();
        }}
      />
      {error === undefined ? null : <span className="field-error">{error}</span>}
    </span>
  );
}

interface NumberFieldProps {
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly title?: string;
  readonly integer?: boolean;
  readonly minimum?: number;
}

export function NumberField({
  value,
  onCommit,
  title,
  integer = false,
  minimum,
}: NumberFieldProps): ReactElement {
  return (
    <TextField
      className="number"
      value={String(value)}
      {...(title === undefined ? {} : { title })}
      onCommit={(text) => {
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) throw new Error(`${text} is not a number`);
        if (integer && !Number.isInteger(parsed)) throw new Error('a whole number is needed here');
        if (minimum !== undefined && parsed < minimum) {
          throw new Error(`needs to be at least ${minimum}`);
        }
        onCommit(parsed);
      }}
    />
  );
}
