import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import { discoverDepFiles } from './depFileDiscovery.js';
import {
  readDependencyFileContent,
  writeDependencyFileContent,
} from './parsers/utils.js';

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

  /**
   * Syncs a package version, falling back to other dependency files when the
   * primary source does not contain a matching line (e.g. -r includes, monorepo paths).
   */
  async syncVersionWithFallback(
    workspaceRoot: string,
    packageName: string,
    newVersion: string,
    primarySource: string
  ): Promise<SyncResult> {
    const primary = await this.syncVersion(workspaceRoot, packageName, newVersion, primarySource);
    if (primary.outcome === 'synced') {
      return primary;
    }

    const tried = new Set<string>([
      path.normalize(primarySource).replace(/\\/g, '/'),
    ]);

    const candidates = discoverDepFiles(workspaceRoot);
    for (const absFile of candidates) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.syncVersion(workspaceRoot, packageName, newVersion, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback synced ${packageName} in ${rel}`);
        return result;
      }
    }

    for (const absFile of this.findIncludedRequirementFiles(workspaceRoot)) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.syncVersion(workspaceRoot, packageName, newVersion, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback synced ${packageName} in included file ${rel}`);
        return result;
      }
    }

    return primary;
  }

  /**
   * Removes a package entry, falling back to other dependency files when the
   * primary source does not contain a matching line (e.g. -r includes, monorepo paths).
   */
  async removePackageWithFallback(
    workspaceRoot: string,
    packageName: string,
    primarySource: string
  ): Promise<SyncResult> {
    const primary = await this.removePackage(workspaceRoot, packageName, primarySource);
    if (primary.outcome === 'synced') {
      return primary;
    }

    const tried = new Set<string>([
      path.normalize(primarySource).replace(/\\/g, '/'),
    ]);

    const candidates = discoverDepFiles(workspaceRoot);
    for (const absFile of candidates) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.removePackage(workspaceRoot, packageName, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback removed ${packageName} from ${rel}`);
        return result;
      }
    }

    for (const absFile of this.findIncludedRequirementFiles(workspaceRoot)) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.removePackage(workspaceRoot, packageName, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback removed ${packageName} from included file ${rel}`);
        return result;
      }
    }

    return primary;
  }

  // ── TXT-based sync (requirements.txt, *.in) ────────────────────────────

  /**
   * Removes a package line from a requirements-style text file.
   */
  private removeFromTxt(filePath: string, packageName: string): SyncResult {
    try {
      const { content, encoding } = readDependencyFileContent(filePath);
      const lines = this.splitRequirementLines(content);
      const fullRegex = this.buildRequirementLineRegex(packageName);

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
        writeDependencyFileContent(filePath, filtered.join('\n') + '\n', encoding);
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
      const { content, encoding } = readDependencyFileContent(filePath);
      const lines = this.splitRequirementLines(content);
      let changed = false;

      this.logger.info(`[sync] syncVersionInTxt: pkg="${packageName}", lines=${lines.length}`);
      const sampleLines = lines.filter(l => l.trim() && !l.trim().startsWith('#')).slice(0, 5);
      this.logger.info(`[sync] file sample: ${JSON.stringify(sampleLines)}`);

      const updatedLines = lines.map(line => {
        const stripped = line.trim();
        if (stripped.startsWith('#') || stripped === '') { return line; }

        const rewritten = this.rewriteTxtRequirementVersion(stripped, packageName, newVersion);
        if (rewritten !== null) {
          changed = true;
          return rewritten;
        }
        return line;
      });

      if (changed) {
        writeDependencyFileContent(filePath, updatedLines.join('\n'), encoding);
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
   * Matches a requirements line that declares the given package, including
   * PEP 508 direct references (`name @ git+...`) and bare names.
   */
  private buildRequirementLineRegex(packageName: string): RegExp {
    const nameRe = this.buildNameRegex(packageName);
    return new RegExp(
      `^\\s*(${nameRe.source}(?:\\[.*?\\])?)\\s*(?:[@=!<>~^]|$)`,
      'i'
    );
  }

  /**
   * Joins PEP 508 line continuations before matching, mirroring requirementsParser.
   */
  private splitRequirementLines(content: string): string[] {
    const normalized = content.replace(/\\\r?\n\s*/g, ' ');
    return normalized.split('\n');
  }

  /**
   * Rewrites a single requirements line to pin the installed version,
   * preserving environment markers and pip hash options.
   */
  private rewriteTxtRequirementVersion(
    stripped: string,
    packageName: string,
    newVersion: string
  ): string | null {
    const nameRe = this.buildNameRegex(packageName);

    const directRef = new RegExp(
      `^(${nameRe.source}(?:\\[.*?\\])?)\\s*@\\s*.+$`,
      'i'
    );
    const directMatch = stripped.match(directRef);
    if (directMatch) {
      const extras = directMatch[1].includes('[')
        ? directMatch[1].slice(directMatch[1].indexOf('['))
        : '';
      return `${packageName}${extras}==${newVersion}`;
    }

    const versionedRegex = new RegExp(
      `^(${nameRe.source}(?:\\[.*?\\])?)\\s*([=!<>~^][^\\s;]*)(.*)$`,
      'i'
    );
    const versionedMatch = stripped.match(versionedRegex);
    if (versionedMatch) {
      const extras = versionedMatch[1].includes('[')
        ? versionedMatch[1].slice(versionedMatch[1].indexOf('['))
        : '';
      const tail = versionedMatch[3] ?? '';
      return `${packageName}${extras}==${newVersion}${tail}`;
    }

    const bareRegex = new RegExp(
      `^(${nameRe.source}(?:\\[.*?\\])?)\\s*(;.*)?$`,
      'i'
    );
    const bareMatch = stripped.match(bareRegex);
    if (bareMatch) {
      const extras = bareMatch[1].includes('[')
        ? bareMatch[1].slice(bareMatch[1].indexOf('['))
        : '';
      const marker = bareMatch[2] ?? '';
      return `${packageName}${extras}==${newVersion}${marker}`;
    }

    return null;
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

  /**
   * Collects requirements.txt / .in files referenced via -r that may be skipped by discovery pruning.
   */
  private findIncludedRequirementFiles(workspaceRoot: string): string[] {
    const found = new Set<string>();

    const scanIncludes = (filePath: string, visited: Set<string>): void => {
      const resolved = path.resolve(filePath);
      if (visited.has(resolved) || !fs.existsSync(resolved)) {
        return;
      }
      visited.add(resolved);

      let content: string;
      try {
        content = readDependencyFileContent(resolved).content;
      } catch {
        return;
      }

      for (const rawLine of content.split('\n')) {
        const line = rawLine.split('#')[0].trim();
        const match = line.match(/^(?:-r|--requirement)\s+(.+)$/);
        if (!match) {
          continue;
        }
        const includeRef = match[1].trim().replace(/^['"]|['"]$/g, '');
        const included = path.resolve(path.dirname(resolved), includeRef);
        if (fs.existsSync(included)) {
          found.add(included);
          scanIncludes(included, visited);
        }
      }
    };

    for (const absFile of discoverDepFiles(workspaceRoot)) {
      scanIncludes(absFile, new Set());
    }

    return [...found];
  }
}
