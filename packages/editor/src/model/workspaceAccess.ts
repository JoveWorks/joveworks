/** Browser-local edit capabilities for Hub workspaces. They never travel in
 * the workspace id/share reference, but retaining them locally lets a student
 * continue saving after a reload on the device that created the workspace. */

const KEY = 'joveworks:workspace-access';

type Access = Readonly<Record<string, string>>;

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
