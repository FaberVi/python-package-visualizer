import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Diagnostic report describing the virtual environment health. */
export interface VenvHealthReport {
  pythonVersion: string;
  pipVersion: string;
  pipUpToDate: boolean;
  pipLatestVersion: string;
  venvType: 'venv' | 'virtualenv' | 'conda' | 'system' | 'unknown';
  venvPath: string;
  isVenvActive: boolean;
  totalInstalled: number;
  duplicatePackages: Array<{ name: string; versions: string[] }>;
  conflictCount: number;
  sitePackagesPath: string;
}

/**
 * Runs shell diagnostics against the active Python environment to produce
 * a health report covering interpreter version, pip status, duplicates, and venv type.
 */
export class VenvHealthChecker {
  constructor(
    private readonly resolvePythonPath: () => string) { }

  /** Executes all diagnostic checks and returns a consolidated report. */
  async checkHealth(cwd: string): Promise<VenvHealthReport> {
    const [
      pythonInfo,
      pipInfo,
      installedPackages,
      conflictCount,
    ] = await Promise.all([
      this.getPythonInfo(cwd),
      this.getPipInfo(cwd),
      this.getInstalledPackages(cwd),
      this.getConflictCount(cwd),
    ]);

    const duplicatePackages = this.findDuplicates(installedPackages);
    const venvInfo = this.detectVenvType(cwd, pythonInfo.sysPrefix, pythonInfo.basePrefix);

    // Check if pip is up-to-date by comparing versions
    const pipUpToDate = pipInfo.latestVersion
      ? pipInfo.version === pipInfo.latestVersion
      : true; // Assume up-to-date if we can't check

    return {
      pythonVersion: pythonInfo.version,
      pipVersion: pipInfo.version,
      pipUpToDate,
      pipLatestVersion: pipInfo.latestVersion,
      venvType: venvInfo.type,
      venvPath: venvInfo.path,
      isVenvActive: venvInfo.isActive,
      totalInstalled: installedPackages.length,
      duplicatePackages,
      conflictCount,
      sitePackagesPath: pipInfo.location,
    };
  }

  private getPythonInfo(cwd: string): Promise<{ version: string; sysPrefix: string; basePrefix: string }> {
    const pythonPath = this.resolvePythonPath();
    const script = 'import sys; print(sys.version.split()[0]); print(sys.prefix); print(getattr(sys, "base_prefix", sys.prefix))';

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-c', script], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve({ version: 'unknown', sysPrefix: '', basePrefix: '' }); }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        const lines = stdout.trim().split('\n').map(l => l.trim());
        resolve({
          version: lines[0] || 'unknown',
          sysPrefix: lines[1] || '',
          basePrefix: lines[2] || '',
        });
      });
      child.on('error', () => { clearTimeout(timer); resolve({ version: 'unknown', sysPrefix: '', basePrefix: '' }); });
    });
  }

  private getPipInfo(cwd: string): Promise<{ version: string; location: string; latestVersion: string }> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', '--version'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve({ version: 'unknown', location: '', latestVersion: '' }); }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        // Output: "pip 23.2.1 from /path/to/site-packages/pip (python 3.11)"
        const match = stdout.match(/^pip\s+(\S+)\s+from\s+(.+?)\s+\(python/i);
        const version = match ? match[1] : 'unknown';
        const location = match ? match[2].trim() : '';

        // Try to get the latest pip version via a lightweight check
        this.getLatestPipVersion(cwd).then(latestVersion => {
          resolve({ version, location, latestVersion });
        }).catch(() => {
          resolve({ version, location, latestVersion: '' });
        });
      });
      child.on('error', () => { clearTimeout(timer); resolve({ version: 'unknown', location: '', latestVersion: '' }); });
    });
  }

  private getLatestPipVersion(cwd: string): Promise<string> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', 'index', 'versions', 'pip'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve(''); }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        // Output: "pip (24.0)\n  Available versions: 24.0, 23.3.2, ..."
        const match = stdout.match(/^pip\s+\((\S+)\)/m);
        resolve(match ? match[1] : '');
      });
      child.on('error', () => { clearTimeout(timer); resolve(''); });
    });
  }

  private getInstalledPackages(cwd: string): Promise<Array<{ name: string; version: string }>> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', 'list', '--format=json'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 15_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(stdout) as Array<{ name: string; version: string }>);
        } catch {
          resolve([]);
        }
      });
      child.on('error', () => { clearTimeout(timer); resolve([]); });
    });
  }

  private getConflictCount(cwd: string): Promise<number> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', 'check'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve(0); }, 15_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        // Each non-empty line of output = one conflict
        const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
        // "No broken requirements found." means 0 conflicts
        if (lines.length === 1 && lines[0].toLowerCase().includes('no broken')) {
          resolve(0);
        } else {
          resolve(lines.length);
        }
      });
      child.on('error', () => { clearTimeout(timer); resolve(0); });
    });
  }

  /** Detects duplicate packages (same normalized name, different versions). */
  private findDuplicates(packages: Array<{ name: string; version: string }>): Array<{ name: string; versions: string[] }> {
    const normalized = new Map<string, string[]>();
    for (const pkg of packages) {
      const norm = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
      const existing = normalized.get(norm);
      if (existing) {
        existing.push(`${pkg.name}==${pkg.version}`);
      } else {
        normalized.set(norm, [`${pkg.name}==${pkg.version}`]);
      }
    }

    const duplicates: Array<{ name: string; versions: string[] }> = [];
    for (const [name, versions] of normalized) {
      if (versions.length > 1) {
        duplicates.push({ name, versions });
      }
    }
    return duplicates;
  }

  /** Determines the venv type and whether it's currently active. */
  private detectVenvType(
    cwd: string,
    sysPrefix: string,
    basePrefix: string
  ): { type: 'venv' | 'virtualenv' | 'conda' | 'system' | 'unknown'; path: string; isActive: boolean } {
    // Check if sys.prefix !== sys.base_prefix → venv is active
    const isActive = sysPrefix !== '' && basePrefix !== '' && sysPrefix !== basePrefix;

    // Detect conda
    if (process.env['CONDA_DEFAULT_ENV'] || process.env['CONDA_PREFIX']) {
      return { type: 'conda', path: process.env['CONDA_PREFIX'] || sysPrefix, isActive: true };
    }

    // Check common venv directories
    const venvDirs = ['.venv', 'venv', 'env', '.env'];
    for (const dir of venvDirs) {
      const venvPath = path.join(cwd, dir);
      if (fs.existsSync(venvPath)) {
        // Check if it has pyvenv.cfg (standard venv) or no_global_site_packages.txt (virtualenv)
        if (fs.existsSync(path.join(venvPath, 'pyvenv.cfg'))) {
          return { type: 'venv', path: venvPath, isActive };
        }
        const libPath = process.platform === 'win32'
          ? path.join(venvPath, 'Lib')
          : path.join(venvPath, 'lib');
        if (fs.existsSync(libPath)) {
          return { type: 'virtualenv', path: venvPath, isActive };
        }
      }
    }

    if (isActive) {
      return { type: 'venv', path: sysPrefix, isActive: true };
    }

    return { type: 'system', path: sysPrefix || 'system', isActive: false };
  }
}
