import * as assert from 'assert';
import { VersionChecker } from '../../src/services/versionChecker.js';

const stubLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
} as unknown as import('../../src/utils/logger.js').Logger;

const stubContext = {} as unknown as import('vscode').ExtensionContext;

suite('VersionChecker', () => {
  let checker: VersionChecker;

  setup(() => {
    checker = new VersionChecker(stubLogger, stubContext);
    checker.clearCache();
  });

  // ── compareVersions ───────────────────────────────────────────────────

  test('compareVersions: equal versions', () => {
    assert.strictEqual(checker.compareVersions('1.2.3', '1.2.3'), 0);
  });

  test('compareVersions: a < b', () => {
    assert.ok(checker.compareVersions('1.2.3', '1.2.4') < 0);
    assert.ok(checker.compareVersions('1.0.0', '2.0.0') < 0);
  });

  test('compareVersions: a > b', () => {
    assert.ok(checker.compareVersions('2.0.0', '1.9.9') > 0);
  });

  test('compareVersions: different lengths', () => {
    assert.ok(checker.compareVersions('1.0', '1.0.1') < 0);
    assert.ok(checker.compareVersions('1.0.1', '1.0') > 0);
  });

  test('compareVersions: strips non-numeric chars', () => {
    // e.g. pre-release tags are stripped → compared numerically only
    assert.strictEqual(checker.compareVersions('1.2.3', '1.2.3'), 0);
  });

  test('computeStatus: detects update-available and not-installed', () => {
    const computeStatus = (checker as unknown as {
      computeStatus: (installed: string, latest: string) => string;
    }).computeStatus.bind(checker);

    assert.strictEqual(computeStatus('', '2.0.0'), 'not-installed');
    assert.strictEqual(computeStatus('2.0.0', '2.0.0'), 'up-to-date');
    assert.strictEqual(computeStatus('1.0.0', '2.0.0'), 'update-available');
    assert.strictEqual(computeStatus('2.1.0', '2.0.0'), 'up-to-date');
  });

  test('checkPythonCompatibility validates requirement constraints', () => {
    const checkPythonCompatibility = (checker as unknown as {
      checkPythonCompatibility: (requires: string, current: string) => boolean;
    }).checkPythonCompatibility;

    assert.strictEqual(checkPythonCompatibility('>=3.8', '3.11'), true);
    assert.strictEqual(checkPythonCompatibility('>=3.12', '3.11'), false);
    assert.strictEqual(checkPythonCompatibility('>=3.8,<4.0', '3.11'), true);
    assert.strictEqual(checkPythonCompatibility('>=3.8,<3.11', '3.11'), false);
    assert.strictEqual(checkPythonCompatibility('!=3.11', '3.11'), false);
  });
});
