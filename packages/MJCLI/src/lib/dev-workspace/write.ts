/**
 * File writing (and the safety gates around it) for `mj dev workspace`.
 *
 * SIDE EFFECTS: writes the generated files at the parent directory. Two hard
 * safety rules, both from the program brief:
 *  1. NEVER overwrite an existing parent file silently — refuse with a clear
 *     message unless forced, and when forced save a `<name>.bak` copy first.
 *  2. Refuse to operate when the parent directory is itself a git repo root —
 *     the workspace parent must be a plain directory holding sibling clones.
 *
 * @module lib/dev-workspace/write
 */
import { copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GeneratedFile, WriteResult } from './types.js';

/** The four files `mj dev workspace` owns at the parent directory. */
export const WORKSPACE_FILE_NAMES: readonly string[] = [
  'pnpm-workspace.yaml',
  '.npmrc',
  'package.json',
  'turbo.json',
];

/**
 * Throws unless the parent directory is a plain directory that is NOT a git repo
 * root (`.git` may be a directory or a worktree file — both disqualify).
 */
export function AssertParentDirSafe(parentDir: string): void {
  if (!path.isAbsolute(parentDir)) {
    throw new Error(`Parent directory must be an absolute path, got: ${parentDir}`);
  }
  if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) {
    throw new Error(`Parent directory does not exist or is not a directory: ${parentDir}`);
  }
  if (existsSync(path.join(parentDir, '.git'))) {
    throw new Error(
      `${parentDir} looks like a git repo root (.git present). The workspace parent must be the plain ` +
        `directory that HOLDS your sibling clones — run again with --dir pointing at the repos' common parent.`
    );
  }
}

/** Names among the generated files that already exist at the parent. */
export function FindExistingFiles(parentDir: string, fileNames: readonly string[]): string[] {
  return fileNames.filter((name) => existsSync(path.join(parentDir, name)));
}

/**
 * Writes the generated files at the parent directory.
 * Without `force`, refuses (throws) if ANY of the files already exists.
 * With `force`, each existing file is first copied to `<name>.bak`.
 */
export function WriteWorkspaceFiles(parentDir: string, files: readonly GeneratedFile[], force: boolean): WriteResult {
  AssertParentDirSafe(parentDir);
  const existing = FindExistingFiles(parentDir, files.map((f) => f.Name));
  if (existing.length > 0 && !force) {
    throw new Error(
      `Refusing to overwrite existing file(s) at ${parentDir}: ${existing.join(', ')}. ` +
        `Re-run with --force to overwrite (a .bak copy of each will be kept).`
    );
  }
  const backedUp: string[] = [];
  for (const name of existing) {
    const target = path.join(parentDir, name);
    copyFileSync(target, `${target}.bak`);
    backedUp.push(`${name}.bak`);
  }
  const written: string[] = [];
  for (const file of files) {
    writeFileSync(path.join(parentDir, file.Name), file.Content, 'utf8');
    written.push(file.Name);
  }
  return { Written: written, BackedUp: backedUp };
}
