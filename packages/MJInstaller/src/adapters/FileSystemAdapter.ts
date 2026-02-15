/**
 * Adapter for file system operations used by the installer:
 * ZIP extraction, directory inspection, disk space, write permission checks.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

export class FileSystemAdapter {
  /**
   * Extract a ZIP file into a target directory.
   * Returns the list of top-level entries extracted.
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
   * Check if a directory exists.
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
   * Check if a file exists.
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
   * Check if a directory is empty (no files or subdirectories).
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
   * Get free disk space in bytes at a given path.
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
   * Check if we can write to a directory.
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
   * Create a temporary directory and return its path.
   */
  async CreateTempDir(prefix: string = 'mj-install-'): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  /**
   * Remove a directory and its contents.
   */
  async RemoveDir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  /**
   * Remove a file.
   */
  async RemoveFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore if it doesn't exist
    }
  }

  /**
   * Read a JSON file and parse it.
   */
  async ReadJSON<T>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  /**
   * Write a JSON file.
   */
  async WriteJSON(filePath: string, data: unknown): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, json, 'utf-8');
  }

  /**
   * Write a text file (for .env, SQL scripts, etc.).
   */
  async WriteText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Read a text file and return its content.
   */
  async ReadText(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * List files in a directory, optionally filtered by a regex pattern.
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
   * Recursively find files matching a pattern under a directory.
   * Returns absolute paths.
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
