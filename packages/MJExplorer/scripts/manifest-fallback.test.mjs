/**
 * Tests for manifest-fallback.mjs: the build fails when Open App client packages are configured,
 * and keeps today's warning otherwise. Run with `node --test "scripts/*.test.mjs"`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./manifest-fallback.mjs', import.meta.url));

/** Runs the script in a temp dir holding the given mj.config.cjs body (or none). */
function runWith(configBody, { manifest } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'mj-manifest-fallback-'));
    try {
        if (configBody != null) {
            writeFileSync(join(dir, 'mj.config.cjs'), `module.exports = ${configBody};\n`);
        }
        const output = join(dir, 'out', 'manifest.ts');
        if (manifest != null) {
            spawnSync(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(join(dir, 'out'))});require('fs').writeFileSync(${JSON.stringify(output)}, ${JSON.stringify(manifest)})`]);
        }
        const result = spawnSync(process.execPath, [script, '--output', output], { cwd: dir, encoding: 'utf8' });
        return {
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            manifest: existsSync(output) ? readFileSync(output, 'utf8') : null,
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('fails the build when an enabled Open App client package is configured', () => {
    const r = runWith(`{ dynamicPackages: { client: [{ PackageName: '@acme/sample-app-ng', AppName: 'Sample App' }] } }`);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /@acme\/sample-app-ng \(Sample App\)/);
    assert.equal(r.manifest, null, 'does not write a manifest on failure');
});

test('keeps the warning and exits 0 when no client packages are configured', () => {
    const r = runWith(`{ dynamicPackages: { server: [{ PackageName: '@acme/sample-app-server' }] } }`);
    assert.equal(r.status, 0);
    assert.match(r.stderr + r.stdout, /using existing manifest/);
});

test('exits 0 when every client package is disabled', () => {
    const r = runWith(`{ dynamicPackages: { client: [{ PackageName: '@acme/sample-app-ng', Enabled: false }] } }`);
    assert.equal(r.status, 0);
});

test('exits 0 with no mj config at all', () => {
    // A temp dir under the OS temp folder has no mj config above it.
    const r = runWith(null);
    assert.equal(r.status, 0);
});

test('writes the empty manifest when none exists, and leaves an existing one alone', () => {
    const fresh = runWith(`{}`);
    assert.match(fresh.manifest ?? '', /CLASS_REGISTRATIONS_COUNT = 0/);

    const existing = runWith(`{}`, { manifest: '// real manifest\n' });
    assert.equal(existing.manifest, '// real manifest\n');
});
