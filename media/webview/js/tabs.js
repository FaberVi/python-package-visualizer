/**
 * Secondary View Rendering System for Python Package Visualizer.
 * Provides modular HTML layout compilers and click binders for specific tabs.
 * Loaded sequentially after utils.js and graph.js to share common rendering tools.
 */

/**
 * Compiles and renders the License Compliance layout.
 * Groups active packages by their license compliance risk levels
 * (Low/Medium/High/Unknown copyleft check).
 */
window.renderLicenses = function () {
  const elViewLicenses = document.getElementById('view-licenses');
  if (!elViewLicenses) return;

  const allPackages = window.allPackages || [];
  const riskMap = {
    low: ['mit', 'bsd-3-clause', 'bsd-2-clause', 'bsd', 'apache-2.0', 'apache 2.0', 'apache', 'isc', 'mpl-2.0', 'python-2.0', 'python software foundation license', 'psf'],
    medium: ['lgpl', 'epl', 'cddl', 'eclipse'],
    high: ['gpl', 'agpl', 'commercial', 'proprietary'],
  };

  /** Classifies license string to color-code risk profiles */
  function classifyLicense(license) {
    if (!license || license === 'UNKNOWN' || /^see /i.test(license)) return 'unknown';
    const lower = String(license).toLowerCase();
    if (riskMap.high.some(k => lower.includes(k))) return 'high';
    if (riskMap.medium.some(k => lower.includes(k))) return 'medium';
    if (riskMap.low.some(k => lower.includes(k))) return 'low';
    return 'unknown';
  }

  const groups = {};
  for (const pkg of allPackages) {
    const license = pkg.license || 'Unknown';
    if (!groups[license]) {
      groups[license] = { risk: classifyLicense(license), packages: [] };
    }
    groups[license].packages.push(pkg);
  }

  const riskColor = { low: '#4ade80', medium: '#fb923c', high: '#f87171', unknown: '#94a3b8' };
  const riskLabel = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk', unknown: 'Unknown' };

  const totalCount = allPackages.length;
  const lowCount = Object.values(groups).filter(g => g.risk === 'low').reduce((s, g) => s + g.packages.length, 0);
  const medCount = Object.values(groups).filter(g => g.risk === 'medium').reduce((s, g) => s + g.packages.length, 0);
  const highCount = Object.values(groups).filter(g => g.risk === 'high').reduce((s, g) => s + g.packages.length, 0);
  const unkCount = Object.values(groups).filter(g => g.risk === 'unknown').reduce((s, g) => s + g.packages.length, 0);

  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const order = { high: 0, medium: 1, unknown: 2, low: 3 };
    const diff = order[a[1].risk] - order[b[1].risk];
    if (diff !== 0) return diff;
    return b[1].packages.length - a[1].packages.length;
  });

  const summaryCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">Total</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--vscode-foreground);">${totalCount}</div>
      </div>
      <div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.3);border-top:3px solid #4ade80;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">Low Risk</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px;color:#4ade80;">${lowCount}</div>
      </div>
      <div style="background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.3);border-top:3px solid #fb923c;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">Medium</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px;color:#fb923c;">${medCount}</div>
      </div>
      <div style="background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.3);border-top:3px solid #f87171;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">High Risk</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px;color:#f87171;">${highCount}</div>
      </div>
      <div style="background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.3);border-top:3px solid #94a3b8;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">Unknown</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px;color:#94a3b8;">${unkCount}</div>
      </div>
    </div>
  `;

  const groupsHtml = sortedGroups.map(([license, group]) => {
    const color = riskColor[group.risk];
    const label = riskLabel[group.risk];
    const pkgListHtml = group.packages.map(p => `
      <div class="license-pkg-row" data-pkg="${window.esc(p.name)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-top:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);cursor:pointer;">
        <span style="font-weight:600;font-size:12px;color:var(--vscode-foreground);">${window.esc(p.name)}</span>
        <span style="font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);">${window.esc(p.installedVersion || '\u2014')}</span>
      </div>
    `).join('');
    return `
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid ${color};border-radius:10px;margin-bottom:16px;overflow:hidden;">
        <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--vscode-foreground);word-break:break-word;">${window.esc(license)}</div>
            <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px;">${group.packages.length} package${group.packages.length !== 1 ? 's' : ''}</div>
          </div>
          <span style="font-size:10px;font-weight:700;padding:4px 10px;border-radius:12px;background:${color}22;color:${color};border:1px solid ${color}55;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">${label}</span>
        </div>
        ${pkgListHtml}
      </div>
    `;
  }).join('');

  const emptyHtml = `<div style="text-align:center;padding:60px 20px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:10px;color:var(--vscode-descriptionForeground);">No license data available.</div>`;

  elViewLicenses.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('tab.licenses')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('lic.subtitle')}</div>
      ${summaryCards}
      ${sortedGroups.length ? groupsHtml : emptyHtml}
    </div>
  `;

  // Click package row → open detail panel
  elViewLicenses.querySelectorAll('.license-pkg-row').forEach(row => {
    row.addEventListener('click', () => {
      const pkg = allPackages.find(p => p.name === row.dataset.pkg);
      if (pkg && typeof window.showDetail === 'function') window.showDetail(pkg);
    });
  });
};

