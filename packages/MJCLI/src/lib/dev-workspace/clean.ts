/**
 * Teardown for `mj dev workspace clean`.
 *
 * SIDE EFFECTS: this module DELETES the generated files, the lockfile and the
 * `node_modules` tree at the parent directory. Everything it can remove is named
 * by a constant here — it never globs, never shells out to `rm`, and never
 * follows a symlink out of the tree (see {@link removeTarget}).
 *
 * The safety ladder, in the order {@link AssertCleanAllowed} applies it:
 *  1. The parent must not itself be a git repo root — the same guard the
 *     generator uses ({@link AssertParentDirSafe}).
 *  2. Without `--force`, a valid sentinel must be present: clean refuses to
 *     remove a workspace it cannot prove it generated.
 *  3. Deletion happens only in {@link ExecuteClean}; `--dry-run` stops after
 *     {@link PlanClean} + {@link RenderCleanPlan}, which never write.
 *
 * {@link ReadSentinel} is read-only and is shared with the status reporter.
 *
 * @module lib/dev-workspace/clean
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { SENTINEL_MARKER } from './build.js';
import { AssertParentDirSafe, GENERATED_FILE_NAMES, SENTINEL_FILE_NAME, WORKSPACE_FILE_NAMES } from './write.js';
import type { CleanPlan, CleanResult, CleanTarget, SentinelReadResult, WorkspaceSentinel } from './types.js';

/** Lockfile `pnpm install` produces at the parent. */
export const LOCKFILE_NAME = 'pnpm-lock.yaml';

/** Dependency tree `pnpm install` produces at the parent. */
export const NODE_MODULES_NAME = 'node_modules';

/** Largest sentinel we will parse; anything bigger is not something we wrote. */
const MAX_SENTINEL_BYTES = 100_000;

/** Retry cap for a single removal (Windows and virus scanners hold file handles briefly). */
const RM_MAX_RETRIES = 3;

/**
 * Number of paths clean owns: the four workspace files, the lockfile, the
 * node_modules tree, and the sentinel. Asserted in {@link PlanClean} so editing a
 * file-name constant can never silently widen or narrow what clean deletes.
 */
export const CLEAN_TARGET_COUNT = WORKSPACE_FILE_NAMES.length + 3;

/** Type guard: parsed JSON carries our marker and both string lists. */
function isSentinelShape(value: unknown): value is WorkspaceSentinel {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.generatedBy === SENTINEL_MARKER && isStringArray(record.files) && isStringArray(record.members);
}

/** Type guard for a `string[]` inside parsed JSON. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Parses sentinel text. Returns 'valid' or 'invalid' with a reason — never 'absent'. */
function parseSentinel(raw: string): SentinelReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { Kind: 'invalid', Reason: `unparseable JSON: ${message}` };
  }
  if (!isSentinelShape(parsed)) {
    return { Kind: 'invalid', Reason: `no "generatedBy": "${SENTINEL_MARKER}" marker with files and members lists` };
  }
  return { Kind: 'valid', Sentinel: parsed };
}

/**
 * Reads the sentinel at a parent directory. Read-only, and never throws for a
 * malformed file: a sentinel that is absent or not ours is a decision the caller
 * makes (refuse, or proceed under `--force`), not a crash.
 */
export function ReadSentinel(parentDir: string): SentinelReadResult {
  const sentinelPath = path.join(parentDir, SENTINEL_FILE_NAME);
  if (!existsSync(sentinelPath)) return { Kind: 'absent' };
  const raw = readFileSync(sentinelPath, 'utf8');
  if (raw.length > MAX_SENTINEL_BYTES) {
    return { Kind: 'invalid', Reason: `over ${MAX_SENTINEL_BYTES} bytes — not a generated sentinel` };
  }
  return parseSentinel(raw);
}

/** Refusal text for a clean with no valid sentinel and no `--force`. */
function refusalMessage(parentDir: string, sentinel: SentinelReadResult): string {
  const escapeHatch =
    `clean only removes a workspace it can prove it generated. Re-run with --force to remove ` +
    `${GENERATED_FILE_NAMES.join(', ')}, ${LOCKFILE_NAME} and ${NODE_MODULES_NAME} anyway ` +
    `(--dry-run --force lists them without deleting).`;
  if (sentinel.Kind === 'invalid') {
    return `${path.join(parentDir, SENTINEL_FILE_NAME)} is not a sentinel this tool wrote (${sentinel.Reason}): ${escapeHatch}`;
  }
  return (
    `No ${SENTINEL_FILE_NAME} at ${parentDir} — this workspace was hand-made, or generated before the ` +
    `sentinel existed: ${escapeHatch}`
  );
}

