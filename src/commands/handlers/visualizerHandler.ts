import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { hasDrift } from '../../utils/version.js';
import { PackageScanner, ScannedPackage } from '../../modules/packageScanner.js';
import { ImportScanner } from '../../modules/importScanner.js';
import { VersionChecker, VersionCheckResult } from '../../services/versionChecker.js';
import { VersionHistoryCache } from '../../services/versionHistoryCache.js';
import { WebviewPanel, ScanStats } from '../../ui/webviewPanel.js';
import { SidebarProvider } from '../../ui/sidebarProvider.js';
import { StatusBarManager } from '../../ui/statusBarManager.js';
import {
  buildDisplayData,
  buildConfidenceContext,
  buildHistoryEntries
} from './visualizer/displayCompiler.js';

/**
 * Handles core workspace package scanning, update checks, auto checks,
 * and compiles displays data for the main webview and sidebar.
 */
export class VisualizerHandler {
  private lastPackages: ScannedPackage[] = [];
  private lastCheckResults: VersionCheckResult[] = [];
  private readonly importScanner: ImportScanner;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly scanner: PackageScanner,
    private readonly checker: VersionChecker,
    private readonly history: VersionHistoryCache,
    private readonly panel: WebviewPanel,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly getAllWorkspaceRoots: () => string[],
    private readonly sidebar?: SidebarProvider,
    private readonly statusBar?: StatusBarManager
  ) {
    this.importScanner = new ImportScanner(logger);
  }

  getLastPackages(): ScannedPackage[] {
    return this.lastPackages;
  }

  setLastPackages(packages: ScannedPackage[]): void {
    this.lastPackages = packages;
  }

  getLastCheckResults(): VersionCheckResult[] {
    return this.lastCheckResults;
  }

  /**
   * Scans the active workspace dependencies and queries PyPI, loading results
   * into the primary webview panel and sidebar dashboards.
   */
  async showVisualizer(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      void vscode.window.showWarningMessage(
        'Python Package Visualizer: No workspace folder open.'
      );
      return;
    }

    this.panel.show();
    this.panel.sendProgress('Scanning workspace...');
    this.sidebar?.sendProgress('Scanning workspace...');

    try {
      const roots = this.getAllWorkspaceRoots();
      const [allScanned, importResults] = await Promise.all([
        Promise.all(roots.map(r => this.scanner.scanWorkspace(r))).then(results => results.flat()),
        Promise.all(roots.map(r => this.importScanner.scanImports(r))),
      ]);

      // Deduplicate packages by normalized name and source path
      const uniqueScanned: ScannedPackage[] = [];
      const seen = new Set<string>();
      for (const p of allScanned) {
        const key = `${p.name.toLowerCase()}::${p.source}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueScanned.push(p);
        }
      }
      const scanned = uniqueScanned;

      if (scanned.length === 0) {
        const existingManualPath = this.context.workspaceState.get<string>(
          'pythonPackageVisualizer.manualRequirementsPath'
        );

        // WHY: If a manual path is already stored but still yielded 0 packages,
        // the file is unparseable or empty. Clear it and show an error instead of
        // re-prompting — this prevents an infinite select→re-scan→prompt loop.
        if (existingManualPath) {
          this.logger.warn(
            `Manual requirements path "${existingManualPath}" produced 0 packages — clearing.`
          );
          await this.context.workspaceState.update(
            'pythonPackageVisualizer.manualRequirementsPath',
            undefined
          );
          void vscode.window.showWarningMessage(
            `The selected file "${existingManualPath}" could not be parsed or contains no dependencies. ` +
            'Please ensure it is a valid requirements.txt, pyproject.toml, setup.py, setup.cfg, or Pipfile.'
          );
          this.panel.sendProgress(
            'No packages found. The selected file could not be parsed.'
          );
          this.panel.sendPackages([], []);
          this.sidebar?.sendPackages([], undefined, 'init');
          return;
        }

        // Fallback for manual selection if zero files were auto-detected
        const choice = await vscode.window.showInformationMessage(
          'No Python dependency files were found automatically in the workspace root. Would you like to select a requirements.txt manually?',
          'Select File...',
          'Dismiss'
        );

        if (choice === 'Select File...') {
          const defaultUri = root ? vscode.Uri.file(root) : undefined;
          const selectedFiles = await vscode.window.showOpenDialog({
            defaultUri,
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select requirements.txt',
            filters: {
              'Python Dependencies': ['txt', 'in', 'toml', 'py', 'cfg', 'Pipfile']
            }
          });

          if (selectedFiles && selectedFiles.length > 0) {
            const selectedPath = selectedFiles[0].fsPath;
            await this.context.workspaceState.update('pythonPackageVisualizer.manualRequirementsPath', selectedPath);
            this.logger.info(`Persisted manual requirements path to workspaceState: ${selectedPath}`);
            void this.showVisualizer();
            return;
          }
        }

        this.panel.sendProgress(
          'No packages found. Add a requirements.txt, pyproject.toml, or setup.py.'
        );
        this.panel.sendPackages([], []);
        this.sidebar?.sendPackages([], undefined, 'init');
        return;
      }

      this.panel.sendProgress(`Checking ${scanned.length} packages on PyPI...`);
      this.sidebar?.sendProgress(`Checking ${scanned.length} packages on PyPI...`);

      const checkResults = await this.checker.checkAll(
        scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
      );

      this.applyDriftStatus(scanned, checkResults);

      // Fetch weekly downloads in batches (non-blocking) to prevent PyPI Stats API rate-limiting or timing out
      const downloadsMap = new Map<string, number>();
      const DOWNLOAD_CONCURRENCY = 5;
      for (let i = 0; i < checkResults.length; i += DOWNLOAD_CONCURRENCY) {
        const batch = checkResults.slice(i, i + DOWNLOAD_CONCURRENCY);
        await Promise.allSettled(
          batch.map(async r => {
            const dl = await this.checker.fetchWeeklyDownloads(r.packageName);
            if (dl > 0) {
              downloadsMap.set(r.packageName, dl);
            }
          })
        );
      }

      for (const r of checkResults) {
        if (downloadsMap.has(r.packageName)) {
          r.weeklyDownloads = downloadsMap.get(r.packageName);
        }
      }

      // Record installed versions in version history cache
      for (const pkg of scanned) {
        if (pkg.installedVersion) {
          this.history.recordVersion(root, pkg.name, pkg.installedVersion, 'detected');
        }
      }

      // Compile imports from all workspace folders
      const mergedImportedModules = new Set<string>();
      let totalFilesScanned = 0;
      for (const res of importResults) {
        totalFilesScanned += res.filesScanned;
        for (const mod of res.importedModules) {
          mergedImportedModules.add(mod);
        }
      }

      const unusedPackages = this.importScanner.getUnusedPackagesWithConfidence(
        scanned.map(p => p.name),
        mergedImportedModules,
        buildConfidenceContext(scanned, checkResults)
      );

      this.logger.info(
        `Import scan: ${totalFilesScanned} files, ` +
        `${mergedImportedModules.size} modules, ` +
        `${unusedPackages.size} possibly unused packages`
      );

      // Compile dashboard metadata stats
      const totalSize = checkResults.reduce((sum, r) => sum + (r.installSize ?? 0), 0);
      const totalDl = checkResults.reduce((sum, r) => sum + (r.weeklyDownloads ?? 0), 0);
      const vulnPkgs = checkResults.filter(r => r.vulnerabilities && r.vulnerabilities.length > 0).length;
      const securityScore = checkResults.length > 0 ? ((checkResults.length - vulnPkgs) / checkResults.length) * 100 : 100;
      const manualRequirementsPath = this.context.workspaceState.get<string>('pythonPackageVisualizer.manualRequirementsPath');

      const scanStats: ScanStats = {
        filesScanned: totalFilesScanned,
        modulesFound: mergedImportedModules.size,
        workspaceRoot: root,
        totalSize,
        totalDownloads: totalDl,
        securityScore,
        maintainerActivityScore: 75,
        slowestPackages: [],
        manualRequirementsPath,
      };

      this.lastPackages = scanned;
      this.lastCheckResults = checkResults;

      this.panel.sendPackages(scanned, checkResults, unusedPackages, scanStats);

      // Perform background conflict analysis across all workspace roots
      Promise.all(roots.map(r => this.scanner.checkConflicts(r))).then(results => {
        const conflicts = results.flat();
        if (conflicts.length > 0) {
          this.logger.info(`Found ${conflicts.length} dependency conflict(s)`);
          const scannedWithConflicts = this.scanner.detectConflicts(scanned, conflicts);
          this.lastPackages = scannedWithConflicts;
          this.panel.sendPackages(scannedWithConflicts, checkResults, unusedPackages);
        }
        this.panel.sendConflicts(conflicts);
      }).catch(err => {
        this.logger.warn(`Conflict check failed: ${String(err)}`);
      });

      // Update history list and sidebar payload
      const historyEntries = buildHistoryEntries(this.history.getFullHistory(root));
      this.panel.sendHistory(historyEntries);

      if (this.sidebar) {
        const displayData = buildDisplayData(scanned, checkResults, unusedPackages);
        this.sidebar.sendPackages(displayData, scanStats, 'init');
      }

      this.updateStatusBar(checkResults);

      const outdated = checkResults.filter(r => r.status === 'update-available').length;
      if (outdated > 0) {
        this.logger.info(`${outdated} package(s) have updates available`);
      }
    } catch (err) {
      this.logger.error(`showVisualizer failed: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Package Visualizer: ${String(err)}`
      );
    }
  }

  /**
   * Sequentially scans dependencies and triggers full check, alerting the user
   * if updates are available.
   */
  async checkUpdates(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    this.logger.info('Checking for package updates...');

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Python Packages: Checking for updates...',
        cancellable: false,
      },
      async () => {
        try {
          const roots = this.getAllWorkspaceRoots();
          const [allScanned, importResults] = await Promise.all([
            Promise.all(roots.map(r => this.scanner.scanWorkspace(r))).then(results => results.flat()),
            Promise.all(roots.map(r => this.importScanner.scanImports(r))),
          ]);

          // Deduplicate packages by normalized name and source path
          const uniqueScanned: ScannedPackage[] = [];
          const seen = new Set<string>();
          for (const p of allScanned) {
            const key = `${p.name.toLowerCase()}::${p.source}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueScanned.push(p);
            }
          }
          const scanned = uniqueScanned;

          const checkResults = await this.checker.checkAll(
            scanned.map(p => ({
              name: p.name,
              installedVersion: p.installedVersion,
            }))
          );

          this.applyDriftStatus(scanned, checkResults);

          this.updateStatusBar(checkResults);

          // Compile imports from all workspace folders
          const mergedImportedModules = new Set<string>();
          for (const res of importResults) {
            for (const mod of res.importedModules) {
              mergedImportedModules.add(mod);
            }
          }

          const unusedPackages = this.importScanner.getUnusedPackagesWithConfidence(
            scanned.map(p => p.name),
            mergedImportedModules,
            buildConfidenceContext(scanned, checkResults)
          );

          if (this.panel.isVisible()) {
            this.panel.updatePackages(scanned, checkResults, unusedPackages);
          }

          if (this.sidebar?.isVisible()) {
            const displayData = buildDisplayData(scanned, checkResults, unusedPackages);
            this.sidebar.sendPackages(displayData, undefined, 'update');
          }

          const outdated = checkResults.filter(r => r.status === 'update-available');

          if (outdated.length === 0) {
            void vscode.window.showInformationMessage(
              'Python Packages: All packages are up to date! ✅'
            );
          } else {
            const msg = `${outdated.length} package(s) have updates available.`;
            const choice = await vscode.window.showInformationMessage(
              `Python Packages: ${msg}`,
              'Show Visualizer'
            );
            if (choice === 'Show Visualizer') {
              await this.showVisualizer();
            }
          }
        } catch (err) {
          this.logger.error(`checkUpdates failed: ${String(err)}`);
        }
      }
    );
  }

  /**
   * Silently triggers the workspace checker on opening and alerts the user
   * if outdated packages are detected.
   */
  async triggerAutoCheck(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    if (!config.get<boolean>('notifyOnOutdated', true)) {
      return;
    }

    try {
      const roots = this.getAllWorkspaceRoots();
      const allScanned = await Promise.all(roots.map(r => this.scanner.scanWorkspace(r))).then(results => results.flat());

      // Deduplicate packages by normalized name and source path
      const uniqueScanned: ScannedPackage[] = [];
      const seen = new Set<string>();
      for (const p of allScanned) {
        const key = `${p.name.toLowerCase()}::${p.source}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueScanned.push(p);
        }
      }
      const scanned = uniqueScanned;

      if (scanned.length === 0) {
        return;
      }

      const checkResults = await this.checker.checkAll(
        scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
      );

      this.applyDriftStatus(scanned, checkResults);

      this.updateStatusBar(checkResults);

      const outdated = checkResults.filter(r => r.status === 'update-available');

      if (outdated.length > 0) {
        const names = outdated
          .slice(0, 3)
          .map(r => r.packageName)
          .join(', ');
        const more = outdated.length > 3 ? ` and ${outdated.length - 3} more` : '';

        const choice = await vscode.window.showInformationMessage(
          `Python Packages: ${outdated.length} update(s) available — ${names}${more}`,
          'Show Visualizer',
          'Dismiss'
        );

        if (choice === 'Show Visualizer') {
          this.panel.show();
          this.panel.sendPackages(scanned, checkResults);
        }
      }
    } catch (err) {
      this.logger.warn(`Auto-check failed: ${String(err)}`);
    }
  }

  private applyDriftStatus(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[]
  ): void {
    const scannedMap = new Map(scanned.map(p => [p.name.toLowerCase(), p]));
    for (const r of checkResults) {
      const pkg = scannedMap.get(r.packageName.toLowerCase());
      if (
        pkg?.specifiedVersion &&
        pkg.installedVersion &&
        r.status === 'up-to-date' &&
        hasDrift(pkg.specifiedVersion, pkg.installedVersion)
      ) {
        r.status = 'drift';
      }
    }
  }

  private updateStatusBar(checkResults: VersionCheckResult[]): void {
    if (!this.statusBar) {
      return;
    }
    const outdated = checkResults.filter(r => r.status === 'update-available').length;
    const vulnerable = checkResults.filter(r => r.vulnerabilities && r.vulnerabilities.length > 0).length;
    this.statusBar.update(outdated, vulnerable, checkResults.length);
  }
}
