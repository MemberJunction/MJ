/**
 * @fileoverview Which paths `mj sync watch` reacts to inside an entity folder. chokidar watches the
 * folder itself; this filter picks the record files and the external files.
 * @module watch-file-filter
 */
import type { Stats } from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';
import { DEFAULT_RECORD_FILE_PATTERN, RECORD_FILE_GLOB_OPTIONS } from './record-file-glob';

/** Extensions of external files that a record can bring in with `@file:`. */
const EXTERNAL_FILE_EXTENSIONS = new Set(['.md', '.txt', '.html', '.liquid', '.sql']);

/** Folder names watch never enters. */
const IGNORED_DIRECTORY_NAMES = new Set(['node_modules', '.git']);

/** The patterns push leaves out of its record files (`node_modules`, every `.mj-*.json`). */
const PUSH_IGNORE_PATTERNS: readonly string[] = RECORD_FILE_GLOB_OPTIONS.ignore ?? [];

/** Minimal file information, as chokidar passes it to `ignored`. */
export type WatchPathStats = Pick<Stats, 'isFile'>;

/**
 * Tells which paths of one entity folder watch reacts to: the record files push reads (the folder's
 * `filePattern`, default `*.json`, relative to the folder, dot files included, without the files push
 * leaves out) and external files by extension.
 */
export class WatchFileFilter {
  private readonly entityDir: string;
  private readonly filePattern: string;
  private readonly ignorePatterns: string[];

  constructor(entityDir: string, filePattern: string | undefined, ignorePatterns: string[] = []) {
    this.entityDir = path.resolve(entityDir);
    this.filePattern = filePattern || DEFAULT_RECORD_FILE_PATTERN;
    this.ignorePatterns = ignorePatterns;
  }

  /**
   * The chokidar `ignored` function. A path in the ignore list is ignored. A file is ignored
   * unless it is a record file or an external file. A folder (or a path without stats) is not
   * ignored, so chokidar looks inside it.
   */
  readonly Ignored = (filePath: string, stats?: WatchPathStats): boolean => {
    if (this.isInIgnoreList(filePath)) {
      return true;
    }
    return stats?.isFile() === true && !this.Accepts(filePath);
  };

  /** True when the file is not in the ignore list and is a record file or an external file. */
  Accepts(filePath: string): boolean {
    if (this.isInIgnoreList(filePath)) {
      return false;
    }
    const relative = this.relativePath(filePath);
    if (relative === '') {
      return false;
    }
    return minimatch(relative, this.filePattern, { dot: true }) || EXTERNAL_FILE_EXTENSIONS.has(path.extname(relative).toLowerCase());
  }

  private isInIgnoreList(filePath: string): boolean {
    const relative = this.relativePath(filePath);
    if (relative === '') {
      return false;
    }
    const segments = relative.split('/');
    const baseName = segments[segments.length - 1];
    if (segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment))) {
      return true;
    }
    if (baseName.endsWith('.backup') || PUSH_IGNORE_PATTERNS.some((pattern) => minimatch(relative, pattern, { dot: true }))) {
      return true;
    }
    const absolute = path.resolve(filePath).split(path.sep).join('/');
    return this.ignorePatterns.some(
      (pattern) => minimatch(relative, pattern, { dot: true }) || minimatch(absolute, pattern, { dot: true })
    );
  }

  /** The path relative to the entity folder, with `/` separators; '' for the folder itself. */
  private relativePath(filePath: string): string {
    return path.relative(this.entityDir, path.resolve(filePath)).split(path.sep).join('/');
  }
}
