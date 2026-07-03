/**
 * Shared version constraint parsing utilities.
 * Centralizes the regex logic to extract pinned versions from PEP 440 specifiers,
 * preventing duplication across handlers.
 */

/** Regex pattern matching PEP 440 version specifiers (==, >=, ~=, !=, etc.) */
const VERSION_CONSTRAINT_RE = /[=!<>~^]+\s*([\d][^\s,;]*)/;

/**
 * Normalizes a version string for equivalence checks (e.g. 1.0.0 ≈ 1.0).
 */
function normalizeVersionCore(version: string): string {
  const m = version.match(/(\d+(?:\.\d+)*)/);
  if (!m) {
    return version.trim();
  }
  const parts = m[1].split('.').map(p => String(parseInt(p, 10)));
  while (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return parts.join('.');
}

/**
 * Returns true when two version strings refer to the same release (loose PEP 440 compare).
 */
export function versionsEquivalent(a: string, b: string): boolean {
  return normalizeVersionCore(a) === normalizeVersionCore(b);
}

/**
 * Extracts the pinned version string from a PEP 440 version constraint.
 * For example, `"==1.2.3"` → `"1.2.3"`, `">=2.0,<3.0"` → `"2.0"`.
 *
 * @param specifiedVersion - The raw constraint string from requirements files.
 * @returns The extracted version string, or null if no version could be parsed.
 */
export function extractPinnedVersion(specifiedVersion: string): string | null {
  const m = specifiedVersion.match(VERSION_CONSTRAINT_RE);
  return m ? m[1] : null;
}

/**
 * Determines whether a package has version drift — i.e. the pinned version
 * in the requirements file differs from the actually installed version.
 *
 * @param specifiedVersion - The constraint from the requirements file.
 * @param installedVersion - The currently installed version.
 * @returns True if the versions differ (drift detected).
 */
export function hasDrift(specifiedVersion: string, installedVersion: string): boolean {
  const pinned = extractPinnedVersion(specifiedVersion);
  return pinned !== null && !versionsEquivalent(pinned, installedVersion);
}
