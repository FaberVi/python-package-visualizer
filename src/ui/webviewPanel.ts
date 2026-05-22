import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import type { VersionCheckResult, VulnerabilityInfo } from '../services/versionChecker.js';
import type { ScannedPackage, ConflictInfo } from '../modules/packageScanner.js';
import { getAlternatives } from '../data/alternativesMap.js';
export interface HistoryDisplayEntry {
  packageName: string;
  version: string;
  installedAt: string;
  source: 'pip-install' | 'pip-rollback' | 'detected';
}

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'updatePackage'; name: string }
  | { type: 'updateAllPackages'; names: string[] }
  | { type: 'rollbackPackage'; name: string; version: string }
  | { type: 'refresh' }
  | { type: 'openUrl'; url: string }
  | { type: 'installNew'; name: string; version?: string }
  | { type: 'searchPypi'; query: string }
  | { type: 'exportReport'; format: 'markdown' | 'json' }
  | { type: 'removeFromRequirements'; name: string; source: string }
  | { type: 'pinVersion'; name: string; version: string; source: string }
  | { type: 'createRequirements' }
  | { type: 'bulkUpdate'; names: string[] }
  | { type: 'bulkRemove'; names: string[]; sources: string[] }
  | { type: 'takeSnapshot'; name: string }
  | { type: 'restoreSnapshot'; id: string }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'listSnapshots' }
  | { type: 'generateRequirements' }
  | { type: 'migrateToUv' }
  | { type: 'migrateToPoetry' }
  | { type: 'selectManualRequirements' }
  | { type: 'clearManualRequirements' }
  | { type: 'generateSetupScript'; format: 'bash' | 'powershell' | 'markdown' }
  | { type: 'syncRequirementsToInstalled'; name: string; source: string };

export interface ScanStats {
  filesScanned: number;
  modulesFound: number;
  workspaceRoot: string;
  totalSize?: number;
  totalDownloads?: number;
  securityScore?: number;
  maintainerActivityScore?: number;
  slowestPackages?: Array<{name: string; time: number}>;
  manualRequirementsPath?: string;
}

export interface PackageDisplayData {
  name: string;
  installedVersion: string;
  latestVersion: string;
  status: string;
  allVersions: string[];
  summary: string;
  homePage: string;
  specifiedVersion: string;
  source: string;
  requires: string[];
  isUsed: boolean;
  vulnerabilities: VulnerabilityInfo[];
  releaseDate: string;
  group: string;
  license?: string;
  pythonRequires?: string;
  weeklyDownloads?: number;
  installSize?: number;
  environment?: string;
  hasConflict?: boolean;
  pythonCompatible?: boolean;
  pythonWarning?: string;
  installTime?: number;
  alternatives?: Array<{ name: string; reason: string; url?: string }>;
}

