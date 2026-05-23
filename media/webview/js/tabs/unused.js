/**
 * Unused Package Analytics and Badge Synchronization.
 * Evaluates declared dependencies against static import scan metrics.
 */

/**
 * Compiles and renders the Unused Packages checklist.
 * Compares import graph scans against packages declared in requirements files.
 * Displays a multi-signal confidence score per package.
 * 
 * @returns {void}
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

  /**
   * Translate machine-readable reason codes into localized human-readable strings.
   * @param {string[]} reasons - Array of reason codes from the backend.
   * @returns {string} Translated tooltip text.
   */
  function translateReasons(reasons) {
    if (!reasons || reasons.length === 0) return '';
    return reasons.map(r => {
      if (r.startsWith('required-by:')) {
        const pkgs = r.replace('required-by:', '');
        return window.t('unused.reasonTransitive').replace('{pkg}', pkgs);
      }
      if (r.startsWith('group:')) {
        const group = r.replace('group:', '');
        return window.t('unused.reasonDevGroup').replace('{group}', group);
      }
      if (r === 'reverse-map') return window.t('unused.reasonReverseMap');
      if (r === 'high-downloads') return window.t('unused.reasonPopular');
      if (r === 'partial-match') return window.t('unused.reasonPartialMatch');
      return r;
    }).join('\n');
  }

  /**
   * Determine the color for a confidence value using a three-tier scale.
   * @param {number} confidence - 5–100 percentage.
   * @returns {{ color: string, bg: string, border: string, label: string }}
   */
  function getConfidenceTier(confidence) {
    if (confidence >= 80) {
      return {
        color: '#f87171',
        bg: 'rgba(248,113,113,.15)',
        border: 'rgba(248,113,113,.4)',
        label: window.t('unused.highConfidence')
      };
    }
    if (confidence >= 50) {
      return {
        color: '#fb923c',
        bg: 'rgba(251,146,60,.12)',
        border: 'rgba(251,146,60,.4)',
        label: window.t('unused.mediumConfidence')
      };
    }
    return {
      color: '#4ade80',
      bg: 'rgba(74,222,128,.12)',
      border: 'rgba(74,222,128,.4)',
      label: window.t('unused.lowConfidence')
    };
  }

  // Sort by confidence descending (highest risk first)
  const sorted = [...unused].sort((a, b) => (b.unusedConfidence ?? 100) - (a.unusedConfidence ?? 100));

  // Compute tier counts for summary cards
  const highCount = sorted.filter(p => (p.unusedConfidence ?? 100) >= 80).length;
  const mediumCount = sorted.filter(p => {
    const c = p.unusedConfidence ?? 100;
    return c >= 50 && c < 80;
  }).length;
  const lowCount = sorted.filter(p => (p.unusedConfidence ?? 100) < 50).length;

  const rowsHtml = sorted.map(pkg => {
    const sourceShort = pkg.source ? String(pkg.source).split(/[\\/]/).pop() : '\u2014';
    const confidence = pkg.unusedConfidence ?? 100;
    const tier = getConfidenceTier(confidence);
    const tooltip = translateReasons(pkg.unusedReasons);

    return `
    <tr class="unused-row" data-pkg="${window.esc(pkg.name)}" style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
      <td style="padding:12px 16px;">
        <div style="font-weight:600;color:var(--vscode-textLink-foreground);cursor:pointer;" class="pkg-name-link" data-pkg="${window.esc(pkg.name)}">${window.esc(pkg.name)}</div>
        ${pkg.summary ? `<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(pkg.summary)}</div>` : ''}
      </td>
      <td style="padding:12px 16px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(pkg.installedVersion || '\u2014')}</td>
      <td style="padding:12px 16px;font-size:11px;color:var(--vscode-descriptionForeground);" title="${window.esc(pkg.source || '')}">${window.esc(sourceShort)}</td>
      <td style="padding:12px 14px;min-width:140px;" title="${window.esc(tooltip)}">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:color-mix(in srgb, var(--vscode-panel-border) 30%, transparent);border-radius:3px;overflow:hidden;min-width:60px;">
            <div style="width:${confidence}%;height:100%;background:${tier.color};border-radius:3px;transition:width .3s ease;"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${tier.color};min-width:32px;text-align:right;">${confidence}%</span>
        </div>
        <div style="font-size:9px;color:var(--vscode-descriptionForeground);margin-top:3px;">${window.esc(tier.label)}</div>
      </td>
      <td style="padding:12px 16px;text-align:right;white-space:nowrap;">
        <button class="unused-remove-btn" data-name="${window.esc(pkg.name)}" data-source="${window.esc(pkg.source || '')}" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);padding:5px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">${window.t('btn.remove')}</button>
      </td>
    </tr>
    `;
  }).join('');

  elUnused.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('unused.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;">${window.t('unused.subtitle')}</div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.totalScanned')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--vscode-foreground);">${totalScanned}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #f87171;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">🔴 ${window.t('unused.highConfidence')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#f87171;">${highCount}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #fb923c;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">🟠 ${window.t('unused.mediumConfidence')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#fb923c;">${mediumCount}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #4ade80;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">🟢 ${window.t('unused.lowConfidence')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#4ade80;">${lowCount}</div>
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
              <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.confidence')} <span title="${window.esc(window.t('unused.confidenceTip'))}" style="cursor:help;opacity:.6;font-size:9px;">?</span></th>
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
 * @returns {void}
 */
window.updateUnusedBadge = function (packages) {
  const count = packages.filter(p => !p.isUsed).length;
  const tab = document.querySelector('.tab[data-tab="unused"]');
  if (tab) {
    tab.textContent = count > 0 ? `${window.t('tab.unused')} (${count})` : window.t('tab.unused');
  }
};
