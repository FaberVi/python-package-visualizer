/**
 * Translation Engine for Python Package Visualizer.
 * Provides the lookup engine, language setter, and static HTML translator.
 */

window.i18n = window.i18n || {};
// Application Language settings
window.currentLang = 'en';

try {
  const stored = localStorage.getItem('ppv-lang');
  if (stored && window.i18n[stored]) { window.currentLang = stored; }
} catch (_) {
  // Silent fallback in case localStorage is sandboxed out
}

/**
 * Translates a key using the active language.
 * Falls back to English, then the key itself.
 * 
 * @param {string} key - The translation key to look up.
 * @returns {string} The localized string.
 */
window.t = function (key) {
  return (window.i18n[window.currentLang] && window.i18n[window.currentLang][key])
    || (window.i18n.en[key])
    || key;
};

/**
 * Changes the active language, persists the setting globally,
 * and triggers page translation updates.
 * 
 * @param {string} lang - The target language code ('en' or 'it').
 */
window.setLanguage = function (lang) {
  if (!window.i18n[lang]) return;
  window.currentLang = lang;
  try { localStorage.setItem('ppv-lang', lang); } catch (_) {}
  
  // Inform the extension host so the settings config updates accordingly
  if (window.vscode) {
    window.vscode.postMessage({ type: 'updateSetting', key: 'language', value: lang });
  }
  
  if (typeof window.applyStaticTranslations === 'function') {
    window.applyStaticTranslations();
  }
  if (typeof window.renderAll === 'function') {
    window.renderAll();
  }
};

/**
 * Triggers query select lookups across text buttons, toolbar status arrays,
 * search boxes, and active modals to swap EN/IT translations without full loads.
 */
