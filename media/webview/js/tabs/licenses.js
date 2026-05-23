/**
 * License Compliance View Renderer.
 * Groups active packages by their copyleft risk level to highlight license compliance concerns.
 */

/**
 * Compiles and renders the License Compliance layout.
 * Groups active packages by their license compliance risk levels
 * (Low/Medium/High/Unknown copyleft check).
 * Exposes a clickable row per package to reveal its deep details.
 * 
 * @returns {void}
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
