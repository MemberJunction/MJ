/**
 * Tests for the claude-pack check group in `mj doctor`.
 *
 * Scenarios:
 *  - Project with no pack artifacts → single info-level check
 *  - Project with CLAUDE.md but no managed block → warn
 *  - Project with full healthy install → all pass
 *  - Project with drifted hash → warn lists the file
 *  - Project with valid CLAUDE.md + START marker but no END → malformed-block warn
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ClaudePackDoctor } from '../diagnostics/ClaudePackDoctor.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { Diagnostics, type DiagnosticCheck } from '../models/Diagnostics.js';

function makeDiagnostics(): Diagnostics {
    return new Diagnostics({ OS: 'test', NodeVersion: 'v22', NpmVersion: '10', Architecture: 'x64' });
}

function findCheck(d: Diagnostics, partialName: string): DiagnosticCheck | undefined {
    return d.Checks.find((c) => c.Name.includes(partialName));
}

function writeManagedFile(tmpDir: string, relPath: string, content: string): { abs: string; sha256: string; bytes: number } {
    const abs = path.join(tmpDir, relPath);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return {
        abs,
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: Buffer.byteLength(content),
    };
}

function writeFullPack(tmpDir: string): void {
    // CLAUDE.md with managed block
    writeFileSync(
        path.join(tmpDir, 'CLAUDE.md'),
        `# My project\n<!-- MJ-MANAGED:CLAUDE-PACK START packVersion=5.1.0 -->\nmanaged content\n<!-- MJ-MANAGED:CLAUDE-PACK END -->\n`
    );

    // Managed files
    const f1 = writeManagedFile(tmpDir, '.claude/mj/core.md', '# core content\n');
    const f2 = writeManagedFile(tmpDir, '.claude/mj/v5.md', '# v5 content\n');

    // VERSION
    writeFileSync(path.join(tmpDir, '.claude/mj/VERSION'), '5.1.0\n');

    // MANIFEST
    const manifest = {
        packVersion: '5.1.0',
        mjMajor: '5',
        remoteUrlPrefix: 'https://example.com/',
        files: [
            { path: '.claude/mj/core.md', bytes: f1.bytes, sha256: f1.sha256 },
            { path: '.claude/mj/v5.md', bytes: f2.bytes, sha256: f2.sha256 },
        ],
    };
    writeFileSync(path.join(tmpDir, '.claude/mj/MANIFEST.json'), JSON.stringify(manifest, null, 2));

    // SessionStart helper
    writeFileSync(path.join(tmpDir, '.claude/mj/check-pack-version.js'), '// helper\n');

    // settings.json with SessionStart hook
    const settings = {
        hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'node .claude/mj/check-pack-version.js' }] }],
        },
    };
    writeFileSync(path.join(tmpDir, '.claude/settings.json'), JSON.stringify(settings, null, 2));
}

describe('ClaudePackDoctor', () => {
    let tmp: string;
    const events: Array<{ check: string; status: string; message: string }> = [];

    const doctor = (): ClaudePackDoctor =>
        new ClaudePackDoctor(new FileSystemAdapter(), (check, status, message) => {
            events.push({ check, status, message });
        });

    beforeEach(() => {
        tmp = mkdtempSync(path.join(tmpdir(), 'cpd-test-'));
        events.length = 0;
    });

    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
    });

    describe('no pack installed', () => {
        it('emits a single info-level check and skips the rest', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);

            expect(d.Checks).toHaveLength(1);
            expect(d.Checks[0].Status).toBe('info');
            expect(d.Checks[0].Message).toMatch(/no claude pack/i);
        });

        it('emits the info check via the emit callback', async () => {
            await doctor().RunChecks(tmp, makeDiagnostics());
            expect(events).toHaveLength(1);
            expect(events[0].status).toBe('info');
        });
    });

    describe('full healthy install', () => {
        beforeEach(() => writeFullPack(tmp));

        it('emits pass checks for every component', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);

            expect(d.HasFailures).toBe(false);
            expect(d.Warnings).toHaveLength(0);
            expect(d.Checks.length).toBeGreaterThanOrEqual(6);

            expect(findCheck(d, 'managed block')?.Status).toBe('pass');
            expect(findCheck(d, 'pack version file')?.Status).toBe('pass');
            expect(findCheck(d, 'pack manifest')?.Status).toBe('pass');
            expect(findCheck(d, 'managed file integrity')?.Status).toBe('pass');
            expect(findCheck(d, 'SessionStart helper')?.Status).toBe('pass');
            expect(findCheck(d, 'SessionStart hook wired')?.Status).toBe('pass');
        });

        it('does not emit the "no pack installed" info check', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);
            expect(findCheck(d, 'install state')).toBeUndefined();
        });
    });

    describe('CLAUDE.md without managed block', () => {
        beforeEach(() => {
            writeFullPack(tmp);
            writeFileSync(path.join(tmp, 'CLAUDE.md'), '# Just plain content, no markers\n');
        });

        it('warns about missing managed block but other checks still pass', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);

            expect(findCheck(d, 'managed block')?.Status).toBe('warn');
            expect(findCheck(d, 'managed block')?.Message).toMatch(/no MJ-managed block/i);
            expect(findCheck(d, 'managed block')?.SuggestedFix).toMatch(/mj install:claude/);

            // Other checks should still pass (the .claude/mj/ artifacts are intact)
            expect(findCheck(d, 'pack manifest')?.Status).toBe('pass');
        });
    });

    describe('malformed managed block (START without END)', () => {
        beforeEach(() => {
            writeFullPack(tmp);
            writeFileSync(
                path.join(tmp, 'CLAUDE.md'),
                '# Project\n<!-- MJ-MANAGED:CLAUDE-PACK START packVersion=5.1.0 -->\ncontent but no end marker\n'
            );
        });

        it('warns about the malformed block', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);
            expect(findCheck(d, 'managed block')?.Status).toBe('warn');
            expect(findCheck(d, 'managed block')?.Message).toMatch(/malformed.*END/i);
        });
    });

    describe('drifted hash', () => {
        beforeEach(() => {
            writeFullPack(tmp);
            // Tamper with one managed file after the manifest was written
            writeFileSync(path.join(tmp, '.claude/mj/v5.md'), '# tampered content\n');
        });

        it('warns and lists the drifted file', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);
            const integrity = findCheck(d, 'managed file integrity');
            expect(integrity?.Status).toBe('warn');
            expect(integrity?.Message).toMatch(/drifted/);
            expect(integrity?.Message).toContain('.claude/mj/v5.md');
            expect(integrity?.SuggestedFix).toMatch(/mj update:claude/);
        });
    });

    describe('missing managed file (deleted from disk after install)', () => {
        beforeEach(() => {
            writeFullPack(tmp);
            // Delete one of the managed files; manifest still lists it
            rmSync(path.join(tmp, '.claude/mj/v5.md'));
        });

        it('warns and lists the missing file separately from drift', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);
            const integrity = findCheck(d, 'managed file integrity');
            expect(integrity?.Status).toBe('warn');
            expect(integrity?.Message).toMatch(/missing/);
            expect(integrity?.Message).toContain('.claude/mj/v5.md');
            expect(integrity?.SuggestedFix).toMatch(/mj update:claude/);
        });
    });

    describe('missing SessionStart hook', () => {
        beforeEach(() => {
            writeFullPack(tmp);
            // settings.json present but no hook entry
            writeFileSync(path.join(tmp, '.claude/settings.json'), JSON.stringify({ hooks: {} }, null, 2));
        });

        it('warns about the missing hook', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);
            const hook = findCheck(d, 'SessionStart hook wired');
            expect(hook?.Status).toBe('warn');
            expect(hook?.Message).toMatch(/does not reference check-pack-version/i);
        });
    });

    describe('malformed MANIFEST.json', () => {
        beforeEach(() => {
            writeFullPack(tmp);
            writeFileSync(path.join(tmp, '.claude/mj/MANIFEST.json'), '{not valid json');
        });

        it('warns about the invalid manifest and skips hash checks', async () => {
            const d = makeDiagnostics();
            await doctor().RunChecks(tmp, d);
            expect(findCheck(d, 'pack manifest')?.Status).toBe('warn');
            // Hash check is skipped when manifest is invalid
            expect(findCheck(d, 'managed file integrity')).toBeUndefined();
        });
    });
});