window.applyStaticTranslations = function () {
  const t = window.t || (k => k);

  const elTitle = document.getElementById('header-h1');
  const elSub = document.getElementById('header-sub');
  const elBtnAddPkg = document.getElementById('btn-add-pkg');
  const elBtnRefresh = document.getElementById('btn-refresh');

  if (elTitle) elTitle.textContent = t('header.title');
  if (elSub) elSub.textContent = t('header.subtitle');
  if (elBtnAddPkg) elBtnAddPkg.textContent = t('header.addPackage');
  if (elBtnRefresh) elBtnRefresh.innerHTML = `&#x21BB; ${t('header.refresh')}`;

  // Export options translations
  const exportLabelReport = document.querySelector('.export-section-label');
  if (exportLabelReport) exportLabelReport.textContent = t('export.reportLabel');

  document.querySelectorAll('.export-item').forEach(item => {
    const action = item.dataset.action;
    if (action === 'export-md') item.innerHTML = t('export.markdown');
    if (action === 'export-json') item.innerHTML = t('export.json');
    if (action === 'gen-requirements') item.innerHTML = t('export.genRequirements');
    if (action === 'gen-setup-bash') item.innerHTML = t('export.genBash');
    if (action === 'gen-setup-ps') item.innerHTML = t('export.genPs');
    if (action === 'gen-setup-md') item.innerHTML = t('export.genMd');
    if (action === 'migrate-uv') item.innerHTML = t('export.migrateUv');
    if (action === 'migrate-poetry') item.innerHTML = t('export.migratePoetry');
  });

  const elSearch = document.getElementById('search');
  if (elSearch) elSearch.placeholder = t('toolbar.search');

  const fs = document.getElementById('filter-status');
  if (fs) {
    fs.options[0].textContent = t('toolbar.allStatuses');
    fs.options[1].textContent = t('toolbar.updatesAvailable');
    fs.options[2].textContent = t('toolbar.upToDate');
    fs.options[3].textContent = t('toolbar.unknown');
    fs.options[4].textContent = t('toolbar.notInstalled');
  }

  const fg = document.getElementById('filter-group');
  if (fg) {
    fg.options[0].textContent = t('toolbar.allGroups');
    fg.options[1].textContent = t('toolbar.main');
    fg.options[2].textContent = t('toolbar.dev');
    fg.options[3].textContent = t('toolbar.test');
    fg.options[4].textContent = t('toolbar.docs');
    fg.options[5].textContent = t('toolbar.lint');
    fg.options[6].textContent = t('toolbar.optional');
  }

  const elSafeMode = document.getElementById('btn-safe-mode');
  if (elSafeMode) {
    elSafeMode.textContent = t('toolbar.safeMode');
    elSafeMode.classList.toggle('active', window.safeMode);
  }

  const labelOk = document.querySelector('#stat-ok-card span:nth-child(3)');
  const labelUpdate = document.querySelector('#stat-update-card span:nth-child(3)');
  const labelUnknown = document.querySelector('#stat-unknown-card span:nth-child(3)');
  const labelVuln = document.querySelector('#stat-vuln-card span:nth-child(3)');
  const labelConflict = document.querySelector('#stat-conflict-card span:nth-child(3)');

  if (labelOk) labelOk.textContent = t('stats.upToDate');
  if (labelUpdate) labelUpdate.textContent = t('stats.updatesAvailable');
  if (labelUnknown) labelUnknown.textContent = t('stats.unknown');
  if (labelVuln) labelVuln.textContent = t('stats.vulnerable');
  if (labelConflict) labelConflict.textContent = t('stats.conflicts');

  document.querySelectorAll('#tab-bar .tab').forEach(tab => {
    const key = tab.dataset.tab;
    if (key === 'list') tab.textContent = t('tab.list');
    if (key === 'dashboard') tab.textContent = t('tab.dashboard');
    if (key === 'unused') tab.textContent = t('tab.unused');
    if (key === 'graph') tab.textContent = t('tab.graph');
    if (key === 'performance') tab.textContent = t('tab.performance');
    if (key === 'history') tab.textContent = t('tab.history');
    if (key === 'licenses') tab.textContent = t('tab.licenses');
    if (key === 'snapshots') tab.textContent = t('tab.snapshots');
  });

  // Table header sorting labels
  document.querySelectorAll('th[data-col]').forEach(th => {
    const col = th.dataset.col;
    const inner = th.querySelector('.th-inner');
    if (inner) {
      const icon = inner.querySelector('.sort-icon')?.outerHTML || '';
      if (col === 'name') inner.innerHTML = `${t('th.package')} ${icon}`;
      if (col === 'installed') inner.innerHTML = `${t('th.installed')} ${icon}`;
      if (col === 'latest') inner.innerHTML = `${t('th.latest')} ${icon}`;
      if (col === 'status') inner.innerHTML = `${t('th.status')} ${icon}`;
      if (col === 'released') inner.innerHTML = `${t('th.released')} ${icon}`;
    }
  });

  const healthHeader = document.querySelector('#view-list th.col-health .th-inner');
  if (healthHeader) {
    healthHeader.textContent = t('th.health');
    healthHeader.setAttribute('title', t('th.health'));
  }

  const actionsHeader = document.querySelector('#view-list th:not([class]):not([data-col]) .th-inner');
  if (actionsHeader) actionsHeader.textContent = t('th.actions');

  const bannerVulnMsg = document.querySelector('#vuln-banner .alert-banner-msg');
  if (bannerVulnMsg) {
    const count = window.allPackages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;
    bannerVulnMsg.innerHTML = `🔴 <strong id="vuln-banner-count">${count}</strong> ${t('banner.vulnMsg')}`;
  }
  const bannerVulnBtn = document.getElementById('vuln-banner-jump');
  if (bannerVulnBtn) bannerVulnBtn.textContent = t('banner.vulnAction');

  const bannerDriftMsg = document.querySelector('#drift-banner .alert-banner-msg');
  if (bannerDriftMsg) {
    const drifted = window.computeDrift ? window.computeDrift(window.allPackages) : [];
    bannerDriftMsg.innerHTML = `⚠️ <strong id="drift-banner-count">${drifted.length}</strong> ${t('banner.driftMsg')}`;
  }
  const bannerDriftBtn = document.getElementById('drift-banner-view');
  if (bannerDriftBtn) bannerDriftBtn.textContent = t('banner.driftAction');

  const addTitle = document.querySelector('#add-pkg-header-text h2');
  const addSub = document.querySelector('#add-pkg-header-text p');
  const addInput = document.getElementById('add-pkg-input');
  const addSearch = document.getElementById('add-pkg-search');
  const addCancel = document.getElementById('add-pkg-cancel');
  const addInstall = document.getElementById('add-pkg-install');

  if (addTitle) addTitle.textContent = t('addPkg.title');
  if (addSub) addSub.textContent = t('addPkg.subtitle');
  if (addInput) addInput.placeholder = t('addPkg.placeholder');
  if (addSearch) addSearch.textContent = t('addPkg.searchBtn');
  if (addCancel) addCancel.textContent = t('addPkg.cancel');
  if (addInstall && !addInstall.classList.contains('is-installed') && !addInstall.disabled) {
    addInstall.innerHTML = t('addPkg.installBtn');
  }
};

