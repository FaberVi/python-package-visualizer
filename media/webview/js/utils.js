/**
 * Shared utility helpers for Python Package Visualizer.
 * Provides escaping, formatting, health scoring, and badge rendering.
 * Loaded sequentially after i18n.js to make all helpers available globally.
 */

/**
 * Escapes HTML special characters to prevent cross-site scripting (XSS)
 * when rendering dynamic package names, summaries, or metadata.
 * 
 * @param {string} str - The raw string to escape.
 * @returns {string} The HTML-safe string.
 */
window.esc = function (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Formats package weekly download numbers into a concise human-readable string.
 * This ensures the layout is not cluttered by large digit counts.
 * 
 * @param {number} n - The raw download count.
 * @returns {string} Formatted download representation (e.g. 1.2M, 50K, 150).
 */
window.formatDownloads = function (n) {
  if (!n || n <= 0) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
};

/**
 * Converts standard release date strings into localized US short format.
 * This is used to maintain a clean timeline and column width.
 * 
 * @param {string} dateStr - Raw release date (YYYY-MM-DD).
 * @returns {string} The formatted local date string.
 */
window.formatReleaseDate = function (dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

/**
 * Determines whether a version difference constitutes a major semver jump.
 * This is used by Safe Mode to block potentially breaking version changes.
 * 
 * @param {string} installed - The installed version.
 * @param {string} latest - The latest available version.
 * @returns {boolean} True if latest version has a higher major component.
 */
window.isMajorJump = function (installed, latest) {
  if (!installed || !latest) return false;
  const maj = v => parseInt((v || '0').replace(/[^\d.].*/, '').split('.')[0], 10) || 0;
  return maj(latest) > maj(installed);
};

/**
 * Identifies package version drift where the installed package version
 * does not match the exact pin or constraint in requirements.txt.
 * 
 * @param {Array<object>} packages - List of package objects.
 * @returns {Array<object>} Filtered list of packages with mismatched versions.
 */
window.computeDrift = function (packages) {
  return packages.filter(pkg => {
    if (!pkg.specifiedVersion || !pkg.installedVersion) return false;
    const m = pkg.specifiedVersion.match(/[=!<>~^]+\s*([\d][^\s,;]*)/);
    if (!m) return false;
    const pinned = m[1];
    return pinned !== pkg.installedVersion;
  });
};

/**
 * Extracts the pinned version string from requirement configuration.
 * Helps display what is written in requirements.txt versus actual installed.
 * 
 * @param {object} pkg - The package object.
 * @returns {string} The extracted pinned version or specified version placeholder.
 */
window.getDriftReqVersion = function (pkg) {
  if (!pkg.specifiedVersion) return '?';
  const m = pkg.specifiedVersion.match(/[=!<>~^]+\s*([\d][^\s,;]*)/);
  return m ? m[1] : pkg.specifiedVersion;
};

/**
 * Computes an overall health score (0-100) based on severity factors.
 * Factoring in security vulnerabilities, updates, and package decay.
 * 
 * @param {object} pkg - The package object.
 * @returns {number} The final calculated health score.
 */
window.healthScore = function (pkg) {
  let s = 100;
  if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) s -= 30;
  if (pkg.status === 'update-available') s -= 20;
  if (pkg.status === 'unknown' || pkg.status === 'not-installed') s -= 10;
  if (pkg.releaseDate) {
    const days = (Date.now() - new Date(pkg.releaseDate + 'T00:00:00').getTime()) / 86400000;
    if (days > 730) s -= 20;
    else if (days > 365) s -= 10;
  }
  return Math.max(0, Math.min(100, s));
};

/**
 * Generates dynamic SVG markup for package health rings.
 * Visually communicates health scores with adaptive color zones.
 * 
 * @param {object} pkg - The package object.
 * @returns {string} SVG HTML template.
 */
window.healthRingHtml = function (pkg) {
  const score = window.healthScore(pkg);
  const r = 9, circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cls = score >= 80 ? 'health-score-good' : score >= 50 ? 'health-score-warn' : 'health-score-bad';
  return `<svg class="health-ring ${cls}" width="24" height="24" viewBox="0 0 24 24" title="Health: ${score}/100">
    <circle class="track" cx="12" cy="12" r="${r}"/>
    <circle class="fill" cx="12" cy="12" r="${r}"
      stroke-dasharray="${circ.toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 12 12)"/>
    <text class="health-score-text" x="12" y="12">${score}</text>
  </svg>`;
};

/**
 * Returns a size categorizing class based on install bytes size.
 * Tints row columns differently for high disk-usage packages.
 * 
 * @param {number} bytes - Install size in bytes.
 * @returns {string} The corresponding CSS layout tint class.
 */
window.sizeTintClass = function (bytes) {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb > 50)  return 'size-xl';
  if (mb > 10)  return 'size-lg';
  if (mb > 1)   return 'size-md';
  return '';
};

