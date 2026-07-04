import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Logger } from '../../utils/logger.js';

const VENV_DIRS = ['.venv', 'venv', 'env', '.env'];
const SEARCH_SUBDIRS = ['', 'backend', 'api', 'server', 'python'];

function normalizePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function expandConfigPath(configPath: string, root?: string): string {
  const workspaceFolder = root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const workspaceFolderBasename = root
    ? path.basename(root)
    : (vscode.workspace.workspaceFolders?.[0]?.name ?? path.basename(workspaceFolder));

  return path.normalize(
    configPath
      .replace(/\$\{workspaceFolder\}/g, workspaceFolder)
      .replace(/\$\{workspaceFolderBasename\}/g, workspaceFolderBasename)
      .replace(/\$\{userHome\}/g, os.homedir())
      .replace(/\$\{env:([^}]+)\}/g, (_, name: string) => process.env[name] ?? '')
  );
}

export function resolveForWorkspace(root: string): string | null {
  const isWindows = process.platform === 'win32';

  for (const sub of SEARCH_SUBDIRS) {
    const searchRoot = sub ? path.join(root, sub) : root;
    if (!fs.existsSync(searchRoot)) {
      continue;
    }
    for (const venvDir of VENV_DIRS) {
      const pythonPath = isWindows
        ? path.join(searchRoot, venvDir, 'Scripts', 'python.exe')
        : path.join(searchRoot, venvDir, 'bin', 'python');

      if (fs.existsSync(pythonPath)) {
        return pythonPath;
      }
    }
  }

  return null;
}

export function resolvePythonPath(logger: Logger): string {
  const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
  const override = config.get<string>('pythonPath', '');
  if (override) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return expandConfigPath(override, root);
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const root = workspaceFolders[0].uri.fsPath;
    const venvPython = resolveForWorkspace(root);
    if (venvPython) {
      logger.debug(`Using venv Python: ${venvPython}`);
      return venvPython;
    }
  }

  try {
    const pythonExt = vscode.extensions.getExtension('ms-python.python');
    if (pythonExt?.isActive) {
      const execDetails = (
        pythonExt.exports as {
          settings?: {
            getExecutionDetails?: () => { execCommand?: string[] };
          };
        }
      )?.settings?.getExecutionDetails?.();
      const interpreter = execDetails?.execCommand?.[0];
      if (interpreter) {
        return interpreter;
      }
    }
  } catch {
    // ms-python not available, fall through
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

export function isPythonInWorkspaceVenv(pythonPath: string, root: string): boolean {
  const normalized = normalizePath(pythonPath);

  for (const sub of SEARCH_SUBDIRS) {
    const searchRoot = sub ? path.join(root, sub) : root;
    for (const venvDir of VENV_DIRS) {
      const venvRoot = normalizePath(path.join(searchRoot, venvDir));
      const prefix = `${venvRoot}${path.sep}`;
      if (normalized === venvRoot || normalized.startsWith(prefix)) {
        return true;
      }
    }
  }

  return false;
}

export function willUseGlobalPython(resolvePython: () => string, root: string): boolean {
  return !isPythonInWorkspaceVenv(resolvePython(), root);
}
