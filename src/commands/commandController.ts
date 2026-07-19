import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';
import { PackageScanner } from '../modules/packageScanner.js';
import type { ImportScanner } from '../modules/importScanner.js';
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
import { VenvHealthChecker } from '../services/venvHealthChecker.js';

// Import specialized domain handlers using ESM extensions
import { PackageInstaller } from './handlers/packageInstaller.js';
import { ReportExporter } from './handlers/reportExporter.js';
import { SnapshotHandler } from './handlers/snapshotHandler.js';
import { RequirementsHandler } from './handlers/requirementsHandler.js';
import { MigrationHandler } from './handlers/migrationHandler.js';
import { VisualizerHandler } from './handlers/visualizerHandler.js';
import { UtilityHandler } from './handlers/utilityHandler.js';
import { UnusedAiHandler } from './handlers/unusedAiHandler.js';
import { routeSidebarMessage, routeWebviewMessage } from './commandController/messageRouter.js';

import type { ScannedPackage } from '../modules/packageScanner.js';
import type { VersionCheckResult } from '../services/versionChecker.js';
import { getConflictInstallSpec } from '../utils/conflictFix.js';

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
  private readonly venvHealthChecker: VenvHealthChecker;
  private readonly logger: Logger;
  private readonly scanner: PackageScanner;

  // Domain command handlers
  private readonly installerHandler: PackageInstaller;
  private readonly reportExporter: ReportExporter;
  private readonly snapshotHandler: SnapshotHandler;
  private readonly requirementsHandler: RequirementsHandler;
  private readonly migrationHandler: MigrationHandler;
  private readonly visualizerHandler: VisualizerHandler;
  private readonly utilityHandler: UtilityHandler;
  private readonly unusedAiHandler: UnusedAiHandler;

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
    this.logger = logger;
    this.scanner = scanner;
    this.reqSync = new RequirementsSync(logger);
    this.snapshotMgr = new SnapshotManager(context.globalStorageUri.fsPath, logger);
    this.reqGen = new RequirementsGenerator(logger, new (class {
      scanImports() { return Promise.resolve({ filesScanned: 0, importedModules: new Set<string>() }); }
      getUnusedPackages() { return new Set<string>(); }
      mapToPackageName() { return null; }
    })() as Pick<ImportScanner, 'scanImports' | 'getUnusedPackages' | 'mapToPackageName'> as ImportScanner, scanner);
    this.migrationHelper = new MigrationHelper(logger, scanner);
    this.setupGen = new SetupScriptGenerator();
    this.venvHealthChecker = new VenvHealthChecker(
      () => scanner.resolvePythonPath()
    );

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
      scanner,
      context,
      logger,
      getRoot,
      refreshView
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

    this.unusedAiHandler = new UnusedAiHandler(panel, logger, getRoot);
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
        async () => {
          await this.visualizerHandler.showVisualizer();
          void this.unusedAiHandler.sendCapabilities();
        }
      ),
      vscode.commands.registerCommand(
        'extension.openPackageVisualizer',
        async () => {
          await this.visualizerHandler.showVisualizer();
          void this.unusedAiHandler.sendCapabilities();
        }
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
      ),
      vscode.commands.registerCommand(
        'extension.analyzeUnusedWithCursor',
        () => {
          const state = this.visualizerHandler.getUnusedAiScanState();
          if (state) {
            this.unusedAiHandler.setScanState(state);
          }
          void this.unusedAiHandler.analyzeUnusedWithCursor(undefined, true);
        }
      )
    );

    // Route messages from webview panel to correct handlers
    this.panel.onMessage(async msg => {
      if (msg.type === 'ready') {
        void this.unusedAiHandler.sendCapabilities();
        return;
      }
      routeWebviewMessage(this.getMessageRouterDeps(), msg);
    });

    if (this.sidebar) {
      this.sidebar.onMessage(msg => {
        routeSidebarMessage(this.getMessageRouterDeps(), msg as {
          type: string;
          url?: string;
          name?: string;
          version?: string;
          names?: string[];
        });
      });
    }
  }

  private getMessageRouterDeps() {
    return {
      showVisualizer: async () => {
        await this.visualizerHandler.showVisualizer();
        void this.unusedAiHandler.sendCapabilities();
      },
      sendCapabilities: () => { void this.unusedAiHandler.sendCapabilities(); },
      updatePackage: (name: string) => this.updatePackage(name),
      fixConflict: (requirement: string, packageName: string) => this.fixConflict(requirement, packageName),
      rollbackPackage: (name: string, version: string) => this.rollbackPackage(name, version),
      updateAllPackages: (names: string[]) => this.updateAllPackages(names),
      installAllPackages: (names: string[]) => this.installAllPackages(names),
      installNewPackage: (name: string, version?: string) => this.installNewPackage(name, version),
      searchPypi: (query: string) => this.utilityHandler.searchPypi(query),
      exportReport: (format: 'markdown' | 'json') => this.exportReport(format),
      removeFromRequirements: (name: string, source: string) => this.removeFromRequirements(name, source),
      pinVersion: (name: string, version: string, source: string) => this.pinVersion(name, version, source),
      createRequirementsFile: () => this.createRequirementsFile(),
      bulkSyncRequirementsToInstalled: (packages: Array<{ name: string; source: string }>) =>
        this.bulkSyncRequirementsToInstalled(packages),
      bulkRemoveFromRequirements: async (names: string[], sources: string[]) => {
        for (let i = 0; i < names.length; i++) {
          await this.removeFromRequirements(names[i], sources[i] ?? '');
        }
      },
      removeUnusedPackagesWithSnapshot: (packages: Array<{ name: string; source: string }>) =>
        this.removeUnusedPackagesWithSnapshot(packages),
      takeSnapshot: (name: string) => this.snapshotHandler.takeSnapshot(name, this.lastPackages),
      restoreSnapshot: (id: string) => this.snapshotHandler.restoreSnapshot(id),
      deleteSnapshot: (id: string) => this.snapshotHandler.deleteSnapshot(id),
      listSnapshots: () => this.snapshotHandler.listSnapshots(),
      generateRequirements: () => this.generateRequirements(),
      migrateToUv: (mode: 'manual' | 'automatic') => this.migrateToUv(mode),
      migrateToPoetry: () => this.migrateToPoetry(),
      selectManualRequirements: () => this.selectManualRequirements(),
      clearManualRequirements: () => this.clearManualRequirements(),
      generateSetupScript: (format: 'bash' | 'powershell' | 'markdown') =>
        this.utilityHandler.generateSetupScript(format),
      syncRequirementsToInstalled: (name: string, source: string) =>
        this.syncRequirementsToInstalled(name, source),
      handleVenvHealthRequest: () => this.handleVenvHealthRequest(),
      handleUpdatePip: () => this.handleUpdatePip(),
      analyzeUnusedWithCursor: async (packageNames?: string[], userInitiated?: boolean) => {
        if (userInitiated !== true) {
          return;
        }
        const state = this.visualizerHandler.getUnusedAiScanState();
        if (state) {
          this.unusedAiHandler.setScanState(state);
        }
        await this.unusedAiHandler.analyzeUnusedWithCursor(packageNames, true);
      },
      markPackageManuallyUsed: (name: string) => this.visualizerHandler.markPackageManuallyUsed(name),
      unmarkPackageManuallyUsed: (name: string) => this.visualizerHandler.unmarkPackageManuallyUsed(name),
    };
  }

  /**
   * Delegates the periodic or startup auto check task to the visualizer handler.
   */
  async triggerAutoCheck(): Promise<void> {
    await this.visualizerHandler.triggerAutoCheck();
  }

  // --- Wrapper Delegates ---

  async updatePackage(packageName: string): Promise<void> {
    await this.snapshotBeforeUpdate(`Pre-update: ${packageName}`);
    await this.installerHandler.updatePackage(packageName);
  }

  async rollbackPackage(packageName: string, version: string): Promise<void> {
    await this.installerHandler.rollbackPackage(packageName, version);
  }

  async updateAllPackages(names: string[]): Promise<void> {
    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const label = names.length === 1
      ? `Pre-update: ${names[0]}`
      : lang === 'it'
        ? `Pre-update: bulk (${names.length} pacchetti)`
        : `Pre-update: bulk (${names.length} packages)`;
    await this.snapshotBeforeUpdate(label);
    await this.installerHandler.updateAllPackages(names);
  }

  async installNewPackage(packageName: string, version?: string): Promise<void> {
    await this.installerHandler.installNewPackage(packageName, version);
  }

  async installAllPackages(names: string[]): Promise<void> {
    await this.installerHandler.installAllPackages(names);
  }

  async fixConflict(requirement: string, packageName: string): Promise<void> {
    const spec = getConflictInstallSpec({
      package: '',
      version: '',
      requirement,
      conflictingPackage: packageName,
      conflictingVersion: '',
    });
    if (!spec) {
      return;
    }
    await this.snapshotBeforeUpdate(`Pre-fix: ${packageName}`);
    await this.installerHandler.installPackageSpec(spec, packageName);
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

  async bulkSyncRequirementsToInstalled(packages: Array<{ name: string; source: string }>): Promise<void> {
    await this.requirementsHandler.bulkSyncRequirementsToInstalled(packages, this.lastPackages);
  }

  async removeUnusedPackagesWithSnapshot(
    packages: Array<{ name: string; source: string }>
  ): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || packages.length === 0) {
      return;
    }

    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const isIt = lang === 'it';
    const names = packages.map(p => p.name).join(', ');
    const preview = names.length > 120 ? `${names.slice(0, 117)}…` : names;

    const confirmLabel = isIt ? 'Rimuovi con snapshot' : 'Remove with snapshot';
    const cancelLabel = isIt ? 'Annulla' : 'Cancel';
    const message = isIt
      ? `Rimuovere ${packages.length} pacchetto/i dai file dipendenze e disinstallarli dal venv?\n\nVerrà creato uno snapshot automatico prima della rimozione.\n\n${preview}`
      : `Remove ${packages.length} package(s) from dependency files and uninstall from the venv?\n\nAn automatic snapshot will be saved before removal.\n\n${preview}`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      confirmLabel,
      cancelLabel
    );
    if (choice !== confirmLabel) {
      return;
    }

    const snapLabel = isIt
      ? `Pre-rimozione inutilizzati (${packages.length} pacchetti)`
      : `Pre-unused-removal (${packages.length} packages)`;
    await this.snapshotBeforeUpdate(snapLabel);

    const { removed, failed } = await this.requirementsHandler.bulkRemovePackagesWithoutConfirm(packages);

    const removedFromFiles = packages
      .filter(p => !failed.includes(p.name))
      .map(p => p.name);

    let uninstalled = 0;
    let uninstallFailed: string[] = [];
    if (removedFromFiles.length > 0) {
      const uninstallResult = await this.installerHandler.bulkUninstallPackages(removedFromFiles);
      uninstalled = uninstallResult.uninstalled;
      uninstallFailed = uninstallResult.failed;
    }

    if (failed.length === 0 && uninstallFailed.length === 0) {
      void vscode.window.showInformationMessage(
        isIt
          ? `Python Packages: Rimossi ${removed} da file dipendenze, ${uninstalled} disinstallati dal venv ✅`
          : `Python Packages: Removed ${removed} from dependency files, ${uninstalled} uninstalled from venv ✅`
      );
    } else {
      const parts: string[] = [];
      if (removed > 0) {
        parts.push(isIt ? `${removed} rimossi da file` : `${removed} removed from files`);
      }
      if (uninstalled > 0) {
        parts.push(isIt ? `${uninstalled} disinstallati` : `${uninstalled} uninstalled`);
      }
      const failedSummary = [...failed, ...uninstallFailed.filter(n => !failed.includes(n))];
      void vscode.window.showWarningMessage(
        isIt
          ? `Python Packages: ${parts.join(', ') || 'Nessuna operazione'}. Falliti: ${failedSummary.join(', ') || 'nessuno'}`
          : `Python Packages: ${parts.join(', ') || 'No changes'}. Failed: ${failedSummary.join(', ') || 'none'}`
      );
    }
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

  async migrateToUv(mode: 'manual' | 'automatic' = 'manual'): Promise<void> {
    if (mode === 'automatic') {
      await this.migrationHandler.migrateToUvAutomatic();
      return;
    }
    await this.migrationHandler.migrateToUvManual();
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

  /** Captures the current environment before a manual package update. */
  private async snapshotBeforeUpdate(label: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    let packages: ScannedPackage[];
    try {
      packages = (await this.scanner.scanWorkspace(root)).packages;
    } catch (err) {
      this.logger.warn(`Pre-update scan failed, using cached packages: ${String(err)}`);
      packages = this.lastPackages;
    }

    if (packages.length === 0) {
      this.logger.warn('Pre-update snapshot skipped: no packages to save');
      return;
    }

    await this.snapshotHandler.takePreUpdateSnapshot(label, packages);
  }

  async handleVenvHealthRequest(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) { return; }
    try {
      const report = await this.venvHealthChecker.checkHealth(root);
      this.panel.sendVenvHealth(report);
    } catch {
      // Non-blocking: silently ignore venv health failures
    }
  }

  async handleUpdatePip(): Promise<void> {
    try {
      await this.installerHandler.updatePip();
    } finally {
      void this.handleVenvHealthRequest();
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
