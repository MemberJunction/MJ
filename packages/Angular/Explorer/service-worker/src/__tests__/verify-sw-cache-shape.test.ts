import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * End-to-end test for the verify-sw-cache-shape.js CI gate.
 *
 * Spawns the script as a child process against synthetic dist directories
 * and asserts the exit code + diagnostic output. This is the most honest way
 * to test it — same code path as a real `npm run postbuild` invocation.
 *
 * Why this matters: the gate is the only thing standing between us and a
 * silently-broken SW cache when Angular's build output naming changes (e.g.
 * a future major release introduces `runtime-*` or `vendor-*` chunks). If
 * the gate breaks itself, future Angular upgrades could quietly bypass it.
 */

const SCRIPT_PATH = resolve(__dirname, '../../scripts/verify-sw-cache-shape.js');

let workDir: string;

beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'verify-sw-cache-shape-'));
});

afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
});

function makeDist(files: string[]): string {
    const dist = join(workDir, 'browser');
    mkdirSync(dist, { recursive: true });
    for (const f of files) {
        writeFileSync(join(dist, f), '/* test fixture */');
    }
    return dist;
}

function runScript(distPath: string) {
    return spawnSync('node', [SCRIPT_PATH, distPath], { encoding: 'utf8' });
}

describe('verify-sw-cache-shape.js', () => {
    it('exits 0 on a known-good dist with all expected prefixes', () => {
        const dist = makeDist([
            'main-ABC12345.js',
            'polyfills-DEF67890.js',
            'styles-GHI12345.css',
            'chunk-JKL67890.js',
            'chunk-MNO12345.js',
            // SW infrastructure files — should be ignored, not flagged
            'ngsw-worker.js',
            'ngsw.json',
            'safety-worker.js',
            'worker-basic.min.js',
        ]);
        const r = runScript(dist);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('verified');
    });

    it('exits 0 on a minimal dist (just shell + one chunk)', () => {
        const dist = makeDist([
            'main-AAA11111.js',
            'polyfills-BBB22222.js',
            'styles-CCC33333.css',
        ]);
        const r = runScript(dist);
        expect(r.status).toBe(0);
    });

    it('exits 1 when an unrecognized JS prefix appears (e.g. future runtime-*)', () => {
        const dist = makeDist([
            'main-ABC12345.js',
            'polyfills-DEF67890.js',
            'styles-GHI12345.css',
            'runtime-FAKE9999.js',  // unknown prefix
        ]);
        const r = runScript(dist);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('runtime-FAKE9999.js');
        expect(r.stderr).toContain('Unrecognized .js prefixes');
    });

    it('exits 1 when an unrecognized CSS prefix appears', () => {
        const dist = makeDist([
            'main-ABC12345.js',
            'theme-OOPS1234.css',  // unknown CSS prefix
        ]);
        const r = runScript(dist);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('theme-OOPS1234.css');
        expect(r.stderr).toContain('Unrecognized .css prefixes');
    });

    it('lists multiple unrecognized files in a single error report', () => {
        const dist = makeDist([
            'main-ABC12345.js',
            'runtime-1.js',
            'vendor-2.js',
        ]);
        const r = runScript(dist);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('runtime-1.js');
        expect(r.stderr).toContain('vendor-2.js');
    });

    it('ignores SW infrastructure files (managed by the SW itself)', () => {
        // SW-managed files should never trigger the gate even though they
        // sit at the dist root and don't match any KNOWN_JS_PREFIXES.
        const dist = makeDist([
            'main-ABC12345.js',
            'ngsw-worker.js',
            'ngsw.json',  // non-.js, but mentioned in the ignore set anyway
            'safety-worker.js',
            'worker-basic.min.js',
        ]);
        const r = runScript(dist);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('SW infrastructure files ignored');
    });

    it('exits 1 when no dist path is provided', () => {
        const r = spawnSync('node', [SCRIPT_PATH], { encoding: 'utf8' });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('Usage');
    });

    it('exits 1 when the dist path does not exist', () => {
        const r = runScript(join(workDir, 'does-not-exist'));
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('not found');
    });

    it('produces a useful "what to do" message in the error output', () => {
        const dist = makeDist(['main-OK.js', 'mystery-XYZ.js']);
        const r = runScript(dist);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('ngsw-config.json');
        expect(r.stderr).toContain('KNOWN_JS_PREFIXES');
    });
});
