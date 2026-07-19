/**
 * Package table confirmation dialogs.
 */

/**
 * Confirm before Align/Sync. Optionally warns when sync would tighten a range to `==`.
 * @param {() => void} onSync
 * @param {Array<{ name?: string, specifiedVersion?: string }>|undefined} packages
 */
window.showSyncConfirmDialog = function (onSync, packages) {
  document.getElementById('sync-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const list = Array.isArray(packages) ? packages : [];
  const tightenCount = list.filter(p =>
    window.wouldTightenToExactPin?.(p?.specifiedVersion ?? '')
  ).length;
  const rangeWarning = tightenCount > 0
    ? `<div style="font-size:12px;color:var(--vscode-editorWarning-foreground,#d29922);margin-bottom:16px;line-height:1.5;padding:8px 10px;border-radius:6px;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.35);">
        ${t('sync.rangeTightenWarning').replace('{n}', String(tightenCount))}
      </div>`
    : '';

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
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.5;">
        ${t('sync.confirmMessage')}
      </div>
      ${rangeWarning}
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

/**
 * Confirms bulk removal of unused packages after AI review or manual selection.
 * Pre-selects high-confidence packages without config/script references.
 */
window.showUnusedRemoveConfirmDialog = function (candidates, onConfirm, options = {}) {
  document.getElementById('unused-remove-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const esc = window.esc || (s => s);
  const mode = options.mode || 'ai';
  const messageKey = mode === 'manual' ? 'unused.removeConfirmMessageManual' : 'unused.removeConfirmMessage';
  const dialog = document.createElement('div');
  dialog.id = 'unused-remove-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;

  const rowsHtml = (candidates || []).map((pkg, idx) => {
    const sourceShort = pkg.source ? String(pkg.source).split(/[\\/]/).pop() : '—';
    const refHint = pkg.hasReferenceHits ? ` · ${t('unused.removeHasRefs')}` : '';
    const checked = pkg.suggestedRemove ? 'checked' : '';
    return `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);cursor:pointer;">
        <input type="checkbox" class="unused-remove-chk" data-idx="${idx}" ${checked}
          style="margin-top:2px;accent-color:#7c3aed;">
        <span style="flex:1;font-size:12px;line-height:1.45;color:var(--vscode-foreground);">
          <strong>${esc(pkg.name)}</strong>
          <span style="color:var(--vscode-descriptionForeground);"> · ${esc(sourceShort)} · ${pkg.confidence}%${refHint}</span>
        </span>
      </label>
    `;
  }).join('');

  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:520px;width:92%;max-height:85vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('unused.removeConfirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.5;">
        ${t(messageKey)}
      </div>
      ${mode === 'manual' ? `
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.45;padding:8px 10px;border-radius:6px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);">
          ${t('unused.bulkUninstallHint')}
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <button type="button" id="unused-remove-select-all" style="
          background:transparent;color:var(--vscode-textLink-foreground);border:1px solid var(--vscode-panel-border);
          padding:5px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('unused.selectAll')}</button>
        <button type="button" id="unused-remove-deselect-all" style="
          background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);
          padding:5px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('unused.deselectAll')}</button>
      </div>
      <div style="max-height:280px;overflow-y:auto;margin-bottom:16px;padding-right:4px;">
        ${rowsHtml || `<div style="font-size:12px;color:var(--vscode-descriptionForeground);">${t('unused.removeNoCandidates')}</div>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="unused-remove-confirm" style="
          flex:1;min-width:140px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('unused.removeConfirmBtn')}</button>
        <button id="unused-remove-cancel" style="
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

  const setAllChecked = (checked) => {
    dialog.querySelectorAll('.unused-remove-chk').forEach(chk => {
      chk.checked = checked;
    });
  };

  document.getElementById('unused-remove-select-all')?.addEventListener('click', () => setAllChecked(true));
  document.getElementById('unused-remove-deselect-all')?.addEventListener('click', () => setAllChecked(false));

  document.getElementById('unused-remove-confirm')?.addEventListener('click', () => {
    const selected = [];
    dialog.querySelectorAll('.unused-remove-chk:checked').forEach(chk => {
      const idx = Number(chk.dataset.idx);
      const pkg = candidates[idx];
      if (pkg) {
        selected.push({ name: pkg.name, source: pkg.source || '' });
      }
    });
    if (!selected.length) return;
    close();
    onConfirm(selected);
  });

  document.getElementById('unused-remove-cancel')?.addEventListener('click', close);
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
