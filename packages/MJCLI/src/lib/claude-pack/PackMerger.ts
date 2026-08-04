/**
 * Per-file merge for the Claude Code pack.
 *
 * Implements the table in plans/claude-install-pack.md §6.4:
 *
 *   CLAUDE.md           — managed-block rewrite (preserves user content)
 *   .claude/mj/**       — overwritten as a unit (incl. sweep of stale files)
 *   .claude/settings.json — deep-merge per §10.2
 *   .claude/commands/*  — seed-once; overwrite needs --force / --refresh-commands
 *   .claude/skills/**   — same rule as commands
 *
 * The merger never destroys user content by default. `Force` and the
 * `Refresh*` flags are explicit opt-ins.
 */

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
    parseManagedBlock,
    rewriteManagedBlock,
    wrapWithManagedBlock,
    ManagedBlockError,
} from './ManagedBlockEditor.js';
import { mergeSettings } from './SettingsMerger.js';
import {
    emptyActionLog,
    recordOutcome,
    type ActionLog,
    type FileMergeResult,
    type Manifest,
} from './PackTypes.js';

// ---------------------------------------------------------------------------
// Options + result
// ---------------------------------------------------------------------------

export interface PackMergeOptions {
    /** Absolute path to the user's project. */
    TargetDir: string;
    /**
     * Pack contents keyed by pack-relative POSIX path. Must include the
     * MANIFEST.json under `.claude/mj/MANIFEST.json` (PackInstaller injects it).
     */
    PackFiles: Map<string, Uint8Array>;
    Manifest: Manifest;
    /** Don't write anything — just compute the action plan. */
    DryRun?: boolean;
    /** Overwrite user-modified commands/skills without prompting. */
    Force?: boolean;
    /** Skip the seed of `.claude/commands/`. */
    SkipCommands?: boolean;
    /** Skip the seed of `.claude/skills/`. */
    SkipSkills?: boolean;
    /** Skip the settings.json deep-merge. */
    SkipSettings?: boolean;
    /** Resync commands from pack (update:claude). Equivalent to per-file --force on commands. */
    RefreshCommands?: boolean;
    /** Resync skills from pack (update:claude). */
    RefreshSkills?: boolean;
}

