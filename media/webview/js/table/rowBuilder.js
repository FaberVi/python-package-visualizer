/**
 * Builds HTML for a single package table row.
 *
 * @param {object} pkg
 * @param {object} helpers
 * @returns {string}
 */
window.buildTableRowHtml = function (pkg, helpers) {
  const {
    esc,
    healthRingHtml,
    statusBadge,
    isMajorJump,
    isChecked,
  } = helpers;

  const canUpdate = pkg.status === 'update-available';
  const isConflictBlocked = pkg.status === 'conflict-blocked' || pkg.updateBlockedByConflict;
  const isMajor = isMajorJump(pkg.installedVersion, pkg.latestVersion);
  const isLocked = window.safeMode && isMajor;

  let hasDrift = false;
  let reqVersion = '';
  if (pkg.specifiedVersion && pkg.installedVersion && window.hasDrift(pkg.specifiedVersion, pkg.installedVersion)) {
    hasDrift = true;
    reqVersion = window.extractExactPinnedVersion(pkg.specifiedVersion) || pkg.specifiedVersion;
  }

  let actionBtnHtml = '';
  if (canUpdate) {
    if (isLocked) {
      actionBtnHtml += `<button class="action-btn update-btn" disabled title="${window.t('tag.majorLockTitle')}">${window.t('tag.majorLock')}</button>`;
    } else {
      actionBtnHtml += `<button class="action-btn update-btn" data-name="${esc(pkg.name)}">${window.t('btn.update')}</button>`;
    }
  } else if (isConflictBlocked) {
    if (pkg.previousVersion) {
      actionBtnHtml += `<button class="action-btn rollback-btn" data-name="${esc(pkg.name)}" data-version="${esc(pkg.previousVersion)}" title="${window.t('btn.revertPreviousTitle')}">${window.t('btn.revertPrevious')}</button> `;
    }
    if (pkg.latestVersion && pkg.latestVersion !== 'unknown') {
      actionBtnHtml += `<button class="action-btn force-update-btn" data-name="${esc(pkg.name)}" title="${window.t('btn.forceUpdateTitle')}">${window.t('btn.forceUpdate')}</button>`;
    }
    if (!actionBtnHtml) {
      actionBtnHtml += `<span style="font-size:11px;opacity:0.5;">\u2014</span>`;
    }
  } else if (pkg.status === 'not-installed') {
    actionBtnHtml += `<button class="action-btn install-btn" data-name="${esc(pkg.name)}">${window.t('btn.install')}</button>`;
  } else if (!hasDrift) {
    actionBtnHtml += `<span style="font-size:11px;opacity:0.5;">\u2014</span>`;
  }

  let tagsHtml = '';
  if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
    tagsHtml += ` <span class="inline-tag cve" title="Has security vulnerabilities">${window.t('tag.cve')}</span>`;
  }
  if (pkg.hasConflict) {
    tagsHtml += ` <span class="inline-tag conflict" title="Has dependency conflicts">${window.t('tag.conflict')}</span>`;
  }
  if (!pkg.isUsed && pkg.status !== 'not-installed') {
    const conf = pkg.unusedConfidence ?? 100;
    tagsHtml += ` <span class="inline-tag unused" title="${window.t('tag.unusedTitle').replace('{n}', conf)}">${window.t('tag.unused')}</span>`;
  }
  if (hasDrift) {
    tagsHtml += ` <span class="inline-tag drift" title="${window.t('tag.driftTitle')}">${window.t('tag.drift')} (${reqVersion})</span>`;
  }

  if (pkg.releaseDate) {
    const ageMs = Date.now() - new Date(pkg.releaseDate).getTime();
    const TWELVE_MONTHS = 365.25 * 24 * 60 * 60 * 1000;
    const TWENTYFOUR_MONTHS = TWELVE_MONTHS * 2;
    if (ageMs > TWENTYFOUR_MONTHS) {
      tagsHtml += ` <span class="inline-tag abandoned" title="${window.t('tag.abandonedTitle')}">${window.t('tag.abandoned')}</span>`;
    } else if (ageMs > TWELVE_MONTHS) {
      tagsHtml += ` <span class="inline-tag stale" title="${window.t('tag.staleTitle')}">${window.t('tag.stale')}</span>`;
    }
  }

  let syncBtnHtml = '';
  if (hasDrift) {
    syncBtnHtml = `<button class="action-btn sync sync-btn" data-name="${esc(pkg.name)}" data-source="${esc(pkg.source || '')}" title="${window.t('btn.syncTitle')}">${window.t('btn.sync')}</button> `;
  }

  const relDate = pkg.releaseDate ? window.formatReleaseDate(pkg.releaseDate) : '\u2014';

  return `
    <tr class="pkg-row ${isConflictBlocked ? 'row-conflict' : ''}" data-name="${esc(pkg.name)}">
      <td class="col-check" style="text-align:center"><input type="checkbox" class="pkg-check" data-name="${esc(pkg.name)}" ${isChecked}></td>
      <td class="col-name">
        <div style="font-weight:600;display:flex;align-items:center;gap:6px;" class="pkg-detail-trigger" data-name="${esc(pkg.name)}">
          ${esc(pkg.name)}
          ${tagsHtml}
        </div>
        ${pkg.summary ? `<div class="pkg-desc">${esc(pkg.summary)}</div>` : ''}
      </td>
      <td class="col-required font-mono">${esc(pkg.specifiedVersion || '\u2014')}</td>
      <td class="col-installed font-mono">${esc(pkg.installedVersion || window.t('detail.notInstalledVal'))}</td>
      <td class="col-latest font-mono">${esc(pkg.latestVersion || '\u2014')}</td>
      <td class="col-status">${statusBadge(pkg.status)}</td>
      <td class="col-released">${esc(relDate)}</td>
      <td class="col-health" style="text-align:center">${healthRingHtml(pkg)}</td>
      <td class="col-actions" style="text-align:right;white-space:nowrap;">
        <span class="act-group">
          ${syncBtnHtml}
          ${actionBtnHtml}
        </span>
      </td>
    </tr>
  `;
};
