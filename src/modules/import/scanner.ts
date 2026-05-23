import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger.js';
import { NAMESPACE_PREFIXES } from './maps.js';

export interface ImportScanResult {
  /** Top-level module names AND dotted sub-names for namespace packages */
  importedModules: Set<string>;
  filesScanned: number;
}

/**
 * FileImportScanner class.
 * Handles the physical scanning of Python files and extraction of import statements.
 */
export class FileImportScanner {
  constructor(private readonly logger: Logger) {}

  /**
   * Scans all Python files in the workspace root and extracts their imports.
   * 
   * @param {string} workspaceRoot - The folder path to search.
   * @returns {Promise<ImportScanResult>} The set of unique imported module names and file count.
   */
  public async scan(workspaceRoot: string): Promise<ImportScanResult> {
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

  /**
   * Walks the directory tree recursively to locate all Python source files.
   * Excludes common virtual environments and cache folders to speed up operations.
   * 
   * @param {string} root - The root folder.
   * @returns {string[]} Absolute paths of all discovered .py files.
   */
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
   * Parses Python source file content and extracts imported module names.
   * Uses regular expressions to match "import" and "from" statements.
   * 
   * @param {string} source - Python file content.
   * @param {Set<string>} out - Target set where module names will be added.
   * @returns {void}
   */
  private extractImports(source: string, out: Set<string>): void {
    // Strip triple-quoted strings and comments to prevent false positives inside documentation
    const cleaned = source
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/'''[\s\S]*?'''/g, "''")
      .replace(/#.*/g, '');

    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim();

      // Match "import X" / "import X as Y" / "import X, Y"
      const importMatch = trimmed.match(/^import\s+(.+)/);
      if (importMatch) {
        for (const part of importMatch[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/i)[0].trim().toLowerCase();
          this.addModuleName(name, out);
        }
        continue;
      }

      // Match "from X import ..." — ignore relative imports (which start with .)
      const fromMatch = trimmed.match(/^from\s+([^\s.][^\s]*)\s+import/);
      if (fromMatch) {
        const name = fromMatch[1].trim().toLowerCase();
        this.addModuleName(name, out);
      }
    }
  }

  /**
   * Adds the import name to the output list, including dotted parents and submodules
   * for namespace package matching.
   * 
   * @param {string} name - The extracted import module name.
   * @param {Set<string>} out - Target set.
   * @returns {void}
   */
  private addModuleName(name: string, out: Set<string>): void {
    const top = name.split('.')[0];
    if (!top || top.startsWith('_')) {
      return;
    }

    out.add(name);       // Full path: google.generativeai
    out.add(top);        // Top-level: google

    // Namespace packages require dotted sub-paths for exact matching
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
