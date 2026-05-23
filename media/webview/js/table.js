/**
 * Package List Table Renderer for Python Package Visualizer.
 * Dynamically builds row elements for packages, handles status tags (CVE, conflict, drift, unused),
 * and registers interactive DOM listeners for selections and updates.
 *
 * WHY: Decoupling the table compilation and row event attachments into a dedicated module
 * makes the list view extremely robust and easy to optimize or extend.
 */

/**
 * Re-compiles HTML structure inside #pkg-table-body, formatting status badges,
 * health score circles, CVE danger tags, and syncing checkbox choices.
 * 
 * @param {Array<object>} filtered - The filtered set of package items to render.
 */
window.renderTable = function (filtered) {
  const tbody = document.getElementById('pkg-table-body');
  const countEl = document.getElementById('result-count');
  if (!tbody) return;

  tbody.innerHTML = '';

  const esc = window.esc || (s => s);
  const healthRingHtml = window.healthRingHtml || (p => '');
  const statusBadge = window.statusBadge || (s => s);
  const isMajorJump = window.isMajorJump || (() => false);

  if (countEl) {
    if (filtered.length === window.allPackages.length) {
      countEl.innerHTML = `${window.t('result.showing')} <strong>${filtered.length}</strong> ${window.t('result.of')} <strong>${window.allPackages.length}</strong> ${window.t('result.packages')}`;
    } else {
      countEl.innerHTML = `${window.t('result.showing')} <strong>${filtered.length}</strong> ${window.t('result.of')} <strong>${window.allPackages.length}</strong> ${window.t('result.packages')} <button id="btn-clear-filters" class="clear-link">${window.t('result.clear')}</button>`;
      document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
        window.clearFilters();
      });
    }
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding:40px 20px;text-align:center;color:var(--vscode-descriptionForeground)">
          <div style="font-size:24px;margin-bottom:8px;">🔍</div>
          <strong>${window.t('empty.noMatch')}</strong>
          <p style="margin-top:6px;font-size:11px;">${window.t('empty.tryClearing')}</p>
        </td>
      </tr>
    `;
    return;
  }

  const listRows = filtered.map(pkg => {
    const isChecked = window.selectedPackages.has(pkg.name) ? 'checked' : '';
    const canUpdate = pkg.status === 'update-available';
    const isMajor = isMajorJump(pkg.installedVersion, pkg.latestVersion);
    const isLocked = window.safeMode && isMajor;

    // Drift checking: Pin requirements to actual installed
    let hasDrift = false;
    let reqVersion = '';
    if (pkg.specifiedVersion && pkg.installedVersion) {
      const pinned = window.extractPinnedVersion(pkg.specifiedVersion);
      if (pinned) {
        reqVersion = pinned;
        if (pinned !== pkg.installedVersion) {
          hasDrift = true;
        }
      }
    }

    // Actions Button HTML compilation
    let actionBtnHtml = '';
    if (canUpdate) {
      if (isLocked) {
        actionBtnHtml += `<button class="action-btn update-btn" disabled title="${window.t('tag.majorLockTitle')}">${window.t('tag.majorLock')}</button>`;
      } else {
        actionBtnHtml += `<button class="action-btn update-btn" data-name="${esc(pkg.name)}">${window.t('btn.update')}</button>`;
      }
    } else if (pkg.status === 'not-installed') {
      actionBtnHtml += `<button class="action-btn install-btn" data-name="${esc(pkg.name)}">${window.t('btn.install')}</button>`;
    } else {
      if (!hasDrift) {
        actionBtnHtml += `<span style="font-size:11px;opacity:0.5;">\u2014</span>`;
      }
    }

    // CVE and status badges tags HTML
    let tagsHtml = '';
    if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
      tagsHtml += ` <span class="inline-tag cve" title="Has security vulnerabilities">${window.t('tag.cve')}</span>`;
    }
    if (pkg.hasConflict) {
      tagsHtml += ` <span class="inline-tag conflict" title="Has dependency conflicts">${window.t('tag.conflict')}</span>`;
    }
    if (!pkg.isUsed && pkg.status !== 'not-installed') {
      tagsHtml += ` <span class="inline-tag unused" title="Not imported in python files">${window.t('tag.unused')}</span>`;
    }

    if (hasDrift) {
      tagsHtml += ` <span class="inline-tag drift" title="${window.t('tag.driftTitle')}">${window.t('tag.drift')} (${reqVersion})</span>`;
    }

    // Stale / Abandoned badge based on release age
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

    // Synchronize requirements file action button
    let syncBtnHtml = '';
    if (hasDrift) {
      syncBtnHtml = `<button class="action-btn sync sync-btn" data-name="${esc(pkg.name)}" data-source="${esc(pkg.source || '')}" title="${window.t('btn.syncTitle')}">${window.t('btn.sync')}</button> `;
    }

    const relDate = pkg.releaseDate ? window.formatReleaseDate(pkg.releaseDate) : '\u2014';

    return `
      <tr class="pkg-row" data-name="${esc(pkg.name)}">
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
  }).join('');

  tbody.innerHTML = listRows;

  // Checkbox binds
  tbody.querySelectorAll('.pkg-check').forEach(chk => {
    chk.addEventListener('change', e => {
      e.stopPropagation();
      const name = chk.dataset.name;
      if (chk.checked) {
        window.selectedPackages.add(name);
      } else {
        window.selectedPackages.delete(name);
      }
      window.updateBulkBar();
    });
  });

  // Package row detail slides click binds
  tbody.querySelectorAll('.pkg-detail-trigger').forEach(trigger => {
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const pkg = window.allPackages.find(p => p.name === trigger.dataset.name);
      if (pkg && typeof window.showDetail === 'function') {
        window.showDetail(pkg);
      }
    });
  });

  // Action update binding
  tbody.querySelectorAll('.update-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.updating')}`;
        window.vscode.postMessage({ type: 'updatePackage', name });
      }
    });
  });

  // Action install binding
  tbody.querySelectorAll('.install-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.installing')}`;
        window.vscode.postMessage({ type: 'installNew', name });
      }
    });
  });

  // Action requirements sync alignment binding
  tbody.querySelectorAll('.sync-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const source = btn.dataset.source;
      if (name) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>...`;
        window.vscode.postMessage({ type: 'syncRequirementsToInstalled', name, source });
      }
    });
  });
};

/**
 * Drives showing, counts, and deselect checks on selected table checkbox actions.
 */
window.updateBulkBar = function () {
  const elBulkBar = document.getElementById('bulk-bar');
  const elBulkCount = document.getElementById('bulk-count');
  const elCheckAll = document.getElementById('check-all');
  const elBulkUpdate = document.getElementById('bulk-update');
  const elBulkSync = document.getElementById('bulk-sync');

  if (!elBulkBar) return;

  const t = window.t || (k => k);

  if (window.selectedPackages.size > 0) {
    elBulkBar.classList.add('visible');
    if (elBulkCount) elBulkCount.textContent = `${window.selectedPackages.size} ${t('bulk.selected')}`;

    // Count updates & syncs
    const selectedList = [...window.selectedPackages]
      .map(name => window.allPackages.find(p => p.name === name))
      .filter(Boolean);

    const updatesCount = selectedList.filter(p => p.status === 'update-available').length;
    const syncsCount = selectedList.filter(p => {
      if (p.specifiedVersion && p.installedVersion) {
        const pinned = window.extractPinnedVersion(p.specifiedVersion);
        return pinned !== null && pinned !== p.installedVersion;
      }
      return false;
    }).length;

    // Update button text and visibility
    if (elBulkUpdate) {
      if (updatesCount > 0) {
        elBulkUpdate.style.display = '';
        elBulkUpdate.textContent = `${t('bulk.updateSelected')} (${updatesCount})`;
      } else {
        elBulkUpdate.style.display = 'none';
      }
    }

    // Sync button text and visibility
    if (elBulkSync) {
      if (syncsCount > 0) {
        elBulkSync.style.display = '';
        elBulkSync.textContent = `${t('bulk.syncSelected')} (${syncsCount})`;
      } else {
        elBulkSync.style.display = 'none';
      }
    }
  } else {
    elBulkBar.classList.remove('visible');
  }

  if (elCheckAll) {
    const filtered = window.getFiltered();
    elCheckAll.checked = filtered.length > 0 && filtered.every(p => window.selectedPackages.has(p.name));
    elCheckAll.indeterminate = window.selectedPackages.size > 0 && !elCheckAll.checked;
  }
};

/**
 * Toggles percent indicator and updates loading states inside specific row actions.
 * 
 * @param {string} pkgName - The raw target package name.
 * @param {string} stage - Current phase text.
 * @param {number} percent - Completion level (0-100).
 */
window.updateRowProgress = function (pkgName, stage, percent) {
  const tbody = document.getElementById('pkg-table-body');
  if (!tbody) return;
  const tr = tbody.querySelector(`tr[data-name="${CSS.escape(pkgName)}"]`);
  if (!tr) return;

  if (percent >= 100) {
    tr.removeAttribute('data-progress');
    tr.style.removeProperty('--row-progress');
    tr.querySelector('.progress-stage')?.remove();
    // Re-render row completely since installation completed
    window.vscode.postMessage({ type: 'refresh' });
  } else {
    tr.setAttribute('data-progress', '1');
    tr.style.setProperty('--row-progress', `${percent}%`);
    const actGroup = tr.querySelector('.act-group');
    if (actGroup) {
      let stageEl = tr.querySelector('.progress-stage');
      if (!stageEl) {
        stageEl = document.createElement('span');
        stageEl.className = 'progress-stage';
        actGroup.appendChild(stageEl);
      }
      stageEl.textContent = stage;
    }
  }
};

