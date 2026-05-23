import { NAMESPACE_PREFIXES, IMPORT_TO_PACKAGE, NEVER_IMPORTED_PACKAGES } from './maps.js';

export interface UnusedPackageInfo {
  /** Normalized package name */
  name: string;
  /** Confidence percentage (5–100) that the package is truly unused */
  confidence: number;
  /** Human-readable reasons explaining the confidence deductions */
  reasons: string[];
}

export interface UnusedConfidenceContext {
  /** Map of package name → list of its dependency names (from pip show) */
  requiresMap: Map<string, string[]>;
  /** Map of package name → weekly download count */
  downloadsMap: Map<string, number>;
  /** Map of package name → group (main, dev, test, docs, lint, optional) */
  groupMap: Map<string, string>;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * UnusedConfidenceAnalyzer class.
 * Computes unused package lists and scores confidence levels based on multiple heuristics.
 */
export class UnusedConfidenceAnalyzer {
  /**
   * Compiles declared packages and imports to compute the subset of unused packages with a confidence score.
   * 
   * @param {string[]} declaredPackages - List of packages declared in requirements/pyproject files.
   * @param {Set<string>} importedModules - Module names harvested during the import scan.
   * @param {UnusedConfidenceContext} [context] - Enrichment context (dependencies, downloads, etc.).
   * @returns {Map<string, UnusedPackageInfo>} Normalized package name → package info.
   */
  public analyze(
    declaredPackages: string[],
    importedModules: Set<string>,
    context?: UnusedConfidenceContext
  ): Map<string, UnusedPackageInfo> {
    const normalizedImports = new Set(
      [...importedModules].map(m => m.toLowerCase())
    );

    const result = new Map<string, UnusedPackageInfo>();

    // Build reverse dependency index to see if any other packages rely on this package
    const requiredBy = new Map<string, string[]>();
    if (context?.requiresMap) {
      for (const [parentPkg, deps] of context.requiresMap) {
        for (const dep of deps) {
          const normDep = normalize(dep);
          const list = requiredBy.get(normDep) ?? [];
          list.push(parentPkg);
          requiredBy.set(normDep, list);
        }
      }
    }

    for (const pkg of declaredPackages) {
      const norm = normalize(pkg);

      // Skip packages that are never imported directly (e.g., platforms, certs)
      if (NEVER_IMPORTED_PACKAGES.has(norm)) {
        continue;
      }

      if (this.isPackageUsed(norm, normalizedImports)) {
        continue;
      }

      // Compute deductions based on signals that suggest the package might still be needed
      let confidence = 100;
      const reasons: string[] = [];

      // Signal 1: Is this package a transitive dependency of another installed package?
      const parents = requiredBy.get(norm);
      if (parents && parents.length > 0) {
        confidence -= 40;
        reasons.push(`required-by:${parents.slice(0, 3).join(',')}`);
      }

      // Signal 2: Is this in a dev/test/lint/docs group?
      const group = context?.groupMap?.get(norm);
      if (group && group !== 'main') {
        confidence -= 15;
        reasons.push(`group:${group}`);
      }

      // Signal 3: Does the package have a known reverse import mapping?
      const hasReverseMapping = Object.values(IMPORT_TO_PACKAGE).some(
        pkgName => normalize(pkgName) === norm
      );
      if (hasReverseMapping) {
        confidence -= 10;
        reasons.push('reverse-map');
      }

      // Signal 4: High weekly downloads (>1M) → popular package, less likely accidental
      const downloads = context?.downloadsMap?.get(norm) ?? 0;
      if (downloads > 1_000_000) {
        confidence -= 5;
        reasons.push('high-downloads');
      }

      // Signal 5: Partial module name match — a submodule was found in imports
      if (this.hasPartialImportMatch(norm, normalizedImports)) {
        confidence -= 10;
        reasons.push('partial-match');
      }

      // Floor at 5% to always acknowledge some uncertainty
      confidence = Math.max(5, confidence);

      result.set(norm, { name: norm, confidence, reasons });
    }

    return result;
  }

  /**
   * Evaluates all possible import name variants for a package against the active imports list.
   * 
   * @param {string} normalizedPkg - Package name (normalized).
   * @param {Set<string>} normalizedImports - Module names harvested during import scan.
   * @returns {boolean} True if any direct or mapping variants are found.
   */
  public isPackageUsed(
    normalizedPkg: string,
    normalizedImports: Set<string>
  ): boolean {
    const candidates = new Set<string>();

    // 1. Direct name variants
    candidates.add(normalizedPkg);                          // google-generativeai
    candidates.add(normalizedPkg.replace(/-/g, '_'));       // google_generativeai
    candidates.add(normalizedPkg.replace(/-/g, ''));        // googlegenerativeai
    candidates.add(normalizedPkg.replace(/-/g, '.'));       // google.generativeai

    // 2. Map import names → package names using the maps file
    for (const [importName, pkgName] of Object.entries(IMPORT_TO_PACKAGE)) {
      if (normalize(pkgName) === normalizedPkg) {
        candidates.add(importName.toLowerCase());
        const top = importName.split('.')[0].toLowerCase();
        if (top !== importName.toLowerCase()) {
          candidates.add(top);
        }
      }
    }

    // 3. Match dotted namespace prefixes
    const parts = normalizedPkg.split('-');
    if (parts.length >= 2 && NAMESPACE_PREFIXES.has(parts[0])) {
      const dotted = parts.join('.'); // google.generativeai
      candidates.add(dotted);
    }

    for (const candidate of candidates) {
      if (normalizedImports.has(candidate)) {
        return true;
      }
      // Dotted sub-path matching: if imports has "google.generativeai.types", "google.generativeai" matches
      for (const imp of normalizedImports) {
        if (imp === candidate || imp.startsWith(candidate + '.')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if any import partially matches this package name without being an exact match.
   * Helps flag false positive candidates (e.g. imports has "google" but not "google-translate-api" specifically).
   * 
   * @param {string} normalizedPkg - The normalized package name.
   * @param {Set<string>} normalizedImports - Scanned import modules set.
   * @returns {boolean} True if a partial match was detected.
   */
  private hasPartialImportMatch(
    normalizedPkg: string,
    normalizedImports: Set<string>
  ): boolean {
    const underscored = normalizedPkg.replace(/-/g, '_');
    const dotted = normalizedPkg.replace(/-/g, '.');
    const topLevel = normalizedPkg.split('-')[0];

    for (const imp of normalizedImports) {
      if (
        (imp.startsWith(topLevel + '.') && topLevel !== normalizedPkg) ||
        (imp.includes(underscored) && imp !== underscored) ||
        (imp.includes(dotted) && imp !== dotted)
      ) {
        return true;
      }
    }
    return false;
  }
}
