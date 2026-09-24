/**
 * The `--dir` contract shared by every `mj dev workspace` command.
 *
 * NO SIDE EFFECTS: a constant and a pure function. oclif does the actual
 * resolution (its `env` flag binding gives flag > env > default for free); this
 * module only names the variable and reports which input won, so `status` can
 * tell the user where its parent directory came from.
 *
 * @module lib/dev-workspace/dir-flag
 */
import type { DirSource } from './types.js';

/** Environment variable every dev workspace command binds to its `--dir` flag. */
export const WORKSPACE_DIR_ENV_VAR = 'MJ_DEV_WORKSPACE_DIR';

/**
 * Determines which input supplied `--dir`, mirroring oclif's own precedence: an
 * explicit flag beats the environment variable, which beats the default. Pure —
 * the caller passes its raw argv and the environment value, so this never reads
 * `process.env` itself.
 */
export function ResolveDirSource(argv: readonly string[], envValue: string | undefined): DirSource {
  if (argv.some((arg) => arg === '--dir' || arg.startsWith('--dir='))) return 'flag';
  if (envValue !== undefined && envValue.length > 0) return 'env';
  return 'default';
}

/** How a resolved `--dir` should be described in output. */
export function DescribeDirSource(source: DirSource): string {
  if (source === 'flag') return '--dir flag';
  if (source === 'env') return `$${WORKSPACE_DIR_ENV_VAR}`;
  return 'default (current directory)';
}
