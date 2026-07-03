import { NEVER_IMPORTED_PACKAGES } from './maps.js';
import { normalizeName } from './normalize.js';
import {
  buildUsedPackageSet,
  isPackageUsed,
} from './packageMatcher.js';

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

/** Packages below this threshold are not reported as unused (likely false positives). */
export const UNUSED_REPORT_THRESHOLD = 50;

/**
 * Computes unused packages with multi-signal confidence scoring.
 */
export class UnusedConfidenceAnalyzer {
  analyze(
    declaredPackages: string[],
    importedModules: Set<string>,
    context?: UnusedConfidenceContext
  ): Map<string, UnusedPackageInfo> {
    const normalizedImports = new Set(
      [...importedModules].map(m => m.toLowerCase())
    );
    const usedPackages = buildUsedPackageSet(normalizedImports);
    const result = new Map<string, UnusedPackageInfo>();

    const requiredBy = this.buildRequiredByIndex(context?.requiresMap);

    for (const pkg of declaredPackages) {
      const norm = normalizeName(pkg);

      if (NEVER_IMPORTED_PACKAGES.has(norm)) {
        continue;
      }

      if (isPackageUsed(norm, normalizedImports)) {
        continue;
      }

      if (this.isTransitiveOfUsedPackage(norm, requiredBy, usedPackages)) {
        continue;
      }

      const { confidence, reasons } = this.scoreUnusedConfidence(norm, context, requiredBy);

      if (confidence < UNUSED_REPORT_THRESHOLD) {
        continue;
      }

      result.set(norm, { name: norm, confidence, reasons });
    }

    return result;
  }

  private buildRequiredByIndex(
    requiresMap?: Map<string, string[]>
  ): Map<string, string[]> {
    const requiredBy = new Map<string, string[]>();
    if (!requiresMap) {
      return requiredBy;
    }

    for (const [parentPkg, deps] of requiresMap) {
      for (const dep of deps) {
        const normDep = normalizeName(dep);
        const list = requiredBy.get(normDep) ?? [];
        list.push(parentPkg);
        requiredBy.set(normDep, list);
      }
    }
    return requiredBy;
  }

  /** Skip deps that are only pulled in by packages already marked as used. */
  private isTransitiveOfUsedPackage(
    normalizedPkg: string,
    requiredBy: Map<string, string[]>,
    usedPackages: Set<string>
  ): boolean {
    const parents = requiredBy.get(normalizedPkg);
    if (!parents?.length) {
      return false;
    }
    return parents.every(parent => usedPackages.has(normalizeName(parent)));
  }

  private scoreUnusedConfidence(
    norm: string,
    context: UnusedConfidenceContext | undefined,
    requiredBy: Map<string, string[]>
  ): { confidence: number; reasons: string[] } {
    let confidence = 100;
    const reasons: string[] = [];

    const parents = requiredBy.get(norm);
    if (parents?.length) {
      confidence -= 40;
      reasons.push(`required-by:${parents.slice(0, 3).join(',')}`);
    }

    const group = context?.groupMap?.get(norm);
    if (group && group !== 'main') {
      confidence -= 15;
      reasons.push(`group:${group}`);
    }

    const downloads = context?.downloadsMap?.get(norm) ?? 0;
    if (downloads > 1_000_000) {
      confidence -= 5;
      reasons.push('high-downloads');
    }

    return { confidence: Math.max(5, confidence), reasons };
  }
}
