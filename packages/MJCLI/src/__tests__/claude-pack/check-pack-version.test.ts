/**
 * Tests for templates/claude-pack/check-pack-version.js — the SessionStart
 * hook helper that detects stale packs.
 *
 * Tested as a subprocess so we exercise the actual entry point users hit.
 * Network calls are routed at a local http server via MJ_PACK_CHECK_URL.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    mkdtempSync,
    rmSync,
    writeFileSync,
    readFileSync,
    existsSync,
    statSync,
    utimesSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const HELPER_SOURCE = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'templates',
    'claude-pack',
    'check-pack-version.js'
);

interface RunResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Run the helper as if it were installed in the given mjDir. The helper uses
 * `__dirname` to locate VERSION/.last-check (correct in production where it
 * lives at `.claude/mj/check-pack-version.js`), so tests must copy it into
 * mjDir before invoking.
 *
 * Uses async `spawn` (not `spawnSync`) so the test process's event loop keeps
 * turning while the child runs — required because the fake HTTP server runs
 * in this same process and would otherwise be blocked from responding to the
 * subprocess's fetch.
 */
function runHelper(mjDir: string, env: Record<string, string> = {}): Promise<RunResult> {
    const installedHelper = path.join(mjDir, 'check-pack-version.js');
    if (!existsSync(installedHelper)) {
        writeFileSync(installedHelper, readFileSync(HELPER_SOURCE));
    }
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [installedHelper], {
            cwd: mjDir,
            env: { ...process.env, ...env },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (c) => (stdout += c));
        child.stderr.on('data', (c) => (stderr += c));
        child.on('close', (code) => {
            resolve({ exitCode: code ?? -1, stdout, stderr });
        });
    });
}

/** Spin up a one-shot HTTP server returning `body` for any request. */
async function makeFakeServer(body: string, statusCode = 200): Promise<{ port: number; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        const server: Server = createServer((_req, res) => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'text/plain');
            res.end(body);
        });
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            resolve({
                port,
                close: () =>
                    new Promise<void>((resolveClose) => {
                        server.close(() => resolveClose());
                    }),
            });
        });
    });
}

describe('check-pack-version.js — short-circuit paths', () => {
    let mjDir: string;
    beforeEach(() => {
        mjDir = mkdtempSync(path.join(tmpdir(), 'pack-check-'));
    });
    afterEach(() => {
        rmSync(mjDir, { recursive: true, force: true });
    });

    it('exits 0 with no output when MJ_PACK_CHECK_DISABLE=1', async () => {
        // Even with a real-looking VERSION, the disable flag wins.
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        const r = await runHelper(mjDir, { MJ_PACK_CHECK_DISABLE: '1' });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('');
        expect(r.stderr).toBe('');
        // No cache touched
        expect(existsSync(path.join(mjDir, '.last-check'))).toBe(false);
    });

    it('exits 0 silently when VERSION file is absent', async () => {
        const r = await runHelper(mjDir);
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('exits 0 silently when VERSION file is empty', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '');
        const r = await runHelper(mjDir);
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('exits 0 silently when VERSION is non-semver (no numeric major)', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), 'not-a-version\n');
        const r = await runHelper(mjDir);
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('skips fetch when cache is fresh (< 7 days)', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        // Plant a fresh cache file (mtime = now)
        writeFileSync(path.join(mjDir, '.last-check'), '');

        // Even if a server is reachable, the script should NOT call it.
        // Point at a port that's intentionally closed.
        const r = await runHelper(mjDir, { MJ_PACK_CHECK_URL: 'http://127.0.0.1:1/' });
        expect(r.exitCode).toBe(0);
        // No notice should appear; the helper never even tried to fetch.
        expect(r.stderr).toBe('');
    });
});

