import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Logger } from '../../utils/logger.js';
import { PackageScanner } from '../../modules/packageScanner.js';
import { VersionHistoryCache } from '../../services/versionHistoryCache.js';
import { RequirementsSync } from '../../modules/requirementsSync.js';
import { WebviewPanel } from '../../ui/webviewPanel.js';

/**
 * Handles package installation, rollback, bulk upgrade, and execution tracking
 * for pip and uv commands in the extension.
 */
export class PackageInstaller {
  constructor(
    private readonly scanner: PackageScanner,
    private readonly history: VersionHistoryCache,
    private readonly reqSync: RequirementsSync,
    private readonly panel: WebviewPanel,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  /**
   * Spawns an upgrade command for a single package and synchronizes the pinned
   * version inside the project requirements declarations.
   */
  async updatePackage(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([packageName, '--upgrade'], root);
    this.logger.info(`Updating: ${exe} ${args.join(' ')}`);

    try {
      await this.runInstallTracked(exe, args, root, packageName);

      // Record in history and sync requirements files
      const scanned = await this.scanner.scanWorkspace(root);
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg?.installedVersion) {
        this.history.recordVersion(root, packageName, pkg.installedVersion, 'pip-install');
        const syncResult = await this.reqSync.syncVersion(root, packageName, pkg.installedVersion, pkg.source);
        if (syncResult.outcome !== 'synced') {
          this.logger.warn(`Post-update sync skipped for ${packageName}: ${syncResult.outcome}`);
        }
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
      await this.runInstallTracked(exe, args, root, packageName);
      this.history.recordVersion(root, packageName, finalVersion, 'pip-rollback');

      // Sync requirements file with new version
      const scanned = await this.scanner.scanWorkspace(root);
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg) {
        const syncResult = await this.reqSync.syncVersion(root, packageName, finalVersion, pkg.source);
        if (syncResult.outcome !== 'synced') {
          this.logger.warn(`Post-rollback sync skipped for ${packageName}: ${syncResult.outcome}`);
        }
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
            const cmd = await this.buildInstallCmd(`"${name}" --upgrade`, root);
            await this.runPip(cmd, root);
            succeeded++;
          } catch (err) {
            failed++;
            this.logger.error(`Update failed for ${name}: ${String(err)}`);
          }
        }
      }
    );

    const msg = failed === 0
      ? `✅ Updated ${succeeded} package${succeeded !== 1 ? 's' : ''} successfully.`
      : `⚠️ ${succeeded} updated, ${failed} failed. See Output panel for details.`;

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
    const pkgSpec = version ? `${packageName}==${version}` : packageName;
    const { exe, args } = await this.buildInstallSpawnArgs([pkgSpec], root);
    this.logger.info(`Installing new package: ${exe} ${args.join(' ')}`);

    try {
      await this.runInstallTracked(exe, args, root, packageName);

      // Append to requirements.txt if it exists and the package is not already listed
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

      void vscode.window.showInformationMessage(`Python Packages: ${packageName} installed ✅`);
      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Install failed: ${String(err)}`);
      void vscode.window.showErrorMessage(`Python Packages: Failed to install ${packageName}`);
    }
  }

  /**
   * Evaluates the active environment to return the correct install command prefix
   * for either uv or pip.
   */
  async buildInstallCmd(packageSpec: string, root: string): Promise<string> {
    const uvPath = await this.scanner.resolveUvPath(root);
    if (uvPath) {
      return `uv pip install ${packageSpec}`;
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
      return { exe: uvPath, args: ['pip', 'install', ...packageArgs] };
    }
    const python = this.scanner.resolvePythonPath();
    return { exe: python, args: ['-m', 'pip', 'install', ...packageArgs] };
  }

  /**
   * Spawns an installation command and processes the stdout output line-by-line
   * to send live completion percentages to the webview UI.
   */
  runInstallTracked(exe: string, args: string[], cwd: string, packageName: string): Promise<void> {
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
        if (code === 0) {
          sendProgress('Done', 100);
          resolve();
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
