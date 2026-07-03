import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { WebviewPanel } from '../../ui/webviewPanel.js';
import { CursorAiService } from '../../services/cursorAiService.js';
import { UsageReferenceSearch } from '../../modules/import/usageReferenceSearch.js';
import type { PackageDisplayData } from '../../ui/webviewTypes.js';
import { normalizeName } from '../../modules/import/normalize.js';

export interface UnusedAiScanState {
  packages: PackageDisplayData[];
  importedModules: Set<string>;
  filesScanned: number;
  workspaceRoot: string;
}

/**
 * Runs deep reference search and opens Cursor Agent for AI-assisted unused-package review.
 */
export class UnusedAiHandler {
  private readonly cursorAi = new CursorAiService();
  private readonly referenceSearch = new UsageReferenceSearch();
  private lastScan: UnusedAiScanState | undefined;

  constructor(
    private readonly panel: WebviewPanel,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null
  ) {}

  setScanState(state: UnusedAiScanState): void {
    this.lastScan = state;
  }

  async sendCapabilities(): Promise<void> {
    const caps = await this.cursorAi.getCapabilities();
    this.panel.sendIdeCapabilities(caps);
  }

  async analyzeUnusedWithCursor(
    packageNames?: string[]
  ): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !this.lastScan) {
      void vscode.window.showWarningMessage(
        'Python Packages: Open the visualizer and scan the workspace first.'
      );
      return;
    }

    const caps = await this.cursorAi.getCapabilities();
    if (!caps.enabled) {
      void vscode.window.showInformationMessage(
        'Cursor AI analysis is disabled. Enable it in Python Package Visualizer settings.'
      );
      return;
    }

    if (!caps.canOpenChat && !caps.isCursor) {
      void vscode.window.showWarningMessage(
        'AI analysis requires Cursor IDE with Agent chat available.'
      );
      return;
    }

    const unusedPackages = this.lastScan.packages.filter(p => {
      if (p.isUsed) {
        return false;
      }
      if (!packageNames?.length) {
        return true;
      }
      return packageNames.some(n => normalizeName(n) === normalizeName(p.name));
    });

    if (unusedPackages.length === 0) {
      void vscode.window.showInformationMessage(
        'Python Packages: No unused packages to analyze.'
      );
      return;
    }

    this.panel.sendProgress('Searching workspace references…');

    const referenceHits = this.referenceSearch.search(
      root,
      unusedPackages.map(p => p.name)
    );

    // Packages found in configs/scripts are likely used — notify user
    const likelyUsed = [...referenceHits.keys()];
    if (likelyUsed.length > 0) {
      this.logger.info(
        `Reference search found usage hints for: ${likelyUsed.join(', ')}`
      );
    }

    const prompt = this.cursorAi.buildUnusedAnalysisPrompt({
      workspaceRoot: root,
      packages: this.lastScan.packages,
      importedModules: [...this.lastScan.importedModules],
      filesScanned: this.lastScan.filesScanned,
      referenceHits,
    });

    try {
      await this.cursorAi.openAnalysisChat(prompt);
      this.panel.sendUnusedAiResult({
        analyzed: unusedPackages.length,
        referenceHits: Object.fromEntries(
          [...referenceHits.entries()].map(([pkg, hits]) => [pkg, hits])
        ),
      });
    } catch (err) {
      this.logger.error(`Cursor AI analysis failed: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Cursor AI analysis failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
