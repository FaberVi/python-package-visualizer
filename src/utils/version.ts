/**
 * Shared version constraint parsing utilities.
 * Centralizes the regex logic to extract pinned versions from PEP 440 specifiers,
 * preventing duplication across handlers.
 */

/** Regex pattern matching PEP 440 version specifiers (==, >=, ~=, !=, etc.) */
const VERSION_CONSTRAINT_RE = /[=!<>~^]+\s*([\d][^\s,;]*)/;

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
  return pinned !== null && pinned !== installedVersion;
}
