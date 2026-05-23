import { ScannedPackage } from '../../../modules/packageScanner.js';
import { UnusedPackageInfo, UnusedConfidenceContext } from '../../../modules/importScanner.js';
import { VersionCheckResult } from '../../../services/versionChecker.js';
import type { PackageDisplayData, HistoryDisplayEntry } from '../../../ui/webviewPanel.js';
import type { VersionHistoryEntry } from '../../../services/versionHistoryCache.js';
import { getAlternatives } from '../../../data/alternativesMap.js';

const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');

/** Flattened history row shape returned by VersionHistoryCache.getFullHistory() */
type FlatHistoryEntry = { packageName: string } & VersionHistoryEntry;

/**
 * Builds history entries payload from raw cache database models.
 * Separates internal entity definitions from visual timeline layouts.
 * 
 * @param {FlatHistoryEntry[]} allEntries - Flattened history rows from cached storage.
 * @returns {HistoryDisplayEntry[]} Transformed entries for the timeline display.
 */
export function buildHistoryEntries(allEntries: FlatHistoryEntry[]): HistoryDisplayEntry[] {
  return allEntries.map(e => ({
    packageName: e.packageName,
    version: e.version,
    installedAt: e.installedAt,
    source: e.source,
  }));
}

/**
 * Aggregates package scan results and PyPI online checker metrics into a unified payload for UI display.
 * Resolves local directories, group tags, copyleft check results, weekly downloads, and suggests alternatives.
 * 
 * @param {ScannedPackage[]} scanned - Package list fetched locally from requirement files.
 * @param {VersionCheckResult[]} checkResults - Check results queried online from PyPI.
 * @param {Set<string> | Map<string, UnusedPackageInfo>} [unusedPackages] - Scanned unused modules map.
 * @returns {PackageDisplayData[]} The unified layout payload.
 */
export function buildDisplayData(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[],
  unusedPackages?: Set<string> | Map<string, UnusedPackageInfo>
): PackageDisplayData[] {
  const resultMap = new Map(checkResults.map(r => [r.packageName, r]));
  const isEnriched = unusedPackages instanceof Map;
  
  return scanned.map(pkg => {
    const result = resultMap.get(pkg.name);
    const normName = normalize(pkg.name);

    let isUsed = true;
    let unusedConfidence: number | undefined;
    let unusedReasons: string[] | undefined;

    if (unusedPackages) {
      if (isEnriched) {
        const info = (unusedPackages as Map<string, UnusedPackageInfo>).get(normName);
        if (info) {
          isUsed = false;
          unusedConfidence = info.confidence;
          unusedReasons = info.reasons;
        }
      } else {
        isUsed = !(unusedPackages as Set<string>).has(normName);
      }
    }

    return {
      name: pkg.name,
      installedVersion: pkg.installedVersion,
      latestVersion: result?.latestVersion ?? 'unknown',
      status: result?.status ?? 'unknown',
      allVersions: result?.allVersions ?? [],
      summary: result?.summary ?? '',
      homePage: result?.homePage ?? '',
      specifiedVersion: pkg.specifiedVersion,
      source: pkg.source,
      requires: pkg.requires,
      isUsed,
      unusedConfidence,
      unusedReasons,
      vulnerabilities: result?.vulnerabilities ?? [],
      releaseDate: result?.releaseDate ?? '',
      group: pkg.group ?? 'main',
      license: result?.license ?? '',
      pythonRequires: result?.pythonRequires ?? '',
      weeklyDownloads: result?.weeklyDownloads ?? 0,
      environment: pkg.environment,
      hasConflict: pkg.hasConflict ?? false,
      pythonCompatible: result?.pythonCompatible,
      pythonWarning: result?.pythonWarning,
      installSize: result?.installSize,
      alternatives: getAlternatives(pkg.name),
    };
  });
}

/**
 * Builds the context object required by the confidence scoring algorithm.
 * Aggregates requires/downloads/group data from scanned packages and check results.
 * 
 * @param {ScannedPackage[]} scanned - Package list fetched locally from requirement files.
 * @param {VersionCheckResult[]} checkResults - Check results queried online from PyPI.
 * @returns {UnusedConfidenceContext} Consolidated metadata mapping.
 */
export function buildConfidenceContext(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[]
): UnusedConfidenceContext {
  const requiresMap = new Map<string, string[]>();
  const groupMap = new Map<string, string>();
  for (const pkg of scanned) {
    const norm = normalize(pkg.name);
    requiresMap.set(norm, pkg.requires ?? []);
    groupMap.set(norm, pkg.group ?? 'main');
  }

  const downloadsMap = new Map<string, number>();
  for (const r of checkResults) {
    if (r.weeklyDownloads && r.weeklyDownloads > 0) {
      downloadsMap.set(normalize(r.packageName), r.weeklyDownloads);
    }
  }

  return { requiresMap, downloadsMap, groupMap };
}
