import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { RequirementsSync } from '../../modules/requirementsSync.js';
import { RequirementsGenerator } from '../../modules/requirementsGenerator.js';
import { ScannedPackage } from '../../modules/packageScanner.js';

/**
 * Coordinates dependency file syncing, alignment, creation, removal,
 * and manual file selection.
 */
export class RequirementsHandler {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly reqSync: RequirementsSync,
    private readonly reqGen: RequirementsGenerator,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  /**
   * Pins a package to a specific version inside the target dependency file.
   */
  async pinVersion(packageName: string, version: string, sourceFile: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !version) {
      return;
    }
    try {
      await this.reqSync.syncVersion(root, packageName, version, sourceFile);
      void vscode.window.showInformationMessage(`📌 Pinned ${packageName} to ==${version} in ${sourceFile}`);
      await this.refreshCallback();
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to pin ${packageName}: ${String(err)}`);
    }
  }

  /**
   * Aligns the requirement pin version with the currently installed version.
   */
  async syncRequirementsToInstalled(
    packageName: string,
    sourceFile: string,
    lastPackages: ScannedPackage[]
  ): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const scanned = lastPackages.find(
      p => p.name.toLowerCase() === packageName.toLowerCase()
    );
    const installedVersion = scanned?.installedVersion;
    if (!installedVersion) {
      void vscode.window.showWarningMessage(
        `Cannot sync "${packageName}": installed version not found. Try refreshing first.`
      );
      return;
    }

    try {
      const synced = await this.reqSync.syncVersion(root, packageName, installedVersion, sourceFile);
      if (synced) {
        void vscode.window.showInformationMessage(
          `🔗 Synced ${packageName}==${installedVersion} in ${sourceFile}`
        );
        await this.refreshCallback();
      } else {
        void vscode.window.showWarningMessage(
          `Could not find "${packageName}" in ${sourceFile} to sync.`
        );
      }
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to sync ${packageName}: ${String(err)}`);
    }
  }

  /**
   * Bootstraps a default requirements.txt file at the workspace root.
   */
  async createRequirementsFile(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }
    const filePath = vscode.Uri.file(root + '/requirements.txt');
    const content = '# Requirements\n# Add your dependencies here\n# Example: requests==2.31.0\n';
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    void vscode.window.showInformationMessage('Created requirements.txt — add your packages and refresh.');
  }

  /**
   * Prompts for confirmation and deletes a package declaration from the specified dependency file.
   */
  async removeFromRequirements(packageName: string, sourceFile: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove "${packageName}" from ${sourceFile}?`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      return;
    }

    try {
      const removed = await this.reqSync.removePackage(root, packageName, sourceFile);
      if (removed) {
        void vscode.window.showInformationMessage(
          `Removed "${packageName}" from ${sourceFile}.`
        );
        await this.refreshCallback();
      } else {
        void vscode.window.showWarningMessage(
          `Could not find "${packageName}" in ${sourceFile}. It may have already been removed.`
        );
      }
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to remove package: ${String(err)}`);
    }
  }

  /**
   * Scans all import statements in the workspace source files and generates a requirements.txt file
   * mapping only the actually-imported modules.
   */
  async generateRequirements(): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        void vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      const target = await this.reqGen.writeFile(root);
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      void vscode.window.showInformationMessage('✅ requirements.txt generated from imports.');
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to generate requirements: ${String(err)}`);
    }
  }

  /**
   * Prompts the user to manually select a requirements.txt file.
   */
  async selectManualRequirements(): Promise<void> {
    const selectedFiles = await vscode.window.showOpenDialog({
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
      this.logger.info(`Manually selected requirements file path updated: ${selectedPath}`);
      void vscode.window.showInformationMessage(`Selected manual requirements file: ${selectedPath}`);
      await this.refreshCallback();
    }
  }

  /**
   * Clears the manually selected requirements.txt file path from the workspace state.
   */
  async clearManualRequirements(): Promise<void> {
    await this.context.workspaceState.update('pythonPackageVisualizer.manualRequirementsPath', undefined);
    this.logger.info('Cleared manually selected requirements path');
    void vscode.window.showInformationMessage('Cleared manually selected requirements file.');
    await this.refreshCallback();
  }
}
