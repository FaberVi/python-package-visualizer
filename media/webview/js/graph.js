/**
 * D3.js Dependency Tree Visualizer for Python Package Visualizer.
 * Renders node hierarchy, expand/collapse interaction, and pan-zoom behaviors.
 * Loaded sequentially after utils.js to leverage esc() and styling rules.
 */

// Module-level D3 zoom instances accessible to toolbar controls
window._graphZoom = null;
window._graphSvg = null;
window._graphFitFn = null;

/**
 * Renders an interactive D3.js hierarchical tree of dependencies.
 * Allows visual inspection of transient packages and updates/conflicts.
 * 
 * @param {Array<object>} packages - The filtered set of package items.
 */
window.renderGraph = function (packages) {
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  window._graphZoom = null;
  window._graphSvg = null;
  window._graphFitFn = null;

  if (typeof d3 === 'undefined') {
    canvas.innerHTML = `<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">${window.t('graph.unavailable')}</div>`;
    return;
  }

  if (!packages.length) {
    canvas.innerHTML = `<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">${window.t('graph.noPackages')}</div>`;
    return;
  }

  try {
    const allPkgs = window.allPackages || [];

    // ── Build hierarchy ──────────────────────────────────────────────────
    const treeData = {
      name: 'Project',
      status: 'root',
      children: packages.map(pkg => ({
        name: pkg.name,
        status: pkg.vulnerabilities && pkg.vulnerabilities.length ? 'vulnerable' : (pkg.status || 'unknown'),
        version: pkg.installedVersion || '',
        pkg,
        children: (pkg.requires || []).filter(r => r).map(req => {
          const dep = allPkgs.find(p => p.name.toLowerCase() === req.toLowerCase());
          return {
            name: req,
            status: dep ? (dep.vulnerabilities && dep.vulnerabilities.length ? 'vulnerable' : dep.status) : 'unknown',
            version: dep ? (dep.installedVersion || '') : '',
            pkg: dep || null,
          };
        }),
      })),
    };

    // ── Dimensions ───────────────────────────────────────────────────────
    const W = canvas.clientWidth  || 860;
    const H = canvas.clientHeight || 520;

    // Count visible leaves to ensure enough vertical room
    const tempRoot = d3.hierarchy(treeData);
    // Collapse depth > 1 by default
    tempRoot.descendants().forEach(d => {
      if (d.depth > 1 && d.children) {
        d._children = d.children;
        d.children  = null;
      }
    });
    const visibleLeaves = Math.max(1, tempRoot.leaves().length);
    const NODE_SEP   = 26;   // px between sibling nodes
    const treeHeight = Math.max(H - 60, visibleLeaves * NODE_SEP);
    const DEPTH_GAP  = Math.min(220, Math.max(160, (W - 120) / 3)); // px per tree level

    // ── SVG setup ────────────────────────────────────────────────────────
    const svg = d3.select('#graph-canvas')
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.08, 4])
      .on('zoom', ev => g.attr('transform', ev.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    window._graphZoom = zoom;
    window._graphSvg  = svg;

    // ── Hierarchy + layout ───────────────────────────────────────────────
    const root = d3.hierarchy(treeData);
    root.descendants().forEach(d => {
      if (d.depth > 1 && d.children) {
        d._children = d.children;
        d.children  = null;
      }
    });

    /** Fits tree bounding box into the viewport with padding */
    function fitView() {
      try {
        const box = g.node().getBBox();
        if (!box || box.width === 0) return;
        const pad = 40;
        const scale = Math.min(0.95, (W - pad * 2) / box.width, (H - pad * 2) / box.height);
        const tx = W / 2 - (box.x + box.width  / 2) * scale;
        const ty = H / 2 - (box.y + box.height / 2) * scale;
        svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      } catch (_) {}
    }
    window._graphFitFn = fitView;

    function update() {
      const layout = d3.tree()
        .nodeSize([NODE_SEP, DEPTH_GAP])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.4));
      layout(root);

      const nodes = root.descendants();
      const links = root.links();

      // ── Links ──────────────────────────────────────────────────────────
      const linkSel = g.selectAll('.link')
        .data(links, d => d.target.id || (d.target.id = Math.random()));

      linkSel.enter().append('path')
        .attr('class', 'link')
        .merge(linkSel)
        .attr('d', d3.linkHorizontal().x(d => d.y).y(d => d.x));

      linkSel.exit().remove();

      // ── Nodes ──────────────────────────────────────────────────────────
      const nodeSel = g.selectAll('.node')
        .data(nodes, d => d.data.name + '-' + d.depth);

      const nodeEnter = nodeSel.enter().append('g')
        .attr('transform', d => `translate(${d.y},${d.x})`);

      nodeEnter.append('circle')
        .attr('r', d => d.depth === 0 ? 12 : 7);

      nodeEnter.append('text')
        .attr('dy', '0.32em')
        .attr('x', d => d.depth === 0 ? 18 : ((d.children || d._children) ? -12 : 12))
        .style('text-anchor', d => d.depth === 0 ? 'start' : ((d.children || d._children) ? 'end' : 'start'))
        .text(d => {
          const v = d.data.version ? ` (${d.data.version})` : '';
          return d.data.name + v;
        });

      // Expand/collapse indicator dot for collapsed nodes
      nodeEnter.filter(d => d._children)
        .append('circle')
        .attr('class', 'expand-dot')
        .attr('r', 3)
        .attr('cx', 10).attr('cy', -10)
        .style('fill', 'var(--c-update)');

      const nodeMerge = nodeSel.merge(nodeEnter);

      nodeMerge
        .attr('class', d => {
          const cls = [
            'node',
            d.data.status || 'unknown',
            d.depth === 0 ? 'root' : '',
            d._children ? 'collapsed' : '',
          ].filter(Boolean).join(' ');
          return cls;
        })
        .attr('transform', d => `translate(${d.y},${d.x})`);

      // Update text anchor on merge (children may have changed)
      nodeMerge.select('text')
        .attr('x', d => d.depth === 0 ? 18 : ((d.children || d._children) ? -12 : 12))
        .style('text-anchor', d => d.depth === 0 ? 'start' : ((d.children || d._children) ? 'end' : 'start'));

      // Update expand-dot visibility
      nodeMerge.selectAll('.expand-dot').remove();
      nodeMerge.filter(d => d._children && d.depth > 0)
        .append('circle')
        .attr('class', 'expand-dot')
        .attr('r', 3).attr('cx', 10).attr('cy', -9)
        .style('fill', 'var(--c-update)').style('stroke', 'none');

      nodeMerge.on('click', (event, d) => {
        event.stopPropagation();
        if (d.children) {
          d._children = d.children;
          d.children  = null;
        } else if (d._children) {
          d.children  = d._children;
          d._children = null;
        }
        if (d.data.pkg && typeof window.showDetail === 'function') {
          window.showDetail(d.data.pkg);
        }
        update();
      });

      nodeSel.exit().remove();
    }

    update();

    // Auto-fit after first render (small delay for layout to settle)
    setTimeout(fitView, 60);

    // ── Legend (absolute overlay) ────────────────────────────────────────
    const legend = document.createElement('div');
    legend.className = 'graph-legend';
    legend.innerHTML = `
      <div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
        color:var(--vscode-descriptionForeground);margin-bottom:4px;">${window.t('graph.legend')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-ok)"></div> ${window.t('graph.legendOk')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-update)"></div> ${window.t('graph.legendUpdate')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-vuln)"></div> ${window.t('graph.legendVuln')}</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-unknown)"></div> ${window.t('graph.legendUnknown')}</div>
      <div class="legend-item"><div class="legend-dot" style="border:2px dashed var(--c-missing);background:none"></div> ${window.t('graph.legendNotInstalled')}</div>
      <div style="margin-top:6px;color:var(--vscode-descriptionForeground);font-size:10px;">
        ${window.t('graph.legendSubDeps')}<br>${window.t('graph.legendClick')}
      </div>
    `;
    canvas.style.position = 'relative';
    canvas.appendChild(legend);
  } catch (err) {
    console.error('renderGraph error:', err);
    canvas.innerHTML = `<div style="padding:40px;text-align:center;color:var(--vscode-errorForeground)">${window.t('graph.error')}</div>`;
  }
};

// ── Graph Toolbar Button Event Handlers ─────────────────────────────────────
document.getElementById('graph-fit')?.addEventListener('click', () => {
  if (window._graphFitFn) window._graphFitFn();
});
document.getElementById('graph-zoom-in')?.addEventListener('click', () => {
  if (window._graphSvg && window._graphZoom) {
    window._graphSvg.call(window._graphZoom.scaleBy, 1.4);
  }
});
document.getElementById('graph-zoom-out')?.addEventListener('click', () => {
  if (window._graphSvg && window._graphZoom) {
    window._graphSvg.call(window._graphZoom.scaleBy, 1 / 1.4);
  }
});
