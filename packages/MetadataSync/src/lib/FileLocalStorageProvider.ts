/**
 * @fileoverview File-based ILocalStorageProvider for persisting metadata cache across CLI invocations.
 *
 * The default InMemoryLocalStorageProvider loses all data when the Node process exits,
 * which means every CLI invocation (mj sync push, mj codegen) does a full metadata load
 * from the database (~8-15s). This provider persists the cache to disk so the existing
 * warm-start path in providerBase.ts can load from file instead.
 *
 * Cache location: ~/.mj/cache/<category>/<key>.json
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ILocalStorageProvider } from '@memberjunction/core';

export class FileLocalStorageProvider implements ILocalStorageProvider {
  private static readonly DEFAULT_CATEGORY = 'default';
  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(os.homedir(), '.mj', 'cache');
  }

  private categoryDir(category?: string): string {
    const cat = (category || FileLocalStorageProvider.DEFAULT_CATEGORY).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, cat);
  }

  private filePath(key: string, category?: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.categoryDir(category), `${safeKey}.json`);
  }

  async GetItem(key: string, category?: string): Promise<string | null> {
    try {
      const fp = this.filePath(key, category);
      if (await fs.pathExists(fp)) {
        return await fs.readFile(fp, 'utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }

  async SetItem(key: string, value: string, category?: string): Promise<void> {
    try {
      const fp = this.filePath(key, category);
      await fs.ensureDir(path.dirname(fp));
      await fs.writeFile(fp, value, 'utf-8');
    } catch {
      // Non-fatal — cache write failure shouldn't break the app
    }
  }

  async Remove(key: string, category?: string): Promise<void> {
    try {
      const fp = this.filePath(key, category);
      await fs.remove(fp);
    } catch {
      // Non-fatal
    }
  }

  async ClearCategory(category: string): Promise<void> {
    try {
      await fs.remove(this.categoryDir(category));
    } catch {
      // Non-fatal
    }
  }

  async GetCategoryKeys(category: string): Promise<string[]> {
    try {
      const dir = this.categoryDir(category);
      if (!(await fs.pathExists(dir))) return [];
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }
}
