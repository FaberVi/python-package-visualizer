/**
 * Sidebar Welcome and Settings View System.
 * Coordinates preferences updates and stats sync between the VS Code host and the sidebar panel.
 */

const vscode = acquireVsCodeApi();

/**
 * Dispatches web requests to open external urls via the host application.
 * 
 * @param {string} url - The target external URL to open.
 * @returns {void}
 */
function openUrl(url) {
  vscode.postMessage({ type: 'openUrl', url });
}

document.getElementById('btn-open').addEventListener('click', () =>
  vscode.postMessage({ type: 'openPanel' })
);

document.getElementById('link-docs').addEventListener('click', () =>
  openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer#readme')
);
document.getElementById('link-changelog').addEventListener('click', () =>
  openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer/blob/main/CHANGELOG.md')
);
document.getElementById('link-issue').addEventListener('click', () =>
  openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer/issues/new')
);
document.getElementById('link-star').addEventListener('click', () =>
  openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer')
);
document.getElementById('link-portfolio').addEventListener('click', () =>
  openUrl('https://codebyelan.in')
);
document.getElementById('link-github-author').addEventListener('click', () =>
  openUrl('https://github.com/Elanchezhiyan-P')
);
document.getElementById('link-linkedin').addEventListener('click', () =>
  openUrl('https://www.linkedin.com/in/elanchezhiyan-p/')
);

// ── Settings ─────────────────────────────────────────
const settingsState = {
  showImportCodeLens: true,
  showImportHover: true,
  autoCheckOnOpen: true,
  notifyOnOutdated: true,
  updateCheckSchedule: 'off',
  showFunctionMetrics: true,
  showMethodCallHover: true,
  showComplexityWarnings: true,
  showTypeHintCoverage: true,
  showDocstringWarnings: true,
};

// Request current settings from extension
vscode.postMessage({ type: 'getSettings' });

/**
 * Applies current workspace configuration settings to the UI controls.
 * Ensures toggle switches and selection inputs align with the backend state.
 * 
 * @param {object} s - Current settings key-value mapping.
 * @returns {void}
 */
function applySettings(s) {
  Object.assign(settingsState, s);
  document.querySelectorAll('.toggle-switch').forEach(el => {
    const key = el.dataset.setting;
    if (settingsState[key]) el.classList.add('on');
    else el.classList.remove('on');
  });
  document.querySelectorAll('.setting-select').forEach(el => {
    const key = el.dataset.setting;
    if (settingsState[key]) el.value = settingsState[key];
  });
  // Language selector
  const langSel = document.getElementById('sidebar-lang-select');
  if (langSel && settingsState.language) {
    langSel.value = settingsState.language;
  }
}

// Toggle handler
document.querySelectorAll('.toggle-switch').forEach(el => {
  el.addEventListener('click', () => {
    const key = el.dataset.setting;
    const newVal = !settingsState[key];
    settingsState[key] = newVal;
    if (newVal) el.classList.add('on');
    else el.classList.remove('on');
    vscode.postMessage({ type: 'updateSetting', key, value: newVal });
  });
});

// Select handler
document.querySelectorAll('.setting-select').forEach(el => {
  el.addEventListener('change', () => {
    const key = el.dataset.setting;
    const value = el.value;
    settingsState[key] = value;
    vscode.postMessage({ type: 'updateSetting', key, value });
  });
});

// Language selector handler
const langSelect = document.getElementById('sidebar-lang-select');
if (langSelect) {
  langSelect.addEventListener('change', () => {
    const value = langSelect.value;
    settingsState.language = value;
    vscode.postMessage({ type: 'updateSetting', key: 'language', value });
  });
}

window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.type === 'sidebarStats') {
    document.getElementById('ls-ok').textContent     = msg.ok;
    document.getElementById('ls-update').textContent = msg.updates;
    document.getElementById('ls-vuln').textContent   = msg.vulnerable;
    document.getElementById('live-stats').classList.add('visible');

    const driftBox = document.getElementById('drift-stat-box');
    if (driftBox) {
      const driftedCount = msg.drifted !== undefined ? msg.drifted : 0;
      driftBox.classList.remove('warning', 'ok');

      if (driftedCount > 0) {
        driftBox.classList.add('warning');
        const txtTemplate = document.getElementById('txt-stats-drifted').textContent;
        driftBox.innerHTML = `<span class="drift-icon">⚠️</span> <span>${txtTemplate.replace('{count}', driftedCount)}</span>`;
      } else {
        driftBox.classList.add('ok');
        const txtTemplate = document.getElementById('txt-stats-all-aligned').textContent;
        driftBox.innerHTML = `<span class="drift-icon">✅</span> <span>${txtTemplate}</span>`;
      }
      driftBox.classList.add('visible');
    }
  }
  if (msg.type === 'settings') {
    applySettings(msg.settings);
  }
});
