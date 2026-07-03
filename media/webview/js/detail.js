/**
 * Package Detail Panel Renderer for Python Package Visualizer.
 * Provides rendering of specific package metadata, conflicts, vulnerabilities,
 * alternatives, and rollback version selections.
 * 
 * WHY: This module is extracted from the monolithic main.js to respect SOLID
 * Single Responsibility principles, making it easy to maintain package details
 * layout independently of main process coordination. It queries DOM elements
 * dynamically to avoid tight variable coupling with other files.
 */

/**
 * Compiles and displays a comprehensive sliding side-panel containing details
 * about the selected package including vulnerabilities, dependencies, and alternative recommendations.
 * 
 * @param {object} pkg - The package data object to render.
 */
window.showDetail = function (pkg) {
  const elDetail = document.getElementById('detail-panel');
  const elDetailName = document.getElementById('detail-name');
  const elDetailBody = document.getElementById('detail-body');
  const elOverlay = document.getElementById('overlay');

  if (!elDetail || !elDetailName || !elDetailBody || !elOverlay) {
    console.error('Detail panel elements missing in the DOM.');
    return;
  }

  const normName = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
  elDetailName.textContent = pkg.name;

  // Retrieve global translation and utility helpers
  const esc = window.esc || (s => String(s ?? ''));
  const formatReleaseDate = window.formatReleaseDate || (d => d);
  const statusBadge = window.statusBadge || (s => s);
  const conflictsByPkg = window.conflictsByPkg || new Map();
  const vscode = window.vscode;

  const history = pkg.allVersions || [];
  const versionChips = history.slice(0, 20).map(v =>
    `<span class="version-chip" data-version="${esc(v)}" data-pkg="${esc(pkg.name)}" title="${window.t ? window.t('detail.availableVersions') : 'Install'} ${esc(v)}">${esc(v)}</span>`
  ).join('');

  const pkgConflicts = conflictsByPkg.get(normName) || [];
  const conflictsHtml = pkgConflicts.length > 0 ? `
    <div class="field">
      <label style="color:#f97316">&#x26A1; ${window.t ? window.t('detail.conflicts') : 'Dependency Conflicts'} (${pkgConflicts.length})</label>
      ${pkgConflicts.map(c => `<div class="vuln-card">
        <div class="vuln-id">${esc(c.package)} ${esc(c.version)} requires <code>${esc(c.requirement)}</code></div>
        <div class="vuln-desc">${
          c.conflictingVersion === 'not installed'
            ? `<strong>${esc(c.conflictingPackage)}</strong> is not installed`
            : `But <strong>${esc(c.conflictingPackage)} ${esc(c.conflictingVersion)}</strong> is installed`
        }</div>
      </div>`).join('')}
    </div>
  ` : '';

  const vulns = pkg.vulnerabilities && pkg.vulnerabilities.length > 0 ? pkg.vulnerabilities : [];
  const vulnHtml = vulns.length > 0 ? `
    <div class="field">
      <label style="color:var(--c-vuln)">&#x1F534; ${window.t ? window.t('stats.vulnerable') : 'Security Vulnerabilities'} (${vulns.length})</label>
      ${vulns.map(v => {
        const cveIds = v.aliases && v.aliases.length > 0 ? v.aliases.join(', ') : '';
        const fixedIn = v.fixed_in && v.fixed_in.length > 0
          ? `Fixed in: ${v.fixed_in.join(', ')}`
          : 'No fix version listed';
        return `<div class="vuln-card">
          <div class="vuln-id">${esc(v.id)}${cveIds ? ` <span style="font-weight:400;opacity:.8">(${esc(cveIds)})</span>` : ''}</div>
          ${v.details ? `<div class="vuln-desc">${esc(v.details.slice(0, 240))}${v.details.length > 240 ? '…' : ''}</div>` : ''}
          <div class="vuln-fix">&#x1F4CC; ${esc(fixedIn)}</div>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  ` : '';

  const releaseDateHtml = pkg.releaseDate
    ? `<div class="field"><label>${window.t ? window.t('detail.released') : 'Released'}</label><div class="field-value">${esc(formatReleaseDate(pkg.releaseDate))}</div></div>`
    : '';

  // Freshness indicator based on release age
  let freshnessHtml = '';
  if (pkg.releaseDate) {
    const ageMs = Date.now() - new Date(pkg.releaseDate).getTime();
    const months = Math.floor(ageMs / (30.44 * 24 * 60 * 60 * 1000));
    let fColor, fLabel, fIcon;
    if (months <= 6) {
      fColor = '#4ade80'; fLabel = window.t ? window.t('detail.freshRecent') : 'Actively maintained'; fIcon = '🟢';
    } else if (months <= 12) {
      fColor = '#facc15'; fLabel = (window.t ? window.t('detail.monthsAgo') : '{n} months ago').replace('{n}', months); fIcon = '🟡';
    } else if (months <= 24) {
      fColor = '#fb923c'; fLabel = window.t ? window.t('detail.staleWarning') : 'May be unmaintained'; fIcon = '🟠';
    } else {
      fColor = '#f87171'; fLabel = window.t ? window.t('detail.abandonedWarning') : 'May be abandoned'; fIcon = '🔴';
    }
    const monthsLabel = (window.t ? window.t('detail.monthsAgo') : '{n} months ago').replace('{n}', months);
    freshnessHtml = `<div class="field">
      <label>${window.t ? window.t('detail.freshness') : 'Freshness'}</label>
      <div class="field-value" style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;">${fIcon}</span>
        <span style="font-weight:600;color:${fColor};font-size:12px;">${esc(monthsLabel)}</span>
        <span style="font-size:11px;color:var(--vscode-descriptionForeground);">— ${esc(fLabel)}</span>
      </div>
    </div>`;
  }

  const isConflictBlocked = pkg.status === 'conflict-blocked' || pkg.updateBlockedByConflict;
  const conflictActionsHtml = isConflictBlocked ? (() => {
    const parts = [];
    if (pkg.previousVersion) {
      parts.push(`<button class="action-btn detail-rollback-btn" data-name="${esc(pkg.name)}" data-version="${esc(pkg.previousVersion)}">${window.t ? window.t('btn.revertPrevious') : '↩ Revert'}</button>`);
    }
    if (pkg.latestVersion && pkg.latestVersion !== 'unknown') {
      parts.push(`<button class="action-btn detail-force-update-btn" data-name="${esc(pkg.name)}">${window.t ? window.t('btn.forceUpdate') : '⬆ Force update'}</button>`);
    }
    if (!parts.length) return '';
    return `<div class="field">
      <label style="color:#f97316">&#x26A1; ${window.t ? window.t('conflicts.blockedHint') : 'Updates blocked while conflicts exist'}</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">${parts.join('')}</div>
    </div>`;
  })() : '';

  const pypiLinkHtml = `<div class="field"><label>${window.t ? window.t('detail.pypiPage') : 'PyPI Page'}</label><div class="field-value"><span style="cursor:pointer;color:var(--vscode-textLink-foreground)" class="detail-pypi-link" data-name="${esc(pkg.name)}">${esc(pkg.name)} &#x2197;</span></div></div>`;

  const metaGridHtml = `
    <div class="detail-meta-grid">
      <div class="detail-meta-item">
        <div class="detail-meta-label">${window.t ? window.t('detail.license') : 'License'}</div>
        <div class="detail-meta-value">${esc(pkg.license || '—')}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">${window.t ? window.t('detail.pythonRequires') : 'Python Requires'}</div>
        <div class="detail-meta-value">${esc(pkg.pythonRequires || '—')}</div>
      </div>
      <div class="detail-meta-item" style="grid-column:1/-1">
        <div class="detail-meta-label">${window.t ? window.t('detail.weeklyDownloads') : 'Weekly Downloads'}</div>
        <div class="detail-meta-value">${pkg.weeklyDownloads > 0 ? pkg.weeklyDownloads.toLocaleString() : '—'}</div>
      </div>
    </div>
  `;

  const alternativesHtml = (pkg.alternatives && pkg.alternatives.length > 0) ? `
    <div class="field">
      <label>${window.t ? window.t('detail.alternatives') : 'Alternatives'}</label>
      <div style="margin-top:6px;">
        ${pkg.alternatives.map(a => `
          <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:6px;padding:10px 12px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <strong style="color:var(--vscode-textLink-foreground);font-size:12px;">${esc(a.name)}</strong>
              ${a.url ? `<span class="alt-link" data-url="${esc(a.url)}" style="font-size:10px;color:var(--vscode-textLink-foreground);cursor:pointer;text-decoration:underline;">&#x2197; Learn more</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;">${esc(a.reason)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  elDetailBody.innerHTML = `
    <div class="field"><label>${window.t ? window.t('detail.status') : 'Status'}</label><div class="field-value">${statusBadge(pkg.status)}</div></div>
    ${pkg.summary ? `<div class="field"><label>${window.t ? window.t('detail.summary') : 'Summary'}</label><div class="field-value" style="color:var(--vscode-descriptionForeground)">${esc(pkg.summary)}</div></div>` : ''}
    ${metaGridHtml}
    <div class="field"><label>${window.t ? window.t('detail.installed') : 'Installed version'}</label><div class="field-value ver">${esc(pkg.installedVersion || 'Not installed')}</div></div>
    <div class="field"><label>${window.t ? window.t('detail.latest') : 'Latest version'}</label><div class="field-value ver">${esc(pkg.latestVersion || '—')}</div></div>
    ${releaseDateHtml}
    ${freshnessHtml}
    <div class="field"><label>${window.t ? window.t('detail.pinnedInFile') : 'Pinned in file'}</label><div class="field-value">${esc(pkg.specifiedVersion || 'any')}</div></div>
    <div class="field"><label>${window.t ? window.t('detail.sourceFile') : 'Source file'}</label><div class="field-value">${esc(pkg.source || '—')}</div></div>
    ${pypiLinkHtml}
    ${pkg.requires && pkg.requires.length ? `<div class="field"><label>${window.t ? window.t('detail.requires') : 'Requires'} (${pkg.requires.length})</label><div class="field-value" style="color:var(--vscode-descriptionForeground);line-height:1.7">${pkg.requires.map(r => `<code>${esc(r)}</code>`).join(' ')}</div></div>` : ''}
    ${conflictsHtml}
    ${conflictActionsHtml}
    ${vulnHtml}
    ${alternativesHtml}
    ${history.length ? `<div class="field"><label>${window.t ? window.t('detail.availableVersions') : 'Available versions'}</label><div style="margin-top:6px;line-height:1.8">${versionChips}</div></div>` : ''}
  `;

  // Alternative learn-more links
  elDetailBody.querySelectorAll('.alt-link').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.url;
      if (url && vscode) vscode.postMessage({ type: 'openUrl', url });
    });
  });

  // PyPI link in detail panel
  elDetailBody.querySelectorAll('.detail-pypi-link').forEach(el => {
    el.addEventListener('click', () => {
      if (vscode) vscode.postMessage({ type: 'openUrl', url: 'https://pypi.org/project/' + el.dataset.name });
    });
  });

  // Install a specific version on chip click
  elDetailBody.querySelectorAll('.version-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (vscode) {
        vscode.postMessage({
          type: 'rollbackPackage',
          name: chip.dataset.pkg,
          version: chip.dataset.version,
        });
      }
      elDetail.style.display = 'none';
      elOverlay.style.display = 'none';
    });
  });

  elDetailBody.querySelectorAll('.detail-rollback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (vscode && btn.dataset.name && btn.dataset.version) {
        btn.disabled = true;
        vscode.postMessage({
          type: 'rollbackPackage',
          name: btn.dataset.name,
          version: btn.dataset.version,
        });
      }
      elDetail.style.display = 'none';
      elOverlay.style.display = 'none';
    });
  });

  elDetailBody.querySelectorAll('.detail-force-update-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      if (!name) return;
      window.showForceUpdateConfirmDialog?.(name, () => {
        btn.disabled = true;
        if (vscode) vscode.postMessage({ type: 'forceUpdatePackage', name });
        elDetail.style.display = 'none';
        elOverlay.style.display = 'none';
      });
    });
  });

  elDetail.style.display = 'block';
  elOverlay.style.display = 'block';
};
