import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { PackageScanner, ScannedPackage } from '../../modules/packageScanner.js';
import { ImportScanner, UnusedPackageInfo } from '../../modules/importScanner.js';
import { VersionChecker, VersionCheckResult } from '../../services/versionChecker.js';
import { VersionHistoryCache } from '../../services/versionHistoryCache.js';
import { WebviewPanel, type ScanStats } from '../../ui/webviewPanel.js';
import { SidebarProvider } from '../../ui/sidebarProvider.js';
import { StatusBarManager } from '../../ui/statusBarManager.js';
import {
  buildEnrichedDisplayData,
  buildConfidenceContext,
  buildHistoryEntries,
  buildGraphPackages,
} from './visualizer/displayCompiler.js';
import {
  applyDriftStatus,
  buildScanStats,
  countActionableUpdates,
  dedupeScannedPackages,
  mergeWorkspaceScans,
  resolveDetectedDepFilePaths,
} from './visualizer/scanHelpers.js';
import { runCheckUpdates, runTriggerAutoCheck } from './visualizer/updateFlows.js';
import type { PackageEnrichment } from '../../ui/webviewPanel.js';
import { UsageReferenceSearch } from '../../modules/import/usageReferenceSearch.js';
import { PypiTopLevelCache } from '../../modules/usageEvidence/pypiTopLevelCache.js';
import type { PackageDisplayData, DepFilesEmptyState, GraphPackageInfo } from '../../ui/webviewTypes.js';

/**
 * Handles core workspace package scanning, update checks, auto checks,
 * and compiles displays data for the main webview and sidebar.
 */
export class VisualizerHandler {
  private lastPackages: ScannedPackage[] = [];
  private lastGraphPackages: GraphPackageInfo[] = [];
  private lastCheckResults: VersionCheckResult[] = [];
  private lastImportedModules = new Set<string>();
  private lastFilesScanned = 0;
  private lastUnusedPackages: Map<string, UnusedPackageInfo> | undefined;
  private scanGeneration = 0;
  private readonly importScanner: ImportScanner;
  private readonly referenceSearch = new UsageReferenceSearch();
  private readonly pypiTopLevelCache: PypiTopLevelCache;

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
    this.pypiTopLevelCache = new PypiTopLevelCache(context);
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

  /** Latest display payload for Cursor AI unused-package analysis. */
  getUnusedAiScanState(): {
    packages: PackageDisplayData[];
    importedModules: Set<string>;
    filesScanned: number;
    workspaceRoot: string;
  } | undefined {
    const root = this.getWorkspaceRoot();
    if (!root || this.lastPackages.length === 0) {
      return undefined;
    }
    const packages = buildEnrichedDisplayData(
      this.lastPackages,
      this.lastCheckResults,
      root,
      this.history,
      this.lastUnusedPackages
    );
    return {
      packages,
      importedModules: new Set(this.lastImportedModules),
      filesScanned: this.lastFilesScanned,
      workspaceRoot: root,
    };
  }

  private packageEnrichment(root: string): PackageEnrichment {
    return { workspaceRoot: root, history: this.history };
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

    const scanGeneration = ++this.scanGeneration;

    try {
      const roots = this.getAllWorkspaceRoots();
      const [scanMerged, importResults] = await Promise.all([
        Promise.all(roots.map(r => this.scanner.scanWorkspace(r))).then(results =>
          mergeWorkspaceScans(results)
        ),
        Promise.all(roots.map(r => this.importScanner.scanImports(r))),
      ]);

      const scanned = dedupeScannedPackages(scanMerged.packages);
      const graphPackages = buildGraphPackages(scanMerged.transitivePackages);
      this.lastGraphPackages = graphPackages;

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
          this.sendEmptyDepFilesState({ reason: 'parse-failed', failedPath: existingManualPath });
          return;
        }

        this.sendEmptyDepFilesState({ reason: 'not-found' });
        return;
      }

      this.panel.sendProgress(`Checking ${scanned.length} packages on PyPI...`);
      this.sidebar?.sendProgress(`Checking ${scanned.length} packages on PyPI...`);

      const checkResults = await this.checker.checkAll(
        scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
      );

      applyDriftStatus(scanned, checkResults);

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

      const extraCandidates = new Map<string, Set<string>>();
      await this.pypiTopLevelCache.enrichCandidates(scanned.map(p => p.name), extraCandidates);

      const evidence = this.importScanner.evidenceEngine.collectEvidence(roots);
      const confidenceContext = buildConfidenceContext(
        scanned,
        checkResults,
        extraCandidates
      );

      const preliminaryUnused = this.importScanner.getUnusedPackagesWithConfidence(
        scanned.map(p => p.name),
        mergedImportedModules,
        confidenceContext,
        evidence
      );

      const refHits = this.referenceSearch.search(root, [...preliminaryUnused.keys()]);
      const unusedPackages = this.importScanner.evidenceEngine.analyzeUnused(
        scanned.map(p => p.name),
        mergedImportedModules,
        confidenceContext,
        evidence,
        refHits
      );

