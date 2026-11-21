/**
 * @fileoverview The fast-glob options that find the record files of an entity folder.
 * Push and validation use the same options, so validation checks the files push reads.
 * @module record-file-glob
 */
import type { Options } from 'fast-glob';

/** The record-file pattern of an entity folder whose config gives no `filePattern`. */
export const DEFAULT_RECORD_FILE_PATTERN = '*.json';

/** Absolute paths of files only, dot files included, without `node_modules` or `.mj-*.json` files. Add `cwd`. */
export const RECORD_FILE_GLOB_OPTIONS: Readonly<Options> = {
  absolute: true,
  onlyFiles: true,
  dot: true,
  ignore: ['**/node_modules/**', '**/.mj-*.json'],
};
