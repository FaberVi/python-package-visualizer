/**
 * Virtual Environment Health Check Tab Renderer.
 * Displays diagnostic information about the Python environment including
 * Python version, pip status, venv type, duplicate packages, and conflict count.
 */

/**
 * Renders the Environment Health Check panel.
 * Shows status cards for key environment metrics and diagnostic tables.
 *
 * @returns {void}
 */
window.renderVenvHealth = function () {
  const el = document.getElementById('view-venv-health');
  if (!el) return;

  const report = window.venvHealthReport;
  const availableProjects = window.venvAvailableProjects || [];
  const activeProject = window.venvActiveProject || null;
  const showProjectSelector = availableProjects.length > 1;

  // Show loading state if no report yet
  if (!report) {
    el.innerHTML = `<div style="max-width:900px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('venv.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('venv.subtitle')}</div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;">
        <div class="loader" style="margin:0 auto;"></div>
        <div style="font-size:13px;color:var(--vscode-descriptionForeground);">${window.t('venv.loading')}</div>
      </div>
    </div>`;
    // Request health data only when not waiting for a project switch response
    if (!window.venvHealthPending) {
      window.vscode.postMessage({ type: 'requestVenvHealth' });
    }
    return;
  }

  /**
   * Determines the health indicator color and icon based on value.
   * @param {boolean} isGood - Whether the status is healthy.
   * @returns {{ color: string, bg: string, border: string }}
   */
  function healthColor(isGood) {
    return isGood
      ? { color: '#4ade80', bg: 'rgba(74,222,128,.12)', border: 'rgba(74,222,128,.35)' }
      : { color: '#fb923c', bg: 'rgba(251,146,60,.12)', border: 'rgba(251,146,60,.35)' };
  }

  const venvTypeLabels = {
    'venv': 'Python venv',
    'virtualenv': 'virtualenv',
    'conda': 'Conda',
    'system': window.t('venv.systemPython'),
    'unknown': 'Unknown',
  };

  // WHY: Use window.allConflicts (populated by the Conflicts tab) as the single
  // source of truth for conflict count, ensuring both views always agree.
  const reportConflictCount = (window.allConflicts || []).length;

  const isHealthy = report.isVenvActive && report.pipUpToDate &&
    report.duplicatePackages.length === 0 && reportConflictCount === 0;

  const pipStatus = healthColor(report.pipUpToDate);
  const venvStatus = healthColor(report.isVenvActive);
  const dupStatus = healthColor(report.duplicatePackages.length === 0);
  const conflictStatus = healthColor(reportConflictCount === 0);

  /**
   * Formats a byte count for display in the environment tab.
   * @param {number} bytes
   * @returns {string}
   */
  function formatDiskSize(bytes) {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const sitePackagesSize = report.sitePackagesSizeBytes || 0;

  // Primary status cards
  const cards = [
    {
      icon: '🐍', label: window.t('venv.pythonVersion'),
      value: report.pythonVersion,
      sub: venvTypeLabels[report.venvType] || report.venvType,
      color: '#60a5fa',
    },
    {
      icon: '📦', label: window.t('venv.pipVersion'),
      value: report.pipVersion,
      sub: report.pipUpToDate ? window.t('venv.pipUpToDate') : `${window.t('venv.pipOutdated')} → ${report.pipLatestVersion}`,
      color: pipStatus.color,
    },
    {
      icon: '🏠', label: window.t('venv.venvType'),
      value: venvTypeLabels[report.venvType] || report.venvType,
      sub: report.isVenvActive ? window.t('venv.venvActive') : window.t('venv.venvInactive'),
      color: venvStatus.color,
    },
    {
      icon: '📊', label: window.t('venv.totalInstalled'),
      value: String(report.totalInstalled),
      sub: sitePackagesSize > 0
        ? `${window.t('venv.packages')} · ${formatDiskSize(sitePackagesSize)} ${window.t('venv.onDisk')}`
        : window.t('venv.packages'),
      color: '#a78bfa',
    },
  ];

  const cardsHtml = cards.map(c => `
    <div style="position:relative;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:hidden;min-height:120px;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${c.color};"></div>
      <div style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;background:${c.color}22;color:${c.color};">${c.icon}</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--vscode-descriptionForeground);">${window.esc(c.label)}</div>
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:24px;font-weight:700;color:var(--vscode-foreground);line-height:1;">${window.esc(c.value)}</span>
      </div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(c.sub)}</div>
    </div>
  `).join('');

  // Health status banner
  const healthBannerHtml = isHealthy ? `
    <div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.3);border-left:3px solid #4ade80;border-radius:6px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:24px;">✅</span>
      <div>
        <div style="font-weight:600;font-size:13px;color:var(--vscode-foreground);">${window.t('venv.noIssues')}</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('venv.noIssuesDesc')}</div>
      </div>
    </div>
  ` : '';

  // Diagnostic detail cards
  let diagnosticsHtml = '';

  // Pip update card
  if (!report.pipUpToDate && report.pipLatestVersion) {
    diagnosticsHtml += `
    <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid #fb923c;border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-weight:600;font-size:12px;color:var(--vscode-foreground);">pip ${window.esc(report.pipVersion)} → ${window.esc(report.pipLatestVersion)}</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('venv.pipOutdated')}</div>
      </div>
      <button id="btn-update-pip" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:600;cursor:pointer;">${window.t('venv.updatePip')}</button>
    </div>`;
  }

  // Venv inactive warning
  if (!report.isVenvActive && report.venvType !== 'system') {
    diagnosticsHtml += `
    <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid #fb923c;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <div style="font-weight:600;font-size:12px;color:var(--vscode-foreground);">${window.t('venv.venvInactive')}</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('venv.venvPath')}: <code>${window.esc(report.venvPath)}</code></div>
    </div>`;
  }

  // System Python warning
  if (report.venvType === 'system') {
    diagnosticsHtml += `
    <div style="background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.3);border-left:3px solid #f87171;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <div style="font-weight:600;font-size:12px;color:#f87171;">${window.t('venv.systemPython')}</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('venv.systemPythonHint')}</div>
    </div>`;
  }

  // Conflicts indicator — use the same data source as the Conflicts tab
  // WHY: venvHealthChecker runs `python -m pip check` while the Conflicts tab
  // may use `uv pip check` (different tools, different output). Using
  // window.allConflicts ensures both views always agree on the count.
  const conflictCount = (window.allConflicts || []).length;
  if (conflictCount > 0) {
    diagnosticsHtml += `
    <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid #f87171;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <div style="font-weight:600;font-size:12px;color:#f87171;">${window.t('venv.conflictsDetected')}: ${conflictCount}</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('venv.conflictsHint')}</div>
    </div>`;
  }

  // Duplicate packages table
  let duplicatesHtml = '';
  if (report.duplicatePackages.length > 0) {
    const dupRows = report.duplicatePackages.map(d => `
      <tr style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
        <td style="padding:10px 14px;font-weight:600;color:var(--vscode-foreground);font-size:12px;">${window.esc(d.name)}</td>
        <td style="padding:10px 14px;font-size:11px;color:var(--vscode-descriptionForeground);">${d.versions.map(v => `<code style="background:var(--vscode-textCodeBlock-background);padding:2px 6px;border-radius:3px;margin-right:4px;">${window.esc(v)}</code>`).join('')}</td>
      </tr>
    `).join('');

    duplicatesHtml = `
    <div style="margin-top:20px;">
      <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">${window.t('venv.duplicates')} (${report.duplicatePackages.length})</div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">Package</th>
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">Installed Versions</th>
            </tr>
          </thead>
          <tbody>${dupRows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Installed packages panel (collapsible with toggle button) ────────
  let installedHtml = '';
  const pkgs = report.installedPackages || [];
  if (pkgs.length > 0) {
    // Sort alphabetically for initial render
    const sorted = [...pkgs].sort((a, b) => a.name.localeCompare(b.name));
    const outdatedCount = sorted.filter(p => p.latestVersion).length;

    const pkgRows = sorted.map(p => {
      const isOutdated = !!p.latestVersion;
      const latestCell = isOutdated
        ? `<span style="color:#e8a317;font-weight:600;">↑ ${window.esc(p.latestVersion)}</span>`
        : `<span style="color:#3cba54;opacity:.7;">✓</span>`;
      const actionCell = isOutdated
        ? `<button class="venv-update-btn" data-pkg="${window.esc(p.name)}" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:5px;padding:4px 10px;font-size:10px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:opacity .2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">↑ ${window.t('venv.updateBtn')}</button>`
        : '';
      const sizeCell = p.diskSizeBytes ? formatDiskSize(p.diskSizeBytes) : '—';
      return `
      <tr class="venv-pkg-row" data-name="${window.esc(p.name.toLowerCase())}" style="${isOutdated ? 'background:color-mix(in srgb, #e8a317 6%, transparent);' : ''}">
        <td style="padding:8px 14px;font-weight:600;font-size:12px;color:var(--vscode-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(p.name)}</td>
        <td style="padding:8px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(p.version)}</td>
        <td style="padding:8px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;">${sizeCell}</td>
        <td style="padding:8px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;white-space:nowrap;">${latestCell}</td>
        <td style="padding:8px 14px;text-align:center;white-space:nowrap;">${actionCell}</td>
      </tr>`;
    }).join('');

    const outdatedBadge = outdatedCount > 0
      ? ` <span style="background:#e8a317;color:#1e1e1e;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;margin-left:8px;">${outdatedCount} ${window.t('venv.outdated')}</span>`
      : '';

    installedHtml = `
    <div style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">
        <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);">${window.t('venv.installedPkgs')} (${pkgs.length})${outdatedBadge}</div>
        <button id="btn-toggle-installed" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          📋 ${window.t('venv.showPkgs')}
        </button>
      </div>
      <div id="venv-installed-panel" style="display:none;">
        <div style="margin-bottom:10px;display:flex;justify-content:flex-end;align-items:center;gap:8px;">
          ${outdatedCount > 0 ? `<button id="btn-update-all-venv" style="background:#e8a317;color:#1e1e1e;border:none;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:opacity .2s;white-space:nowrap;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">↑ ${window.t('venv.updateAll')}</button>` : ''}
          <input id="venv-pkg-search" type="text" placeholder="${window.t('venv.searchPkgs')}"
            style="background:var(--vscode-input-background);color:var(--vscode-input-foreground);
            border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;
            padding:6px 12px;font-size:11px;font-family:inherit;outline:none;width:220px;" />
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;overflow:hidden;">
          <div style="max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
              <thead style="position:sticky;top:0;z-index:1;">
                <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:32%;">${window.t('venv.pkgName')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:16%;">${window.t('venv.pkgVersion')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:14%;">${window.t('venv.pkgDiskSize')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:18%;">${window.t('venv.pkgLatest')}</th>
                  <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:20%;">${window.t('venv.pkgActions')}</th>
                </tr>
              </thead>
              <tbody id="venv-pkg-tbody">${pkgRows}</tbody>
            </table>
          </div>
          <div style="padding:8px 14px;font-size:10px;color:var(--vscode-descriptionForeground);text-align:right;border-top:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
            <span id="venv-pkg-count">${pkgs.length}</span> ${window.t('venv.packages')}
          </div>
        </div>
      </div>
    </div>`;
  }

  // Environment path info
  const projectSelectorHtml = showProjectSelector ? `
    <div style="margin-bottom:20px;">
      <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">${window.t('venv.activeProject')}</div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
        <select id="venv-project-select" style="background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;padding:8px 12px;font-size:12px;font-family:inherit;outline:none;max-width:100%;">
          ${availableProjects.map((project, index) => `
            <option value="${index}" ${activeProject && project.root === activeProject.root ? 'selected' : ''}>
              ${window.esc(project.name)}
            </option>
          `).join('')}
        </select>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.5;">${window.t('venv.activeProjectHint')}</div>
      </div>
    </div>
  ` : '';

  const envInfoHtml = `
    <div style="margin-top:20px;">
      <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">${window.t('venv.venvPath')}</div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:12px 16px;">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:12px;">
          <span style="color:var(--vscode-descriptionForeground);font-weight:600;">${window.t('venv.venvType')}:</span>
          <span style="color:var(--vscode-foreground);">${window.esc(venvTypeLabels[report.venvType] || report.venvType)}</span>
          <span style="color:var(--vscode-descriptionForeground);font-weight:600;">${window.t('venv.venvPath')}:</span>
          <span style="color:var(--vscode-foreground);word-break:break-all;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;">${window.esc(report.venvPath)}</span>
          <span style="color:var(--vscode-descriptionForeground);font-weight:600;">${window.t('venv.sitePackages')}:</span>
          <span style="color:var(--vscode-foreground);word-break:break-all;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;">${window.esc(report.sitePackagesPath)}</span>
        </div>
      </div>
    </div>`;

  el.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;gap:16px;">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('venv.title')}</div>
          <div style="font-size:12px;color:var(--vscode-descriptionForeground);">${window.t('venv.subtitle')}</div>
        </div>
        <button id="btn-refresh-venv" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:8px 16px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          🔄 ${window.t('venv.refresh')}
        </button>
      </div>
      <div style="background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent);border:1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 25%, transparent);border-left:3px solid var(--vscode-textLink-foreground);border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.55;">
        ℹ️ ${window.t('venv.scopeHint')}
      </div>
      ${healthBannerHtml}
      ${projectSelectorHtml}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:24px;">${cardsHtml}</div>
      ${diagnosticsHtml}
      ${installedHtml}
      ${duplicatesHtml}
      ${envInfoHtml}
    </div>
  `;

  // Wire up pip update button
  const btnUpdatePip = el.querySelector('#btn-update-pip');
  if (btnUpdatePip) {
    btnUpdatePip.addEventListener('click', () => {
      window.venvHealthReport = null;
      btnUpdatePip.disabled = true;
      btnUpdatePip.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updatingPip')}`;
      window.vscode.postMessage({ type: 'updatePip' });
    });
  }

  // Wire up project selector
  const projectSelect = el.querySelector('#venv-project-select');
  if (projectSelect) {
    projectSelect.addEventListener('change', () => {
      const projects = window.venvAvailableProjects || [];
      const index = Number.parseInt(projectSelect.value, 10);
      const root = projects[index]?.root;
      if (!root || (activeProject && root === activeProject.root)) {
        return;
      }
      window.venvHealthPending = true;
      window.venvHealthReport = null;
      projectSelect.disabled = true;
      window.vscode.postMessage({ type: 'selectActiveVenvProject', root });
      window.renderVenvHealth();
    });
  }

  // Wire up refresh button
  const btnRefresh = el.querySelector('#btn-refresh-venv');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      window.venvHealthReport = null;
      window.renderVenvHealth();
    });
  }

  // Wire up installed packages toggle button
  const btnToggle = el.querySelector('#btn-toggle-installed');
  const installedPanel = el.querySelector('#venv-installed-panel');
  if (btnToggle && installedPanel) {
    btnToggle.addEventListener('click', () => {
      const isHidden = installedPanel.style.display === 'none';
      installedPanel.style.display = isHidden ? 'block' : 'none';
      btnToggle.innerHTML = isHidden
        ? `▴ ${window.t('venv.hidePkgs')}`
        : `📋 ${window.t('venv.showPkgs')}`;
    });
  }

  // Wire up per-package update buttons
  el.querySelectorAll('.venv-update-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pkgName = btn.dataset.pkg;
      if (!pkgName) return;
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updating')}`;
      window.vscode.postMessage({ type: 'updatePackage', name: pkgName });
      setTimeout(() => { window.venvHealthReport = null; }, 500);
    });
  });

  // Wire up "Update All" button
  const btnUpdateAll = el.querySelector('#btn-update-all-venv');
  if (btnUpdateAll) {
    btnUpdateAll.addEventListener('click', () => {
      btnUpdateAll.disabled = true;
      btnUpdateAll.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updatingAll')}`;
      // Disable all individual update buttons too
      el.querySelectorAll('.venv-update-btn').forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updating')}`;
      });
      // WHY: Send a single batch message instead of N individual updatePackage messages.
      // The backend handler runs pip sequentially, avoiding parallel pip processes
      // that can cause lock conflicts or venv corruption.
      const outdated = (report.installedPackages || []).filter(p => p.latestVersion);
      const names = outdated.map(p => p.name);
      window.vscode.postMessage({ type: 'updateAllPackages', names });
      setTimeout(() => { window.venvHealthReport = null; }, 500);
    });
  }

  // Wire up installed packages search with debounce
  const searchInput = el.querySelector('#venv-pkg-search');
  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.toLowerCase().trim();
        const rows = el.querySelectorAll('.venv-pkg-row');
        let visible = 0;
        rows.forEach(row => {
          const name = row.dataset.name || '';
          const isMatch = !query || name.includes(query);
          row.style.display = isMatch ? '' : 'none';
          if (isMatch) visible++;
        });
        const countEl = el.querySelector('#venv-pkg-count');
        if (countEl) countEl.textContent = String(visible);
      }, 250);
    });
  }
};
