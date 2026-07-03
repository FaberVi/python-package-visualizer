/**
 * Shared type definitions for webview panel communication and display payloads.
 * Extracted from webviewPanel.ts to decouple interface declarations from the panel lifecycle class.
 */

import type { VulnerabilityInfo } from '../services/versionChecker.js';
import type { VenvHealthReport } from '../services/venvHealthChecker.js';

export type { VenvHealthReport };

/** A single entry in the version history timeline display. */
export interface HistoryDisplayEntry {
  packageName: string;
  version: string;
  installedAt: string;
  source: 'pip-install' | 'pip-rollback' | 'detected';
}

/** Discriminated union of all messages the webview can send to the extension host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'updatePackage'; name: string }
  | { type: 'forceUpdatePackage'; name: string }
  | { type: 'updateAllPackages'; names: string[] }
  | { type: 'rollbackPackage'; name: string; version: string }
  | { type: 'refresh' }
  | { type: 'openUrl'; url: string }
  | { type: 'installNew'; name: string; version?: string }
  | { type: 'searchPypi'; query: string }
  | { type: 'exportReport'; format: 'markdown' | 'json' }
  | { type: 'removeFromRequirements'; name: string; source: string }
  | { type: 'pinVersion'; name: string; version: string; source: string }
  | { type: 'createRequirements' }
  | { type: 'bulkUpdate'; names: string[] }
  | { type: 'bulkSync'; packages: Array<{ name: string; source: string }> }
  | { type: 'bulkRemove'; names: string[]; sources: string[] }
  | { type: 'takeSnapshot'; name: string }
  | { type: 'restoreSnapshot'; id: string }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'listSnapshots' }
  | { type: 'generateRequirements' }
  | { type: 'migrateToUv' }
  | { type: 'migrateToPoetry' }
  | { type: 'selectManualRequirements' }
  | { type: 'clearManualRequirements' }
  | { type: 'generateSetupScript'; format: 'bash' | 'powershell' | 'markdown' }
  | { type: 'syncRequirementsToInstalled'; name: string; source: string }
  | { type: 'requestVenvHealth' }
  | { type: 'updatePip' }
  | { type: 'cursorAnalyzeUnused'; packageNames?: string[] };

/** Aggregated workspace scan statistics sent alongside package data. */
export interface ScanStats {
  filesScanned: number;
  modulesFound: number;
  workspaceRoot: string;
  totalSize?: number;
  totalDownloads?: number;
  securityScore?: number;
  maintainerActivityScore?: number;
  slowestPackages?: Array<{name: string; time: number}>;
  manualRequirementsPath?: string;
}

/** Shown in the webview when no dependency files are auto-detected. */
export interface DepFilesEmptyState {
  reason: 'not-found' | 'parse-failed';
  failedPath?: string;
}

/** Unified display payload for a single package, combining scan + PyPI data. */
export interface PackageDisplayData {
  name: string;
  installedVersion: string;
  latestVersion: string;
  status: string;
  allVersions: string[];
  summary: string;
  homePage: string;
  specifiedVersion: string;
  source: string;
  requires: string[];
  isUsed: boolean;
  vulnerabilities: VulnerabilityInfo[];
  releaseDate: string;
  group: string;
  license?: string;
  pythonRequires?: string;
  weeklyDownloads?: number;
  installSize?: number;
  environment?: string;
  hasConflict?: boolean;
  /** Previous installed version from local history, when available. */
  previousVersion?: string | null;
  /** True when an update exists on PyPI but is blocked due to dependency conflicts. */
  updateBlockedByConflict?: boolean;
  pythonCompatible?: boolean;
  pythonWarning?: string;
  installTime?: number;
  alternatives?: Array<{ name: string; reason: string; url?: string }>;
  /** Confidence percentage (5–100) that the package is truly unused. Only set when isUsed=false. */
  unusedConfidence?: number;
  /** Machine-readable reason codes explaining confidence deductions */
  unusedReasons?: string[];
  /** Set when config/script reference search found usage outside imports */
  referenceUsageFound?: boolean;
}