export interface PackMergeResult {
    Actions: ActionLog;
    Warnings: string[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function mergePack(opts: PackMergeOptions): PackMergeResult {
    const actions = emptyActionLog();
    const warnings: string[] = [];

    mergeRootClaudeMd(opts, actions, warnings);
    mergeMjBundle(opts, actions, warnings);
    if (!opts.SkipSettings) mergeSettingsFile(opts, actions, warnings);
    if (!opts.SkipCommands) {
        mergeSeededTree(opts, actions, warnings, '.claude/commands/', !!opts.RefreshCommands);
    }
    if (!opts.SkipSkills) {
        mergeSeededTree(opts, actions, warnings, '.claude/skills/', !!opts.RefreshSkills);
    }

    return { Actions: actions, Warnings: warnings };
}

// ---------------------------------------------------------------------------
// CLAUDE.md — managed-block rewrite
// ---------------------------------------------------------------------------

function mergeRootClaudeMd(
    opts: PackMergeOptions,
    actions: ActionLog,
    warnings: string[]
): void {
    const packBytes = opts.PackFiles.get('CLAUDE.md');
    if (!packBytes) {
        recordOutcome(actions, { path: 'CLAUDE.md', outcome: 'error', reason: 'absent from pack' });
        return;
    }
    const packText = decodeText(packBytes);
    let packBlock;
    try {
        packBlock = parseManagedBlock(packText);
    } catch (err) {
        recordOutcome(actions, {
            path: 'CLAUDE.md',
            outcome: 'error',
            reason: `pack CLAUDE.md malformed: ${(err as Error).message}`,
        });
        return;
    }
    if (!packBlock) {
        recordOutcome(actions, {
            path: 'CLAUDE.md',
            outcome: 'error',
            reason: 'pack CLAUDE.md has no managed block',
        });
        return;
    }

    const targetPath = path.join(opts.TargetDir, 'CLAUDE.md');

    if (!existsSync(targetPath)) {
        writeFile(opts, targetPath, packText);
        recordOutcome(actions, { path: 'CLAUDE.md', outcome: 'added' });
        return;
    }

    const existing = readFileSync(targetPath, 'utf8');
    let existingBlock;
    try {
        existingBlock = parseManagedBlock(existing);
    } catch (err) {
        warnings.push(
            `CLAUDE.md has malformed MJ-MANAGED markers — leaving the file alone. ` +
                `Fix it and re-run, or pass --force to wrap the existing content. (${(err as Error).message})`
        );
        recordOutcome(actions, {
            path: 'CLAUDE.md',
            outcome: 'skipped',
            reason: 'malformed managed markers',
        });
        return;
    }

    let newContent: string;
    if (existingBlock === null) {
        newContent = wrapWithManagedBlock(existing, packBlock.body, packBlock.attrs);
    } else {
        newContent = rewriteManagedBlock(existing, packBlock.body, packBlock.attrs);
    }

    if (newContent === existing) {
        recordOutcome(actions, { path: 'CLAUDE.md', outcome: 'skipped', reason: 'identical' });
        return;
    }

    writeFile(opts, targetPath, newContent);
    recordOutcome(actions, { path: 'CLAUDE.md', outcome: 'updated' });
}

// ---------------------------------------------------------------------------
// .claude/mj/** — overwritten as a unit + sweep of stale files
// ---------------------------------------------------------------------------

function mergeMjBundle(
    opts: PackMergeOptions,
    actions: ActionLog,
    _warnings: string[]
): void {
    const mjPaths = collectPackPathsByPrefix(opts.PackFiles, '.claude/mj/');
    const targetMjDir = path.join(opts.TargetDir, '.claude', 'mj');

    // Sweep: delete any existing .claude/mj/ files that aren't in the new pack.
    // The folder is "managed as a unit" — stale files from previous versions
    // would otherwise linger.
    if (existsSync(targetMjDir)) {
        const expected = new Set(mjPaths);
        for (const stale of walkRelativeFiles(targetMjDir, opts.TargetDir)) {
            if (!stale.startsWith('.claude/mj/')) continue;
            if (!expected.has(stale)) {
                const absPath = path.join(opts.TargetDir, stale);
                if (!opts.DryRun) unlinkSync(absPath);
                recordOutcome(actions, {
                    path: stale,
                    outcome: 'updated',
                    reason: 'removed (no longer shipped)',
                });
            }
        }
    }

    // Write or overwrite every file the pack ships under .claude/mj/.
    for (const relPath of mjPaths) {
        const bytes = opts.PackFiles.get(relPath)!;
        const absPath = path.join(opts.TargetDir, relPath);
        const existed = existsSync(absPath);
        const identical = existed && bytesEqual(readFileBytes(absPath), bytes);
        if (identical) {
            recordOutcome(actions, { path: relPath, outcome: 'skipped', reason: 'identical' });
            continue;
        }
        writeFile(opts, absPath, bytes);
        recordOutcome(actions, { path: relPath, outcome: existed ? 'updated' : 'added' });
    }
}

// ---------------------------------------------------------------------------
// .claude/settings.json — deep-merge per §10.2
// ---------------------------------------------------------------------------

function mergeSettingsFile(
    opts: PackMergeOptions,
    actions: ActionLog,
    warnings: string[]
): void {
    const packBytes = opts.PackFiles.get('.claude/settings.json');
    if (!packBytes) {
        recordOutcome(actions, {
            path: '.claude/settings.json',
            outcome: 'error',
            reason: 'absent from pack',
        });
        return;
    }
    let packJson: Record<string, unknown>;
    try {
        packJson = JSON.parse(decodeText(packBytes));
    } catch (err) {
        recordOutcome(actions, {
            path: '.claude/settings.json',
            outcome: 'error',
            reason: `pack settings.json invalid JSON: ${(err as Error).message}`,
        });
        return;
    }

    const targetPath = path.join(opts.TargetDir, '.claude', 'settings.json');
    let existing: Record<string, unknown> = {};
    const existed = existsSync(targetPath);
    if (existed) {
        try {
            existing = JSON.parse(readFileSync(targetPath, 'utf8'));
        } catch (err) {
            warnings.push(
                `Existing .claude/settings.json is malformed JSON; leaving it alone. (${(err as Error).message})`
            );
            recordOutcome(actions, {
                path: '.claude/settings.json',
                outcome: 'skipped',
                reason: 'malformed JSON',
            });
            return;
        }
    }

    const { Result, Changed } = mergeSettings({ Existing: existing, Pack: packJson });
    if (!Changed && existed) {
        recordOutcome(actions, {
            path: '.claude/settings.json',
            outcome: 'skipped',
            reason: 'identical',
        });
        return;
    }

    writeFile(opts, targetPath, JSON.stringify(Result, null, 2) + '\n');
    recordOutcome(actions, {
        path: '.claude/settings.json',
        outcome: existed ? 'updated' : 'added',
    });
}

// ---------------------------------------------------------------------------
// .claude/commands/* and .claude/skills/** — seed-once with --force override
// ---------------------------------------------------------------------------

function mergeSeededTree(
    opts: PackMergeOptions,
    actions: ActionLog,
    warnings: string[],
    prefix: string,
    refresh: boolean
): void {
    const paths = collectPackPathsByPrefix(opts.PackFiles, prefix);
    for (const relPath of paths) {
        const result = seedOneFile(opts, relPath, refresh, warnings);
        recordOutcome(actions, result);
    }
}

function seedOneFile(
    opts: PackMergeOptions,
    relPath: string,
    refresh: boolean,
    warnings: string[]
): FileMergeResult {
    const bytes = opts.PackFiles.get(relPath)!;
    const absPath = path.join(opts.TargetDir, relPath);

    if (!existsSync(absPath)) {
        writeFile(opts, absPath, bytes);
        return { path: relPath, outcome: 'added' };
    }

    const existing = readFileBytes(absPath);
    if (bytesEqual(existing, bytes)) {
        return { path: relPath, outcome: 'skipped', reason: 'identical' };
    }

    // Different — user has customized this file. Default behavior is to
    // preserve theirs; --force or --refresh-commands/--refresh-skills
    // overrides with a .bak backup.
    if (opts.Force || refresh) {
        if (!opts.DryRun) {
            writeFileSync(absPath + '.bak', existing);
        }
        writeFile(opts, absPath, bytes);
        return { path: relPath, outcome: 'updated', reason: 'overwritten (.bak saved)' };
    }

    warnings.push(`${relPath} differs from pack — kept user version. Pass --force to overwrite.`);
    return { path: relPath, outcome: 'skipped', reason: 'user-modified' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeText(bytes: Uint8Array): string {
    return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Read a file's raw bytes as a fresh `Uint8Array`. `readFileSync(path)` returns
 * `Buffer`, which Node's strict @types/node 20+ won't always assign to
 * `Uint8Array<ArrayBufferLike>` due to generic-param invariance — wrapping in
 * `new Uint8Array(...)` produces a portable, type-clean value.
 */
function readFileBytes(absPath: string): Uint8Array {
    return new Uint8Array(readFileSync(absPath));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function collectPackPathsByPrefix(
    files: Map<string, Uint8Array>,
    prefix: string
): string[] {
    return [...files.keys()].filter((p) => p.startsWith(prefix)).sort();
}

function writeFile(opts: PackMergeOptions, absPath: string, body: Uint8Array | string): void {
    assertWithinTarget(opts.TargetDir, absPath);
    if (opts.DryRun) return;
    mkdirSync(path.dirname(absPath), { recursive: true });
    if (typeof body === 'string') {
        writeFileSync(absPath, body, 'utf8');
    } else {
        writeFileSync(absPath, body);
    }
}

/**
 * Defense-in-depth against malicious pack manifests: every write must
 * resolve to a path inside `targetDir`. A hostile `--from` pack whose
 * manifest declares `relPath: "../../etc/whatever"` would otherwise
 * escape the install directory.
 */
function assertWithinTarget(targetDir: string, absPath: string): void {
    const resolvedTarget = path.resolve(targetDir);
    const resolvedAbs = path.resolve(absPath);
    const targetWithSep = resolvedTarget.endsWith(path.sep) ? resolvedTarget : resolvedTarget + path.sep;
    if (resolvedAbs !== resolvedTarget && !resolvedAbs.startsWith(targetWithSep)) {
        throw new Error(
            `Pack manifest tried to write outside the target directory: ${absPath} (target: ${targetDir})`
        );
    }
}

/**
 * Walk a directory and return file paths relative to `relativeTo`, using
 * POSIX separators (`/`) regardless of host OS — these are pack-relative
 * paths the rest of the merger compares with.
 */
function walkRelativeFiles(dir: string, relativeTo: string): string[] {
    const out: string[] = [];
    function recurse(current: string) {
        for (const entry of readdirSync(current)) {
            const abs = path.join(current, entry);
            const stat = statSync(abs);
            if (stat.isDirectory()) {
                recurse(abs);
            } else {
                const rel = path.relative(relativeTo, abs).split(path.sep).join('/');
                out.push(rel);
            }
        }
    }
    if (existsSync(dir)) recurse(dir);
    return out;
}

/** Re-export for tests that want to exercise the walker in isolation. */
export const _internals = { walkRelativeFiles, bytesEqual, collectPackPathsByPrefix };

// ManagedBlockError re-export — callers may catch it specifically.
export { ManagedBlockError };
