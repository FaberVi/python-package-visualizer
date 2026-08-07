import * as assert from 'assert';
import {
  getIgnoredUpdates,
  ignorePackageUpdate,
  isUpdateIgnoredForDisplay,
  unignorePackageUpdate,
} from '../../src/services/ignoredUpdates.js';
import { isUpdateSuppressedByIgnore, compareVersions } from '../../src/utils/version.js';
import {
  countActionableUpdates,
  getActionableUpdates,
} from '../../src/commands/handlers/visualizer/scanHelpers.js';
import type { ScannedPackage } from '../../src/modules/packageScanner.js';

suite('ignoredUpdates', () => {
  const workspaceRoot = 'C:/fake/workspace';
  const stubContext = {
    workspaceState: {
      _data: {} as Record<string, unknown>,
      get<T>(key: string): T | undefined {
        return this._data[key] as T | undefined;
      },
      async update(key: string, value: unknown): Promise<void> {
        this._data[key] = value;
      },
    },
  } as unknown as import('vscode').ExtensionContext;

  test('ignore and unignore persist per workspace', async () => {
    await ignorePackageUpdate(stubContext, workspaceRoot, 'Requests', '2.32.0');
    const map = getIgnoredUpdates(stubContext, workspaceRoot);
    assert.strictEqual(map.get('requests'), '2.32.0');

    await unignorePackageUpdate(stubContext, workspaceRoot, 'requests');
    assert.strictEqual(getIgnoredUpdates(stubContext, workspaceRoot).get('requests'), undefined);
  });

  test('isUpdateSuppressedByIgnore respects version ordering', () => {
    assert.strictEqual(isUpdateSuppressedByIgnore('2.0.0', '2.0.0'), true);
    assert.strictEqual(isUpdateSuppressedByIgnore('2.1.0', '2.0.0'), true);
    assert.strictEqual(isUpdateSuppressedByIgnore('2.0.0', '2.1.0'), false);
  });

  test('isUpdateIgnoredForDisplay', () => {
    assert.strictEqual(isUpdateIgnoredForDisplay('2.32.0', '2.32.0'), true);
    assert.strictEqual(isUpdateIgnoredForDisplay('2.32.0', '2.33.0'), false);
    assert.strictEqual(isUpdateIgnoredForDisplay(undefined, '2.32.0'), false);
  });

  test('compareVersions basic ordering', () => {
    assert.ok(compareVersions('1.0.0', '2.0.0') < 0);
    assert.strictEqual(compareVersions('2.32.0', '2.32.0'), 0);
  });

  test('getActionableUpdates excludes ignored releases and PEP 503 names', () => {
    const scanned: ScannedPackage[] = [
      {
        name: 'scikit_learn',
        specifiedVersion: '>=1.0',
        installedVersion: '1.4.0',
        source: 'requirements.txt',
        extras: [],
        requires: [],
        group: 'main',
        environment: 'main',
        hasConflict: false,
      },
    ];
    const checkResults = [
      {
        packageName: 'scikit_learn',
        installedVersion: '1.4.0',
        latestVersion: '1.5.0',
        status: 'update-available' as const,
        allVersions: ['1.5.0'],
        summary: '',
        homePage: '',
        vulnerabilities: [],
      },
    ];
    const ignored = new Map<string, string>([['scikit-learn', '1.5.0']]);
    assert.strictEqual(countActionableUpdates(scanned, checkResults, ignored), 0);
    assert.strictEqual(getActionableUpdates(scanned, checkResults, ignored).length, 0);

    const newerCheck = [{ ...checkResults[0], latestVersion: '1.6.0' }];
    assert.strictEqual(countActionableUpdates(scanned, newerCheck, ignored), 1);
  });
});
