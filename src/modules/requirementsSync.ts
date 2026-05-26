import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

/** Result type for sync operations, distinguishing success/not-found/unsupported */
export type SyncResult =
  | { outcome: 'synced' }
  | { outcome: 'not-found' }
  | { outcome: 'unsupported'; reason: string };

export class RequirementsSync {
  constructor(private readonly logger: Logger) {}

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Remove a package entry from its requirements file entirely.
   * Routes to the correct format-specific handler based on file extension.
   */
  async removePackage(
    workspaceRoot: string,
    packageName: string,
    sourceFile: string
  ): Promise<SyncResult> {
    const filePath = path.join(workspaceRoot, sourceFile);
    this.logger.info(`[sync] removePackage called: pkg="${packageName}", source="${sourceFile}", resolved="${filePath}", exists=${fs.existsSync(filePath)}`);
    if (!fs.existsSync(filePath)) { return { outcome: 'not-found' }; }

    const ext = this.classifyFile(sourceFile);

    if (ext === 'toml') {
      return this.removeFromToml(filePath, packageName);
    }
    if (ext === 'txt') {
      return this.removeFromTxt(filePath, packageName);
    }

    return {
      outcome: 'unsupported',
      reason: this.unsupportedMessage(sourceFile),
    };
  }

  /**
   * After updating/rolling back a package, update its version pin
   * in the requirements file it came from.
   * Routes to the correct format-specific handler based on file extension.
   */
  async syncVersion(
    workspaceRoot: string,
    packageName: string,
    newVersion: string,
    sourceFile: string
  ): Promise<SyncResult> {
    const filePath = path.join(workspaceRoot, sourceFile);
    this.logger.info(`[sync] syncVersion called: pkg="${packageName}", ver="${newVersion}", source="${sourceFile}", resolved="${filePath}", exists=${fs.existsSync(filePath)}`);
    if (!fs.existsSync(filePath)) { return { outcome: 'not-found' }; }

    const ext = this.classifyFile(sourceFile);

    if (ext === 'toml') {
      return this.syncVersionInToml(filePath, packageName, newVersion);
    }
    if (ext === 'txt') {
      return this.syncVersionInTxt(filePath, packageName, newVersion);
    }

    return {
      outcome: 'unsupported',
      reason: this.unsupportedMessage(sourceFile),
    };
  }

  // ── TXT-based sync (requirements.txt, *.in) ────────────────────────────

  /**
   * Removes a package line from a requirements-style text file.
   */
  private removeFromTxt(filePath: string, packageName: string): SyncResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const regex = this.buildNameRegex(packageName);
      const fullRegex = new RegExp(
        `^\\s*(${regex.source}(?:\\[.*?\\])?)\\s*([=!<>~^].*)?\\s*$`,
        'i'
      );

      const filtered = lines.filter(line => {
        const stripped = line.trim();
        if (stripped.startsWith('#') || stripped === '') { return true; }
        return !fullRegex.test(stripped);
      });

