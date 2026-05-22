import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { MigrationHelper } from '../../modules/migrationHelper.js';

/**
 * Facilitates automated dependency migration from traditional requirements lists
 * to modern uv or Poetry pyproject.toml configurations.
 */
export class MigrationHandler {
  constructor(
    private readonly migration: MigrationHelper,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null
  ) {}

  /**
   * Prompts for confirmation and converts current dependencies to modern PEP 621
   * uv configuration.
   */
  async migrateToUv(): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        'This will create or overwrite pyproject.toml in your project. Continue?',
        { modal: true },
        'Migrate to uv'
      );
      if (choice !== 'Migrate to uv') {
        return;
      }
      const target = await this.migration.migrateToUv(root);
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      void vscode.window.showInformationMessage('✅ Migrated to uv. Run `uv sync` to install.');
    } catch (err) {
      void vscode.window.showErrorMessage(`Migration failed: ${String(err)}`);
      this.logger.error(`Migration to uv failed: ${String(err)}`);
    }
  }

  /**
   * Prompts for confirmation and converts current dependencies to Poetry-configured
   * pyproject.toml layout.
   */
  async migrateToPoetry(): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        'This will create or overwrite pyproject.toml in your project. Continue?',
        { modal: true },
        'Migrate to Poetry'
      );
      if (choice !== 'Migrate to Poetry') {
        return;
      }
      const target = await this.migration.migrateToPoetry(root);
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      void vscode.window.showInformationMessage('✅ Migrated to Poetry. Run `poetry install` to install.');
    } catch (err) {
      void vscode.window.showErrorMessage(`Migration failed: ${String(err)}`);
      this.logger.error(`Migration to Poetry failed: ${String(err)}`);
    }
  }
}