/**
 * Applies the pre-deletion safety ladder and returns what the sentinel said.
 * Throws when the parent is not a safe workspace parent, or when no valid
 * sentinel is present and `force` was not given.
 */
export function AssertCleanAllowed(parentDir: string, force: boolean): SentinelReadResult {
  AssertParentDirSafe(parentDir);
  const sentinel = ReadSentinel(parentDir);
  if (sentinel.Kind === 'valid' || force) return sentinel;
  throw new Error(refusalMessage(parentDir, sentinel));
}

/**
 * The paths clean owns, in removal order. The sentinel goes LAST on purpose: if a
 * removal fails part-way, the sentinel is still there and a re-run is allowed to
 * finish the job without `--force`.
 */
function ownedPaths(): Array<Omit<CleanTarget, 'Exists'>> {
  return [
    ...WORKSPACE_FILE_NAMES.map((Name) => ({ Name, Kind: 'file' as const })),
    { Name: LOCKFILE_NAME, Kind: 'file' as const },
    { Name: NODE_MODULES_NAME, Kind: 'directory' as const },
    { Name: SENTINEL_FILE_NAME, Kind: 'file' as const },
  ];
}

/** `<name>.bak` copies the generator's `--force` path leaves behind. Clean never removes these. */
function findBackups(parentDir: string): string[] {
  return GENERATED_FILE_NAMES.map((name) => `${name}.bak`).filter((name) => existsSync(path.join(parentDir, name)));
}

/**
 * Builds the removal plan for a parent directory: every owned path with whether it
 * exists right now, plus the `.bak` files that will be left alone. Read-only.
 */
export function PlanClean(parentDir: string): CleanPlan {
  if (!path.isAbsolute(parentDir)) {
    throw new Error(`PlanClean requires an absolute path, got: ${parentDir}`);
  }
  const targets: CleanTarget[] = ownedPaths().map((owned) => ({
    ...owned,
    Exists: existsSync(path.join(parentDir, owned.Name)),
  }));
  if (targets.length !== CLEAN_TARGET_COUNT) {
    throw new Error(`clean plan has ${targets.length} targets, expected ${CLEAN_TARGET_COUNT}`);
  }
  return { ParentDir: parentDir, Targets: targets, PreservedBackups: findBackups(parentDir) };
}

/**
 * Removes one owned path.
 *
 * `fs.rmSync`'s recursive walk lstats every entry and unlinks symlinks instead of
 * descending into them, so a linked dependency inside `node_modules` can never
 * lead the delete outside the tree. A shell `rm -rf` gives no such guarantee,
 * which is why this never spawns one.
 */
function removeTarget(targetPath: string, kind: CleanTarget['Kind']): void {
  const recursive = kind === 'directory';
  rmSync(targetPath, { recursive, force: true, maxRetries: RM_MAX_RETRIES });
}

/**
 * Deletes every existing target in plan order. Targets that are already absent
 * are reported, not treated as failures. A failed removal aborts and names what
 * had already gone — the sentinel is removed last, so a re-run resumes.
 */
export function ExecuteClean(plan: CleanPlan): CleanResult {
  const removed: string[] = [];
  const alreadyGone: string[] = [];
  for (const target of plan.Targets) {
    if (!target.Exists) {
      alreadyGone.push(target.Name);
      continue;
    }
    try {
      removeTarget(path.join(plan.ParentDir, target.Name), target.Kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to remove ${target.Name} at ${plan.ParentDir}: ${message}. ` +
          `Removed so far: ${removed.join(', ') || '(nothing)'} — re-run clean to finish.`
      );
    }
    removed.push(target.Name);
  }
  return { Removed: removed, AlreadyGone: alreadyGone };
}

/**
 * Renders the `--dry-run` report: only the paths that actually exist (so the list
 * is what a real clean would delete), plus the `.bak` files it would leave. Pure.
 */
export function RenderCleanPlan(plan: CleanPlan): string[] {
  const present = plan.Targets.filter((t) => t.Exists);
  if (present.length === 0) {
    return [chalk.dim(`Nothing to remove at ${plan.ParentDir} — no workspace files, lockfile or node_modules.`)];
  }
  const lines = [chalk.bold(`Would remove at ${plan.ParentDir}:`)];
  for (const target of present) {
    lines.push(`  ${target.Name}${target.Kind === 'directory' ? '/ (tree)' : ''}`);
  }
  for (const backup of plan.PreservedBackups) {
    lines.push(chalk.dim(`  keeping ${backup} (backups are never removed)`));
  }
  return lines;
}
