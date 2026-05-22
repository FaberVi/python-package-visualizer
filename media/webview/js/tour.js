/**
 * Welcome Interactive Tour for Python Package Visualizer.
 * Displays highlighting tooltips guiding new users through package stats,
 * PyPI installation, dependency graphs, and license risk dashboards.
 *
 * WHY: Modularizing the tour guides isolates temporary UI guide states,
 * avoiding pollution of critical data-loading routines.
 */

// ── Tour Configuration Steps ────────────────────────────────────────────────
window.TOUR_STEPS = [
  { target: '#stats-bar',           title: 'Package Stats',      text: 'Click any card to instantly filter the list by status — updates, vulnerabilities, or conflicts.' },
  { target: '#btn-add-pkg',         title: 'Add Package',        text: 'Search PyPI and install a new package into your environment in one click.' },
  { target: '[data-tab="graph"]',   title: 'Dependency Graph',   text: 'Visualize your full dependency tree. Click any node to expand or view package details.' },
  { target: '[data-tab="licenses"]',title: 'License Compliance', text: 'See all licenses grouped by risk level — flagging GPL/AGPL packages for commercial projects.' },
];
window.tourStep = 0;

/**
 * Initiates the welcome walkthrough tour if it hasn't been completed before.
 */
window.startTour = function () {
  if (localStorage.getItem('tourShown')) return;
  window.tourStep = 0;
  window.showTourStep();
};

/**
 * Computes boundaries and places highlighting tooltips relative to targeted elements.
 */
window.showTourStep = function () {
  const backdrop = document.getElementById('tour-backdrop');
  const tooltip  = document.getElementById('tour-tooltip');
  if (!backdrop || !tooltip) return;

  if (window.tourStep >= window.TOUR_STEPS.length) {
    window.endTour();
    return;
  }

  const step = window.TOUR_STEPS[window.tourStep];
  const target = document.querySelector(step.target);

  const tLabel = document.getElementById('tour-step-label');
  const tTitle = document.getElementById('tour-title');
  const tText = document.getElementById('tour-text');
  const tNext = document.getElementById('tour-next');

  if (tLabel) tLabel.textContent = `Step ${window.tourStep + 1} of ${window.TOUR_STEPS.length}`;
  if (tTitle) tTitle.textContent = step.title;
  if (tText) tText.textContent = step.text;
  if (tNext) tNext.textContent = window.tourStep === window.TOUR_STEPS.length - 1 ? '✓ Done' : 'Next →';

  backdrop.classList.add('active');
  tooltip.classList.add('active');

  if (target) {
    const rect = target.getBoundingClientRect();
    const ttW = 260, ttH = 160;
    let top  = rect.bottom + 10;
    let left = rect.left;
    if (left + ttW > window.innerWidth - 10)  left = window.innerWidth - ttW - 10;
    if (top  + ttH > window.innerHeight - 10) top  = rect.top - ttH - 10;
    tooltip.style.top  = `${Math.max(8, top)}px`;
    tooltip.style.left = `${Math.max(8, left)}px`;
  } else {
    tooltip.style.top  = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%,-50%)';
  }
};

/**
 * Safely hides tour screens and persists state to avoid re-triggering.
 */
window.endTour = function () {
  document.getElementById('tour-backdrop')?.classList.remove('active');
  document.getElementById('tour-tooltip')?.classList.remove('active');
  localStorage.setItem('tourShown', '1');
};
