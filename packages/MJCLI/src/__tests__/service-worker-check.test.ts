/**
 * Tests for the service worker cache check that `mj explorer postbuild` runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunServiceWorkerCheck } from '../lib/explorer-postbuild/service-worker-check.js';

describe('RunServiceWorkerCheck', () => {
    let host: string;

    function installCheck(scriptBody: string): void {
        const packageDir = join(host, 'node_modules', '@memberjunction', 'ng-explorer-service-worker');
        mkdirSync(join(packageDir, 'scripts'), { recursive: true });
        writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@memberjunction/ng-explorer-service-worker', version: '1.0.0' }));
        writeFileSync(join(packageDir, 'scripts', 'verify-sw-cache-shape.js'), scriptBody);
    }

    beforeEach(() => {
        host = mkdtempSync(join(tmpdir(), 'mj-sw-check-'));
        writeFileSync(join(host, 'package.json'), JSON.stringify({ name: 'host', private: true }));
    });

    afterEach(() => {
        rmSync(host, { recursive: true, force: true });
    });

    it('is skipped when the host does not have the check script', () => {
        expect(RunServiceWorkerCheck(join(host, 'dist'), host)).toBe('skipped');
    });

    it('passes the site folder to the check script', () => {
        installCheck("if (!process.argv[2].endsWith('dist')) process.exit(1);");
        expect(RunServiceWorkerCheck(join(host, 'dist'), host)).toBe('passed');
    });

    it('throws when the check fails', () => {
        installCheck('process.exit(1);');
        expect(() => RunServiceWorkerCheck(join(host, 'dist'), host)).toThrow(/service worker/i);
    });
});
