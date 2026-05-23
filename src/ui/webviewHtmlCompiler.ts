/**
 * Webview HTML Template Compiler.
 * Resolves media asset URIs and interpolates placeholder tokens in the HTML template.
 * Extracted from WebviewPanel to isolate the heavy template processing logic.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from '../utils/nonce.js';

/**
 * Asset manifest entry describing a JS file and its HTML template placeholder.
 * WHY: Declarative manifest avoids repetitive URI.joinPath boilerplate —
 * adding a new script is a single line instead of 10.
 */
interface JsAsset {
  /** Path segments relative to `media/webview/` */
  segments: string[];
  /** Template placeholder name (e.g. `STATE_JS_URI` → `{{STATE_JS_URI}}`) */
  placeholder: string;
}

/** Ordered list of JS assets loaded by the webview — order matters for script execution. */
const JS_ASSETS: JsAsset[] = [
  { segments: ['js', 'state.js'],             placeholder: 'STATE_JS_URI' },
  { segments: ['js', 'i18n', 'en.js'],        placeholder: 'I18N_EN_JS_URI' },
  { segments: ['js', 'i18n', 'it.js'],        placeholder: 'I18N_IT_JS_URI' },
  { segments: ['js', 'i18n.js'],              placeholder: 'I18N_JS_URI' },
  { segments: ['js', 'utils.js'],             placeholder: 'UTILS_JS_URI' },
  { segments: ['js', 'filters.js'],           placeholder: 'FILTERS_JS_URI' },
  { segments: ['js', 'table.js'],             placeholder: 'TABLE_JS_URI' },
  { segments: ['js', 'modal.js'],             placeholder: 'MODAL_JS_URI' },
  { segments: ['js', 'tour.js'],              placeholder: 'TOUR_JS_URI' },
  { segments: ['js', 'graph.js'],             placeholder: 'GRAPH_JS_URI' },
  { segments: ['js', 'tabs', 'licenses.js'],  placeholder: 'TAB_LICENSES_JS_URI' },
  { segments: ['js', 'tabs', 'snapshots.js'], placeholder: 'TAB_SNAPSHOTS_JS_URI' },
  { segments: ['js', 'tabs', 'dashboard.js'], placeholder: 'TAB_DASHBOARD_JS_URI' },
  { segments: ['js', 'tabs', 'performance.js'], placeholder: 'TAB_PERFORMANCE_JS_URI' },
  { segments: ['js', 'tabs', 'history.js'],   placeholder: 'TAB_HISTORY_JS_URI' },
  { segments: ['js', 'tabs', 'unused.js'],    placeholder: 'TAB_UNUSED_JS_URI' },
  { segments: ['js', 'tabs', 'conflicts.js'], placeholder: 'TAB_CONFLICTS_JS_URI' },
  { segments: ['js', 'tabs', 'venv-health.js'], placeholder: 'TAB_VENV_HEALTH_JS_URI' },
  { segments: ['js', 'tabs.js'],              placeholder: 'TABS_JS_URI' },
  { segments: ['js', 'detail.js'],            placeholder: 'DETAIL_JS_URI' },
  { segments: ['main.js'],                    placeholder: 'MAIN_JS_URI' },
];

/** CSS files loaded by the webview, relative to `media/webview/css/`. */
const CSS_FILES: string[] = [
  'base.css',
  'layout.css',
  'components.css',
  'components/loader.css',
  'components/empty-state.css',
  'components/tour.css',
  'components/modal.css',
  'components/export-menu.css',
  'list-view.css',
  'detail-view.css',
  'graph-view.css',
  'tabs-view.css',
  'tabs/dashboard.css',
  'tabs/unused.css',
  'tabs/licenses.css',
  'tabs/snapshots.css',
  'tabs/performance.css',
  'tabs/history.css',
  'tabs/conflicts.css',
  'tabs/venv-health.css',
];

/**
 * Reads the webview HTML template from disk, resolves all media asset URIs,
 * and interpolates security nonce + CSP source tokens.
 *
 * @param webview - The VS Code Webview instance providing URI resolution and CSP source.
 * @param extensionUri - The root URI of the extension (for media path resolution).
 * @returns The fully interpolated HTML string ready for webview rendering.
 */
export function compileWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const htmlPath = path.join(extensionUri.fsPath, 'media', 'webview', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf-8');

  const nonce = getNonce();
  const cspSource = webview.cspSource;

  // Build CSS <link> tags
  const cssLinks = CSS_FILES.map(file => {
    const uri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'css', file)
    );
    return `<link rel="stylesheet" nonce="${nonce}" href="${uri.toString()}">`;
  }).join('\n  ');

  // Resolve JS asset URIs and build replacement map
  const replacements = new Map<string, string>();
  replacements.set('NONCE', nonce);
  replacements.set('CSP_SOURCE', cspSource);
  replacements.set('STYLE_CSS_URI', cssLinks);

  for (const asset of JS_ASSETS) {
    const uri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'webview', ...asset.segments)
    );
    replacements.set(asset.placeholder, uri.toString());
  }

  // Apply all replacements in a single pass
  for (const [key, value] of replacements) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return html;
}
