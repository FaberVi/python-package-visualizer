import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';
import { PackageScanner } from '../modules/packageScanner.js';
import { VersionChecker } from '../services/versionChecker.js';
import { VersionHistoryCache } from '../services/versionHistoryCache.js';
import { WebviewPanel } from '../ui/webviewPanel.js';
import { SidebarProvider } from '../ui/sidebarProvider.js';
import { StatusBarManager } from '../ui/statusBarManager.js';
import { RequirementsSync } from '../modules/requirementsSync.js';
import { SnapshotManager } from '../services/snapshotManager.js';
import { RequirementsGenerator } from '../modules/requirementsGenerator.js';
import { MigrationHelper } from '../modules/migrationHelper.js';
import { SetupScriptGenerator } from '../modules/setupScriptGenerator.js';

// Import specialized domain handlers using ESM extensions
import { PackageInstaller } from './handlers/packageInstaller.js';
import { ReportExporter } from './handlers/reportExporter.js';
import { SnapshotHandler } from './handlers/snapshotHandler.js';
import { RequirementsHandler } from './handlers/requirementsHandler.js';
import { MigrationHandler } from './handlers/migrationHandler.js';
import { VisualizerHandler } from './handlers/visualizerHandler.js';
import { UtilityHandler } from './handlers/utilityHandler.js';

import type { ScannedPackage } from '../modules/packageScanner.js';
import type { VersionCheckResult } from '../services/versionChecker.js';

/**
 * Orchestrates extension commands, webview interactions, and background tasks.
 * Acting strictly as an action router/delegator, it maintains low coupling and high cohesion.
 */
export class CommandController {
  private readonly reqSync: RequirementsSync;
  private readonly snapshotMgr: SnapshotManager;
  private readonly reqGen: RequirementsGenerator;
  private readonly migrationHelper: MigrationHelper;
  private readonly setupGen: SetupScriptGenerator;

  // Domain command handlers
  private readonly installerHandler: PackageInstaller;
  private readonly reportExporter: ReportExporter;
  private readonly snapshotHandler: SnapshotHandler;
  private readonly requirementsHandler: RequirementsHandler;
  private readonly migrationHandler: MigrationHandler;
  private readonly visualizerHandler: VisualizerHandler;
  private readonly utilityHandler: UtilityHandler;

  /**
   * Getter to dynamically retrieve scanned packages from visualizer state cache.
   * Why: Keeps local cached states unified under VisualizerHandler while keeping backwards compatibility.
   */
  get lastPackages(): ScannedPackage[] {
    return this.visualizerHandler.getLastPackages();
  }

  /**
   * Getter to dynamically retrieve latest check results from visualizer state cache.
   * Why: Prevents synchronization discrepancies across other handlers depending on Pypi info.
   */
  get lastCheckResults(): VersionCheckResult[] {
    return this.visualizerHandler.getLastCheckResults();
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    logger: Logger,
    scanner: PackageScanner,
    checker: VersionChecker,
    history: VersionHistoryCache,
    private readonly panel: WebviewPanel,
    private readonly sidebar?: SidebarProvider,
    statusBar?: StatusBarManager
  ) {
    this.reqSync = new RequirementsSync(logger);
    this.snapshotMgr = new SnapshotManager(context.globalStorageUri.fsPath, logger);
    this.reqGen = new RequirementsGenerator(logger, new (class {
      scanImports() { return Promise.resolve({ filesScanned: 0, importedModules: new Set<string>() }); }
      getUnusedPackages() { return new Set<string>(); }
    })() as any, scanner); // Kept minimal wrapper or we can use local ref if needed
    this.migrationHelper = new MigrationHelper(logger, scanner);
    this.setupGen = new SetupScriptGenerator();

    const getRoot = () => this.getWorkspaceRoot();
    const getAllRoots = () => this.getAllWorkspaceRoots();
    const refreshView = () => this.refreshVisualizer();

    // Initialize specialized sub-handlers
    this.installerHandler = new PackageInstaller(
      scanner,
      history,
      this.reqSync,
      panel,
      logger,
      getRoot,
      refreshView
    );

    this.reportExporter = new ReportExporter(logger, getRoot);

    this.snapshotHandler = new SnapshotHandler(
      this.snapshotMgr,
      panel,
      this.installerHandler,
      logger,
      getRoot,
      refreshView
    );

    this.requirementsHandler = new RequirementsHandler(
      context,
      this.reqSync,
      this.reqGen,
      logger,
      getRoot,
      refreshView
    );

    this.migrationHandler = new MigrationHandler(
      this.migrationHelper,
      logger,
      getRoot
    );

    this.visualizerHandler = new VisualizerHandler(
      context,
      logger,
      scanner,
      checker,
      history,
      panel,
      getRoot,
      getAllRoots,
      sidebar,
      statusBar
    );

    this.utilityHandler = new UtilityHandler(
      logger,
      panel,
      this.setupGen,
      getRoot,
      () => this.lastPackages,
      sidebar
    );
  }

