/**
 * Adapter for file system operations used by the installer.
 *
 * Provides a testable abstraction over Node.js `fs` operations including
 * ZIP extraction, directory inspection, disk space checks, write permission
 * tests, temp directory creation, JSON/text I/O, and recursive file search.
 *
 * All methods are async and use `node:fs/promises` internally. The adapter
 * pattern allows phases to be unit-tested with mock file system implementations.
 *
 * @module adapters/FileSystemAdapter
 * @see ScaffoldPhase — uses ExtractZip, CreateTempDir, RemoveFile.
 * @see PreflightPhase — uses GetFreeDiskSpace, CanWrite, DirectoryExists.
 * @see ConfigurePhase — uses WriteText, ReadText, FileExists, ListFiles.
 * @see CodeGenPhase — uses ReadText, WriteText, GetModifiedTime, FindFiles.
 *
 * @example
 * ```typescript
 * const fs = new FileSystemAdapter();
 * await fs.ExtractZip('/tmp/release.zip', '/path/to/install');
 * const config = await fs.ReadJSON<{ settings: object }>('/path/to/mj.config.cjs');
 * ```
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

/**
 * File system adapter providing all I/O operations needed by installer phases.
 *
 * Methods are organized into categories:
 * - **ZIP operations**: {@link ExtractZip}
 * - **Directory operations**: {@link CreateDirectory}, {@link DirectoryExists},
 *   {@link IsDirectoryEmpty}, {@link ListDirectoryEntries}, {@link RemoveDir}
 * - **File operations**: {@link FileExists}, {@link RemoveFile}, {@link ReadJSON},
 *   {@link WriteJSON}, {@link WriteText}, {@link ReadText}
 * - **Disk checks**: {@link GetFreeDiskSpace}, {@link CanWrite}
 * - **Temp/search**: {@link CreateTempDir}, {@link ListFiles}, {@link FindFiles},
 *   {@link GetModifiedTime}
 */
export class FileSystemAdapter {
  /**
   * Extract a ZIP file into a target directory.
   *
   * Handles the common GitHub zipball convention where all files are nested
   * inside a single root folder (e.g., `MemberJunction-MJ-abc1234/`). When
   * a single root folder is detected, its contents are extracted directly
   * into `targetDir` without the wrapper folder.
   *
   * @param zipPath - Absolute path to the ZIP file.
   * @param targetDir - Directory to extract into (created if it doesn't exist).
   * @returns List of top-level entry names in the target directory after extraction.
   * @throws Error if the ZIP file is corrupt or unreadable.
   *
   * @example
   * ```typescript
   * const entries = await fs.ExtractZip('/tmp/v5.1.0.zip', '/path/to/install');
   * // ['packages', 'package.json', 'turbo.json', ...]
   * ```
   */
  async ExtractZip(zipPath: string, targetDir: string): Promise<string[]> {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // Determine if ZIP has a single root folder (common for GitHub zipballs)
    const topLevelNames = new Set<string>();
    for (const entry of entries) {
      const firstSegment = entry.entryName.split('/')[0];
      topLevelNames.add(firstSegment);
    }

    const hasSingleRoot = topLevelNames.size === 1;
    const rootPrefix = hasSingleRoot ? [...topLevelNames][0] + '/' : '';

    await fs.mkdir(targetDir, { recursive: true });

    for (const entry of entries) {
      let relativePath = entry.entryName;

      // Strip the single root folder if present
      if (hasSingleRoot && relativePath.startsWith(rootPrefix)) {
        relativePath = relativePath.slice(rootPrefix.length);
      }

      if (!relativePath) {
        continue;
      }

      const fullPath = path.join(targetDir, relativePath);

      if (entry.isDirectory) {
        await fs.mkdir(fullPath, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, new Uint8Array(entry.getData()));
      }
    }

    // Return the list of top-level items in the target dir after extraction
    const extracted = await fs.readdir(targetDir);
    return extracted;
  }

