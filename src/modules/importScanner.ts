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
import {
  STDLIB_MODULES,
  IMPORT_TO_PACKAGE
} from './import/maps.js';

export { ImportScanResult, UnusedPackageInfo, UnusedConfidenceContext };

/**
 * ImportScanner class.
 * Serves as the primary public entry point and coordinator for Python import scanning
 * and unused package confidence scoring.
 * 
 * Satisfies the Single Responsibility Principle by delegating file parsing and analytical
 * calculations to specialized components.
 */
export class ImportScanner {
  private readonly fileScanner: FileImportScanner;
  private readonly confidenceAnalyzer: UnusedConfidenceAnalyzer;

  constructor(logger: Logger) {
    this.fileScanner = new FileImportScanner(logger);
    this.confidenceAnalyzer = new UnusedConfidenceAnalyzer();
  }

  /**
   * Maps a Python import module name to its corresponding pip package name.
   * Returns null if it is a standard library module.
   * 
   * @param {string} moduleName - The extracted import name.
   * @returns {string | null} Normalized package name or null.
   */
  public mapToPackageName(moduleName: string): string | null {
    const lower = moduleName.toLowerCase();
    // Standard library check
    if (STDLIB_MODULES.has(lower.split('.')[0])) { return null; }
    // Direct mapping
    if (IMPORT_TO_PACKAGE[lower]) { return IMPORT_TO_PACKAGE[lower]; }
    // 2-level for namespace packages
    const parts = lower.split('.');
    if (parts.length >= 2) {
      const twoLevel = parts.slice(0, 2).join('.');
      if (IMPORT_TO_PACKAGE[twoLevel]) { return IMPORT_TO_PACKAGE[twoLevel]; }
    }
    // Top-level fallback
    const top = parts[0];
    if (IMPORT_TO_PACKAGE[top]) { return IMPORT_TO_PACKAGE[top]; }
    // Default: assume top-level matches package name
    return top;
  }

  /**
   * Scans Python files in the workspace and extracts unique imported modules.
   * Delegates the task to FileImportScanner.
   * 
   * @param {string} workspaceRoot - Directory path to scan.
   * @returns {Promise<ImportScanResult>} Harvester results.
   */
  public async scanImports(workspaceRoot: string): Promise<ImportScanResult> {
    return this.fileScanner.scan(workspaceRoot);
  }

  /**
   * Simple boolean unused detection.
   * Provided to maintain 100% backward compatibility with legacy stubs.
   * 
   * @param {string[]} declaredPackages - declared requirements.
   * @param {Set<string>} importedModules - set of scanned imports.
   * @returns {Set<string>} Set of unused package names.
   */
  public getUnusedPackages(
    declaredPackages: string[],
    importedModules: Set<string>
  ): Set<string> {
    const enriched = this.getUnusedPackagesWithConfidence(
      declaredPackages,
      importedModules
    );
    return new Set([...enriched.values()].map(info => info.name));
  }

  /**
   * Enriched unused package detection with multi-signal confidence scoring.
   * Delegates the analysis to UnusedConfidenceAnalyzer.
   * 
   * @param {string[]} declaredPackages - declared requirements.
   * @param {Set<string>} importedModules - set of scanned imports.
   * @param {UnusedConfidenceContext} [context] - optional downloads and dependency map data.
   * @returns {Map<string, UnusedPackageInfo>} Package details map.
   */
  public getUnusedPackagesWithConfidence(
    declaredPackages: string[],
    importedModules: Set<string>,
    context?: UnusedConfidenceContext
  ): Map<string, UnusedPackageInfo> {
    return this.confidenceAnalyzer.analyze(declaredPackages, importedModules, context);
  }
}
