import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface HashCache {
  lastRun: string;
  gitCommit: string;
  hashes: Record<string, string>;
}

const EMPTY_CACHE: HashCache = {
  lastRun: '',
  gitCommit: '',
  hashes: {},
};

export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return computeHash(content);
}

export function loadHashCache(syncDir: string): HashCache {
  const cachePath = path.join(syncDir, 'file-hashes.json');
  if (!fs.existsSync(cachePath)) return { ...EMPTY_CACHE };
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return { ...EMPTY_CACHE };
  }
}

export function saveHashCache(syncDir: string, cache: HashCache): void {
  fs.mkdirSync(syncDir, { recursive: true });
  const cachePath = path.join(syncDir, 'file-hashes.json');
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

/** Returns true if the file has changed since last sync */
export function hasFileChanged(filePath: string, cache: HashCache): boolean {
  const currentHash = computeFileHash(filePath);
  const cachedHash = cache.hashes[filePath];
  return currentHash !== cachedHash;
}

/** Update the hash for a file in the cache */
export function updateFileHash(filePath: string, cache: HashCache): void {
  cache.hashes[filePath] = computeFileHash(filePath);
}
