/**
 * Doctor checks for the Claude Code pack — verifies that an MJ project's
 * `.claude/mj/` bundle, managed `CLAUDE.md` block, and SessionStart hook
 * are intact.
 *
 * Severity policy: "no pack installed" is **info**, not a warning. Many
 * projects deliberately opt out. A partial install (CLAUDE.md says one
 * thing but `.claude/mj/` says another) is a **warn**. Tampered file
 * hashes are a **warn** so users can re-run `mj install:claude` to fix.
 *
 * Consumed by `InstallerEngine.Doctor()`. Pure logic + injected
 * `FileSystemAdapter` so it's unit-testable without spawning the engine.
 */

import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { Diagnostics } from '../models/Diagnostics.js';

/** Severity flavors emitted by this doctor module. Mirrors `DiagnosticCheck.Status`. */
type DoctorStatus = 'pass' | 'fail' | 'warn' | 'info';

/** Signature for the engine's `emitDiagnostic` callback. */
type EmitDiagnostic = (
    check: string,
    status: DoctorStatus,
    message: string,
    suggestedFix?: string
) => void;

/**
 * One file entry inside the pack's `MANIFEST.json`. Inlined here rather than
 * imported from `@memberjunction/cli` to avoid a circular dependency.
 */
interface ManifestEntry {
    path: string;
    bytes: number;
    sha256: string;
}

/** Top-level shape of `.claude/mj/MANIFEST.json`. */
interface Manifest {
    packVersion: string;
    mjMajor: string;
    remoteUrlPrefix: string;
    files: ManifestEntry[];
}

/** Regex for the managed-block START / END markers in CLAUDE.md. */
const MANAGED_START_RE = /<!--\s*MJ-MANAGED:CLAUDE-PACK\s+START[^>]*-->/;
const MANAGED_END_RE = /<!--\s*MJ-MANAGED:CLAUDE-PACK\s+END\s*-->/;

const CHECK_GROUP = 'Claude pack';

/**
 * Files that the install/update pipeline intentionally MERGES with user
 * content (rather than overwriting verbatim). Hash-checking them against
 * the manifest would always flag false-positive drift. Their integrity is
 * still verified — just by semantic checks elsewhere in this module
 * (managed-block presence, SessionStart hook wired).
 */
const MERGEABLE_FILES = new Set<string>([
    'CLAUDE.md',
    '.claude/settings.json',
]);

/**
 * Runs the claude-pack diagnostic check group against a target directory.
 *
 * Stateless once constructed — each `.RunChecks()` call is independent.
 */
export class ClaudePackDoctor {
    constructor(
        private readonly fs: FileSystemAdapter,
        private readonly emit: EmitDiagnostic
    ) {}

    /**
     * Inspect the target directory for an MJ Claude pack install and add
     * diagnostic checks to `diagnostics`. Emits real-time events via the
     * engine's `emitDiagnostic` callback.
     */
    public async RunChecks(targetDir: string, diagnostics: Diagnostics): Promise<void> {
        const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
        const mjDir = path.join(targetDir, '.claude', 'mj');
        const versionPath = path.join(mjDir, 'VERSION');
        const manifestPath = path.join(mjDir, 'MANIFEST.json');
        const hookPath = path.join(mjDir, 'check-pack-version.js');
        const settingsPath = path.join(targetDir, '.claude', 'settings.json');

        const claudeMdExists = await this.fs.FileExists(claudeMdPath);
        const versionExists = await this.fs.FileExists(versionPath);
        const manifestExists = await this.fs.FileExists(manifestPath);
        const hookExists = await this.fs.FileExists(hookPath);

        // Detect whether any pack-related artifact is present at all
        const anyArtifact = claudeMdExists || versionExists || manifestExists || hookExists;
        if (!anyArtifact) {
            this.add(diagnostics, {
                Name: `${CHECK_GROUP}: install state`,
                Status: 'info',
                Message: 'No Claude pack installed. Optional — run `mj install:claude` to add curated guidance for Claude Code.',
            });
            return;
        }

        await this.checkManagedBlock(claudeMdPath, claudeMdExists, diagnostics);
        await this.checkVersionFile(versionPath, versionExists, diagnostics);
        const manifest = await this.checkManifestFile(manifestPath, manifestExists, diagnostics);
        await this.checkManagedFileHashes(targetDir, manifest, diagnostics);
        this.checkHookHelper(hookExists, diagnostics);
        await this.checkSessionStartHook(settingsPath, diagnostics);
    }

