/**
 * @fileoverview Chooses the entity folders a push runs over.
 * @module push-directories
 */

import fs from 'fs-extra';
import path from 'path';
import { LoadSyncConfig, SyncConfig } from '../config';
import { FindEntityDirectories } from './provider-utils';
import { FilterByPushWhen, PushWhenFilterResult, SkippedDirectory } from './push-when';

/** The settings and the entity folders for one push or watch run. */
export interface PushFolders {
  /** The `--dir` folder, or the original working directory when there is no `--dir`. */
  ConfigDir: string;
  /** The folder whose `.mj-sync.json` holds the run settings. */
  SyncRootDir: string;
  /** The `.mj-sync.json` of {@link SyncRootDir}, or null when there is none. */
  SyncConfig: SyncConfig | null;
  /**
   * Finds the entity folders and removes the folders whose `pushWhen` is not true
   * (see {@link SelectPushDirectories}). Reads `pushWhen` each time it is called.
   * @throws Error when there is no entity folder before the `pushWhen` filter
   */
  SelectDirectories: () => PushWhenFilterResult;
}

/**
 * Finds the start folder and the sync root for a run, and loads the sync-root `.mj-sync.json`.
 * The folder selection uses that config's `directoryOrder` and `ignoreDirectories`.
 * @param originalCwd - The folder the command was started from
 * @param dir - The `--dir` value, relative to `originalCwd`
 */
export async function ResolvePushFolders(
  originalCwd: string,
  dir?: string,
  include?: string[],
  exclude?: string[]
): Promise<PushFolders> {
  const configDir = dir ? path.resolve(originalCwd, dir) : originalCwd;
  const syncRootDir = dir ? FindSyncRootDir(configDir) : configDir;
  const syncConfig = await LoadSyncConfig(syncRootDir);
  return {
    ConfigDir: configDir,
    SyncRootDir: syncRootDir,
    SyncConfig: syncConfig,
    SelectDirectories: () => SelectPushDirectories(configDir, !!dir, syncConfig, include, exclude),
  };
}

/** The line printed for a folder that `pushWhen` skipped. Names the variable, never its value. */
export function SkippedDirectoryMessage(configDir: string, skipped: SkippedDirectory): string {
  return `⏭️  Skipped folder ${path.relative(configDir, skipped.Directory) || path.basename(skipped.Directory)}: ${skipped.Reason}`;
}

/**
 * Returns the folder whose `.mj-sync.json` holds the push settings for `dir`: the nearest
 * folder at or above `dir` whose config has no `entity`. Returns the resolved `dir` when there is none.
 */
export function FindSyncRootDir(dir: string): string {
  let current = path.resolve(dir);
  while (true) {
    const config = readConfig(current);
    if (!config) {
      return path.resolve(dir);
    }
    if (!config.entity) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(dir);
    }
    current = parent;
  }
}

/**
 * Finds the entity folders under `configDir`, or `configDir` itself when `--dir` points at an
 * entity folder, then removes the folders whose `pushWhen` is not true.
 * @throws Error when there is no entity folder before the `pushWhen` filter
 */
export function SelectPushDirectories(
  configDir: string,
  dirOptionGiven: boolean,
  syncConfig: SyncConfig | null,
  include?: string[],
  exclude?: string[],
  env: NodeJS.ProcessEnv = process.env
): PushWhenFilterResult {
  const found = FindEntityDirectories(
    configDir,
    dirOptionGiven ? configDir : undefined,
    syncConfig?.directoryOrder,
    syncConfig?.ignoreDirectories,
    include,
    exclude
  );
  if (found.length === 0) {
    throw new Error('No entity directories found');
  }
  return FilterByPushWhen(found, env);
}

function readConfig(dir: string): { entity?: string } | null {
  const configPath = path.join(dir, '.mj-sync.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  return fs.readJsonSync(configPath) as { entity?: string };
}
