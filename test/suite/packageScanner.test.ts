import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PackageScanner, sanitizeRequiresList } from '../../src/modules/packageScanner.js';

// Minimal logger stub
const stubLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
} as unknown as import('../../src/utils/logger.js').Logger;

suite('PackageScanner', () => {
  let tmpDir: string;
  let scanner: PackageScanner;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-test-'));
    scanner = new PackageScanner(stubLogger);
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── requirements.txt ───────────────────────────────────────────────────

  test('parses basic requirements.txt', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      [
        '# comment line',
        'requests>=2.0',
        'Flask==2.3.0',
        'numpy',
        '',
        '# another comment',
        'scipy>=1.0,<2.0',
      ].join('\n')
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
      specifiedVersion: string;
    }>;

    assert.strictEqual(pkgs.length, 4);
    assert.strictEqual(pkgs[0].name, 'requests');
    assert.strictEqual(pkgs[0].specifiedVersion, '>=2.0');
    assert.strictEqual(pkgs[1].name, 'flask');
    assert.strictEqual(pkgs[1].specifiedVersion, '==2.3.0');
    assert.strictEqual(pkgs[2].name, 'numpy');
    assert.strictEqual(pkgs[2].specifiedVersion, '');
    assert.strictEqual(pkgs[3].name, 'scipy');
  });

  test('follows -r includes when the referenced file exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'base.txt'), 'numpy\n');
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      [
        '-r base.txt',
        '-e .',
        '--index-url https://pypi.org',
        'requests',
      ].join('\n')
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string, g?: string, r?: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt'), undefined, tmpDir) as Array<{
      name: string;
    }>;

    assert.strictEqual(pkgs.length, 2);
    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'numpy'));
  });

  test('handles line continuations', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      'requests\\\n  >=2.28\n'
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
      specifiedVersion: string;
    }>;

    assert.strictEqual(pkgs.length, 1);
    assert.strictEqual(pkgs[0].name, 'requests');
    assert.ok(pkgs[0].specifiedVersion.includes('>=2.28'));
  });

  test('parses extras in requirements.txt', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      'requests[security,socks]>=2.0\n'
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
      extras: string[];
    }>;

    assert.strictEqual(pkgs[0].name, 'requests');
    assert.deepStrictEqual(pkgs[0].extras, ['security', 'socks']);
  });

  // ── pyproject.toml ────────────────────────────────────────────────────

  test('parses PEP 621 pyproject.toml', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `[project]\nname = "myapp"\ndependencies = [\n  "requests>=2.28",\n  "flask==2.3.0",\n]\n`
    );

    const pkgs = (scanner as unknown as {
      parsePyprojectToml: (f: string) => unknown[];
    }).parsePyprojectToml(path.join(tmpDir, 'pyproject.toml')) as Array<{
      name: string;
      specifiedVersion: string;
    }>;

    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'flask'));
  });

  test('parses Poetry pyproject.toml', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `[tool.poetry.dependencies]\npython = "^3.11"\nrequests = "^2.28"\nflask = { version = "^2.3", extras = ["async"] }\n`
    );

    const pkgs = (scanner as unknown as {
      parsePyprojectToml: (f: string) => unknown[];
    }).parsePyprojectToml(path.join(tmpDir, 'pyproject.toml')) as Array<{
      name: string;
    }>;

    // python entry must be excluded
    assert.ok(!pkgs.some(p => p.name === 'python'));
    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'flask'));
  });

  // ── setup.py ──────────────────────────────────────────────────────────

  test('parses install_requires in setup.py', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'setup.py'),
      `from setuptools import setup\nsetup(\n    name="myapp",\n    install_requires=[\n        "requests>=2.0",\n        "numpy",\n    ],\n)\n`
    );

    const pkgs = (scanner as unknown as {
      parseSetupPy: (f: string) => unknown[];
    }).parseSetupPy(path.join(tmpDir, 'setup.py')) as Array<{ name: string }>;

    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'numpy'));
  });

  // ── normalizeName ─────────────────────────────────────────────────────

  test('isPythonInWorkspaceVenv detects python inside workspace .venv', () => {
    const venvPython = path.join(tmpDir, '.venv', 'Scripts', 'python.exe');
    fs.mkdirSync(path.dirname(venvPython), { recursive: true });
    fs.writeFileSync(venvPython, '');

    assert.strictEqual(scanner.isPythonInWorkspaceVenv(venvPython, tmpDir), true);
  });

  test('expandConfigPath resolves ${workspaceFolder} for pythonPath override', () => {
    const expand = (scanner as unknown as {
      expandConfigPath: (configPath: string, root?: string) => string;
    }).expandConfigPath;

    const expanded = expand('${workspaceFolder}/.venv/Scripts/python.exe', tmpDir);
    assert.strictEqual(
      expanded,
      path.join(tmpDir, '.venv', 'Scripts', 'python.exe')
    );
    assert.strictEqual(scanner.isPythonInWorkspaceVenv(expanded, tmpDir), true);
  });

  test('isPythonInWorkspaceVenv rejects unexpanded ${workspaceFolder} paths', () => {
    const venvPython = path.join(tmpDir, '.venv', 'Scripts', 'python.exe');
    fs.mkdirSync(path.dirname(venvPython), { recursive: true });
    fs.writeFileSync(venvPython, '');

    assert.strictEqual(
      scanner.isPythonInWorkspaceVenv('${workspaceFolder}/.venv/Scripts/python.exe', tmpDir),
      false
    );
  });

  test('normalizes package names (PEP 503)', () => {
    assert.strictEqual(scanner.normalizeName('Requests'), 'requests');
    assert.strictEqual(scanner.normalizeName('my_package'), 'my-package');
    assert.strictEqual(scanner.normalizeName('My.Package'), 'my-package');
    assert.strictEqual(scanner.normalizeName('MY--PACKAGE'), 'my-package');
  });

  test('parsePipShowOutput splits pip show blocks and normalizes requires', () => {
    const stdout = [
      'Name: Flask',
      'Version: 3.0.0',
      'Requires: Werkzeug, Jinja2, click',
      '---',
      'Name: scikit-learn',
      'Version: 1.4.0',
      'Requires: numpy, scipy, joblib',
      '---',
      'Name: empty-reqs',
      'Version: 1.0.0',
      'Requires:',
    ].join('\n');

    const map = scanner.parsePipShowOutput(stdout);

    assert.strictEqual(map.size, 3);
    assert.deepStrictEqual(map.get('flask')?.requires, ['werkzeug', 'jinja2', 'click']);
    assert.deepStrictEqual(map.get('scikit-learn')?.requires, ['numpy', 'scipy', 'joblib']);
    assert.deepStrictEqual(map.get('empty-reqs')?.requires, []);
  });

  test('parsePipShowOutput ignores Required-by reverse dependency metadata', () => {
    const stdout = [
      'Name: psycopg2-binary',
      'Version: 2.9.12',
      'Requires:',
      'Required-by: django, flask',
      '---',
      'Name: pyjwt',
      'Version: 2.13.0',
      'Requires:',
      'Required-by: flask',
    ].join('\n');

    const map = scanner.parsePipShowOutput(stdout);

    assert.deepStrictEqual(map.get('psycopg2-binary')?.requires, []);
    assert.deepStrictEqual(map.get('pyjwt')?.requires, []);
  });

  test('parsePipShowOutput rejects Required-by accidentally merged on Requires line', () => {
    const stdout = [
      'Name: broken',
      'Requires: Required-by: django',
      '---',
      'Name: mixed',
      'Requires: foo, Required-by: bar',
    ].join('\n');

    const map = scanner.parsePipShowOutput(stdout);

    assert.deepStrictEqual(map.get('broken')?.requires, []);
    assert.deepStrictEqual(map.get('mixed')?.requires, ['foo']);
  });

  test('sanitizeRequiresList strips required-by metadata tokens', () => {
    assert.deepStrictEqual(
      sanitizeRequiresList(['requests', 'required-by:', 'Required-by: django', 'flask']),
      ['requests', 'flask']
    );
    assert.deepStrictEqual(sanitizeRequiresList(['required-by: mcp']), []);
    assert.deepStrictEqual(sanitizeRequiresList(['Required-by: ']), []);
  });

  test('parsePipShowOutput handles Windows pip show with empty Requires and Required-by', () => {
    const stdout = [
      'Name: isort',
      'Version: 8.0.1',
      'Requires: ',
      'Required-by: ',
      '---',
      'Name: pyjwt',
      'Version: 2.13.0',
      'Requires: ',
      'Required-by: mcp',
    ].join('\r\n');

    const map = scanner.parsePipShowOutput(stdout);

    assert.deepStrictEqual(map.get('isort')?.requires, []);
    assert.deepStrictEqual(map.get('pyjwt')?.requires, []);
  });
});
