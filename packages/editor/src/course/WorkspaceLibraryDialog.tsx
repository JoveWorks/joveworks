import { useEffect, useState, type ReactElement } from 'react';

import { phrase } from '../i18n';
import { createWorkspaceShare, loadWorkspace, type HubWorkspace } from '../model/hub';
import { loadWorkspaceEditToken, type WorkspaceAccess } from '../model/workspaceAccess';
import { useSettings } from '../settings-context';

interface Row {
  readonly access: WorkspaceAccess;
  readonly workspace?: HubWorkspace;
  readonly error?: string;
}

interface Props {
  readonly accesses: readonly WorkspaceAccess[];
  readonly onOpen: (workspace: HubWorkspace) => void;
  readonly onDelete: (workspace: HubWorkspace) => Promise<void>;
  readonly onClose: () => void;
}

/** Lists the workspaces this browser can manage. The Hub deliberately has no
 * global workspace index: an id is a read capability, not a classroom roster. */
export function WorkspaceLibraryDialog({ accesses, onOpen, onDelete, onClose }: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [deleting, setDeleting] = useState<string | undefined>();
  const share = async (workspace: HubWorkspace): Promise<void> => {
    const token = loadWorkspaceEditToken(workspace.hubUrl, workspace.id);
    if (token === undefined) throw new Error('This browser does not own this workspace.');
    const link = await createWorkspaceShare(workspace, token);
    try { await navigator.clipboard.writeText(link); } catch { window.prompt(t('Copy this student share link'), link); }
  };

  useEffect(() => {
    let active = true;
    void Promise.all(accesses.map(async (access): Promise<Row> => {
      try {
        const token = loadWorkspaceEditToken(access.hubUrl, access.id);
        if (token === undefined) throw new Error('This browser does not own this workspace.');
        return { access, workspace: await loadWorkspace(access.hubUrl, access.id, token) };
      } catch (reason) {
        return { access, error: reason instanceof Error ? reason.message : phrase(locale, 'Could not load this workspace.') };
      }
    })).then((next) => {
      if (active) setRows(next);
    });
    return () => { active = false; };
  }, [accesses, locale]);

  const remove = (row: Row): void => {
    if (row.workspace === undefined || deleting !== undefined) return;
    if (!window.confirm(t(`Delete “${row.workspace.title}”? This cannot be undone.`))) return;
    setDeleting(row.workspace.id);
    onDelete(row.workspace)
      .then(() => setRows((current) => current.filter((candidate) => candidate.access !== row.access)))
      .catch((reason: unknown) => setRows((current) => current.map((candidate) => candidate.access !== row.access
        ? candidate
        : { ...candidate, error: reason instanceof Error ? reason.message : t('Could not delete this workspace.') })))
      .finally(() => setDeleting(undefined));
  };

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div className="dialog workspace-library-dialog" role="dialog" aria-label={t('Hub workspaces')}>
        <h2>{t('Hub workspaces')}</h2>
        <p className="dialog-note">{t('Workspaces this browser created. Open a shared workspace separately by its ID.')}</p>
        {rows.length === 0
          ? <p className="dialog-message">{accesses.length === 0 ? t('No Hub workspaces saved from this browser.') : t('Loading workspaces…')}</p>
          : <div className="workspace-library-list">
            {rows.map((row) => (
              <div className="workspace-library-row" key={`${row.access.hubUrl}\n${row.access.id}`}>
                {row.workspace === undefined ? <p className="dialog-message course-error">{row.access.id}: {row.error ?? t('Loading…')}</p> : <>
                  <div className="workspace-library-meta">
                    <strong>{row.workspace.title}</strong>
                    <small>{row.workspace.id} · {row.workspace.updatedAt ?? t('unknown date')}</small>
                  </div>
                  <div className="workspace-library-actions">
                    <button type="button" onClick={() => onOpen(row.workspace!)}>{t('Open')}</button>
                    <button type="button" onClick={() => void share(row.workspace!).catch((error) => window.alert(error instanceof Error ? error.message : t('Could not share this workspace.')))}>{t('Share')}</button>
                    <button type="button" className="danger" disabled={deleting !== undefined} onClick={() => remove(row)}>{deleting === row.workspace.id ? t('Deleting…') : t('Delete')}</button>
                  </div>
                </>}
              </div>
            ))}
          </div>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </>
  );
}
