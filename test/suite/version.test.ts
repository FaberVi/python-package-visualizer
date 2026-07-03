import * as assert from 'assert';
import { hasDrift, versionsEquivalent } from '../../src/utils/version.js';

suite('version utils', () => {
  test('versionsEquivalent treats trailing zeros as equal', () => {
    assert.strictEqual(versionsEquivalent('1.0.0', '1.0'), true);
    assert.strictEqual(versionsEquivalent('2.28.0', '2.28'), true);
    assert.strictEqual(versionsEquivalent('1.0.1', '1.0.0'), false);
  });

  test('hasDrift ignores equivalent version forms', () => {
    assert.strictEqual(hasDrift('==1.0.0', '1.0'), false);
    assert.strictEqual(hasDrift('==2.28.0', '2.28'), false);
    assert.strictEqual(hasDrift('==1.0.0', '1.0.1'), true);
  });

  test('hasDrift detects real mismatch', () => {
    assert.strictEqual(hasDrift('==1.2.3', '1.2.4'), true);
  });

  test('hasDrift returns false when no version is pinned', () => {
    assert.strictEqual(hasDrift('', '1.5.0'), false);
    assert.strictEqual(hasDrift('numpy', '1.5.0'), false);
  });
});
