/** A node/frame title which keeps raw document text while typesetting its display. */

import katex from 'katex';
import { useState, type ReactElement, type ReactNode } from 'react';

import { useSettings } from '../settings-context';
import { TextField } from './fields';

interface Props {
  readonly value: string;
  readonly onCommit: (text: string) => void;
  /** Frames have room for titles to wrap; compact node titles deliberately do not. */
  readonly multiline?: boolean;
}

// Deliberately conservative: prose is not LaTeX. Only tokens carrying an
// unmistakable TeX marker are offered to KaTeX; all other text remains text.
const MATH_TOKEN = /(?:\\[A-Za-z]+|[_^](?:[A-Za-z0-9]|\{[^{}]+\})|\b[A-Za-z]['′](?![A-Za-z]))/;
const TOKEN_OR_SPACE = /(\s+)/;

export function typesetTitle(title: string): readonly ReactNode[] | undefined {
  if (!MATH_TOKEN.test(title)) return undefined;

  let renderedAny = false;
  const rendered = title.split(TOKEN_OR_SPACE).map((part, index) => {
    if (part === '' || /^\s+$/.test(part) || !MATH_TOKEN.test(part)) return part;
    try {
      const html = katex.renderToString(part, { throwOnError: true, displayMode: false });
      renderedAny = true;
      return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      // A title is user text, not a formula contract. Invalid TeX is shown
      // verbatim so it remains readable and editable.
      return part;
    }
  });
  return renderedAny ? rendered : undefined;
}

/** Read-only counterpart to TitleField, used wherever a stored title is displayed. */
export function TitleText({ value }: { readonly value: string }): ReactElement {
  const { titleMathRendering } = useSettings();
  const typeset = titleMathRendering ? typesetTitle(value) : undefined;
  return <>{typeset ?? value}</>;
}

export function TitleField({ value, onCommit, multiline = false }: Props): ReactElement {
  const { titleMathRendering } = useSettings();
  const [editing, setEditing] = useState(false);
  const typeset = titleMathRendering ? typesetTitle(value) : undefined;

  if (editing || typeset === undefined) {
    return (
      <TextField
        className="title"
        value={value}
        onCommit={onCommit}
        onBlur={() => setEditing(false)}
        autoFocus={editing}
        multiline={multiline}
      />
    );
  }

  return (
    <span
      className="title title-math"
      role="textbox"
      tabIndex={0}
      aria-label={value}
      title="Click to edit the raw title"
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') setEditing(true);
        event.stopPropagation();
      }}
    >
      {typeset}
    </span>
  );
}
