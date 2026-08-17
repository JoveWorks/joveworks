import { parseExpression } from '@joveworks/kernel';

export interface UserEquation {
  readonly id: string;
  readonly label: string;
  readonly expression: string;
}

interface UserEquationFile {
  readonly schemaVersion: 1;
  readonly kind: 'joveworks-user-equations';
  readonly equations: readonly UserEquation[];
}

const STORAGE_KEY = 'joveworks:user-equations';

function parseEquation(value: unknown, path: string): UserEquation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of ['id', 'label', 'expression'] as const) {
    if (typeof record[key] !== 'string' || record[key].trim().length === 0) {
      throw new Error(`${path}.${key} must be a non-empty string`);
    }
  }
  parseExpression(record.expression as string);
  return { id: record.id as string, label: record.label as string, expression: record.expression as string };
}

export function parseUserEquations(text: string): readonly UserEquation[] {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('file must be an object');
  const file = value as Record<string, unknown>;
  if (file.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (file.kind !== 'joveworks-user-equations') throw new Error("kind must be 'joveworks-user-equations'");
  if (!Array.isArray(file.equations)) throw new Error('equations must be an array');
  const equations = file.equations.map((entry, index) => parseEquation(entry, `equations[${index}]`));
  if (new Set(equations.map(({ id }) => id)).size !== equations.length) throw new Error('equation ids must be unique');
  return equations;
}

export function saveUserEquations(equations: readonly UserEquation[]): string {
  const file: UserEquationFile = { schemaVersion: 1, kind: 'joveworks-user-equations', equations };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function loadStoredUserEquations(): readonly UserEquation[] {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text === null ? [] : parseUserEquations(text);
  } catch {
    return [];
  }
}

export function storeUserEquations(equations: readonly UserEquation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, saveUserEquations(equations));
  } catch {
    // A blocked/full store leaves the in-memory library usable for this session.
  }
}

export function equationId(label: string, equations: readonly UserEquation[]): string {
  const stem = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'equation';
  let id = stem;
  let suffix = 2;
  const used = new Set(equations.map((equation) => equation.id));
  while (used.has(id)) id = `${stem}-${suffix++}`;
  return id;
}
