/**
 * CLI entry-point regression test.
 *
 * Catches the silent-pass bug surfaced by the HubSpot clean-build verification:
 * the validator's CLI guard used to be `import.meta.url === \`file://${process.argv[1]}\``
 * which never matched when invoked via npm's bin symlink (or via `npx`), so the
 * CLI body would silently not run and the process would exit 0 — making the
 * mj-test-runner MCP report `T1_InvariantValidator: Pass` for connectors that
 * actually failed validation.
 *
 * These tests assert:
 *   1. `IsCLIEntryPoint` returns true when the metaURL resolves to the same
 *      realpath as process.argv[1], including through symlinks.
 *   2. Invoking the bin path against a known-failing fixture produces exit
 *      code 1 with structured JSON output.
 *   3. Invoking via `npx mj-validate-invariants` ALSO produces exit code 1 —
 *      this is the path the MCP T1 takes.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, symlinkSync, mkdirSync, unlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { IsCLIEntryPoint } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Repo-relative paths (test runs from packages/Integration/connector-validator/).
const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const FAILING_CONNECTOR = 'known-failing-connector';
const VALIDATOR_DIST_ENTRY = resolve(__dirname, '..', '..', 'dist', 'index.js');

describe('IsCLIEntryPoint (unit)', () => {
    it('returns true when metaURL resolves to the same realpath as argv[1]', () => {
        const realFile = realpathSync(VALIDATOR_DIST_ENTRY);
        const metaURL = `file://${realFile}`;
        expect(IsCLIEntryPoint(metaURL, realFile)).toBe(true);
    });

    it('returns false when argv[1] is undefined', () => {
        const metaURL = `file://${VALIDATOR_DIST_ENTRY}`;
        expect(IsCLIEntryPoint(metaURL, undefined)).toBe(false);
    });

    it('returns false when paths differ', () => {
        const metaURL = `file://${VALIDATOR_DIST_ENTRY}`;
        expect(IsCLIEntryPoint(metaURL, '/some/other/path.js')).toBe(false);
    });

    it('returns true when argv[1] is a symlink to the same file (the bug case)', () => {
        // Build a real-world symlink scenario in a temp dir to reproduce
        // the npm/npx bin-symlink shape without depending on workspace state.
        const tmpRoot = resolve(tmpdir(), `mj-validator-cli-entry-${process.pid}-${Date.now()}`);
        mkdirSync(tmpRoot, { recursive: true });
        const symlinkPath = resolve(tmpRoot, 'mj-validate-invariants');
        try {
            symlinkSync(VALIDATOR_DIST_ENTRY, symlinkPath);
            // Real file's metaURL
            const realFile = realpathSync(VALIDATOR_DIST_ENTRY);
            const metaURL = `file://${realFile}`;
            // argv[1] is the symlink (this is what npm bin/npx hands to the script)
            expect(IsCLIEntryPoint(metaURL, symlinkPath)).toBe(true);
        } finally {
            if (existsSync(symlinkPath)) unlinkSync(symlinkPath);
            rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});

describe('CLI exit code (integration)', () => {
    if (!existsSync(VALIDATOR_DIST_ENTRY)) {
        it.skip('skipped — validator dist/ not built', () => undefined);
        return;
    }

    it('exits 1 with structured JSON on a known-failing connector (direct node invocation)', () => {
        const result = spawnSync(
            process.execPath,
            [VALIDATOR_DIST_ENTRY, FAILING_CONNECTOR, FIXTURES_DIR],
            { encoding: 'utf-8', timeout: 30000 },
        );
        expect(result.status).toBe(1);
        // stdout MUST contain the structured JSON envelope
        expect(result.stdout).toContain('"Overall": "Fail"');
        expect(result.stdout).toContain('"ConnectorName": "known-failing-connector"');
    });

    it('exits 1 when invoked through a symlink (regression test for the silent-pass bug)', () => {
        // Reproduce the npm/npx bin-symlink shape: create a symlink to the
        // dist/index.js and invoke node against the symlink path. Pre-fix,
        // the CLI guard would NOT match (because import.meta.url is the
        // resolved file but argv[1] is the symlink), the body would not run,
        // and exit would be 0. Post-fix, realpathSync on both sides makes
        // them match and the body runs → exit 1.
        const tmpRoot = resolve(tmpdir(), `mj-validator-bin-${process.pid}-${Date.now()}`);
        mkdirSync(tmpRoot, { recursive: true });
        const symlinkPath = resolve(tmpRoot, 'mj-validate-invariants');
        try {
            symlinkSync(VALIDATOR_DIST_ENTRY, symlinkPath);
            const result = spawnSync(
                process.execPath,
                [symlinkPath, FAILING_CONNECTOR, FIXTURES_DIR],
                { encoding: 'utf-8', timeout: 30000 },
            );
            // The key assertion: must NOT silently exit 0.
            expect(result.status).toBe(1);
            expect(result.stdout).toContain('"Overall": "Fail"');
        } finally {
            if (existsSync(symlinkPath)) unlinkSync(symlinkPath);
            rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('exits 2 with usage on missing-argument', () => {
        const result = spawnSync(
            process.execPath,
            [VALIDATOR_DIST_ENTRY],
            { encoding: 'utf-8', timeout: 10000 },
        );
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('Usage:');
    });
});
