import * as assert from 'assert';
import { isUvExecutable, withUvGlobalArgs } from '../../src/utils/uvSpawn.js';

suite('uvSpawn', () => {
  test('isUvExecutable recognizes uv binary names', () => {
    assert.strictEqual(isUvExecutable('uv'), true);
    assert.strictEqual(isUvExecutable('uv.exe'), true);
    assert.strictEqual(isUvExecutable('C:\\Tools\\uv.exe'), true);
    assert.strictEqual(isUvExecutable('python'), false);
    assert.strictEqual(isUvExecutable('python.exe'), false);
  });

  test('withUvGlobalArgs prepends --system-certs once', () => {
    assert.deepStrictEqual(
      withUvGlobalArgs(['pip', 'install', 'black']),
      ['--system-certs', 'pip', 'install', 'black']
    );
    assert.deepStrictEqual(
      withUvGlobalArgs(['--system-certs', 'pip', 'list']),
      ['--system-certs', 'pip', 'list']
    );
  });
});
