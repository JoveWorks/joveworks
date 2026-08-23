/**
 * The small editable fields nodes are made of.
 *
 * There is no inspector panel to put these in — values, units and ranges are
 * edited where they are read, because a canvas that showed a diagram while the
 * real work happened beside it would stop being the calculation.
 *
 * Both fields below commit on blur and on Enter, and hold their text while it is
 * being typed. That matters more than it looks: the document stores a parsed
 * quantity, and re-parsing on every keystroke would delete the unit the moment
 * someone typed a space after the number.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

import {
  PLAIN_NUMBER_FORMAT,
  formatPlainNumber,
  stripNumberFormatting,
  type NumberFormat,
} from '@joveworks/units';

import { messageOf } from '../model/quantity';

interface TextFieldProps {
  readonly value: string;
  readonly onCommit: (text: string) => void;
  readonly placeholder?: string;
  readonly title?: string;
  readonly className?: string;
  /**
   * Grows and shrinks the field to what is actually typed, via the `size`
   * attribute rather than CSS — `field-sizing: content` does the same thing
   * in browsers that support it, but a fixed CSS width as its fallback does
   * not resize at all, which is what let a longer number overflow its box.
   * `size` is universally supported and needs no fallback of its own.
   */
  readonly autoSize?: number;
  /**
   * A wire is supplying the value instead — the field shows it but refuses
   * the edit, rather than staying editable with a tooltip explaining it is
   * overridden (the choice `CompareNodeView`'s threshold made). Unplugging
   * the wire is what makes the field editable again.
   */
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  /** Mirrors each keystroke for fields whose document state saves live. */
  readonly onChange?: (text: string) => void;
  readonly onBlur?: () => void;
  /** A content-height textarea, for fields such as canvas frame titles. */
  readonly multiline?: boolean;
  /**
   * Selects the whole value when the field gains focus, so typing a
   * replacement doesn't need a backspace first. For values (numbers, digit
   * counts) where a click almost always means "replace this" — not for
   * prose, titles, or labels, where a click means "place my cursor here".
   */
  readonly selectOnFocus?: boolean;
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
  autoSize,
  disabled,
  autoFocus,
  onChange,
  onBlur,
  multiline = false,
  selectOnFocus = false,
}: TextFieldProps): ReactElement {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // The document is the source of truth: an edit from anywhere else — loading a
  // file, opening a sample — replaces what is in the field.
  useEffect(() => {
    setText(value);
    setError(undefined);
  }, [value]);

  useLayoutEffect(() => {
    if (!multiline || textarea.current === null) return;
    const element = textarea.current;
    const resize = (): void => {
      element.style.height = '0px';
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();

    // A column resize (e.g. a sibling taking more of the row) can change how
    // many lines the same text wraps to, and the height set above must
    // follow it — not just re-measure when the text itself changes.
    if (typeof ResizeObserver === 'undefined') return;
    let lastWidth = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === lastWidth) return;
      lastWidth = element.offsetWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [multiline, text]);

  const commit = (): void => {
    if (text === value) return;
    try {
      onCommit(text);
      setError(undefined);
    } catch (problem) {
      setError(messageOf(problem));
    }
  };

  const interactiveClassName = className === undefined ? 'nodrag' : `${className} nodrag`;

  return (
    <span className="field">
      {multiline ? (
        <textarea
          ref={textarea}
          className={interactiveClassName}
          value={text}
          placeholder={placeholder}
          title={error ?? title}
          aria-invalid={error !== undefined}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={1}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            onChange?.(next);
          }}
          onBlur={() => {
            commit();
            onBlur?.();
          }}
          onFocus={selectOnFocus ? (event) => event.currentTarget.select() : undefined}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            // Enter finalizes, matching the single-line field below —
            // Shift+Enter remains for a deliberate line break.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setText(value);
              setError(undefined);
              event.currentTarget.blur();
            }
            event.stopPropagation();
          }}
        />
      ) : (
        <input
          className={interactiveClassName}
          value={text}
          placeholder={placeholder}
          title={error ?? title}
          aria-invalid={error !== undefined}
          disabled={disabled}
          {...(autoSize === undefined ? {} : { size: Math.max(autoSize, text.length, 1) })}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            onChange?.(next);
          }}
          autoFocus={autoFocus}
          onBlur={() => {
            commit();
            onBlur?.();
          }}
          onFocus={selectOnFocus ? (event) => event.currentTarget.select() : undefined}
          onPointerDown={(event) => event.stopPropagation()}
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
      )}
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
  readonly autoSize?: number;
  readonly className?: string;
  /** The global number-format preference (`useSettings().numberFormat`); plain punctuation if omitted. */
  readonly format?: NumberFormat;
}

export function NumberField({
  value,
  onCommit,
  title,
  integer = false,
  minimum,
  autoSize,
  className,
  format = PLAIN_NUMBER_FORMAT,
}: NumberFieldProps): ReactElement {
  return (
    <TextField
      className={className === undefined ? 'number' : `number ${className}`}
      value={formatPlainNumber(value, format)}
      selectOnFocus
      {...(title === undefined ? {} : { title })}
      {...(autoSize === undefined ? {} : { autoSize })}
      onCommit={(text) => {
        const parsed = Number(stripNumberFormatting(text, format));
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