/**
 * Compiles and renders the Environment Snapshots management layout.
 * Lists all snapshots saved in the workspace, with restore and delete binds.
 */
window.renderSnapshots = function () {
  const elViewSnapshots = document.getElementById('view-snapshots');
  if (!elViewSnapshots) return;
  const snaps = window.snapshots || [];

  const defaultName = `Snapshot ${new Date().toLocaleString()}`;
  const takeBtn = `
    <div style="display:flex;gap:8px;align-items:stretch;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:12px;">
      <input id="snap-name-input" type="text" placeholder="Snapshot name..." value="${window.esc(defaultName)}"
        style="flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;padding:8px 12px;font-size:12px;font-family:inherit;outline:none;" />
      <button id="btn-take-snapshot-new" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
        \u{1F4F8} ${window.t('snap.take')}
      </button>
    </div>
  `;

  let bodyHtml;
  if (snaps.length === 0) {
    bodyHtml = `
      <div style="text-align:center;padding:80px 20px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:10px;margin-top:24px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.5;">\u{1F4F8}</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">No snapshots yet</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.5;">${window.t('snap.noSnapshots')}</div>
      </div>
    `;
  } else {
    bodyHtml = `<div style="display:grid;gap:12px;margin-top:20px;">` +
      snaps.map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toLocaleString() : '';
        const pkgs = s.packages;
        let count = 0;
        if (Array.isArray(pkgs)) count = pkgs.length;
        else if (pkgs && typeof pkgs === 'object') count = Object.keys(pkgs).length;
        return `
          <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;">
              <div style="font-size:22px;flex-shrink:0;">\u{1F4F8}</div>
              <div style="min-width:0;flex:1;">
                <div style="font-weight:600;font-size:13px;color:var(--vscode-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(s.name || 'Snapshot')}</div>
                <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;">${window.esc(date)} \u00B7 ${count} ${window.t('snap.packages')}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
              <button class="snap-restore-btn" data-id="${window.esc(s.id || '')}" style="background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.3);padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">\u21BB ${window.t('snap.restore')}</button>
              <button class="snap-delete-btn" data-id="${window.esc(s.id || '')}" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">\u{1F5D1} ${window.t('snap.delete')}</button>
            </div>
          </div>
        `;
      }).join('') +
      `</div>`;
  }

  elViewSnapshots.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('tab.snapshots')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;">Save and restore the exact state of your installed packages</div>
      ${takeBtn}
      ${bodyHtml}
    </div>
  `;

  // Wire up buttons
  const newBtn = document.getElementById('btn-take-snapshot-new');
  const nameInput = document.getElementById('snap-name-input');
  if (newBtn && nameInput) {
    const triggerSnapshot = () => {
      const name = nameInput.value.trim() || `Snapshot ${new Date().toLocaleString()}`;
      window.vscode.postMessage({ type: 'takeSnapshot', name });
    };
    newBtn.addEventListener('click', triggerSnapshot);
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerSnapshot();
      }
    });
  }
  elViewSnapshots.querySelectorAll('.snap-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id) {
        window.vscode.postMessage({ type: 'restoreSnapshot', id, confirm: true });
      }
    });
  });
  elViewSnapshots.querySelectorAll('.snap-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id) {
        window.vscode.postMessage({ type: 'deleteSnapshot', id, confirm: true });
      }
    });
  });
};

/**
 * Renders the workspace dashboard health statistics panels.
 * Visualizes size footprint, download metrics, and custom requirement configurations.
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

/**
 * Compiles and renders installation speeds and file-size bar rankings.
 * Displays package installations sorted by install duration.
 * 
 * @param {Array<object>} filtered - The filtered set of package items.
 */
window.renderPerformance = function (filtered) {
  const elPerfView = document.getElementById('view-performance');
  if (!elPerfView) return;

  const allPackages = window.allPackages || [];
  const tracked = allPackages.filter(p => p.installTime && p.installTime > 0);
  const fastCount = tracked.filter(p => p.installTime <= 1).length;
  const modCount  = tracked.filter(p => p.installTime > 1 && p.installTime <= 5).length;
  const slowCount = tracked.filter(p => p.installTime > 5).length;

  const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('perf.fast')} (&lt;1s)</div>
        <div style="font-size:26px;font-weight:700;margin-top:6px;color:#4ade80;">${fastCount}</div>
      </div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('perf.moderate')} (1-5s)</div>
        <div style="font-size:26px;font-weight:700;margin-top:6px;color:#fb923c;">${modCount}</div>
      </div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('perf.slow')} (&gt;5s)</div>
        <div style="font-size:26px;font-weight:700;margin-top:6px;color:#f87171;">${slowCount}</div>
      </div>
    </div>
  `;

  let bodyHtml;
  if (tracked.length === 0) {
    bodyHtml = `
      <div style="text-align:center;padding:80px 20px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:8px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.5;">&#x23F1;&#xFE0F;</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('perf.noData')}</div>
        <div style="font-size:11px;margin-top:6px;">${window.t('perf.noDataDesc')}</div>
      </div>
    `;
  } else {
    const maxTime = Math.max(...tracked.map(p => p.installTime));
    const sorted = [...tracked].sort((a, b) => b.installTime - a.installTime).slice(0, 20);

    const rows = sorted.map(pkg => {
      const time = pkg.installTime;
      let color = '#4ade80', label = 'Fast';
      if (time > 5)      { color = '#f87171'; label = 'Slow'; }
      else if (time > 1) { color = '#fb923c'; label = 'Moderate'; }
      const widthPct = Math.max(10, (time / maxTime) * 100);
      const sizeMB = pkg.installSize ? (pkg.installSize / (1024 * 1024)).toFixed(1) : '—';
      return `
        <tr style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
          <td style="padding:14px 16px;font-weight:600;">${window.esc(pkg.name)}</td>
          <td style="padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:${widthPct}px;height:6px;border-radius:3px;background:${color};min-width:20px;"></div>
              <span>${time.toFixed(2)}s</span>
            </div>
          </td>
          <td style="padding:14px 16px;"><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:${color}22;color:${color};">${label}</span></td>
          <td style="padding:14px 16px;text-align:right;color:var(--vscode-descriptionForeground);">${sizeMB}</td>
        </tr>
      `;
    }).join('');

    bodyHtml = `
      <table style="width:100%;border-collapse:collapse;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.package')}</th>
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.installTime')}</th>
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.speed')}</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.sizeMB')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  elPerfView.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;width:100%;padding:24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--vscode-foreground);">${window.t('perf.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('perf.subtitle')}</div>
      ${summaryHtml}
      ${bodyHtml}
    </div>
  `;
};

