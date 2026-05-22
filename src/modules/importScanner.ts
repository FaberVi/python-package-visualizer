import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface ImportScanResult {
  /** Top-level module names AND dotted sub-names for namespace packages */
  importedModules: Set<string>;
  filesScanned: number;
}

import {
  NAMESPACE_PREFIXES,
  STDLIB_MODULES,
  IMPORT_TO_PACKAGE,
  NEVER_IMPORTED_PACKAGES
} from './import/maps.js';

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

export class ImportScanner {
  constructor(private readonly logger: Logger) {}

  /** Map a Python import module name to its pip package name. Returns null if it's a standard library module. */
  public mapToPackageName(moduleName: string): string | null {
    const lower = moduleName.toLowerCase();
    // Standard library check
    if (STDLIB_MODULES.has(lower.split('.')[0])) { return null; }
    // Direct mapping
    if (IMPORT_TO_PACKAGE[lower]) { return IMPORT_TO_PACKAGE[lower]; }
    // 2-level for namespace packages
    const parts = lower.split('.');
    if (parts.length >= 2) {
      const twoLevel = parts.slice(0, 2).join('.');
      if (IMPORT_TO_PACKAGE[twoLevel]) { return IMPORT_TO_PACKAGE[twoLevel]; }
    }
    // Top-level fallback
    const top = parts[0];
    if (IMPORT_TO_PACKAGE[top]) { return IMPORT_TO_PACKAGE[top]; }
    // Default: assume top-level matches package name
    return top;
  }

  async scanImports(workspaceRoot: string): Promise<ImportScanResult> {
    this.logger.info(`Scanning imports in: ${workspaceRoot}`);
    const pyFiles = this.findPyFiles(workspaceRoot);
    this.logger.info(`Found ${pyFiles.length} Python files to scan`);

    const importedModules = new Set<string>();

    for (const file of pyFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        this.extractImports(content, importedModules);
      } catch (err) {
        this.logger.warn(`Could not read ${file}: ${String(err)}`);
      }
    }

    this.logger.info(
      `Import scan complete: ${importedModules.size} unique modules found`
    );
    return { importedModules, filesScanned: pyFiles.length };
  }

  getUnusedPackages(
    declaredPackages: string[],
    importedModules: Set<string>
  ): Set<string> {
    // Normalize all imported modules for comparison
    const normalizedImports = new Set(
      [...importedModules].map(m => m.toLowerCase())
    );

    const unused = new Set<string>();

    for (const pkg of declaredPackages) {
      const norm = normalize(pkg);

      // These packages are never imported directly — skip them
      if (NEVER_IMPORTED_PACKAGES.has(norm)) {
        continue;
      }

      if (this.isPackageUsed(norm, normalizedImports)) {
        continue;
      }

      unused.add(norm);
    }

    return unused;
  }

  private isPackageUsed(
    normalizedPkg: string,
    normalizedImports: Set<string>
  ): boolean {
    // Candidates: all the ways this package might appear in import statements
    const candidates = new Set<string>();

    // 1. Direct name variants
    candidates.add(normalizedPkg);                          // google-generativeai
    candidates.add(normalizedPkg.replace(/-/g, '_'));       // google_generativeai
    candidates.add(normalizedPkg.replace(/-/g, ''));        // googlegenerativeai
    candidates.add(normalizedPkg.replace(/-/g, '.'));       // google.generativeai

    // 2. Check the IMPORT_TO_PACKAGE reverse map: any import name → this pkg?
    for (const [importName, pkgName] of Object.entries(IMPORT_TO_PACKAGE)) {
      if (normalize(pkgName) === normalizedPkg) {
        candidates.add(importName.toLowerCase());
        // Also add dotted parent (e.g. "google.generativeai" → "google")
        const top = importName.split('.')[0].toLowerCase();
        if (top !== importName.toLowerCase()) {
          candidates.add(top);
        }
      }
    }

    // 3. For packages like "google-generativeai", also try top-level "google"
    //    only if the full dotted name IS in imports (prevents false positives)
    const parts = normalizedPkg.split('-');
    if (parts.length >= 2 && NAMESPACE_PREFIXES.has(parts[0])) {
      // e.g. google-generativeai → look for "google.generativeai" in imports
      const dotted = parts.join('.'); // google.generativeai
      candidates.add(dotted);
    }

    for (const candidate of candidates) {
      if (normalizedImports.has(candidate)) {
        return true;
      }
      // Partial prefix match for dotted names
      // e.g. imports has "google.generativeai.types" → candidate "google.generativeai" matches
      for (const imp of normalizedImports) {
        if (imp === candidate || imp.startsWith(candidate + '.')) {
          return true;
        }
      }
    }

    return false;
  }

  private findPyFiles(root: string): string[] {
    const results: string[] = [];
    const SKIP_DIRS = new Set([
      'node_modules', '.git', '__pycache__', '.venv', 'venv',
      'env', '.env', 'dist', 'build', 'site-packages', '.tox',
      '.mypy_cache', '.pytest_cache', '.eggs',
    ]);

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            walk(path.join(dir, entry.name));
          }
        } else if (entry.isFile() && entry.name.endsWith('.py')) {
          results.push(path.join(dir, entry.name));
        }
      }
    };

    walk(root);
    return results;
  }

  /**
   * Extract module names from Python import statements.
   * For namespace packages (google.*, azure.*), records BOTH the
   * top-level name AND the 2-level dotted path.
   */
  private extractImports(source: string, out: Set<string>): void {
    // Strip triple-quoted strings and comments to avoid false positives
    const cleaned = source
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/'''[\s\S]*?'''/g, "''")
      .replace(/#.*/g, '');

    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim();

      // "import X" / "import X as Y" / "import X, Y"
      const importMatch = trimmed.match(/^import\s+(.+)/);
      if (importMatch) {
        for (const part of importMatch[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/i)[0].trim().toLowerCase();
          this.addModuleName(name, out);
        }
        continue;
      }

      // "from X import ..." — skip relative imports (start with .)
      const fromMatch = trimmed.match(/^from\s+([^\s.][^\s]*)\s+import/);
      if (fromMatch) {
        const name = fromMatch[1].trim().toLowerCase();
        this.addModuleName(name, out);
      }
    }
  }

  /**
   * Add a module name to the set, and for namespace packages also add
   * the 2-level dotted name so we can match e.g. google-generativeai.
   */
  private addModuleName(name: string, out: Set<string>): void {
    const top = name.split('.')[0];
    if (!top || top.startsWith('_')) {
      return;
    }

    out.add(name);       // full path: google.generativeai
    out.add(top);        // top-level: google

    // For namespace packages, also add 2-level path
    if (NAMESPACE_PREFIXES.has(top) && name.includes('.')) {
      const parts = name.split('.');
      if (parts.length >= 2) {
        out.add(`${parts[0]}.${parts[1]}`); // google.generativeai
      }
      if (parts.length >= 3) {
        out.add(`${parts[0]}.${parts[1]}.${parts[2]}`); // google.cloud.storage
      }
    }
  }
}