      if (filtered.length !== lines.length) {
        // Remove trailing blank lines left by the deletion
        while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
          filtered.pop();
        }
        fs.writeFileSync(filePath, filtered.join('\n') + '\n', 'utf-8');
        this.logger.info(`Removed ${packageName} from ${path.basename(filePath)}`);
        return { outcome: 'synced' };
      }
    } catch (err) {
      this.logger.error(`Failed to remove package from requirements: ${String(err)}`);
    }
    return { outcome: 'not-found' };
  }

  /**
   * Syncs a package version inside a requirements-style text file.
   * Uses the canonical (PEP 503) package name in the rewritten line.
   */
  private syncVersionInTxt(
    filePath: string,
    packageName: string,
    newVersion: string
  ): SyncResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      let changed = false;

      const nameRe = this.buildNameRegex(packageName);
      const versionedRegex = new RegExp(
        `^(${nameRe.source}(?:\\[.*?\\])?)\\s*([=!<>~^]+.*)$`,
        'i'
      );
      const bareRegex = new RegExp(
        `^(${nameRe.source}(?:\\[.*?\\])?)\\s*$`,
        'i'
      );

      this.logger.info(`[sync] syncVersionInTxt: pattern="${versionedRegex.source}", lines=${lines.length}`);
      // Log first few non-comment lines for diagnosis
      const sampleLines = lines.filter(l => l.trim() && !l.trim().startsWith('#')).slice(0, 5);
      this.logger.info(`[sync] file sample: ${JSON.stringify(sampleLines)}`);

      const updatedLines = lines.map(line => {
        const stripped = line.trim();
        if (stripped.startsWith('#') || stripped === '') { return line; }

        const match = stripped.match(versionedRegex);
        if (match) {
          changed = true;
          const extras = match[1].includes('[') ? match[1].slice(match[1].indexOf('[')) : '';
          return `${packageName}${extras}==${newVersion}`;
        }
        // Also match bare package name with no version specifier
        if (stripped.match(bareRegex)) {
          changed = true;
          return `${packageName}==${newVersion}`;
        }
        return line;
      });

      if (changed) {
        fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
        this.logger.info(`Synced ${packageName}==${newVersion} in ${path.basename(filePath)}`);
        return { outcome: 'synced' };
      }
    } catch (err) {
      this.logger.error(`Failed to sync requirements: ${String(err)}`);
    }
    return { outcome: 'not-found' };
  }

  // ── TOML-based sync (pyproject.toml) ────────────────────────────────────

  /**
   * Removes a package dependency string from a pyproject.toml file.
   * Uses regex-based line editing to avoid full TOML reformat.
   */
  private removeFromToml(filePath: string, packageName: string): SyncResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const nameRe = this.buildNameRegex(packageName);
      // WHY no 'g' flag: test() advances lastIndex on global regexes,
      // which would cause the subsequent replace() to miss the match.
      const lineRegex = new RegExp(
        `^(\\s*)(["'])(${nameRe.source}(?:\\[.*?\\])?)\\s*(?:[=!<>~^][^"']*)?\\2\\s*,?\\s*$`,
        'im'
      );

      if (!lineRegex.test(content)) {
        // Try Poetry [tool.poetry.dependencies] table entry: packagename = "^1.0"
        const poetryKeyRegex = new RegExp(
          `^\\s*${nameRe.source}\\s*=`,
          'im'
        );
        if (poetryKeyRegex.test(content)) {
          const updated = content.replace(
            new RegExp(`^\\s*${nameRe.source}\\s*=.*$\\n?`, 'im'),
            ''
          );
          fs.writeFileSync(filePath, updated, 'utf-8');
          this.logger.info(`Removed ${packageName} from ${path.basename(filePath)} (Poetry table)`);
          return { outcome: 'synced' };
        }

        // Strategy 3: Poetry inline table — packagename = {version = "^1.0", optional = true}
        const poetryInlineRegex = new RegExp(
          `^\\s*${nameRe.source}\\s*=\\s*\\{[^}]*\\}\\s*$\\n?`,
          'im'
        );
        if (poetryInlineRegex.test(content)) {
          const updated = content.replace(poetryInlineRegex, '');
          fs.writeFileSync(filePath, updated, 'utf-8');
          this.logger.info(`Removed ${packageName} from ${path.basename(filePath)} (Poetry inline table)`);
          return { outcome: 'synced' };
        }

        return { outcome: 'not-found' };
      }

      const updated = content.replace(lineRegex, '');
      fs.writeFileSync(filePath, updated, 'utf-8');
      this.logger.info(`Removed ${packageName} from ${path.basename(filePath)}`);
      return { outcome: 'synced' };
    } catch (err) {
      this.logger.error(`Failed to remove from TOML: ${String(err)}`);
      return { outcome: 'not-found' };
    }
  }

  /**
   * Syncs a package version inside a pyproject.toml file.
   * Handles two TOML dependency formats:
   *   1. PEP 621 array strings: "packagename>=1.0" → "packagename==2.0"
   *   2. Poetry table entries:   packagename = "^1.0" → packagename = "==2.0"
   */
  private syncVersionInToml(
    filePath: string,
    packageName: string,
    newVersion: string
  ): SyncResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const nameRe = this.buildNameRegex(packageName);
      let updated = content;
      let changed = false;

      // Strategy 1: PEP 621 array element — "packagename>=1.0" or "packagename"
      // Matches lines like:   "requests>=2.0",
      const arrayLineRegex = new RegExp(
        `^(\\s*)(["'])(${nameRe.source})((?:\\[.*?\\])?)\\s*(?:[=!<>~^][^"']*)?\\2`,
        'im'
      );
      const arrayMatch = updated.match(arrayLineRegex);
      if (arrayMatch) {
        const indent = arrayMatch[1];
        const quote = arrayMatch[2];
        const extras = arrayMatch[4] || '';
        const replacement = `${indent}${quote}${packageName}${extras}==${newVersion}${quote}`;
        updated = updated.replace(arrayLineRegex, replacement);
        changed = true;
      }

      // Strategy 2: Poetry table entry — packagename = "^1.0" or packagename = {version = "^1.0", ...}
      if (!changed) {
        const poetrySimpleRegex = new RegExp(
          `^(\\s*)(${nameRe.source})(\\s*=\\s*)(["'])([^"']*?)\\4`,
          'im'
        );
        const poetryMatch = updated.match(poetrySimpleRegex);
        if (poetryMatch) {
          const indent = poetryMatch[1];
          const spacing = poetryMatch[3];
          const quote = poetryMatch[4];
          updated = updated.replace(
            poetrySimpleRegex,
            `${indent}${packageName}${spacing}${quote}==${newVersion}${quote}`
          );
          changed = true;
        }
      }

      // Strategy 3: Poetry inline table — packagename = {version = "^1.0", optional = true}
      if (!changed) {
        const poetryInlineRegex = new RegExp(
          `^(\\s*)(${nameRe.source})(\\s*=\\s*\\{[^}]*version\\s*=\\s*)(["'])([^"']*?)\\4`,
          'im'
        );
        const inlineMatch = updated.match(poetryInlineRegex);
        if (inlineMatch) {
          const indent = inlineMatch[1];
          const preVersion = inlineMatch[3];
          const quote = inlineMatch[4];
          updated = updated.replace(
            poetryInlineRegex,
            `${indent}${packageName}${preVersion}${quote}==${newVersion}${quote}`
          );
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(filePath, updated, 'utf-8');
        this.logger.info(`Synced ${packageName}==${newVersion} in ${path.basename(filePath)}`);
        return { outcome: 'synced' };
      }
    } catch (err) {
      this.logger.error(`Failed to sync TOML: ${String(err)}`);
    }
    return { outcome: 'not-found' };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Builds a regex fragment that matches any delimiter variant of a package name.
   * E.g. "auto-flake" → /auto[-_.]+flake/
   * Ensures names with no delimiters match literally.
   */
  private buildNameRegex(packageName: string): RegExp {
    const pattern = packageName.replace(/[-_.]/g, '[-_.]+');
    return new RegExp(pattern);
  }

  /**
   * Classifies a dependency file into a sync-strategy bucket.
   */
  private classifyFile(sourceFile: string): 'txt' | 'toml' | 'unsupported' {
    const base = path.basename(sourceFile).toLowerCase();
    if (base.endsWith('.txt') || base.endsWith('.in')) { return 'txt'; }
    if (base === 'pyproject.toml') { return 'toml'; }
    return 'unsupported';
  }

  /**
   * Produces a human-friendly message explaining why sync is not supported for this file type.
   */
  private unsupportedMessage(sourceFile: string): string {
    const base = path.basename(sourceFile);
    return `Automatic sync is not supported for ${base}. Please edit the file manually.`;
  }
}