/**
 * Compiles and renders a chronological history list of updates and rollbacks.
 * Groups events together under Today, Yesterday, This Week, and Earlier headers.
 */
window.renderHistory = function () {
  const elHistoryView = document.getElementById('view-history');
  if (!elHistoryView) return;

  const historyEntries = window.historyEntries || [];

  const wrapStart = `<div style="max-width:820px;margin:0 auto;width:100%;padding:24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--vscode-foreground);">${window.t('history.title')}</div>
    <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('history.subtitle')}</div>`;
  const wrapEnd = `</div>`;

  if (!historyEntries || historyEntries.length === 0) {
    elHistoryView.innerHTML = wrapStart + `
      <div style="text-align:center;padding:80px 20px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:8px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.5;">&#x1F553;</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('history.noHistory')}</div>
        <div style="font-size:11px;margin-top:6px;">${window.t('history.noHistoryDesc')}</div>
      </div>
    ` + wrapEnd;
    return;
  }

  const now              = new Date();
  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfWeek      = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);

  function dateGroup(dateStr) {
    try {
      const d = new Date(dateStr);
      if (d >= startOfToday)     return 'Today';
      if (d >= startOfYesterday) return 'Yesterday';
      if (d >= startOfWeek)      return 'This Week';
      return 'Earlier';
    } catch { return 'Earlier'; }
  }

  const actionMeta = {
    'pip-install':  { label: window.t('history.installedUpdated'), icon: '&#x2B07;',  color: '#4ade80' },
    'pip-rollback': { label: window.t('history.rolledBack'),         icon: '&#x21A9;',  color: '#60a5fa' },
    'detected':     { label: window.t('history.detected'),            icon: '&#x1F4CC;', color: '#94a3b8' },
  };

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const groups = {};
  for (const entry of historyEntries) {
    const g = dateGroup(entry.installedAt);
    if (!groups[g]) groups[g] = [];
    groups[g].push(entry);
  }

  let html = wrapStart;
  for (const groupName of groupOrder) {
    if (!groups[groupName]) continue;
    html += `<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vscode-descriptionForeground);padding:14px 0 8px;opacity:.7;">${groupName}</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">`;

    for (const entry of groups[groupName]) {
      const meta = actionMeta[entry.source] || actionMeta.detected;
      let timeStr = '';
      try { timeStr = new Date(entry.installedAt).toLocaleString(); } catch { timeStr = entry.installedAt || ''; }

      html += `
        <div style="display:flex;gap:12px;padding:12px 14px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid ${meta.color};border-radius:0 8px 8px 0;">
          <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;background:${meta.color}22;color:${meta.color};">${meta.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-weight:600;font-size:13px;color:var(--vscode-foreground);">${window.esc(entry.packageName)}</span>
              <span style="font-size:11px;color:var(--vscode-descriptionForeground);">${meta.label} to</span>
              <code style="font-family:var(--vscode-editor-font-family,monospace);font-size:11px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 7px;border-radius:4px;">${window.esc(entry.version)}</code>
            </div>
            <div style="font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:4px;">${window.esc(timeStr)}</div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }
  html += wrapEnd;
  elHistoryView.innerHTML = html;
};

/**
 * Compiles and renders the Unused Packages checklist.
 * Compares import graph scans against packages declared in requirements files.
 */
window.renderUnused = function () {
  const elUnused = document.getElementById('view-unused');
  if (!elUnused) return;

  const allPackages = window.allPackages || [];
  const unused = allPackages.filter(p => !p.isUsed);
  const totalScanned = allPackages.length;
  const stats = window.scanStats || window._scanStats || {};
  const filesScanned = stats.filesScanned || 0;
  const workspaceRoot = stats.workspaceRoot || '';
  const rootShort = workspaceRoot
    ? workspaceRoot.replace(/\\/g, '/').split('/').slice(-2).join('/')
    : '';

  // Sync the sidebar tab badge indicator
  const tabEl = document.querySelector('.tab[data-tab="unused"]');
  if (tabEl) {
    tabEl.textContent = unused.length > 0
      ? `${window.t('tab.unused')} (${unused.length})`
      : window.t('tab.unused');
  }

  if (unused.length === 0) {
    elUnused.innerHTML = `<div style="max-width:900px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('unused.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('unused.subtitle')}</div>
      <div style="text-align:center;padding:80px 20px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:10px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.7;">\u2705</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('unused.allUsed')}</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px;">Scanned ${filesScanned} file${filesScanned !== 1 ? 's' : ''} across ${totalScanned} package${totalScanned !== 1 ? 's' : ''}${rootShort ? ' in <code>' + window.esc(rootShort) + '</code>' : ''}</div>
      </div>
    </div>`;
    return;
  }

  const rowsHtml = unused.map(pkg => {
    const sourceShort = pkg.source ? String(pkg.source).split(/[\\/]/).pop() : '\u2014';
    return `
    <tr class="unused-row" data-pkg="${window.esc(pkg.name)}" style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
      <td style="padding:12px 16px;">
        <div style="font-weight:600;color:var(--vscode-textLink-foreground);cursor:pointer;" class="pkg-name-link" data-pkg="${window.esc(pkg.name)}">${window.esc(pkg.name)}</div>
        ${pkg.summary ? `<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(pkg.summary)}</div>` : ''}
      </td>
      <td style="padding:12px 16px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(pkg.installedVersion || '\u2014')}</td>
      <td style="padding:12px 16px;font-size:11px;color:var(--vscode-descriptionForeground);" title="${window.esc(pkg.source || '')}">${window.esc(sourceShort)}</td>
      <td style="padding:12px 16px;text-align:right;white-space:nowrap;">
        <button class="unused-remove-btn" data-name="${window.esc(pkg.name)}" data-source="${window.esc(pkg.source || '')}" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);padding:5px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">\u{1F5D1} ${window.t('btn.remove')}</button>
      </td>
    </tr>
    `;
  }).join('');

  elUnused.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('unused.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;">${window.t('unused.subtitle')}</div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.totalScanned')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--vscode-foreground);">${totalScanned}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #fb923c;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.possiblyUnused')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#fb923c;">${unused.length}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.filesAnalyzed')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--vscode-foreground);">${filesScanned}</div>
        </div>
      </div>

      <div style="background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.3);border-left:3px solid #fb923c;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:11px;color:var(--vscode-foreground);line-height:1.5;">
        <strong>${window.t('unused.headsUp')}</strong> ${window.t('unused.headsUpText')} <code>importlib</code>. ${window.t('unused.alwaysCheck')}
      </div>

      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.title')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.version')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.sourceFile')}</th>
              <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.actions')}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  // Wire up Remove buttons
  elUnused.querySelectorAll('.unused-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const source = btn.dataset.source;
      if (name) {
        window.vscode.postMessage({ type: 'removeFromRequirements', name, source });
      }
    });
  });

  // Wire up package name links to open detail panel
  elUnused.querySelectorAll('.pkg-name-link').forEach(el => {
    el.addEventListener('click', () => {
      const pkgName = el.dataset.pkg;
      const pkg = allPackages.find(p => p.name === pkgName);
      if (pkg && typeof window.showDetail === 'function') window.showDetail(pkg);
    });
  });
};

/**
 * Syncs the sidebar tab badge reflecting count of possibly unused packages.
 * 
 * @param {Array<object>} packages - The raw package list.
 */
window.updateUnusedBadge = function (packages) {
  const count = packages.filter(p => !p.isUsed).length;
  const tab = document.querySelector('.tab[data-tab="unused"]');
  if (tab) {
    tab.textContent = count > 0 ? `${window.t('tab.unused')} (${count})` : window.t('tab.unused');
  }
};

/**
 * Synchronizes layout count for dependency conflict stat card.
 * Hides or displays conflict card on toolbar depending on severity.
 */
window.updateConflictStat = function () {
  const card = document.getElementById('stat-conflict-card');
  const num  = document.getElementById('stat-conflict');
  const conflicts = window.allConflicts || [];
  if (num)  { num.textContent = conflicts.length; }
  if (card) { card.style.display = conflicts.length > 0 ? '' : 'none'; }
};

/**
 * Computes and triggers alert-banners for vulnerability checks and requirements sync drift.
 */
window.updateVulnBanner = function (packages) {
  const elVulnBanner = document.getElementById('vuln-banner');
  if (!elVulnBanner) return;
  const count = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;
  if (count > 0 && !window.vulnBannerDismissed) {
    const el = document.getElementById('vuln-banner-count');
    if (el) el.textContent = count;
    elVulnBanner.classList.add('visible');
  } else {
    elVulnBanner.classList.remove('visible');
  }
};

window.updateDriftBanner = function (packages) {
  const elDriftBanner = document.getElementById('drift-banner');
  if (!elDriftBanner) return;
  const drifted = window.computeDrift(packages);
  if (drifted.length > 0 && !window.driftBannerDismissed) {
    const el = document.getElementById('drift-banner-count');
    if (el) el.textContent = drifted.length;
    elDriftBanner.classList.add('visible');
  } else {
    elDriftBanner.classList.remove('visible');
  }
};

/**
 * Refreshes top-level statistics display numbers in header card overlays.
 * 
 * @param {Array<object>} packages - The raw package list.
 */
window.updateStats = function (packages) {
  const ok       = packages.filter(p => p.status === 'up-to-date').length;
  const updates  = packages.filter(p => p.status === 'update-available').length;
  const unknown  = packages.filter(p => p.status === 'unknown' || p.status === 'not-installed').length;
  const vulnPkgs = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;

  const elStatOk = document.getElementById('stat-ok');
  const elStatUpdate = document.getElementById('stat-update');
  const elStatUnknown = document.getElementById('stat-unknown');
  const elStatVuln = document.getElementById('stat-vuln');
  const elStatVulnCard = document.getElementById('stat-vuln-card');
  const elStatGroupsCard = document.getElementById('stat-groups-card');
  const elStatGroupsText = document.getElementById('stat-groups-text');

  if (elStatOk) elStatOk.textContent = ok;
  if (elStatUpdate) elStatUpdate.textContent = updates;
  if (elStatUnknown) elStatUnknown.textContent = unknown;

  if (elStatVuln) elStatVuln.textContent = vulnPkgs;
  if (elStatVulnCard) elStatVulnCard.style.display = vulnPkgs > 0 ? '' : 'none';

  window.updateVulnBanner(packages);
  window.updateDriftBanner(packages);

  // Group breakdown
  const groupCounts = {};
  for (const pkg of packages) {
    const g = pkg.group || 'main';
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  }
  const nonMainGroups = Object.entries(groupCounts)
    .filter(([g]) => g !== 'main')
    .map(([g, c]) => `${c} ${g}`)
    .join(' · ');
  const mainCount = groupCounts['main'] || 0;
  if (nonMainGroups && elStatGroupsCard && elStatGroupsText) {
    elStatGroupsText.textContent = `${mainCount} main · ${nonMainGroups}`;
    elStatGroupsCard.style.display = '';
  } else if (elStatGroupsCard) {
    elStatGroupsCard.style.display = 'none';
  }
};

/**
 * High-level router that toggles HTML displays based on active tab select.
 * 
 * @param {string} tab - Tab name ('list' | 'dashboard' | 'unused' | 'graph' | etc.).
 * @param {Array<object>} filtered - The filtered set of package items.
 */
window.showTab = function (tab, filtered) {
  const elGraph = document.getElementById('view-graph');
  const elList = document.getElementById('view-list');
  const elUnused = document.getElementById('view-unused');
  const elHistory = document.getElementById('view-history');
  const elDashboard = document.getElementById('view-dashboard');
  const elPerformance = document.getElementById('view-performance');
  const elViewLicenses = document.getElementById('view-licenses');
  const elViewSnapshots = document.getElementById('view-snapshots');

  if (elGraph) elGraph.style.display = 'none';
  if (elList) elList.style.display = 'none';
  if (elUnused) elUnused.style.display = 'none';
  if (elHistory) elHistory.style.display = 'none';
  if (elDashboard) elDashboard.style.display = 'none';
  if (elPerformance) elPerformance.style.display = 'none';
  if (elViewLicenses) elViewLicenses.style.display = 'none';
  if (elViewSnapshots) elViewSnapshots.style.display = 'none';

  if (tab === 'graph') {
    if (elGraph) elGraph.style.display = 'block';
    if (typeof window.renderGraph === 'function') window.renderGraph(filtered);
  } else if (tab === 'unused') {
    if (elUnused) {
      elUnused.style.display = 'flex';
      elUnused.style.flexDirection = 'column';
      window.renderUnused();
    }
  } else if (tab === 'history') {
    if (elHistory) elHistory.style.display = 'flex';
    window.renderHistory();
  } else if (tab === 'dashboard') {
    if (elDashboard) {
      elDashboard.style.display = 'flex';
      window.renderDashboard();
    }
  } else if (tab === 'performance') {
    if (elPerformance) {
      elPerformance.style.display = 'flex';
      window.renderPerformance(filtered);
    }
  } else if (tab === 'licenses') {
    if (elViewLicenses) {
      elViewLicenses.style.display = 'flex';
      elViewLicenses.style.flexDirection = 'column';
      window.renderLicenses();
    }
  } else if (tab === 'snapshots') {
    if (elViewSnapshots) {
      elViewSnapshots.style.display = 'flex';
      elViewSnapshots.style.flexDirection = 'column';
      window.vscode.postMessage({ type: 'listSnapshots' });
      window.renderSnapshots();
    }
  } else {
    if (elList) elList.style.display = 'block';
    if (typeof window.renderTable === 'function') window.renderTable(filtered);
  }
};
