/**
 * Top-level orchestrator for `mj install:claude` and `mj update:claude`.
 *
 * Composes:
 *  - source resolution (remote via PackFetcher, or local via PackPaths)
 *  - MJ-major detection and the cross-major guard
 *  - the --check fast path (compare versions without touching the FS)
 *  - the merge (PackMerger) and InstallResult assembly
 *
 * The CLI command files thinly wrap this with flag parsing + output rendering.
 *
 * @see plans/claude-install-pack.md §6.3, §6.5, §7.4, §7.5
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fetchPack, type HttpGetter, PackFetchError } from './PackFetcher.js';
import { mergePack } from './PackMerger.js';
import {
    buildRemoteUrlPrefix,
    detectMJMajor,
    detectMJVersionString,
    resolveLocalPackRoot,
} from './PackPaths.js';
import {
    emptyActionLog,
    type ActionLog,
    type InstallResult,
    type Manifest,
} from './PackTypes.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface InstallPackOptions {
    /** Absolute or relative target directory (default: process.cwd()). */
    TargetDir: string;
    /** Override the detected MJ major. Useful when target dir has no MJ deps yet. */
    Major?: string;
    /** Git ref to fetch from (branch or tag). Default: `'main'`. */
    Ref?: string;
    /**
     * Use a local pack source instead of fetching. Accepts an MJ repo root
     * (looks under `templates/claude-pack/dist/v{N}/`) or an already-unpacked
     * dist directory.
     */
    FromPath?: string;
    /** Forbid network — requires FromPath. */
    Offline?: boolean;
    /** Don't write anything, just compute the action plan. */
    DryRun?: boolean;
    /** Overwrite user-customized commands/skills (skip prompts). */
    Force?: boolean;
    /** Skip the seed of `.claude/commands/`. */
    SkipCommands?: boolean;
    /** Skip the seed of `.claude/skills/`. */
    SkipSkills?: boolean;
    /** Skip the `.claude/settings.json` deep-merge. */
    SkipSettings?: boolean;
    /** update:claude only — resync commands. */
    RefreshCommands?: boolean;
    /** update:claude only — resync skills. */
    RefreshSkills?: boolean;
    /** update:claude only — don't write; compare versions and return. */
    CheckOnly?: boolean;
    /**
     * update:claude only — required when the remote pack's major differs from
     * the local MJ install's major. Without this flag, the installer refuses
     * the cross-major migration as a guardrail.
     */
    AllowMajor?: boolean;
    /** Injected HTTP getter (tests). Defaults to real `node:https`. */
    HttpGet?: HttpGetter;
    /** Progress callback for verbose mode. */
    OnProgress?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function installPack(opts: InstallPackOptions): Promise<InstallResult> {
    const targetDir = path.resolve(opts.TargetDir);
    const onProgress = opts.OnProgress ?? (() => {});

    const major = opts.Major ?? detectMJMajor(targetDir);
    if (!major) {
        return errorResult(
            null,
            'Could not detect MJ major version (no @memberjunction/* in package.json). ' +
                'Pass --major <N> to override.'
        );
    }

    if (opts.Offline && !opts.FromPath) {
        return errorResult(detectMJVersion(targetDir), '--offline requires --from <path>.');
    }

    onProgress(`resolving pack (major=v${major}${opts.FromPath ? `, from=${opts.FromPath}` : ''})`);

    let manifest: Manifest;
    let files: Map<string, Uint8Array>;
    try {
        ({ manifest, files } = await resolvePack(major, opts, onProgress));
    } catch (err) {
        const installedMJ = detectMJVersion(targetDir);
        if (err instanceof PackFetchError) {
            return errorResult(installedMJ, `Failed to fetch pack: ${err.message}`);
        }
        return errorResult(installedMJ, `Failed to resolve pack: ${(err as Error).message}`);
    }

    const installedMJVersion = detectMJVersion(targetDir);

    // --check: compare versions and return without writing.
    if (opts.CheckOnly) {
        return buildCheckResult(targetDir, manifest, installedMJVersion);
    }

    // Cross-major guardrail — pack's major must match local MJ unless explicitly allowed.
    if (manifest.mjMajor !== major && !opts.AllowMajor) {
        return errorResult(
            installedMJVersion,
            `Pack major v${manifest.mjMajor} doesn't match local MJ major v${major}. ` +
                `Pass --allow-major to apply anyway.`
        );
    }

    // Inject MANIFEST.json into the files map so the merger writes it to disk.
    // (The fetched MANIFEST.json itself is not in `files` because the manifest
    // omits its own entry to avoid the self-reference.)
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
    files.set('.claude/mj/MANIFEST.json', manifestBytes);

    onProgress('merging pack into target');
    const { Actions, Warnings } = mergePack({
        TargetDir: targetDir,
        PackFiles: files,
        Manifest: manifest,
        DryRun: opts.DryRun,
        Force: opts.Force,
        SkipCommands: opts.SkipCommands,
        SkipSkills: opts.SkipSkills,
        SkipSettings: opts.SkipSettings,
        RefreshCommands: opts.RefreshCommands,
        RefreshSkills: opts.RefreshSkills,
    });

    return {
        ok: Actions.errors.length === 0,
        packVersion: manifest.packVersion,
        installedMJVersion,
        actions: Actions,
        warnings: Warnings,
        notes: [],
    };
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

async function resolvePack(
    major: string,
    opts: InstallPackOptions,
    onProgress: (m: string) => void
): Promise<{ manifest: Manifest; files: Map<string, Uint8Array> }> {
    if (opts.FromPath) {
        const localRoot = resolveLocalPackRoot(opts.FromPath, major);
        if (!localRoot) {
            throw new Error(
                `Could not find a Claude pack at --from path: ${opts.FromPath}. ` +
                    `Expected either an MJ repo root (with templates/claude-pack/dist/v${major}/) or an unpacked dist directory.`
            );
        }
        return loadLocalPack(localRoot, opts.CheckOnly ?? false);
    }

    const fetched = await fetchPack({
        Major: major,
        Ref: opts.Ref,
        HttpGet: opts.HttpGet,
        OnProgress: onProgress,
        ManifestOnly: opts.CheckOnly,
    });
    return { manifest: fetched.Manifest, files: fetched.Files };
}

/**
 * Read a pack from a local directory, verifying every file's sha256 against
 * the manifest (sanity check — guards against partial/corrupt local copies).
 */
function loadLocalPack(
    rootDir: string,
    manifestOnly: boolean
): { manifest: Manifest; files: Map<string, Uint8Array> } {
    const manifestPath = path.join(rootDir, '.claude', 'mj', 'MANIFEST.json');
    if (!existsSync(manifestPath)) {
        throw new Error(`Local pack at ${rootDir} has no .claude/mj/MANIFEST.json`);
    }
    let manifest: Manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        throw new Error(
            `Local pack manifest at ${manifestPath} is not valid JSON: ${(err as Error).message}`
        );
    }

    const files = new Map<string, Uint8Array>();
    if (manifestOnly) {
        return { manifest, files };
    }

    for (const entry of manifest.files) {
        const abs = path.join(rootDir, ...entry.path.split('/'));
        if (!existsSync(abs)) {
            throw new Error(`Local pack missing file: ${entry.path}`);
        }
        // `new Uint8Array(readFileSync(...))` normalizes Buffer → Uint8Array
        // for the strict @types/node generics (see PackFetcher.ts for context).
        const bytes = new Uint8Array(readFileSync(abs));
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (hash !== entry.sha256) {
            throw new Error(
                `Local pack checksum mismatch for ${entry.path}: expected ${entry.sha256}, got ${hash}`
            );
        }
        files.set(entry.path, bytes);
    }
    return { manifest, files };
}

