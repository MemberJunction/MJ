/**
 * `ResolveExtractorScriptPath` regression test.
 *
 * Catches the .ts/.mts mismatch surfaced by the HubSpot clean-build:
 * the IOIOFExtractor agent legitimately emits `extract-io-iof.mts` when
 * the script needs to import subpath-exported ESM packages, but the
 * validator hardcoded `.ts`. The mismatch made Invariant 1b report
 * "fabrication-by-self-citation" against a script that actually existed —
 * just under the other extension.
 *
 * These tests assert:
 *   1. When only `extract-io-iof.ts` exists → returns the `.ts` path.
 *   2. When only `extract-io-iof.mts` exists → returns the `.mts` path.
 *   3. When BOTH exist → returns the `.ts` path (canonical).
 *   4. When NEITHER exists → returns the canonical `.ts` path so the
 *      "script absent" error surfaces deterministically.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ResolveExtractorScriptPath } from '../index.js';

function makeTmpConnectorDir(): string {
    const dir = resolve(tmpdir(), `mj-extractor-path-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(resolve(dir, 'scripts'), { recursive: true });
    return dir;
}

describe('ResolveExtractorScriptPath', () => {
    it('returns .ts path when only extract-io-iof.ts exists', () => {
        const dir = makeTmpConnectorDir();
        try {
            const tsPath = resolve(dir, 'scripts', 'extract-io-iof.ts');
            writeFileSync(tsPath, '// stub\n');
            expect(ResolveExtractorScriptPath(dir)).toBe(tsPath);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('returns .mts path when only extract-io-iof.mts exists (the bug case)', () => {
        const dir = makeTmpConnectorDir();
        try {
            const mtsPath = resolve(dir, 'scripts', 'extract-io-iof.mts');
            writeFileSync(mtsPath, '// stub\n');
            expect(ResolveExtractorScriptPath(dir)).toBe(mtsPath);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('prefers .ts when both exist', () => {
        const dir = makeTmpConnectorDir();
        try {
            const tsPath = resolve(dir, 'scripts', 'extract-io-iof.ts');
            const mtsPath = resolve(dir, 'scripts', 'extract-io-iof.mts');
            writeFileSync(tsPath, '// ts stub\n');
            writeFileSync(mtsPath, '// mts stub\n');
            expect(ResolveExtractorScriptPath(dir)).toBe(tsPath);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('returns canonical .ts path when neither exists (deterministic absent-error surface)', () => {
        const dir = makeTmpConnectorDir();
        try {
            const expected = resolve(dir, 'scripts', 'extract-io-iof.ts');
            expect(ResolveExtractorScriptPath(dir)).toBe(expected);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
