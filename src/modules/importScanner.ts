import { Logger } from '../utils/logger.js';
import {
  FileImportScanner,
  ImportScanResult
} from './import/scanner.js';
import {
  UnusedConfidenceAnalyzer,
  UnusedPackageInfo,
  UnusedConfidenceContext
} from './import/confidence.js';
import { mapImportToPackageName } from './import/packageMatcher.js';

export { ImportScanResult, UnusedPackageInfo, UnusedConfidenceContext };

/**
 * Coordinates Python import scanning and unused-package analysis.
 */
export class ImportScanner {
  private readonly fileScanner: FileImportScanner;
  private readonly confidenceAnalyzer: UnusedConfidenceAnalyzer;

  constructor(logger: Logger) {
    this.fileScanner = new FileImportScanner(logger);
    this.confidenceAnalyzer = new UnusedConfidenceAnalyzer();
  }

  /** Maps a Python import module name to its pip package name (null for stdlib). */
  mapToPackageName(moduleName: string): string | null {
    return mapImportToPackageName(moduleName);
  }

  async scanImports(workspaceRoot: string): Promise<ImportScanResult> {
    return this.fileScanner.scan(workspaceRoot);
  }

  getUnusedPackages(
    declaredPackages: string[],
    importedModules: Set<string>
  ): Set<string> {
    const enriched = this.getUnusedPackagesWithConfidence(
      declaredPackages,
      importedModules
    );
    return new Set([...enriched.values()].map(info => info.name));
  }

  getUnusedPackagesWithConfidence(
    declaredPackages: string[],
    importedModules: Set<string>,
    context?: UnusedConfidenceContext
  ): Map<string, UnusedPackageInfo> {
    return this.confidenceAnalyzer.analyze(declaredPackages, importedModules, context);
  }
}
