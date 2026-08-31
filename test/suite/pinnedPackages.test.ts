import * as assert from 'assert';
import {
  getPinnedPackages,
  getPinnedVersion,
  pinPackage,
  unpinPackage,
} from '../../src/services/pinnedPackages.js';

suite('pinnedPackages', () => {
  const workspaceRoot = 'C:/fake/workspace';
  const otherRoot = 'C:/other/workspace';

  function makeContext(): import('vscode').ExtensionContext {
    return {
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
  }

  test('pin and unpin persist per workspace with PEP 503 names', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'Requests', { version: '2.31.0', ignoredLatest: '2.32.0' });

    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'requests'), '2.31.0');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests')?.ignoredLatest, '2.32.0');
    assert.strictEqual(getPinnedVersion(ctx, otherRoot, 'requests'), undefined);

    await unpinPackage(ctx, workspaceRoot, 'requests');
    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'requests'), undefined);
  });

  test('pin overwrites previous entry for the same package', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'flask', { version: '2.0.0', ignoredLatest: '3.0.0' });
    await pinPackage(ctx, workspaceRoot, 'Flask', { version: '2.3.0', ignoredLatest: '3.1.0' });

    const entry = getPinnedPackages(ctx, workspaceRoot).get('flask');
    assert.strictEqual(entry?.version, '2.3.0');
    assert.strictEqual(entry?.ignoredLatest, '3.1.0');
  });

  test('PEP 503 treats underscores and dots as the same package', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'Foo_Bar', { version: '1.0.0', ignoredLatest: '1.1.0' });
    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'foo-bar'), '1.0.0');
    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'foo.bar'), '1.0.0');
  });

  test('unpin of missing package is a no-op', async () => {
    const ctx = makeContext();
    await unpinPackage(ctx, workspaceRoot, 'numpy');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).size, 0);
  });
});