      this.lastImportedModules = mergedImportedModules;
      this.lastFilesScanned = totalFilesScanned;
      this.lastUnusedPackages = unusedPackages;

      this.logger.info(
        `Import scan: ${totalFilesScanned} files, ` +
        `${mergedImportedModules.size} modules, ` +
        `${unusedPackages.size} possibly unused packages`
      );

      const manualRequirementsPath = this.context.workspaceState.get<string>('pythonPackageVisualizer.manualRequirementsPath');
      const scanStats = buildScanStats({
        totalFilesScanned,
        mergedImportedModules,
        root,
        checkResults,
        manualRequirementsPath,
        detectedDepFilePaths: resolveDetectedDepFilePaths(this.context, roots),
      });

      this.lastPackages = scanned;
      this.lastCheckResults = checkResults;

      if (scanGeneration !== this.scanGeneration) {
        return;
      }

      this.deliverPackagesToPanel(
        scanned,
        checkResults,
        unusedPackages,
        scanStats,
        this.packageEnrichment(root),
        graphPackages
      );

      // Perform background conflict analysis across all workspace roots
      Promise.all(roots.map(r => this.scanner.checkConflicts(r))).then(results => {
        if (scanGeneration !== this.scanGeneration) {
          return;
        }
        const conflicts = results.flat();
        if (conflicts.length > 0) {
          this.logger.info(`Found ${conflicts.length} dependency conflict(s)`);
          const scannedWithConflicts = this.scanner.detectConflicts(scanned, conflicts);
          this.lastPackages = scannedWithConflicts;
          this.panel.updatePackages(
            scannedWithConflicts,
            checkResults,
            unusedPackages,
            scanStats,
            this.packageEnrichment(root),
            graphPackages
          );
        }
        this.panel.sendConflicts(conflicts);
      }).catch(err => {
        this.logger.warn(`Conflict check failed: ${String(err)}`);
      });

      // Update history list and sidebar payload
      const historyEntries = buildHistoryEntries(this.history.getFullHistory(root));
      this.panel.sendHistory(historyEntries);

      if (this.sidebar) {
        const displayData = buildEnrichedDisplayData(
          scanned,
          checkResults,
          root,
          this.history,
          unusedPackages
        );
        this.sidebar.sendPackages(displayData, scanStats, 'init');
      }

      this.updateStatusBar(checkResults, scanned);

      const outdated = countActionableUpdates(scanned, checkResults);
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

  async checkUpdates(): Promise<void> {
    await runCheckUpdates(this.getUpdateContext());
  }

  async triggerAutoCheck(): Promise<void> {
    await runTriggerAutoCheck(this.getUpdateContext());
  }

  private getUpdateContext() {
    return {
      logger: this.logger,
      scanner: this.scanner,
      checker: this.checker,
      history: this.history,
      panel: this.panel,
      importScanner: this.importScanner,
      sidebar: this.sidebar,
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      getAllWorkspaceRoots: () => this.getAllWorkspaceRoots(),
      packageEnrichment: (root: string) => this.packageEnrichment(root),
      updateStatusBar: (checkResults: VersionCheckResult[], scanned?: ScannedPackage[]) =>
        this.updateStatusBar(checkResults, scanned),
      showVisualizer: () => this.showVisualizer(),
      setLastGraphPackages: (packages: GraphPackageInfo[]) => { this.lastGraphPackages = packages; },
      getLastGraphPackages: () => this.lastGraphPackages,
      setLastPackages: (packages: ScannedPackage[]) => { this.lastPackages = packages; },
    };
  }

  private deliverPackagesToPanel(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages: Map<string, UnusedPackageInfo> | undefined,
    scanStats: ScanStats,
    enrich: PackageEnrichment,
    graphPackages: GraphPackageInfo[]
  ): void {
    if (this.panel.isWebviewReady()) {
      this.panel.updatePackages(
        scanned,
        checkResults,
        unusedPackages,
        scanStats,
        enrich,
        graphPackages
      );
      return;
    }
    this.panel.sendPackages(
      scanned,
      checkResults,
      unusedPackages,
      scanStats,
      enrich,
      undefined,
      graphPackages
    );
  }

  private updateStatusBar(checkResults: VersionCheckResult[], scanned?: ScannedPackage[]): void {
    if (!this.statusBar) {
      return;
    }
    const outdated = scanned
      ? countActionableUpdates(scanned, checkResults)
      : checkResults.filter(r => r.status === 'update-available').length;
    const vulnerable = checkResults.filter(r => r.vulnerabilities && r.vulnerabilities.length > 0).length;
    this.statusBar.update(outdated, vulnerable, checkResults.length);
  }

  private sendEmptyDepFilesState(state: DepFilesEmptyState): void {
    this.panel.sendPackages([], [], undefined, undefined, undefined, state);
    this.sidebar?.sendPackages([], undefined, 'init');
  }
}
