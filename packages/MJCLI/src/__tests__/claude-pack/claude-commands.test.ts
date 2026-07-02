/**
 * Tests for `mj install:claude` and `mj update:claude`.
 *
 * Four layers of confidence:
 *   1. Each command class loads and exposes the expected flag set (static)
 *   2. mapFlagsToInstallOptions translates oclif flags → installPack options
 *   3. End-to-end via Command.run([...argv]) with --from --dry-run, asserting
 *      the command exercises the full orchestrator path without any FS write
 *   4. Subprocess test that spawns the actual `bin/run.js` so we can detect
 *      regressions in things only the full CLI sees (prerun hook, banner
 *      output, JSON-mode purity, etc.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import InstallClaude, { mapFlagsToInstallOptions } from '../../commands/install/claude.js';
import UpdateClaude from '../../commands/update/claude.js';

// ---------------------------------------------------------------------------
// Static / metadata tests
// ---------------------------------------------------------------------------

describe('install:claude command class', () => {
    it('exposes a description', () => {
        expect(InstallClaude.description).toMatch(/Claude Code pack/);
    });

    it('declares every §7.4 install-side flag', () => {
        const flags = Object.keys(InstallClaude.flags);
        for (const expected of [
            'dir',
            'major',
            'ref',
            'from',
            'offline',
            'dry-run',
            'yes',
            'force',
            'skip-commands',
            'skip-skills',
            'skip-settings',
            'json',
            'verbose',
        ]) {
            expect(flags).toContain(expected);
        }
    });

    it('does NOT declare update-only flags', () => {
        const flags = Object.keys(InstallClaude.flags);
        for (const not of ['check', 'refresh-commands', 'refresh-skills', 'allow-major']) {
            expect(flags).not.toContain(not);
        }
    });
});

describe('update:claude command class', () => {
    it('declares every §7.4 install flag', () => {
        const flags = Object.keys(UpdateClaude.flags);
        for (const expected of [
            'dir',
            'major',
            'ref',
            'from',
            'offline',
            'dry-run',
            'yes',
            'force',
            'skip-commands',
            'skip-skills',
            'skip-settings',
            'json',
            'verbose',
        ]) {
            expect(flags).toContain(expected);
        }
    });

    it('declares the update-only flags too', () => {
        const flags = Object.keys(UpdateClaude.flags);
        for (const expected of ['check', 'refresh-commands', 'refresh-skills', 'allow-major']) {
            expect(flags).toContain(expected);
        }
    });
});

// ---------------------------------------------------------------------------
// mapFlagsToInstallOptions
// ---------------------------------------------------------------------------

describe('mapFlagsToInstallOptions', () => {
    it('maps every flag to its installPack option name', () => {
        const opts = mapFlagsToInstallOptions({
            dir: '/some/dir',
            major: '5',
            ref: 'v5.33.0',
            from: '/local/pack',
            offline: true,
            'dry-run': true,
            force: true,
            'skip-commands': true,
            'skip-skills': true,
            'skip-settings': true,
        });
        expect(opts.TargetDir).toBe('/some/dir');
        expect(opts.Major).toBe('5');
        expect(opts.Ref).toBe('v5.33.0');
        expect(opts.FromPath).toBe('/local/pack');
        expect(opts.Offline).toBe(true);
        expect(opts.DryRun).toBe(true);
        expect(opts.Force).toBe(true);
        expect(opts.SkipCommands).toBe(true);
        expect(opts.SkipSkills).toBe(true);
        expect(opts.SkipSettings).toBe(true);
    });

    it('defaults TargetDir to "." when dir is empty/undefined', () => {
        expect(mapFlagsToInstallOptions({}).TargetDir).toBe('.');
        expect(mapFlagsToInstallOptions({ dir: '' }).TargetDir).toBe('.');
    });

    it('leaves optional string fields undefined when absent', () => {
        const opts = mapFlagsToInstallOptions({});
        expect(opts.Major).toBeUndefined();
        expect(opts.Ref).toBeUndefined();
        expect(opts.FromPath).toBeUndefined();
    });

    it('booleans default to undefined / false, not true', () => {
        const opts = mapFlagsToInstallOptions({});
        expect(opts.Offline).toBe(false);
        expect(opts.DryRun).toBe(false);
        expect(opts.Force).toBe(false);
    });

    it('passes OnProgress through when provided', () => {
        const cb = vi.fn();
        const opts = mapFlagsToInstallOptions({}, cb);
        expect(opts.OnProgress).toBe(cb);
    });
});

// ---------------------------------------------------------------------------
// End-to-end smoke: invoke the command with a real --from fixture
// ---------------------------------------------------------------------------

describe('install:claude end-to-end (via Command.run)', () => {
    let target: string;
    let packDir: string;
    let logOutput: string[];
    let origLog: typeof process.stdout.write;

    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-cmd-target-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-cmd-pack-'));
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );

        // Build a tiny valid pack in packDir
        const claudeMd = `# Project Instructions for Claude Code

<!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 mj-major=5 -->

@.claude/mj/core.md

<!-- MJ-MANAGED:CLAUDE-PACK END -->
`;
        const settings = JSON.stringify({
            __mj_managed: { version: '5.1.0', mjMajor: '5', keys: ['env.MJ_CLAUDE_PACK'] },
            env: { MJ_CLAUDE_PACK: '5.1.0' },
        });
        const fixtureFiles: Record<string, string> = {
            'CLAUDE.md': claudeMd,
            '.claude/settings.json': settings,
            '.claude/mj/core.md': '# core\n',
            '.claude/mj/VERSION': '5.1.0\n',
            '.claude/mj/README.md': '# managed\n',
        };
        for (const [rel, content] of Object.entries(fixtureFiles)) {
            const abs = path.join(packDir, ...rel.split('/'));
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, content);
        }
        const manifest = {
            packVersion: '5.1.0',
            mjMajor: '5',
            remoteUrlPrefix: 'https://example/v5/',
            files: Object.entries(fixtureFiles).map(([p, c]) => ({
                path: p,
                bytes: Buffer.byteLength(c, 'utf8'),
                sha256: createHash('sha256').update(c).digest('hex'),
            })),
        };
        writeFileSync(
            path.join(packDir, '.claude/mj/MANIFEST.json'),
            JSON.stringify(manifest, null, 2) + '\n'
        );

        // Capture this.log() output. oclif's Command.log writes directly via
        // process.stdout.write, not console.log — stub that.
        logOutput = [];
        origLog = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array, ..._rest: unknown[]) => {
            const s = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
            logOutput.push(s);
            return true;
        }) as typeof process.stdout.write;
    });

    afterEach(() => {
        process.stdout.write = origLog as typeof process.stdout.write;
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('--dry-run --from <path> --json emits a §7.5-shaped JSON result, writes nothing', async () => {
        await InstallClaude.run([
            '--dir', target,
            '--from', packDir,
            '--dry-run',
            '--json',
        ]);

        // Nothing written
        expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(false);
        expect(existsSync(path.join(target, '.claude'))).toBe(false);

        // Output was a JSON document with the right shape
        expect(logOutput.length).toBeGreaterThan(0);
        const parsed = JSON.parse(logOutput.join('\n'));
        expect(parsed).toHaveProperty('ok', true);
        expect(parsed).toHaveProperty('packVersion', '5.1.0');
        expect(parsed).toHaveProperty('actions');
        expect(parsed.actions.added.length).toBeGreaterThan(0);
    });

    it('--dry-run pretty mode logs a banner and action listing', async () => {
        await InstallClaude.run(['--dir', target, '--from', packDir, '--dry-run']);
        const text = logOutput.join('\n');
        expect(text).toContain('Claude Code pack');
        expect(text).toContain('5.1.0');
    });
});

describe('update:claude --check (via Command.run)', () => {
    let target: string;
    let packDir: string;
    let logOutput: string[];
    let origLog: typeof process.stdout.write;

    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-cmd-target-update-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-cmd-pack-update-'));
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );
        mkdirSync(path.join(target, '.claude/mj'), { recursive: true });
        writeFileSync(path.join(target, '.claude/mj/VERSION'), '5.1.0\n');

        // Build a pack at v5.2.0 so the check reports update available
        const claudeMd = `<!-- MJ-MANAGED:CLAUDE-PACK START version=5.2.0 mj-major=5 -->\n\n<!-- MJ-MANAGED:CLAUDE-PACK END -->\n`;
        const fixtureFiles: Record<string, string> = {
            'CLAUDE.md': claudeMd,
            '.claude/mj/VERSION': '5.2.0\n',
        };
        for (const [rel, content] of Object.entries(fixtureFiles)) {
            const abs = path.join(packDir, ...rel.split('/'));
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, content);
        }
        const manifest = {
            packVersion: '5.2.0',
            mjMajor: '5',
            remoteUrlPrefix: 'https://example/v5/',
            files: Object.entries(fixtureFiles).map(([p, c]) => ({
                path: p,
                bytes: Buffer.byteLength(c, 'utf8'),
                sha256: createHash('sha256').update(c).digest('hex'),
            })),
        };
        writeFileSync(
            path.join(packDir, '.claude/mj/MANIFEST.json'),
            JSON.stringify(manifest, null, 2) + '\n'
        );

        logOutput = [];
        origLog = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array, ..._rest: unknown[]) => {
            const s = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
            logOutput.push(s);
            return true;
        }) as typeof process.stdout.write;
    });

    afterEach(() => {
        process.stdout.write = origLog as typeof process.stdout.write;
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('--check --from <path> --json reports update available without writing', async () => {
        // Snapshot CLAUDE.md state — should still not exist after --check
        expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(false);

        await UpdateClaude.run(['--dir', target, '--from', packDir, '--check', '--json']);

        expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(false);

        const parsed = JSON.parse(logOutput.join('\n'));
        expect(parsed.ok).toBe(true);
        expect(parsed.packVersion).toBe('5.2.0');
        // "Update available" is informational — lands in notes, not warnings.
        const noteText = (parsed.notes as string[]).join(' ');
        expect(noteText).toContain('Update available');
        expect(noteText).toContain('5.2.0');
    });
});

// ---------------------------------------------------------------------------
// Subprocess: spawns the actual bin/run.js
// ---------------------------------------------------------------------------
//
// These tests catch regressions that only surface through the full CLI entry
// point — the prerun hook in particular. Notable past bug: the prerun hook
// printed the MJ banner ("~ M e m b e r J u n c t i o n ~" plus the userAgent)
// to stdout unconditionally, contaminating --json output and breaking
// `mj install:claude --json | jq .` for any downstream consumer. The fix was
// to skip the banner when --json is in argv. This test guards that.

describe('install:claude via spawned bin/run.js — --json purity', () => {
    let target: string;
    let packDir: string;
    const BIN = path.resolve(__dirname, '..', '..', '..', 'bin', 'run.js');

    // Spawning the full compiled CLI cold — no warm FS cache, immediately after
    // the build step writes thousands of files, under parallel-test CPU/IO
    // contention — can take far longer than vitest's 30s default in CI, even
    // though the command itself runs in ~0.1s warm. Give the subprocess a hard
    // spawnSync timeout (so a genuine hang fails fast and loud instead of
    // silently eating the test budget) and a per-test timeout above it.
    const SPAWN_TIMEOUT_MS = 60_000;
    const TEST_TIMEOUT_MS = 90_000;

    beforeEach(() => {
        target = mkdtempSync(path.join(tmpdir(), 'mj-cmd-bin-target-'));
        packDir = mkdtempSync(path.join(tmpdir(), 'mj-cmd-bin-pack-'));
        writeFileSync(
            path.join(target, 'package.json'),
            JSON.stringify({ name: 'user', dependencies: { '@memberjunction/cli': '^5.33.0' } })
        );

        const claudeMd = `<!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 mj-major=5 -->\n\n<!-- MJ-MANAGED:CLAUDE-PACK END -->\n`;
        const fixtureFiles: Record<string, string> = {
            'CLAUDE.md': claudeMd,
            '.claude/settings.json': JSON.stringify({
                __mj_managed: { version: '5.1.0', mjMajor: '5', keys: ['env.MJ_CLAUDE_PACK'] },
                env: { MJ_CLAUDE_PACK: '5.1.0' },
            }),
            '.claude/mj/VERSION': '5.1.0\n',
        };
        for (const [rel, content] of Object.entries(fixtureFiles)) {
            const abs = path.join(packDir, ...rel.split('/'));
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, content);
        }
        const manifest = {
            packVersion: '5.1.0',
            mjMajor: '5',
            remoteUrlPrefix: 'https://example/v5/',
            files: Object.entries(fixtureFiles).map(([p, c]) => ({
                path: p,
                bytes: Buffer.byteLength(c, 'utf8'),
                sha256: createHash('sha256').update(c).digest('hex'),
            })),
        };
        writeFileSync(
            path.join(packDir, '.claude/mj/MANIFEST.json'),
            JSON.stringify(manifest, null, 2) + '\n'
        );
    });

    afterEach(() => {
        rmSync(target, { recursive: true, force: true });
        rmSync(packDir, { recursive: true, force: true });
    });

    it('--json stdout is pure JSON (no banner contamination)', () => {
        // Skip if the compiled CLI binary isn't present (tests run pre-build).
        if (!existsSync(BIN)) {
            console.warn(`Skipping subprocess test — ${BIN} not found. Run \`npm run build\` first.`);
            return;
        }
        const res = spawnSync(
            process.execPath,
            [BIN, 'install:claude', '--dir', target, '--from', packDir, '--dry-run', '--json'],
            { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS }
        );
        // Surface a real hang distinctly from an assertion failure.
        expect(res.error, `CLI subprocess errored/timed out: ${res.error?.message}`).toBeUndefined();
        expect(res.status).toBe(0);

        // The contract: stdout is parseable JSON, end of story.
        // The MJ banner ("~ M e m b e r J u n c t i o n ~") + userAgent line
        // are part of the pretty mode only — they must NOT leak into --json.
        let parsed: unknown;
        try {
            parsed = JSON.parse(res.stdout);
        } catch (err) {
            throw new Error(
                `--json stdout did not parse as JSON: ${(err as Error).message}\n` +
                    `--- First 500 chars of stdout ---\n${res.stdout.slice(0, 500)}\n` +
                    `--- /stdout snippet ---`
            );
        }
        expect(parsed).toMatchObject({ ok: true, packVersion: '5.1.0' });
        // Defensive: assert the banner string is absent from stdout
        expect(res.stdout).not.toContain('~ M e m b e r J u n c t i o n ~');
        expect(res.stdout).not.toContain('MemberJunction'); // figlet banner on wide terminals
    }, TEST_TIMEOUT_MS);

    it('pretty mode (no --json) DOES include the banner — regression-safe', () => {
        if (!existsSync(BIN)) return;
        const res = spawnSync(
            process.execPath,
            [BIN, 'install:claude', '--dir', target, '--from', packDir, '--dry-run'],
            { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS }
        );
        // Surface a real hang distinctly from an assertion failure.
        expect(res.error, `CLI subprocess errored/timed out: ${res.error?.message}`).toBeUndefined();
        expect(res.status).toBe(0);
        // One of the two banner forms must be present
        const hasBanner =
            res.stdout.includes('~ M e m b e r J u n c t i o n ~') ||
            res.stdout.includes('MemberJunction');
        expect(hasBanner).toBe(true);
    }, TEST_TIMEOUT_MS);
});