  /**
   * Create a directory and any missing parent directories.
   *
   * @param dirPath - Absolute path of the directory to create.
   */
  async CreateDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Check whether a path exists and is a directory.
   *
   * @param dirPath - Absolute path to check.
   * @returns `true` if the path exists and is a directory, `false` otherwise.
   */
  async DirectoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check whether a path exists and is a regular file.
   *
   * @param filePath - Absolute path to check.
   * @returns `true` if the path exists and is a file, `false` otherwise.
   */
  async FileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check whether a directory is empty (contains no files or subdirectories).
   *
   * @param dirPath - Absolute path to the directory.
   * @returns `true` if the directory is empty or doesn't exist, `false` otherwise.
   */
  async IsDirectoryEmpty(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries.length === 0;
    } catch {
      return true; // doesn't exist = treat as empty
    }
  }

  /**
   * List all entries (files and directories) in a directory.
   * Returns an empty array if the directory doesn't exist.
   */
  async ListDirectoryEntries(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch {
      return [];
    }
  }

  /**
   * Get free disk space in bytes at a given path.
   *
   * Walks up the directory tree to find an existing ancestor if `dirPath`
   * doesn't exist yet (common for fresh installs). Uses `fs.statfs()` to
   * query available blocks.
   *
   * @param dirPath - Path to check free space for (can be non-existent).
   * @returns Available disk space in bytes.
   * @throws Error if the filesystem stats cannot be read.
   */
  async GetFreeDiskSpace(dirPath: string): Promise<number> {
    // Ensure the directory exists (use parent if it doesn't)
    let checkPath = dirPath;
    while (!(await this.DirectoryExists(checkPath))) {
      const parent = path.dirname(checkPath);
      if (parent === checkPath) break; // reached root
      checkPath = parent;
    }

    const stats = await fs.statfs(checkPath);
    return stats.bavail * stats.bsize;
  }

  /**
   * Test whether the current process can write to a directory.
   *
   * Creates the directory if it doesn't exist, writes a temporary probe file,
   * then deletes it. Returns `false` if any step fails (permission denied, etc.).
   *
   * @param dirPath - Directory path to test write access for.
   * @returns `true` if a file can be written and deleted in the directory.
   */
  async CanWrite(dirPath: string): Promise<boolean> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      const testFile = path.join(dirPath, `.mj-install-write-test-${Date.now()}`);
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a temporary directory in the system temp folder.
   *
   * @param prefix - Directory name prefix (default: `'mj-install-'`).
   * @returns Absolute path to the created temporary directory.
   */
  async CreateTempDir(prefix: string = 'mj-install-'): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  /**
   * Recursively remove a directory and all its contents.
   *
   * @param dirPath - Absolute path of the directory to remove.
   */
  async RemoveDir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  /**
   * Remove a single file. Silently succeeds if the file doesn't exist.
   *
   * @param filePath - Absolute path of the file to remove.
   */
  async RemoveFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore if it doesn't exist
    }
  }

  /**
   * Read and parse a JSON file.
   *
   * @typeParam T - Expected shape of the parsed JSON.
   * @param filePath - Absolute path to the JSON file.
   * @returns Parsed JSON content cast to type `T`.
   * @throws Error if the file doesn't exist or contains invalid JSON.
   */
  async ReadJSON<T>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  /**
   * Serialize data as JSON and write it to a file (pretty-printed, 2-space indent).
   *
   * @param filePath - Absolute path to write the JSON file.
   * @param data - Data to serialize.
   */
  async WriteJSON(filePath: string, data: unknown): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, json, 'utf-8');
  }

  /**
   * Write a UTF-8 text file, creating parent directories if needed.
   * Used for `.env`, SQL scripts, environment.ts, and manifest files.
   *
   * @param filePath - Absolute path to write the file.
   * @param content - Text content to write.
   */
  async WriteText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Read a UTF-8 text file and return its content as a string.
   *
   * @param filePath - Absolute path to the file.
   * @returns File content as a string.
   * @throws Error if the file doesn't exist.
   */
  async ReadText(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * List file names in a directory, optionally filtered by a regex pattern.
   * Returns only regular files (not directories).
   *
   * @param dirPath - Absolute path to the directory.
   * @param pattern - Optional regex to filter file names (e.g., `/environment.*\.ts$/`).
   * @returns Array of matching file names (not full paths). Empty if directory doesn't exist.
   */
  async ListFiles(dirPath: string, pattern?: RegExp): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name);
      if (pattern) {
        return files.filter((f) => pattern.test(f));
      }
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Get the last-modified time of a file in milliseconds since the Unix epoch.
   *
   * Used by {@link CodeGenPhase}'s fast mode to compare source vs compiled
   * file timestamps and determine whether post-codegen rebuilds are needed.
   *
   * @param filePath - Absolute path to the file.
   * @returns Modification time in milliseconds, or `null` if the file doesn't exist.
   */
  async GetModifiedTime(filePath: string): Promise<number | null> {
    try {
      const stat = await fs.stat(filePath);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Recursively search for files with a specific name under a directory.
   *
   * Skips `node_modules` and `.git` directories to avoid excessive traversal.
   * Used by {@link PlatformCompatPhase} to find all `package.json` files
   * in the workspace.
   *
   * @param dirPath - Root directory to start the search from.
   * @param filename - Exact file name to match (e.g., `'package.json'`).
   * @param maxDepth - Maximum directory depth to recurse into (default: `3`).
   * @returns Array of absolute paths to matching files.
   */
  async FindFiles(dirPath: string, filename: string, maxDepth: number = 3): Promise<string[]> {
    const results: string[] = [];
    await this.findFilesRecursive(dirPath, filename, maxDepth, 0, results);
    return results;
  }

  private async findFilesRecursive(
    dirPath: string,
    filename: string,
    maxDepth: number,
    currentDepth: number,
    results: string[]
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile() && entry.name === filename) {
          results.push(fullPath);
        } else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          await this.findFilesRecursive(fullPath, filename, maxDepth, currentDepth + 1, results);
        }
      }
    } catch {
      // skip directories we can't read
    }
  }
}
