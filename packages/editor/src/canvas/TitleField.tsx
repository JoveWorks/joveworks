/** A node/frame title which keeps raw document text while typesetting its display. */

import katex from 'katex';
import { useState, type ReactElement, type ReactNode } from 'react';

import { useSettings } from '../settings-context';
import { phrase } from '../i18n';
import { TextField } from './fields';

interface Props {
  readonly value: string;
  readonly onCommit: (text: string) => void;
  /** Optional live counterpart to `onCommit`, for document text fields. */
  readonly onChange?: (text: string) => void;
  readonly onBlur?: () => void;
  /** Frames have room for titles to wrap; compact node titles deliberately do not. */
  readonly multiline?: boolean;
}

// Deliberately conservative: prose is not LaTeX. Only tokens carrying an
// unmistakable TeX marker are offered to KaTeX; all other text remains text.
const MATH_TOKEN = /(?:\\[A-Za-z]+|[_^](?:[A-Za-z0-9]|\{[^{}]+\})|\b[A-Za-z]['′](?![A-Za-z]))/;
const TOKEN_OR_SPACE = /(\s+)/;

function typesetPart(part: string): string | undefined {
  if (!MATH_TOKEN.test(part)) return undefined;
  try {
    return katex.renderToString(part, { throwOnError: true, displayMode: false });
  } catch {
    return undefined;
  }
}

export function typesetTitle(title: string): readonly ReactNode[] | undefined {
  if (!MATH_TOKEN.test(title)) return undefined;

  let renderedAny = false;
  const rendered = title.split(TOKEN_OR_SPACE).map((part, index) => {
    const html = typesetPart(part);
    if (html !== undefined) {
      renderedAny = true;
      return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    // A title is user text, not a formula contract. Invalid TeX is shown
    // verbatim so it remains readable and editable.
    return part;
  });
  return renderedAny ? rendered : undefined;
}

/** KaTeX fragment for an SVG/HTML label, or no fragment when it is plain text. */
export function typesetTitleHtml(title: string): string | undefined {
  if (!MATH_TOKEN.test(title)) return undefined;
  let renderedAny = false;
  const html = title.split(TOKEN_OR_SPACE).map((part) => {
    const rendered = typesetPart(part);
    if (rendered !== undefined) {
      renderedAny = true;
      return rendered;
    }
    return part.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  });
  return renderedAny ? html.join('') : undefined;
}

/** Read-only counterpart to TitleField, used wherever a stored title is displayed. */
export function TitleText({ value }: { readonly value: string }): ReactElement {
  const { titleMathRendering } = useSettings();
  const typeset = titleMathRendering ? typesetTitle(value) : undefined;
  return <>{typeset ?? value}</>;
}

export function TitleField({ value, onCommit, onChange, onBlur, multiline = false }: Props): ReactElement {
  const { titleMathRendering, locale } = useSettings();
  const [editing, setEditing] = useState(false);
  const typeset = titleMathRendering ? typesetTitle(value) : undefined;

  if (editing || typeset === undefined) {
    return (
      <TextField
        className="title"
        value={value}
        onCommit={onCommit}
        {...(onChange === undefined ? {} : { onChange })}
        onBlur={() => {
          setEditing(false);
          onBlur?.();
        }}
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
      title={phrase(locale, 'Click to edit the raw title')}
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
