/**
 * @fileoverview The `ignoreDirectories` name rule shared by push, watch, status and validation.
 * @module ignore-directories
 */

/**
 * True when a directory name equals one of the patterns or ends with it.
 * Used for `ignoreDirectories` by push (and watch, which chooses folders as push does), status and validation.
 */
export function IsIgnoredDirectoryName(name: string, patterns: readonly string[] | undefined): boolean {
  return !!patterns && patterns.some((pattern) => name === pattern || name.endsWith(pattern));
}
