/** Browser-local edit capabilities for Hub workspaces. They never travel in
 * the workspace id/share reference, but retaining them locally lets a student
 * continue saving after a reload on the device that created the workspace. */

const KEY = 'joveworks:workspace-access';

type Access = Readonly<Record<string, string>>;

export interface WorkspaceAccess {
  readonly hubUrl: string;
  readonly id: string;
}

function accessKey(hubUrl: string, id: string): string {
  return `${hubUrl}\n${id}`;
}

function read(): Access {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

export function loadWorkspaceEditToken(hubUrl: string, id: string): string | undefined {
  return read()[accessKey(hubUrl, id)];
}

export function saveWorkspaceEditToken(hubUrl: string, id: string, token: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [accessKey(hubUrl, id)]: token }));
  } catch {
    // Saving still succeeded remotely. The browser will ask the student to
    // create a copy after a reload if private storage is unavailable.
  }
}

export function removeWorkspaceEditToken(hubUrl: string, id: string): void {
  try {
    const current = read();
    const key = accessKey(hubUrl, id);
    if (!(key in current)) return;
    const { [key]: _removed, ...remaining } = current;
    window.localStorage.setItem(KEY, JSON.stringify(remaining));
  } catch {
    // Remote deletion has already completed; leaving a stale local entry is
    // harmless and the library reports it as unavailable.
  }
}

export function loadWorkspaceAccesses(): readonly WorkspaceAccess[] {
  return Object.keys(read()).flatMap((key) => {
    const separator = key.lastIndexOf('\n');
    if (separator <= 0 || separator === key.length - 1) return [];
    return [{ hubUrl: key.slice(0, separator), id: key.slice(separator + 1) }];
  });
}
