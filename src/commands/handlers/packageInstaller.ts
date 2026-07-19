import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Logger } from '../../utils/logger.js';
import { hasDrift, extractExactPinnedVersion, isExactPin } from '../../utils/version.js';
import { PackageScanner } from '../../modules/packageScanner.js';
import { VersionHistoryCache } from '../../services/versionHistoryCache.js';
import { RequirementsSync } from '../../modules/requirementsSync.js';
import { WebviewPanel } from '../../ui/webviewPanel.js';
import { withUvGlobalArgs } from '../../utils/uvSpawn.js';

/**
 * Handles package installation, rollback, bulk upgrade, and execution tracking
 * for pip and uv commands in the extension.
 */
export class PackageInstaller {
  constructor(
    private readonly scanner: PackageScanner,
    readonly history: VersionHistoryCache,
    private readonly reqSync: RequirementsSync,
    private readonly panel: WebviewPanel,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  /**
   * Syncs the dependency file only when the current specifier is an exact pin (`==`).
   * Flexible constraints (`>=`, `^`, `~=`, …) are left untouched to avoid silent tighten.
   */
  private async syncExactPinOnly(
    root: string,
    packageName: string,
    version: string,
    source: string | undefined,
    specifiedVersion: string | undefined,
    contextLabel: string
  ): Promise<void> {
    if (!source || !version) {
      return;
    }
    if (!isExactPin(specifiedVersion ?? '')) {
      this.logger.info(
        `${contextLabel}: skip file sync for ${packageName} (flexible constraint: ${specifiedVersion || 'none'})`
      );
      return;
    }
    const syncResult = await this.reqSync.syncVersionWithFallback(
      root,
      packageName,
      version,
      source
    );
    if (syncResult.outcome !== 'synced') {
      this.logger.warn(`${contextLabel} sync skipped for ${packageName}: ${syncResult.outcome}`);
    }
  }

  /**
   * Installs a pip package spec (e.g. "contourpy>=1.0.1") to resolve dependency conflicts.
   */
  async installPackageSpec(spec: string, packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !spec.trim()) {
      return;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([spec], root);
    this.logger.info(`Installing conflict fix: ${exe} ${args.join(' ')}`);

    try {
      const installTime = await this.runInstallTracked(exe, args, root, packageName);

      const scanned = (await this.scanner.scanWorkspace(root)).packages;
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg?.installedVersion) {
        this.history.recordVersion(root, packageName, pkg.installedVersion, 'pip-install', installTime);
        await this.syncExactPinOnly(
          root,
          packageName,
          pkg.installedVersion,
          pkg.source,
          pkg.specifiedVersion,
          'Post-fix'
        );
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} updated to satisfy dependency requirement ✅`
      );

      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Conflict fix failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to install ${spec}. See Output panel for details.`
      );
      this.logger.show();
    }
  }

  /**
   * Spawns an upgrade command for a single package and synchronizes the pinned
   * version inside the project requirements declarations.
   */
  async updatePackage(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([packageName, '--upgrade'], root);
    this.logger.info(`Updating: ${exe} ${args.join(' ')}`);

    try {
      const installTime = await this.runInstallTracked(exe, args, root, packageName);

      // Record in history and sync requirements files
      const scanned = (await this.scanner.scanWorkspace(root)).packages;
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg?.installedVersion) {
        this.history.recordVersion(root, packageName, pkg.installedVersion, 'pip-install', installTime);
        await this.syncExactPinOnly(
          root,
          packageName,
          pkg.installedVersion,
          pkg.source,
          pkg.specifiedVersion,
          'Post-update'
        );
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} updated successfully ✅`
      );

      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Update failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to update ${packageName}. See Output panel for details.`
      );
      this.logger.show();
    }
  }

  /**
   * Reverts a package to a previously recorded version or specific version target,
   * updating both the virtual environment and requirements lists.
   */
  async rollbackPackage(packageName: string, version: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return;
    }

    let finalVersion = version;
    if (!finalVersion) {
      const prev = this.history.getPreviousVersion(root, packageName);
      if (!prev) {
        void vscode.window.showWarningMessage(
          `Python Packages: No previous version recorded for ${packageName}.`
        );
        return;
      }
      finalVersion = prev;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([`${packageName}==${finalVersion}`], root);
    this.logger.info(`Rolling back: ${exe} ${args.join(' ')}`);

    try {
      const installTime = await this.runInstallTracked(exe, args, root, packageName);
      this.history.recordVersion(root, packageName, finalVersion, 'pip-rollback', installTime);

      // Sync requirements file with new version
      const scanned = (await this.scanner.scanWorkspace(root)).packages;
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg) {
        await this.syncExactPinOnly(
          root,
          packageName,
          finalVersion,
          pkg.source,
          pkg.specifiedVersion,
          'Post-rollback'
        );
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} rolled back to ${finalVersion} ✅`
      );

      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Rollback failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to rollback ${packageName}. See Output panel for details.`
      );
      this.logger.show();
    }
  }

  /**
   * Installs and upgrades multiple selected packages sequentially, showing a unified
   * progress bar inside the editor notifications.
   */
  async updateAllPackages(names: string[]): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !names.length) {
      return;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return;
    }

    let succeeded = 0;
    let failed = 0;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Python Packages: Updating ${names.length} packages…`,
        cancellable: false,
      },
      async progress => {
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          progress.report({
            message: `(${i + 1}/${names.length}) ${name}`,
            increment: 100 / names.length,
          });
          try {
            const { exe, args } = await this.buildInstallSpawnArgs([name, '--upgrade'], root);
            const installTime = await this.runInstallTracked(exe, args, root, name);

            const scanned = (await this.scanner.scanWorkspace(root)).packages;
            const pkg = scanned.find(p => p.name === name);
            if (pkg?.installedVersion) {
              this.history.recordVersion(root, name, pkg.installedVersion, 'pip-install', installTime);
              await this.syncExactPinOnly(
                root,
                name,
                pkg.installedVersion,
                pkg.source,
                pkg.specifiedVersion,
                'Post-bulk-update'
              );
            }

            succeeded++;
          } catch (err) {
            failed++;
            this.logger.error(`Update failed for ${name}: ${String(err)}`);
          }
        }
      }
    );

    // Reconcile exact pins still out of sync (wrong source file, pruned includes, etc.)
    const finalScan = (await this.scanner.scanWorkspace(root)).packages;
    for (const pkg of finalScan) {
      if (
        pkg.installedVersion &&
        pkg.specifiedVersion &&
        pkg.source &&
        hasDrift(pkg.specifiedVersion, pkg.installedVersion)
      ) {
        const syncResult = await this.reqSync.syncVersionWithFallback(
          root,
          pkg.name,
          pkg.installedVersion,
          pkg.source
        );
        if (syncResult.outcome !== 'synced') {
          this.logger.warn(`Post-bulk reconcile failed for ${pkg.name}: ${syncResult.outcome}`);
        }
      }
    }

    const msg = failed === 0
      ? `✅ Updated ${succeeded} package${succeeded !== 1 ? 's' : ''} successfully.`
      : `⚠️ ${succeeded} updated, ${failed} failed. See Output panel for details.`;

    void vscode.window.showInformationMessage(`Python Packages: ${msg}`);
    await this.refreshCallback();
  }

  /**
   * Installs multiple missing packages sequentially, using pinned versions from
   * dependency files when available.
   */
  async installAllPackages(names: string[]): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !names.length) {
      return;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return;
    }

    const scanned = (await this.scanner.scanWorkspace(root)).packages;
    let succeeded = 0;
    let failed = 0;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Python Packages: Installing ${names.length} packages…`,
        cancellable: false,
      },
      async progress => {
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          progress.report({
            message: `(${i + 1}/${names.length}) ${name}`,
            increment: 100 / names.length,
          });
          try {
            const pkg = scanned.find(p => p.name === name);
            // Only honor exact pins (==) when installing; ranges stay flexible for the resolver.
            const version = pkg?.specifiedVersion
              ? extractExactPinnedVersion(pkg.specifiedVersion) ?? undefined
              : undefined;
            await this.runNewPackageInstall(name, version, root);
            succeeded++;
          } catch (err) {
            failed++;
            this.logger.error(`Install failed for ${name}: ${String(err)}`);
          }
        }
      }
    );

    const msg = failed === 0
      ? `✅ Installed ${succeeded} package${succeeded !== 1 ? 's' : ''} successfully.`
      : `⚠️ ${succeeded} installed, ${failed} failed. See Output panel for details.`;

    void vscode.window.showInformationMessage(`Python Packages: ${msg}`);
    await this.refreshCallback();
  }

  /**
   * Spawns a process to install a brand new dependency in the current environment
   * and appends it to requirements.txt (if requirements.txt already exists in the project).
   */
  async installNewPackage(packageName: string, version?: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName.trim()) {
      return;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return;
    }

    try {
      await this.runNewPackageInstall(packageName, version, root);
      void vscode.window.showInformationMessage(`Python Packages: ${packageName} installed ✅`);
      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Install failed: ${String(err)}`);
      void vscode.window.showErrorMessage(`Python Packages: Failed to install ${packageName}`);
    }
  }

  /**
   * Runs pip/uv install for a new package and appends to requirements.txt when present.
   */
  private async runNewPackageInstall(
    packageName: string,
    version: string | undefined,
    root: string
  ): Promise<void> {
    const pkgSpec = version ? `${packageName}==${version}` : packageName;
    const { exe, args } = await this.buildInstallSpawnArgs([pkgSpec], root);
    this.logger.info(`Installing new package: ${exe} ${args.join(' ')}`);
    const installTime = await this.runInstallTracked(exe, args, root, packageName);

    const recordedVersion = version
      ?? (await this.scanner.scanWorkspace(root)).packages.find(p => p.name === packageName)?.installedVersion;
    if (recordedVersion) {
      this.history.recordVersion(root, packageName, recordedVersion, 'pip-install', installTime);
    }

    const reqFile = vscode.Uri.file(path.join(root, 'requirements.txt'));
    try {
      const bytes = await vscode.workspace.fs.readFile(reqFile);
      const content = Buffer.from(bytes).toString('utf-8');
      const normPkg = packageName.toLowerCase().replace(/[-_.]+/g, '-');
      const alreadyListed = content.split('\n').some(line => {
        const clean = line.split('#')[0].trim().toLowerCase().replace(/[-_.]+/g, '-');
        return clean.startsWith(normPkg);
      });
      if (!alreadyListed) {
        const entry = version ? `${packageName}==${version}` : packageName;
        const newContent = content.endsWith('\n') ? content + entry + '\n' : content + '\n' + entry + '\n';
        await vscode.workspace.fs.writeFile(reqFile, Buffer.from(newContent, 'utf-8'));
        this.logger.info(`Appended ${entry} to requirements.txt`);
      }
    } catch {
      // requirements.txt does not exist — skip silently
    }
  }

  /**
   * Asks for confirmation when pip would target a non-project interpreter.
   */
  private async confirmInstallTarget(root: string): Promise<boolean> {
    if (!this.scanner.willUseGlobalPython(root)) {
      return true;
    }

    const python = this.scanner.resolvePythonPath();
    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const isIt = lang === 'it';
    const displayPath = python.length > 72 ? `...${python.slice(-69)}` : python;
    const message = isIt
      ? `I pacchetti verranno installati/aggiornati nell'interprete Python globale o esterno:\n${displayPath}\n\nNon verrà usato un virtual environment del progetto (.venv, venv, env). Procedere?`
      : `Packages will be installed/updated in the global or external Python interpreter:\n${displayPath}\n\nNo project virtual environment (.venv, venv, env) will be used. Continue?`;
    const proceed = isIt ? 'Procedi' : 'Continue';
    const cancel = isIt ? 'Annulla' : 'Cancel';
    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      proceed,
      cancel
    );
    return choice === proceed;
  }

  /**
   * Evaluates the active environment to return the correct install command prefix
   * for either uv or pip.
   */
  async buildInstallCmd(packageSpec: string, root: string): Promise<string> {
    const uvPath = await this.scanner.resolveUvPath(root);
    if (uvPath) {
      return `uv --system-certs pip install ${packageSpec}`;
    }
    const python = this.scanner.resolvePythonPath();
    return `"${python}" -m pip install ${packageSpec}`;
  }

  /**
   * Evaluates the active environment to return spawn-ready command and list of arguments.
   */
  async buildInstallSpawnArgs(packageArgs: string[], root: string): Promise<{ exe: string; args: string[] }> {
    const uvPath = await this.scanner.resolveUvPath(root);
    if (uvPath) {
      return { exe: uvPath, args: withUvGlobalArgs(['pip', 'install', ...packageArgs]) };
    }
    const python = this.scanner.resolvePythonPath();
    return { exe: python, args: ['-m', 'pip', 'install', ...packageArgs] };
  }

  /** Returns spawn args to uninstall packages from the active environment. */
  async buildUninstallSpawnArgs(
    packageNames: string[],
    root: string
  ): Promise<{ exe: string; args: string[] }> {
    const uvPath = await this.scanner.resolveUvPath(root);
    if (uvPath) {
      return { exe: uvPath, args: withUvGlobalArgs(['pip', 'uninstall', ...packageNames, '-y']) };
    }
    const python = this.scanner.resolvePythonPath();
    return { exe: python, args: ['-m', 'pip', 'uninstall', ...packageNames, '-y'] };
  }

  /** Upgrades pip in the workspace interpreter (supports uv and venv). */
  async updatePip(): Promise<boolean> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return false;
    }
    if (!(await this.confirmInstallTarget(root))) {
      return false;
    }

    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const isIt = lang === 'it';

    try {
      const { exe, args } = await this.buildInstallSpawnArgs(['--upgrade', 'pip'], root);
      this.logger.info(`Updating pip: ${exe} ${args.join(' ')}`);
      await this.runPipSpawn(exe, args, root);
      void vscode.window.showInformationMessage(
        isIt ? 'Python Packages: pip aggiornato ✅' : 'Python Packages: pip updated ✅'
      );
      return true;
    } catch (err) {
      this.logger.error(`pip update failed: ${String(err)}`);
      void vscode.window.showErrorMessage(
        isIt
          ? `Aggiornamento pip fallito: ${err instanceof Error ? err.message : String(err)}`
          : `Failed to update pip: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /** Uninstalls packages from the active environment without per-package prompts. */
  async bulkUninstallPackages(
    packageNames: string[]
  ): Promise<{ uninstalled: number; failed: string[] }> {
    const root = this.getWorkspaceRoot();
    const unique = [...new Set(packageNames.map(n => n.trim()).filter(Boolean))];
    if (!root || unique.length === 0) {
      return { uninstalled: 0, failed: [] };
    }
    if (!(await this.confirmInstallTarget(root))) {
      return { uninstalled: 0, failed: unique };
    }

    try {
      const { exe, args } = await this.buildUninstallSpawnArgs(unique, root);
      this.logger.info(`Bulk uninstall: ${exe} ${args.join(' ')}`);
      await this.runPipSpawn(exe, args, root);
      return { uninstalled: unique.length, failed: [] };
    } catch (err) {
      this.logger.warn(`Batch uninstall failed, trying individually: ${String(err)}`);
      let uninstalled = 0;
      const failed: string[] = [];
      for (const name of unique) {
        try {
          const { exe, args } = await this.buildUninstallSpawnArgs([name], root);
          await this.runPipSpawn(exe, args, root);
          uninstalled++;
        } catch {
          failed.push(name);
        }
      }
      return { uninstalled, failed };
    }
  }

  private runPipSpawn(exe: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(exe, args, { cwd, shell: false });
      let stderr = '';

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.logger.warn(text.trim());
      });
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          this.logger.info(text);
        }
      });
      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `Process exited with code ${String(code)}`));
        }
      });
      child.on('error', reject);
    });
  }

  /**
   * Spawns an installation command and processes the stdout output line-by-line
   * to send live completion percentages to the webview UI.
   * @returns Elapsed install time in seconds.
   */
  runInstallTracked(exe: string, args: string[], cwd: string, packageName: string): Promise<number> {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const child = cp.spawn(exe, args, { cwd, shell: false });

      const sendProgress = (stage: string, percent: number) => {
        void this.panel.webview?.postMessage({ type: 'pkgProgress', name: packageName, stage, percent });
      };

      sendProgress('Starting…', 5);

      let stderr = '';
      let stdoutBuf = '';

      const processLine = (line: string) => {
        if (!line.trim()) { return; }
        this.logger.info(line);
        const l = line.toLowerCase();
        if (l.includes('collecting') || l.includes('resolved')) {
          sendProgress('Collecting…', 15);
        } else if (l.includes('downloading') || l.includes('prepared')) {
          const match = line.match(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*mb/i);
          if (match) {
            const pct = Math.round((parseFloat(match[1]) / parseFloat(match[2])) * 50) + 20;
            sendProgress('Downloading…', Math.min(pct, 70));
          } else {
            sendProgress('Downloading…', 40);
          }
        } else if (l.includes('installing collected') || l.includes('installed') || l.includes('updated')) {
          sendProgress('Installing…', 85);
        } else if (l.includes('successfully installed') || l.includes('requirement already satisfied') || l.includes('audited')) {
          sendProgress('Done', 100);
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        lines.forEach(processLine);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.logger.warn(text.trim());
      });
      child.on('close', (code: number | null) => {
        if (stdoutBuf) { processLine(stdoutBuf); }
        const elapsedSec = Math.max(0.01, (Date.now() - startedAt) / 1000);
        if (code === 0) {
          sendProgress('Done', 100);
          resolve(elapsedSec);
        } else {
          reject(new Error(stderr || `Process exited with code ${String(code)}`));
        }
      });
      child.on('error', reject);
    });
  }

  /**
   * Executes a command via child_process exec with timeout support.
   */
  runPip(cmd: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      cp.exec(cmd, { cwd, timeout: 120_000 }, (err, stdout, stderr) => {
        if (stdout) {
          this.logger.info(stdout.trim());
        }
        if (stderr) {
          this.logger.warn(stderr.trim());
        }
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      });
    });
  }
}
