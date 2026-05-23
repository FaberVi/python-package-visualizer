/**
 * Dashboard View Renderer.
 * Displays package health metrics, size footprints, download rates, and active/inactive maintainer breakdowns.
 */

/**
 * Renders the workspace dashboard health statistics panels.
 * Visualizes size footprint, download metrics, and custom requirement configurations.
 * Exposes functionality to select a manual requirements.txt file or clear the customized path.
 * 
 * @returns {void}
 */
window.renderDashboard = function () {
  const elDashboardView = document.getElementById('view-dashboard');
  if (!elDashboardView) return;

  const allPackages = window.allPackages || [];
  const scanStats = window.scanStats || window._scanStats || {};
  const totalPkgs      = allPackages.length;
  const withVulns      = allPackages.filter(p => (p.vulnerabilities || []).length > 0).length;
  const securityScore  = totalPkgs > 0 ? Math.round(((totalPkgs - withVulns) / totalPkgs) * 100) : 100;
  const totalDownloads = allPackages.reduce((s, p) => s + (p.weeklyDownloads || 0), 0);
  const totalSizeMB    = allPackages.reduce((s, p) => s + (p.installSize || 0), 0) / (1024 * 1024);
  const outdated       = allPackages.filter(p => p.status === 'update-available').length;

  const fmtDl = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)     return (n / 1000).toFixed(1) + 'K';
    return String(n);
  };

  const cards = [
    { color: '#60a5fa', icon: '&#x1F4E6;', label: window.t('dash.totalPackages'), val: totalPkgs, unit: outdated > 0 ? `${outdated} ${window.t('dash.outdated')}` : window.t('dash.allCurrent') },
    { color: '#a78bfa', icon: '&#x1F4BE;', label: window.t('dash.totalSize'),     val: totalSizeMB.toFixed(1), unit: 'MB' },
    { color: '#4ade80', icon: '&#x1F4CA;', label: window.t('dash.weeklyDownloads'), val: fmtDl(totalDownloads), unit: window.t('dash.perWeek') },
    { color: '#fb923c', icon: '&#x1F512;', label: window.t('dash.securityScore'), val: securityScore, unit: withVulns === 0 ? window.t('dash.safe') : `${withVulns} vulnerable` },
  ];

  const cardHtml = cards.map(c => `
    <div style="position:relative;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:hidden;min-height:120px;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${c.color};"></div>
      <div style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;background:${c.color}22;color:${c.color};">${c.icon}</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--vscode-descriptionForeground);">${window.esc(c.label)}</div>
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:28px;font-weight:700;color:var(--vscode-foreground);line-height:1;">${window.esc(String(c.val))}</span>
        <span style="font-size:12px;color:var(--vscode-descriptionForeground);">${window.esc(c.unit)}</span>
      </div>
    </div>
  `).join('');

  // Maintainer activity calculation
  const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
  const maintainers = allPackages
    .filter(p => p.releaseDate)
    .map(pkg => {
      const released = new Date(pkg.releaseDate).getTime();
      return { name: pkg.name, date: pkg.releaseDate, active: !isNaN(released) && released > sixMonthsAgo };
    })
    .sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0))
    .slice(0, 20);

  let maintHtml;
  if (maintainers.length === 0) {
    maintHtml = `<div style="text-align:center;padding:50px 20px;color:var(--vscode-descriptionForeground);font-size:13px;">${window.t('dash.noMaintainerData')}</div>`;
  } else {
    maintHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">` +
      maintainers.map(m => `
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:600;font-size:12.5px;color:var(--vscode-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(m.name)}</div>
            <div style="font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('dash.lastRelease')} ${window.esc(m.date)}</div>
          </div>
          <span style="font-size:10px;font-weight:600;padding:4px 10px;border-radius:12px;white-space:nowrap;flex-shrink:0;background:${m.active ? 'rgba(74,222,128,.18)' : 'rgba(148,163,184,.15)'};color:${m.active ? '#4ade80' : '#94a3b8'};border:1px solid ${m.active ? 'rgba(74,222,128,.35)' : 'rgba(148,163,184,.3)'};">
            ${m.active ? window.t('dash.active') : window.t('dash.inactive')}
          </span>
        </div>
      `).join('') +
    `</div>`;
  }

  const isManual = !!scanStats.manualRequirementsPath;
  const reqPath = scanStats.manualRequirementsPath || window.t('dash.autoDetectedDesc');

  const requirementsBannerHtml = `
    <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
        <div style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;background:${isManual ? 'rgba(74,222,128,.18)' : 'rgba(96,165,250,.18)'};color:${isManual ? '#4ade80' : '#60a5fa'};flex-shrink:0;">
          ${isManual ? '&#x1F4DD;' : '&#x1F50D;'}
        </div>
        <div style="min-width:0;flex:1;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--vscode-descriptionForeground);">${window.t('dash.depFileSource')}</div>
          <div style="font-weight:600;font-size:13px;color:var(--vscode-foreground);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:8px;" title="${window.esc(reqPath)}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(reqPath)}</span>
            <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;background:${isManual ? 'rgba(74,222,128,.18)' : 'rgba(96,165,250,.18)'};color:${isManual ? '#4ade80' : '#60a5fa'};border:1px solid ${isManual ? 'rgba(74,222,128,.35)' : 'rgba(96,165,250,.3)'};">
              ${isManual ? window.t('dash.manualPath') : window.t('dash.autoDetected')}
            </span>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <button id="btn-select-manual-req" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          ${window.t('dash.selectFile')}
        </button>
        ${isManual ? `
          <button id="btn-clear-manual-req" style="background:transparent;color:var(--vscode-errorForeground,#f87171);border:1px solid var(--vscode-errorForeground,#f87171);border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background 0.2s;" onmouseover="this.style.background='rgba(248,113,113,0.1)'" onmouseout="this.style.background='transparent'">
            ${window.t('dash.clearCustomPath')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  elDashboardView.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;width:100%;padding:24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--vscode-foreground);">${window.t('dash.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('dash.subtitle')}</div>
      ${requirementsBannerHtml}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:32px;">${cardHtml}</div>
      <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">${window.t('dash.maintainerActivity')}</div>
      ${maintHtml}
    </div>
  `;

  const btnSelect = elDashboardView.querySelector('#btn-select-manual-req');
  const btnClear = elDashboardView.querySelector('#btn-clear-manual-req');
  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      window.vscode.postMessage({ type: 'selectManualRequirements' });
    });
  }
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      window.vscode.postMessage({ type: 'clearManualRequirements' });
    });
  }
};
