/**
 * Formal vitest coverage for `templates/claude-pack/build-pack.mjs` —
 * deferred from Milestone 1 per the plan's §11.1 "build-pack.test.ts"
 * row and the M1 decision to "defer to Milestone 3" once MJCLI's vitest
 * suite came online.
 *
 * Tests run against an isolated copy of `templates/claude-pack/` placed in
 * a temp directory, so the real source tree is never mutated and the real
 * `dist/v5/` is never regenerated under tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PACK_SRC = path.join(REPO_ROOT, 'templates', 'claude-pack');

function copyPackSource(toDir: string): void {
    // Copy everything except the existing dist/ — tests build fresh.
    cpSync(PACK_SRC, toDir, {
        recursive: true,
        filter: (src) => !src.includes(`${path.sep}dist${path.sep}`) && !src.endsWith(`${path.sep}dist`),
    });
}

function runBuild(packDir: string, args: string[] = []): { code: number; stdout: string; stderr: string } {
    const res = spawnSync(process.execPath, [path.join(packDir, 'build-pack.mjs'), ...args], {
        cwd: packDir,
        encoding: 'utf8',
    });
    return { code: res.status ?? 0, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function listFilesRel(rootDir: string): string[] {
    const out: string[] = [];
    function recurse(cur: string) {
        for (const name of readdirSync(cur)) {
            const abs = path.join(cur, name);
            const st = statSync(abs);
            if (st.isDirectory()) recurse(abs);
            else out.push(path.relative(rootDir, abs).split(path.sep).join('/'));
        }
    }
    if (existsSync(rootDir)) recurse(rootDir);
    return out.sort();
}

function treeHash(rootDir: string): string {
    const files = listFilesRel(rootDir);
    const h = createHash('sha256');
    for (const rel of files) {
        const abs = path.join(rootDir, ...rel.split('/'));
        h.update(rel);
        h.update('\0');
        h.update(readFileSync(abs));
        h.update('\0');
    }
    return h.digest('hex');
}

describe('build-pack.mjs', () => {
    let sandbox: string;
    beforeEach(() => {
        sandbox = mkdtempSync(path.join(tmpdir(), 'build-pack-test-'));
        copyPackSource(sandbox);
    });
    afterEach(() => {
        rmSync(sandbox, { recursive: true, force: true });
    });

    // ───────────────────────────────────────────────────────────────────
    // Success path
    // ───────────────────────────────────────────────────────────────────
    describe('success path', () => {
        it('produces dist/v5/ with the expected file set', () => {
            const { code } = runBuild(sandbox);
            expect(code).toBe(0);
            const dist = path.join(sandbox, 'dist', 'v5');
            const files = listFilesRel(dist);
            // Minimum file set per plan §3.2
            expect(files).toContain('CLAUDE.md');
            expect(files).toContain('.claude/settings.json');
            expect(files).toContain('.claude/mj/core.md');
            expect(files).toContain('.claude/mj/v5.md');
            expect(files).toContain('.claude/mj/VERSION');
            expect(files).toContain('.claude/mj/README.md');
            expect(files).toContain('.claude/mj/REMOTE.md');
            expect(files).toContain('.claude/mj/MANIFEST.json');
        });

        it('renders all {{...}} placeholders in CLAUDE.md and settings.json', () => {
            runBuild(sandbox);
            const claudeMd = readFileSync(path.join(sandbox, 'dist/v5/CLAUDE.md'), 'utf8');
            const settings = readFileSync(path.join(sandbox, 'dist/v5/.claude/settings.json'), 'utf8');
            expect(claudeMd).not.toMatch(/\{\{[A-Z_]+\}\}/);
            expect(settings).not.toMatch(/\{\{[A-Z_]+\}\}/);
        });

        it('stamps PACK_VERSION into the VERSION file', () => {
            runBuild(sandbox);
            const source = readFileSync(
                path.join(sandbox, 'versions/v5/PACK_VERSION'),
                'utf8'
            ).trim();
            const dist = readFileSync(path.join(sandbox, 'dist/v5/.claude/mj/VERSION'), 'utf8').trim();
            expect(dist).toBe(source);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // Determinism (the property the CI gate relies on)
    // ───────────────────────────────────────────────────────────────────
    describe('determinism', () => {
        it('two consecutive builds produce byte-identical output', () => {
            expect(runBuild(sandbox).code).toBe(0);
            const hashA = treeHash(path.join(sandbox, 'dist', 'v5'));
            expect(runBuild(sandbox).code).toBe(0);
            const hashB = treeHash(path.join(sandbox, 'dist', 'v5'));
            expect(hashA).toBe(hashB);
        });

        it('--major 5 explicit produces same output as default discovery', () => {
            expect(runBuild(sandbox).code).toBe(0);
            const hashDefault = treeHash(path.join(sandbox, 'dist', 'v5'));
            rmSync(path.join(sandbox, 'dist'), { recursive: true, force: true });
            expect(runBuild(sandbox, ['--major', '5']).code).toBe(0);
            const hashExplicit = treeHash(path.join(sandbox, 'dist', 'v5'));
            expect(hashDefault).toBe(hashExplicit);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // Manifest integrity
    // ───────────────────────────────────────────────────────────────────
    describe('MANIFEST.json integrity', () => {
        it('every manifest entry has a matching sha256 and byte length', () => {
            runBuild(sandbox);
            const distDir = path.join(sandbox, 'dist/v5');
            const manifest = JSON.parse(readFileSync(path.join(distDir, '.claude/mj/MANIFEST.json'), 'utf8'));
            for (const entry of manifest.files) {
                const abs = path.join(distDir, ...entry.path.split('/'));
                const bytes = readFileSync(abs);
                const sha = createHash('sha256').update(bytes).digest('hex');
                expect(sha).toBe(entry.sha256);
                expect(bytes.length).toBe(entry.bytes);
            }
        });

        it('manifest does not contain itself', () => {
            runBuild(sandbox);
            const manifest = JSON.parse(
                readFileSync(path.join(sandbox, 'dist/v5/.claude/mj/MANIFEST.json'), 'utf8')
            );
            expect(manifest.files.some((f: { path: string }) => f.path.endsWith('MANIFEST.json'))).toBe(false);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // Error paths
    // ───────────────────────────────────────────────────────────────────
    describe('error paths', () => {
        it('fails with a clear error when versions/v5/PACK_VERSION is missing', () => {
            rmSync(path.join(sandbox, 'versions/v5/PACK_VERSION'));
            const { code, stderr, stdout } = runBuild(sandbox);
            expect(code).not.toBe(0);
            expect(stderr + stdout).toMatch(/PACK_VERSION|ENOENT/);
        });

        it('fails when PACK_VERSION major does not match the folder name', () => {
            writeFileSync(path.join(sandbox, 'versions/v5/PACK_VERSION'), '6.0.0\n');
            const { code, stderr, stdout } = runBuild(sandbox);
            expect(code).not.toBe(0);
            expect(stderr + stdout).toMatch(/major/i);
        });

        it('fails when the overlay file is missing', () => {
            rmSync(path.join(sandbox, 'versions/v5/overlay.md'));
            const { code, stderr, stdout } = runBuild(sandbox);
            expect(code).not.toBe(0);
            expect(stderr + stdout).toMatch(/overlay|ENOENT/i);
        });

        it('fails on an unknown --major', () => {
            const { code, stderr, stdout } = runBuild(sandbox, ['--major', '99']);
            expect(code).not.toBe(0);
            expect(stderr + stdout).toMatch(/v99|ENOENT|PACK_VERSION/i);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // Multi-major build (future-proofing for v6)
    // ───────────────────────────────────────────────────────────────────
    describe('multi-major', () => {
        function addV6Fixture() {
            const v6 = path.join(sandbox, 'versions', 'v6');
            cpSync(path.join(sandbox, 'versions', 'v5'), v6, { recursive: true });
            writeFileSync(path.join(v6, 'PACK_VERSION'), '6.0.0\n');
            writeFileSync(
                path.join(v6, 'overlay.md'),
                '# v6 overlay fixture\n\nUNIQUE-MARKER-V6\n'
            );
        }

        it('default build produces both dist/v5 and dist/v6', () => {
            addV6Fixture();
            expect(runBuild(sandbox).code).toBe(0);
            expect(existsSync(path.join(sandbox, 'dist/v5/CLAUDE.md'))).toBe(true);
            expect(existsSync(path.join(sandbox, 'dist/v6/CLAUDE.md'))).toBe(true);
        });

        it('each major gets its own overlay (no cross-contamination)', () => {
            addV6Fixture();
            runBuild(sandbox);
            const v5overlay = readFileSync(
                path.join(sandbox, 'dist/v5/.claude/mj/v5.md'),
                'utf8'
            );
            const v6overlay = readFileSync(
                path.join(sandbox, 'dist/v6/.claude/mj/v6.md'),
                'utf8'
            );
            expect(v6overlay).toContain('UNIQUE-MARKER-V6');
            expect(v5overlay).not.toContain('UNIQUE-MARKER-V6');
        });

        it('--major 6 builds only v6', () => {
            addV6Fixture();
            // Touch nothing first
            runBuild(sandbox);
            const v5HashBefore = treeHash(path.join(sandbox, 'dist', 'v5'));

            // Re-run with --major 6, then check v5 unchanged
            const { code } = runBuild(sandbox, ['--major', '6']);
            expect(code).toBe(0);
            const v5HashAfter = treeHash(path.join(sandbox, 'dist', 'v5'));
            expect(v5HashBefore).toBe(v5HashAfter);
            expect(existsSync(path.join(sandbox, 'dist/v6/.claude/mj/v6.md'))).toBe(true);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // commands/skills verbatim copy (tested via fixture injection)
    // ───────────────────────────────────────────────────────────────────
    describe('commands/skills copy', () => {
        it('copies a command fixture verbatim to dist', () => {
            writeFileSync(
                path.join(sandbox, 'commands', 'test-cmd.md'),
                '# /test-cmd\nfixture command\n'
            );
            runBuild(sandbox);
            const dist = readFileSync(
                path.join(sandbox, 'dist/v5/.claude/commands/test-cmd.md'),
                'utf8'
            );
            expect(dist).toBe('# /test-cmd\nfixture command\n');
        });

        it('does NOT copy .gitkeep files to dist', () => {
            runBuild(sandbox);
            expect(existsSync(path.join(sandbox, 'dist/v5/.claude/commands/.gitkeep'))).toBe(false);
            expect(existsSync(path.join(sandbox, 'dist/v5/.claude/skills/.gitkeep'))).toBe(false);
        });
    });
});