export class WebviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messageHandlers: Array<(msg: WebviewMessage) => void> = [];
  private pendingMessage: { type: 'init' | 'update'; packages: PackageDisplayData[]; scanStats?: ScanStats } | undefined;
  private isReady = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {}

  /** Open or reveal the webview panel */
  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'pythonPackageVisualizer',
      'Python Package Visualizer',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview'),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    // Forward inbound messages to registered handlers
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => {
        this.logger.debug(`Webview message: ${msg.type}`);
        if (msg.type === 'ready') {
          this.isReady = true;
          // Flush any message that arrived before webview was ready
          if (this.pendingMessage) {
            void this.panel?.webview.postMessage(this.pendingMessage);
            this.pendingMessage = undefined;
          }
          return;
        }
        // Handle settings updates directly (e.g., language change)
        if ((msg as { type: string; key?: string; value?: unknown }).type === 'updateSetting') {
          const settingsMsg = msg as { type: string; key: string; value: unknown };
          const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
          void config.update(settingsMsg.key, settingsMsg.value, vscode.ConfigurationTarget.Global);
          return;
        }
        this.messageHandlers.forEach(h => h(msg));
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.isReady = false;
        this.pendingMessage = undefined;
        this.logger.debug('Webview panel disposed');
      },
      undefined,
      this.context.subscriptions
    );
  }

  /** Register a handler for messages sent from the webview */
  onMessage(handler: (msg: WebviewMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /** Send initial package data to the webview */
  sendPackages(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages?: Set<string>,
    scanStats?: ScanStats
  ): void {
    if (!this.panel) {
      return;
    }
    const language = vscode.workspace.getConfiguration('pythonPackageVisualizer').get<string>('language', 'en');
    const msg = { type: 'init' as const, packages: this.buildPayload(scanned, checkResults, unusedPackages), scanStats, language };
    if (this.isReady) {
      void this.panel.webview.postMessage(msg);
    } else {
      this.pendingMessage = msg;
    }
  }

  /** Push an updated package list (after update/rollback) */
  updatePackages(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages?: Set<string>,
    scanStats?: ScanStats
  ): void {
    if (!this.panel) {
      return;
    }
    const language = vscode.workspace.getConfiguration('pythonPackageVisualizer').get<string>('language', 'en');
    const msg = { type: 'update' as const, packages: this.buildPayload(scanned, checkResults, unusedPackages), scanStats, language };
    if (this.isReady) {
      void this.panel.webview.postMessage(msg);
    } else {
      this.pendingMessage = msg;
    }
  }

  private buildPayload(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages?: Set<string>
  ): PackageDisplayData[] {
    const resultMap = new Map(checkResults.map(r => [r.packageName, r]));
    return scanned.map(pkg => {
      const result = resultMap.get(pkg.name);
      // Normalize the package name the same way getUnusedPackages does
      // so the Set lookup always matches regardless of case or separators
      const normName = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
      return {
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        latestVersion: result?.latestVersion ?? 'unknown',
        status: result?.status ?? 'unknown',
        allVersions: result?.allVersions ?? [],
        summary: result?.summary ?? '',
        homePage: result?.homePage ?? '',
        specifiedVersion: pkg.specifiedVersion,
        source: pkg.source,
        requires: pkg.requires,
        isUsed: unusedPackages ? !unusedPackages.has(normName) : true,
        vulnerabilities: result?.vulnerabilities ?? [],
        releaseDate: result?.releaseDate ?? '',
        group: pkg.group ?? 'main',
        license: result?.license ?? '',
        pythonRequires: result?.pythonRequires ?? '',
        weeklyDownloads: result?.weeklyDownloads ?? 0,
        environment: pkg.environment,
        hasConflict: pkg.hasConflict ?? false,
        pythonCompatible: result?.pythonCompatible,
        pythonWarning: result?.pythonWarning,
        installSize: result?.installSize,
        alternatives: getAlternatives(pkg.name),
      };
    });
  }

  /** Show a loading/progress message in the webview */
  sendProgress(message: string): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({ type: 'progress', message });
  }

  isVisible(): boolean {
    return this.panel !== undefined;
  }

  /** Expose the underlying vscode.Webview for direct postMessage calls */
  get webview(): vscode.Webview | undefined {
    return this.panel?.webview;
  }

  /** Send dependency conflict results to the webview */
  sendConflicts(conflicts: ConflictInfo[]): void {
    if (!this.panel) { return; }
    void this.panel.webview.postMessage({ type: 'conflicts', conflicts });
  }

  /** Send version history entries to the webview */
  sendHistory(entries: HistoryDisplayEntry[]): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({ type: 'history', entries });
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlPath = path.join(
      this.context.extensionUri.fsPath,
      'media',
      'webview',
      'index.html'
    );

    let html = fs.readFileSync(htmlPath, 'utf-8');

    const cssFiles = [
      'base.css',
      'layout.css',
      'components.css',
      'list-view.css',
      'detail-view.css',
      'graph-view.css',
      'tabs-view.css'
    ];

    const stateJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'state.js'
      )
    );

    const i18nJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'i18n.js'
      )
    );

    const i18nEnJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'i18n',
        'en.js'
      )
    );

    const i18nItJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'i18n',
        'it.js'
      )
    );

    const utilsJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'utils.js'
      )
    );

    const filtersJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'filters.js'
      )
    );

    const tableJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'table.js'
      )
    );

    const modalJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'modal.js'
      )
    );

    const tourJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'tour.js'
      )
    );

    const graphJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'graph.js'
      )
    );

    const tabsJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'tabs.js'
      )
    );

    const detailJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'js',
        'detail.js'
      )
    );

    const mainJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'webview',
        'main.js'
      )
    );

    const nonce = getNonce();
    const cspSource = webview.cspSource;

    const cssLinks = cssFiles.map(file => {
      const uri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview', 'css', file)
      );
      return `<link rel="stylesheet" nonce="${nonce}" href="${uri.toString()}">`;
    }).join('\n  ');

    html = html
      .replace(/\{\{NONCE\}\}/g, nonce)
      .replace(/\{\{STYLE_CSS_URI\}\}/g, cssLinks)
      .replace(/\{\{STATE_JS_URI\}\}/g, stateJsUri.toString())
      .replace(/\{\{I18N_EN_JS_URI\}\}/g, i18nEnJsUri.toString())
      .replace(/\{\{I18N_IT_JS_URI\}\}/g, i18nItJsUri.toString())
      .replace(/\{\{I18N_JS_URI\}\}/g, i18nJsUri.toString())
      .replace(/\{\{UTILS_JS_URI\}\}/g, utilsJsUri.toString())
      .replace(/\{\{FILTERS_JS_URI\}\}/g, filtersJsUri.toString())
      .replace(/\{\{TABLE_JS_URI\}\}/g, tableJsUri.toString())
      .replace(/\{\{MODAL_JS_URI\}\}/g, modalJsUri.toString())
      .replace(/\{\{TOUR_JS_URI\}\}/g, tourJsUri.toString())
      .replace(/\{\{GRAPH_JS_URI\}\}/g, graphJsUri.toString())
      .replace(/\{\{TABS_JS_URI\}\}/g, tabsJsUri.toString())
      .replace(/\{\{DETAIL_JS_URI\}\}/g, detailJsUri.toString())
      .replace(/\{\{MAIN_JS_URI\}\}/g, mainJsUri.toString())
      .replace(/\{\{CSP_SOURCE\}\}/g, cspSource);

    return html;
  }
}

function getNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
