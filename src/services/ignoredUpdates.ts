/**
 * Persists PyPI updates the user chose to ignore per workspace.
 * Each entry stores the latest version that was dismissed; a newer PyPI release
 * becomes actionable again.
 */

import type * as vscode from 'vscode';
import { isUpdateSuppressedByIgnore } from '../utils/version.js';

const STORE_KEY = 'pythonPackageVisualizer.ignoredUpdates';

/** workspaceRoot → normalized package name → ignored latest version */
type Store = Record<string, Record<string, string>>;

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function readStore(context: vscode.ExtensionContext): Store {
  return context.workspaceState.get<Store>(STORE_KEY) ?? {};
}

function rootKey(workspaceRoot: string): string {
  return workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Ignored latest versions for this workspace (normalized package name → version). */
export function getIgnoredUpdates(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Map<string, string> {
  const entries = readStore(context)[rootKey(workspaceRoot)] ?? {};
  return new Map(Object.entries(entries));
}

export function getIgnoredUpdateVersion(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): string | undefined {
  return readStore(context)[rootKey(workspaceRoot)]?.[normalize(packageName)];
}

export async function ignorePackageUpdate(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string,
  ignoredLatestVersion: string
): Promise<void> {
  if (!ignoredLatestVersion || ignoredLatestVersion === 'unknown') {
    return;
  }
  const store = readStore(context);
  const key = rootKey(workspaceRoot);
  const workspaceEntries = { ...(store[key] ?? {}) };
  workspaceEntries[normalize(packageName)] = ignoredLatestVersion;
  store[key] = workspaceEntries;
  await context.workspaceState.update(STORE_KEY, store);
}

export async function unignorePackageUpdate(
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

/** Whether a PyPI update should be hidden because the user ignored this latest release. */
export function isUpdateIgnoredForDisplay(
  ignoredVersion: string | undefined,
  latestVersion: string
): boolean {
  return ignoredVersion !== undefined && isUpdateSuppressedByIgnore(ignoredVersion, latestVersion);
}