// ---------------------------------------------------------------------------
// --check fast path
// ---------------------------------------------------------------------------

function buildCheckResult(
    targetDir: string,
    manifest: Manifest,
    installedMJVersion: string | null
): InstallResult {
    const localVersionFile = path.join(targetDir, '.claude', 'mj', 'VERSION');
    const localVersion = existsSync(localVersionFile)
        ? readFileSync(localVersionFile, 'utf8').trim()
        : null;

    const actions: ActionLog = emptyActionLog();
    const warnings: string[] = [];
    const notes: string[] = [];

    if (!localVersion) {
        // "No local pack" is a state worth flagging — the user ran --check
        // expecting an installed pack and there isn't one.
        warnings.push('No local pack found (.claude/mj/VERSION missing).');
    } else if (localVersion === manifest.packVersion) {
        // "Up to date" is the success case for --check, not a warning.
        notes.push(`Pack is up to date (v${localVersion}).`);
    } else {
        // "Update available" is informational — there's an action the user
        // *can* take, but nothing is wrong.
        notes.push(
            `Update available: v${localVersion} → v${manifest.packVersion}. Run \`mj update:claude\` to apply.`
        );
    }

    return {
        ok: true,
        packVersion: manifest.packVersion,
        installedMJVersion,
        actions,
        warnings,
        notes,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(installedMJVersion: string | null, message: string): InstallResult {
    return {
        ok: false,
        packVersion: '',
        installedMJVersion,
        actions: { ...emptyActionLog(), errors: [message] },
        warnings: [],
        notes: [],
    };
}

/**
 * Detect the full MJ semver in the target dir (e.g. `5.33.0`). Delegates
 * to {@link detectMJVersionString} in PackPaths so the workspace-walk
 * behavior stays in sync with {@link detectMJMajor}.
 */
const detectMJVersion = detectMJVersionString;

/** Re-export the default raw URL prefix for tests / verbose logging. */
export { buildRemoteUrlPrefix };