describe('check-pack-version.js — network paths', () => {
    let mjDir: string;
    let server: { port: number; close: () => Promise<void> } | null;
    beforeEach(() => {
        mjDir = mkdtempSync(path.join(tmpdir(), 'pack-check-net-'));
        server = null;
    });
    afterEach(async () => {
        if (server) await server.close();
        rmSync(mjDir, { recursive: true, force: true });
    });

    it('prints stderr notice when remote version is newer', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        server = await makeFakeServer('5.2.0\n');
        const r = await runHelper(mjDir, {
            MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toContain('update available');
        expect(r.stderr).toContain('5.1.0');
        expect(r.stderr).toContain('5.2.0');
        expect(r.stderr).toContain('mj update:claude');
        // Cache was touched
        expect(existsSync(path.join(mjDir, '.last-check'))).toBe(true);
    });

    it('does NOT print a notice when remote version is the same', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        server = await makeFakeServer('5.1.0\n');
        const r = await runHelper(mjDir, {
            MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
        expect(existsSync(path.join(mjDir, '.last-check'))).toBe(true);
    });

    it('does NOT print a notice when remote version is OLDER', async () => {
        // Defensive: if some weird mirror returns an older version we still don't nag.
        writeFileSync(path.join(mjDir, 'VERSION'), '5.2.0\n');
        server = await makeFakeServer('5.1.0\n');
        const r = await runHelper(mjDir, {
            MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('refetches when cache is stale (> 7 days)', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        // Plant a STALE cache file — 8 days old
        const cachePath = path.join(mjDir, '.last-check');
        writeFileSync(cachePath, '');
        const eightDaysAgo = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
        utimesSync(cachePath, eightDaysAgo, eightDaysAgo);

        server = await makeFakeServer('5.2.0\n');
        const r = await runHelper(mjDir, {
            MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toContain('update available');
        // Cache mtime was refreshed
        const cacheStat = statSync(cachePath);
        expect(Date.now() - cacheStat.mtimeMs).toBeLessThan(5000);
    });

    it('still touches cache on a non-200 response (no notice, no retry-loop)', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        server = await makeFakeServer('not found', 404);
        const r = await runHelper(mjDir, {
            MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
        expect(existsSync(path.join(mjDir, '.last-check'))).toBe(true);
    });

    it('still touches cache on a connection error (no notice, no retry-loop)', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        // Point at an unused port — connection will refuse fast
        const r = await runHelper(mjDir, { MJ_PACK_CHECK_URL: 'http://127.0.0.1:1/' });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
        // Cache was touched defensively before the fetch
        expect(existsSync(path.join(mjDir, '.last-check'))).toBe(true);
    });

    it('handles trailing whitespace / blank lines in remote response', async () => {
        writeFileSync(path.join(mjDir, 'VERSION'), '5.1.0\n');
        server = await makeFakeServer('  5.2.0  \n\n');
        const r = await runHelper(mjDir, {
            MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
        });
        expect(r.stderr).toContain('5.2.0');
    });
});

describe('check-pack-version.js — semver comparison via runtime behavior', () => {
    // Indirectly tests compareSemver via the helper's notice-emitted decision.
    let mjDir: string;
    let server: { port: number; close: () => Promise<void> } | null;
    beforeEach(() => {
        mjDir = mkdtempSync(path.join(tmpdir(), 'pack-check-sem-'));
        server = null;
    });
    afterEach(async () => {
        if (server) await server.close();
        rmSync(mjDir, { recursive: true, force: true });
    });

    const cases: Array<{ local: string; remote: string; expectNotice: boolean; desc: string }> = [
        { local: '5.1.0', remote: '5.1.1', expectNotice: true, desc: 'patch bump' },
        { local: '5.1.0', remote: '5.2.0', expectNotice: true, desc: 'minor bump' },
        { local: '5.1.0', remote: '6.0.0', expectNotice: true, desc: 'major bump' },
        { local: '5.1.0', remote: '5.1.0', expectNotice: false, desc: 'equal' },
        { local: '5.1.1', remote: '5.1.0', expectNotice: false, desc: 'remote older patch' },
        { local: '5.2.0', remote: '5.1.9', expectNotice: false, desc: 'remote older minor' },
        { local: '10.0.0', remote: '9.9.9', expectNotice: false, desc: 'numeric (not lex) compare' },
    ];

    for (const c of cases) {
        it(`${c.desc} — local v${c.local} vs remote v${c.remote} → ${c.expectNotice ? 'notice' : 'no notice'}`, async () => {
            writeFileSync(path.join(mjDir, 'VERSION'), c.local + '\n');
            server = await makeFakeServer(c.remote + '\n');
            const r = await runHelper(mjDir, {
                MJ_PACK_CHECK_URL: `http://127.0.0.1:${server.port}/version`,
            });
            expect(r.exitCode).toBe(0);
            if (c.expectNotice) {
                expect(r.stderr).toContain('update available');
            } else {
                expect(r.stderr).toBe('');
            }
        });
    }
});
