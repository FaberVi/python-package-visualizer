import * as assert from 'assert';
import { withUvGlobalArgs } from '../../src/utils/uvSpawn.js';

suite('packageInstaller spawn helpers', () => {
  test('uv uninstall args include batch packages and -y', () => {
    assert.deepStrictEqual(
      withUvGlobalArgs(['pip', 'uninstall', 'requests', 'numpy', '-y']),
      ['--system-certs', 'pip', 'uninstall', 'requests', 'numpy', '-y']
    );
  });

  test('uv pip upgrade args use install --upgrade pip shape', () => {
    assert.deepStrictEqual(
      withUvGlobalArgs(['pip', 'install', '--upgrade', 'pip']),
      ['--system-certs', 'pip', 'install', '--upgrade', 'pip']
    );
  });
});
