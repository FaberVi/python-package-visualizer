/**
 * Package table confirmation dialogs.
 */

window.showSyncConfirmDialog = function (onSync) {
  document.getElementById('sync-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const dialog = document.createElement('div');
  dialog.id = 'sync-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('sync.confirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;line-height:1.5;">
        ${t('sync.confirmMessage')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="sync-dialog-snapshot" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('sync.snapshotFirst')}</button>
        <button id="sync-dialog-direct" style="
          flex:1;min-width:120px;background:rgba(96,165,250,.15);color:#60a5fa;
          border:1px solid rgba(96,165,250,.3);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.justSync')}</button>
        <button id="sync-dialog-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown, true);

  const close = () => {
    dialog.remove();
    document.removeEventListener('keydown', onKeydown, true);
  };

  document.getElementById('sync-dialog-snapshot').addEventListener('click', () => {
    close();
    const snapName = `Pre-sync ${new Date().toLocaleString()}`;
    window.vscode.postMessage({ type: 'takeSnapshot', name: snapName });
    const onSnapshotDone = (event) => {
      if (event.data?.type === 'snapshots') {
        window.removeEventListener('message', onSnapshotDone);
        onSync();
      }
    };
    window.addEventListener('message', onSnapshotDone);
  });

  document.getElementById('sync-dialog-direct').addEventListener('click', () => {
    close();
    onSync();
  });

  document.getElementById('sync-dialog-cancel').addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};

window.showForceUpdateConfirmDialog = function (packageName, onConfirm) {
  document.getElementById('force-update-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const dialog = document.createElement('div');
  dialog.id = 'force-update-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('forceUpdate.confirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;line-height:1.5;">
        ${t('forceUpdate.confirmMessage').replace('{name}', window.esc(packageName))}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="force-update-confirm" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('btn.forceUpdate')}</button>
        <button id="force-update-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const close = () => dialog.remove();
  document.getElementById('force-update-confirm')?.addEventListener('click', () => {
    close();
    onConfirm();
  });
  document.getElementById('force-update-cancel')?.addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};

window.showVersionInstallConfirmDialog = function (packageName, version, onConfirm) {
  document.getElementById('version-install-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const dialog = document.createElement('div');
  dialog.id = 'version-install-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('versionInstall.confirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;line-height:1.5;">
        ${t('versionInstall.confirmMessage')
          .replace('{name}', window.esc(packageName))
          .replace('{version}', window.esc(version))}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="version-install-confirm" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('versionInstall.confirmBtn')}</button>
        <button id="version-install-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const close = () => dialog.remove();
  document.getElementById('version-install-confirm')?.addEventListener('click', () => {
    close();
    onConfirm();
  });
  document.getElementById('version-install-cancel')?.addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};