    /** Verifies CLAUDE.md exists and contains both START and END managed-block markers. */
    private async checkManagedBlock(
        claudeMdPath: string,
        exists: boolean,
        diagnostics: Diagnostics
    ): Promise<void> {
        const name = `${CHECK_GROUP}: CLAUDE.md managed block`;
        if (!exists) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: 'CLAUDE.md is missing but other pack artifacts are present.',
                SuggestedFix: 'Run `mj install:claude` to restore CLAUDE.md.',
            });
            return;
        }

        const content = await this.fs.ReadText(claudeMdPath);
        const hasStart = MANAGED_START_RE.test(content);
        const hasEnd = MANAGED_END_RE.test(content);

        if (hasStart && hasEnd) {
            this.add(diagnostics, {
                Name: name,
                Status: 'pass',
                Message: 'CLAUDE.md has the MJ-managed block markers.',
            });
        } else if (!hasStart && !hasEnd) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: 'CLAUDE.md exists but has no MJ-managed block. The pack was removed or never installed.',
                SuggestedFix: 'Run `mj install:claude` to add the managed block (preserves your existing content).',
            });
        } else {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: `CLAUDE.md managed block is malformed: ${hasStart ? 'START' : 'END'} marker is present but the matching ${hasStart ? 'END' : 'START'} marker is missing.`,
                SuggestedFix: 'Run `mj install:claude` to rewrite the managed block cleanly.',
            });
        }
    }

    /** Verifies `.claude/mj/VERSION` exists and parses as a semver-ish version. */
    private async checkVersionFile(
        versionPath: string,
        exists: boolean,
        diagnostics: Diagnostics
    ): Promise<void> {
        const name = `${CHECK_GROUP}: pack version file`;
        if (!exists) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: '.claude/mj/VERSION is missing.',
                SuggestedFix: 'Run `mj install:claude` to restore the managed bundle.',
            });
            return;
        }

        const raw = (await this.fs.ReadText(versionPath)).trim();
        if (!/^\d+\.\d+\.\d+/.test(raw)) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: `.claude/mj/VERSION does not contain a valid semver: "${raw}".`,
                SuggestedFix: 'Run `mj install:claude` to overwrite with a known-good VERSION.',
            });
            return;
        }

        this.add(diagnostics, {
            Name: name,
            Status: 'pass',
            Message: `Pack version: ${raw}`,
        });
    }

    /**
     * Verifies `.claude/mj/MANIFEST.json` exists, parses, and has the
     * expected shape. Returns the parsed manifest (or `null` if invalid)
     * so downstream hash checks can run.
     */
    private async checkManifestFile(
        manifestPath: string,
        exists: boolean,
        diagnostics: Diagnostics
    ): Promise<Manifest | null> {
        const name = `${CHECK_GROUP}: pack manifest`;
        if (!exists) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: '.claude/mj/MANIFEST.json is missing.',
                SuggestedFix: 'Run `mj install:claude` to restore the managed bundle.',
            });
            return null;
        }

        let parsed: Manifest;
        try {
            parsed = await this.fs.ReadJSON<Manifest>(manifestPath);
        } catch (err) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: `.claude/mj/MANIFEST.json is not valid JSON: ${(err as Error).message}`,
                SuggestedFix: 'Run `mj install:claude` to rewrite the manifest.',
            });
            return null;
        }

        if (!Array.isArray(parsed.files) || typeof parsed.packVersion !== 'string') {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: '.claude/mj/MANIFEST.json is missing required fields (packVersion, files).',
                SuggestedFix: 'Run `mj install:claude` to rewrite the manifest.',
            });
            return null;
        }

        this.add(diagnostics, {
            Name: name,
            Status: 'pass',
            Message: `Manifest lists ${parsed.files.length} managed file(s) at pack v${parsed.packVersion}.`,
        });
        return parsed;
    }

    /**
     * For each file listed in the manifest, computes its sha256 and
     * compares to the recorded hash. Surfaces drift (which usually means
     * a user hand-edited a managed file).
     */
    private async checkManagedFileHashes(
        targetDir: string,
        manifest: Manifest | null,
        diagnostics: Diagnostics
    ): Promise<void> {
        if (!manifest) return;

        const name = `${CHECK_GROUP}: managed file integrity`;
        const drifted: string[] = [];
        const missing: string[] = [];
        let checked = 0;

        for (const entry of manifest.files) {
            // Skip files that the install pipeline merges with user content.
            // Their integrity is verified by semantic checks (managed-block, SessionStart hook).
            if (MERGEABLE_FILES.has(entry.path)) continue;

            checked++;
            const absPath = path.join(targetDir, entry.path);
            if (!(await this.fs.FileExists(absPath))) {
                missing.push(entry.path);
                continue;
            }
            const actual = await this.computeSha256(absPath);
            if (actual !== entry.sha256) {
                drifted.push(entry.path);
            }
        }

        if (missing.length === 0 && drifted.length === 0) {
            this.add(diagnostics, {
                Name: name,
                Status: 'pass',
                Message: `All ${checked} managed file(s) match their recorded sha256.`,
            });
            return;
        }

        const messages: string[] = [];
        if (missing.length > 0) messages.push(`${missing.length} missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`);
        if (drifted.length > 0) messages.push(`${drifted.length} drifted: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? '…' : ''}`);

        this.add(diagnostics, {
            Name: name,
            Status: 'warn',
            Message: messages.join('; '),
            SuggestedFix: 'Run `mj update:claude` to restore managed files to their manifest-recorded contents.',
        });
    }

    /** Verifies the SessionStart staleness-check helper is present. */
    private checkHookHelper(hookExists: boolean, diagnostics: Diagnostics): void {
        const name = `${CHECK_GROUP}: SessionStart helper`;
        if (hookExists) {
            this.add(diagnostics, {
                Name: name,
                Status: 'pass',
                Message: '.claude/mj/check-pack-version.js is installed.',
            });
        } else {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: '.claude/mj/check-pack-version.js is missing.',
                SuggestedFix: 'Run `mj install:claude` to restore the SessionStart helper.',
            });
        }
    }

    /**
     * Verifies `.claude/settings.json` declares a SessionStart hook that
     * invokes `node .claude/mj/check-pack-version.js`. Absence is a warn
     * because the pack still works — users just miss out on upgrade nudges.
     */
    private async checkSessionStartHook(
        settingsPath: string,
        diagnostics: Diagnostics
    ): Promise<void> {
        const name = `${CHECK_GROUP}: SessionStart hook wired`;
        if (!(await this.fs.FileExists(settingsPath))) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: '.claude/settings.json is missing; SessionStart hook will not fire.',
                SuggestedFix: 'Run `mj install:claude` to restore settings.json with the SessionStart hook.',
            });
            return;
        }

        let settings: { hooks?: { SessionStart?: unknown } };
        try {
            settings = await this.fs.ReadJSON(settingsPath);
        } catch (err) {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: `.claude/settings.json is not valid JSON: ${(err as Error).message}`,
                SuggestedFix: 'Fix the JSON or re-run `mj install:claude`.',
            });
            return;
        }

        const serialized = JSON.stringify(settings.hooks?.SessionStart ?? '');
        if (serialized.includes('check-pack-version.js')) {
            this.add(diagnostics, {
                Name: name,
                Status: 'pass',
                Message: 'SessionStart hook references check-pack-version.js.',
            });
        } else {
            this.add(diagnostics, {
                Name: name,
                Status: 'warn',
                Message: 'SessionStart hook does not reference check-pack-version.js.',
                SuggestedFix: 'Run `mj install:claude` to re-merge the SessionStart hook into settings.json.',
            });
        }
    }

    /** Helper to add a check AND emit a real-time diagnostic event. */
    private add(
        diagnostics: Diagnostics,
        check: { Name: string; Status: DoctorStatus; Message: string; SuggestedFix?: string }
    ): void {
        diagnostics.AddCheck(check);
        this.emit(check.Name, check.Status, check.Message, check.SuggestedFix);
    }

    /** Computes the hex sha256 of a file's bytes. */
    private async computeSha256(filePath: string): Promise<string> {
        const bytes = await this.fs.ReadBytes(filePath);
        return createHash('sha256').update(bytes).digest('hex');
    }
}