  /**
   * Registers all extension commands and registers the communication channel
   * with the visualizer sidebar and webview panel to establish the action router.
   * Why: Decouples VS Code UI layout and activation cycle from individual handler implementations.
   */
  registerAll(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'extension.showPackageVisualizer',
        () => this.visualizerHandler.showVisualizer()
      ),
      vscode.commands.registerCommand(
        'extension.openPackageVisualizer',
        () => this.visualizerHandler.showVisualizer()
      ),
      vscode.commands.registerCommand(
        'extension.checkPackageUpdates',
        () => this.visualizerHandler.checkUpdates()
      ),
      vscode.commands.registerCommand(
        'extension.updatePackage',
        (name: string) => this.updatePackage(name)
      ),
      vscode.commands.registerCommand(
        'extension.rollbackPackage',
        (name: string, version: string) => this.rollbackPackage(name, version)
      ),
      vscode.commands.registerCommand(
        'extension.selectManualRequirements',
        () => this.selectManualRequirements()
      ),
      vscode.commands.registerCommand(
        'extension.clearManualRequirements',
        () => this.clearManualRequirements()
      )
    );

    // Route messages from webview panel to correct handlers
    this.panel.onMessage(async msg => {
      switch (msg.type) {
        case 'updatePackage':
          void this.updatePackage(msg.name);
          break;
        case 'rollbackPackage':
          void this.rollbackPackage(msg.name, msg.version);
          break;
        case 'updateAllPackages':
          void this.updateAllPackages(msg.names);
          break;
        case 'refresh':
          void this.visualizerHandler.showVisualizer();
          break;
        case 'openUrl':
          void vscode.env.openExternal(vscode.Uri.parse((msg as { type: string; url: string }).url));
          break;
        case 'installNew':
          void this.installNewPackage(
            (msg as { type: string; name: string; version?: string }).name,
            (msg as { type: string; name: string; version?: string }).version
          );
          break;
        case 'searchPypi':
          void this.utilityHandler.searchPypi((msg as { type: string; query: string }).query);
          break;
        case 'exportReport':
          void this.exportReport((msg as { type: string; format: 'markdown' | 'json' }).format);
          break;
        case 'removeFromRequirements':
          void this.removeFromRequirements(
            (msg as { type: string; name: string; source: string }).name,
            (msg as { type: string; name: string; source: string }).source
          );
          break;
        case 'pinVersion': {
          const m = msg as { type: string; name: string; version: string; source: string };
          void this.pinVersion(m.name, m.version, m.source);
          break;
        }
        case 'createRequirements':
          void this.createRequirementsFile();
          break;
        case 'bulkUpdate': {
          const m = msg as { type: string; names: string[] };
          void this.updateAllPackages(m.names);
          break;
        }
        case 'bulkRemove': {
          const m = msg as { type: string; names: string[]; sources: string[] };
          for (let i = 0; i < m.names.length; i++) {
            await this.removeFromRequirements(m.names[i], m.sources[i] ?? '');
          }
          break;
        }
        case 'takeSnapshot':
          this.snapshotHandler.takeSnapshot((msg as { type: string; name: string }).name, this.lastPackages);
          break;
        case 'restoreSnapshot':
          void this.snapshotHandler.restoreSnapshot((msg as { type: string; id: string }).id);
          break;
        case 'deleteSnapshot':
          void this.snapshotHandler.deleteSnapshot((msg as { type: string; id: string }).id);
          break;
        case 'listSnapshots':
          this.snapshotHandler.listSnapshots();
          break;
        case 'generateRequirements':
          void this.generateRequirements();
          break;
        case 'migrateToUv':
          void this.migrateToUv();
          break;
        case 'migrateToPoetry':
          void this.migrateToPoetry();
          break;
        case 'selectManualRequirements':
          void this.selectManualRequirements();
          break;
        case 'clearManualRequirements':
          void this.clearManualRequirements();
          break;
        case 'generateSetupScript': {
          const m = msg as { type: string; format: 'bash' | 'powershell' | 'markdown' };
          void this.utilityHandler.generateSetupScript(m.format);
          break;
        }
        case 'syncRequirementsToInstalled': {
          const m = msg as { type: string; name: string; source: string };
          void this.syncRequirementsToInstalled(m.name, m.source);
          break;
        }
      }
    });

    // Route messages from sidebar to correct handlers
    if (this.sidebar) {
      this.sidebar.onMessage(msg => {
        const m = msg as { type: string; url?: string; name?: string; version?: string; names?: string[] };
        switch (m.type) {
          case 'openPanel':
            void this.visualizerHandler.showVisualizer();
            break;
          case 'openUrl':
            if (m.url) {
              void vscode.env.openExternal(vscode.Uri.parse(m.url));
            }
            break;
          case 'updatePackage':
            void this.updatePackage(m.name ?? '');
            break;
          case 'rollbackPackage':
            void this.rollbackPackage(m.name ?? '', m.version ?? '');
            break;
          case 'updateAllPackages':
            void this.updateAllPackages(m.names ?? []);
            break;
          case 'refresh':
            void this.visualizerHandler.showVisualizer();
            break;
        }
      });
    }
  }

  /**
   * Delegates the periodic or startup auto check task to the visualizer handler.
   */
  async triggerAutoCheck(): Promise<void> {
    await this.visualizerHandler.triggerAutoCheck();
  }

  // --- Wrapper Delegates ---

  async updatePackage(packageName: string): Promise<void> {
    await this.installerHandler.updatePackage(packageName);
  }

  async rollbackPackage(packageName: string, version: string): Promise<void> {
    await this.installerHandler.rollbackPackage(packageName, version);
  }

  async updateAllPackages(names: string[]): Promise<void> {
    await this.installerHandler.updateAllPackages(names);
  }

  async installNewPackage(packageName: string, version?: string): Promise<void> {
    await this.installerHandler.installNewPackage(packageName, version);
  }

  async exportReport(format: 'markdown' | 'json'): Promise<void> {
    await this.reportExporter.exportReport(format, this.lastPackages, this.lastCheckResults);
  }

  async pinVersion(packageName: string, version: string, sourceFile: string): Promise<void> {
    await this.requirementsHandler.pinVersion(packageName, version, sourceFile);
  }

  async syncRequirementsToInstalled(packageName: string, sourceFile: string): Promise<void> {
    await this.requirementsHandler.syncRequirementsToInstalled(packageName, sourceFile, this.lastPackages);
  }

  async selectManualRequirements(): Promise<void> {
    await this.requirementsHandler.selectManualRequirements();
  }

  async clearManualRequirements(): Promise<void> {
    await this.requirementsHandler.clearManualRequirements();
  }

  async createRequirementsFile(): Promise<void> {
    await this.requirementsHandler.createRequirementsFile();
  }

  async removeFromRequirements(packageName: string, sourceFile: string): Promise<void> {
    await this.requirementsHandler.removeFromRequirements(packageName, sourceFile);
  }

  async generateRequirements(): Promise<void> {
    await this.requirementsHandler.generateRequirements();
  }

  async migrateToUv(): Promise<void> {
    await this.migrationHandler.migrateToUv();
  }

  async migrateToPoetry(): Promise<void> {
    await this.migrationHandler.migrateToPoetry();
  }

  // --- Internal Helper Methods ---

  private async refreshVisualizer(): Promise<void> {
    if (this.panel.isVisible() || this.sidebar?.isVisible()) {
      await this.visualizerHandler.showVisualizer();
    }
  }

  private getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri.fsPath;
  }

  private getAllWorkspaceRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
  }
}