/**
 * Assesses the potential risk of a license string for commercial compliance.
 * Colors indicators red for AGPL/GPL copyleft licenses.
 * 
 * @param {string} license - The raw license identifier.
 * @returns {string} Category ('safe' | 'caution' | 'restricted' | 'unknown').
 */
window.getLicenseRisk = function (license) {
  if (!license) return 'unknown';
  const l = license.toUpperCase();
  if (/\bAGPL\b/.test(l) || /\bGPL[-\s]?[23]/.test(l)) return 'restricted';
  if (/\bLGPL\b/.test(l) || /\bMPL\b/.test(l) || /\bEUPL\b/.test(l)) return 'caution';
  if (/\bMIT\b|\bBSD\b|\bAPACHE\b|\bISC\b|\bUNLICENSE\b|\bPSF\b|\bWTFPL\b/.test(l)) return 'safe';
  return 'unknown';
};

/**
 * Returns dynamic HTML badge matching package update/sync status.
 * Standardizes styling class and leverages localization dictionaries.
 * 
 * @param {string} status - Package status string.
 * @returns {string} HTML span element.
 */
window.statusBadge = function (status) {
  const labels = {
    'up-to-date':       window.t('status.upToDate'),
    'update-available': window.t('status.updateAvailable'),
    'not-installed':    window.t('status.notInstalled'),
    'unknown':          window.t('status.unknown'),
  };
  return `<span class="badge ${window.esc(status || 'unknown')}">${labels[status] || window.t('status.unknown')}</span>`;
};

/**
 * Renders the primary fullscreen loading state during environment discovery.
 * Ensures the user has visual feedback when long shell commands run.
 * 
 * @param {string} msg - Dynamic message string.
 */
window.showLoading = function (msg) {
  const elLoadingMsg = document.getElementById('loading-msg');
  const elLoading    = document.getElementById('loading');
  const elEmpty      = document.getElementById('empty-state');
  const elGraph      = document.getElementById('view-graph');
  const elList       = document.getElementById('view-list');
  const elUnused     = document.getElementById('view-unused');
  const elHistory    = document.getElementById('view-history');
  
  if (elLoadingMsg) elLoadingMsg.textContent = msg || 'Scanning workspace…';
  if (elLoading) elLoading.style.display = 'flex';
  if (elEmpty) elEmpty.style.display = 'none';
  if (elGraph) elGraph.style.display = 'none';
  if (elList) elList.style.display = 'none';
  if (elUnused) elUnused.style.display = 'none';
  if (elHistory) elHistory.style.display = 'none';
};

/**
 * Dismisses the fullscreen loading state when a background scan completes.
 */
window.hideLoading = function () {
  const elLoading = document.getElementById('loading');
  if (elLoading) elLoading.style.display = 'none';
};

/**
 * Displays an empty-state panel when no valid python dependency files are found.
 * Provides helpful diagnostic directions to resolve requirements setup.
 */
window.showEmpty = function () {
  const elEmpty   = document.getElementById('empty-state');
  const elGraph   = document.getElementById('view-graph');
  const elList    = document.getElementById('view-list');
  const elUnused  = document.getElementById('view-unused');
  const elHistory = document.getElementById('view-history');
  
  if (elEmpty) elEmpty.style.display = 'flex';
  if (elGraph) elGraph.style.display = 'none';
  if (elList) elList.style.display = 'none';
  if (elUnused) elUnused.style.display = 'none';
  if (elHistory) elHistory.style.display = 'none';
};
