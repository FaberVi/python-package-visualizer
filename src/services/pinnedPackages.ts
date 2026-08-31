/**
 * Persists user-chosen version pins per workspace.
 * The hold on PyPI updates still lives in ignoredUpdates; this store
 * only drives the Pinned tag and unpin metadata.
 */

import type * as vscode from 'vscode';

const STORE_KEY = 'pythonPackageVisualizer.pinnedPackages';

export interface PinnedPackageEntry {
  version: string;
  ignoredLatest: string;
}

/** workspaceRoot → normalized package name → pin entry */
type Store = Record<string, Record<string, PinnedPackageEntry>>;

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function readStore(context: vscode.ExtensionContext): Store {
  return context.workspaceState.get<Store>(STORE_KEY) ?? {};
}

function rootKey(workspaceRoot: string): string {
  return workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Pin entries for this workspace (normalized package name → entry). */
export function getPinnedPackages(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Map<string, PinnedPackageEntry> {
  const entries = readStore(context)[rootKey(workspaceRoot)] ?? {};
  return new Map(Object.entries(entries));
}

export function getPinnedVersion(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): string | undefined {
  return readStore(context)[rootKey(workspaceRoot)]?.[normalize(packageName)]?.version;
}

export async function pinPackage(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string,
  entry: PinnedPackageEntry
): Promise<void> {
  if (!entry.version) {
    return;
  }
  const store = readStore(context);
  const key = rootKey(workspaceRoot);
  const workspaceEntries = { ...(store[key] ?? {}) };
  workspaceEntries[normalize(packageName)] = {
    version: entry.version,
    ignoredLatest: entry.ignoredLatest ?? '',
  };
  store[key] = workspaceEntries;
  await context.workspaceState.update(STORE_KEY, store);
}

export async function unpinPackage(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): Promise<void> {
  const store = readStore(context);
  const key = rootKey(workspaceRoot);
  const workspaceEntries = { ...(store[key] ?? {}) };
  delete workspaceEntries[normalize(packageName)];
  if (Object.keys(workspaceEntries).length === 0) {
    delete store[key];
  } else {
    store[key] = workspaceEntries;
  }
  await context.workspaceState.update(STORE_KEY, store);
}
