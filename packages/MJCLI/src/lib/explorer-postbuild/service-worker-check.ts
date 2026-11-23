/**
 * @fileoverview Runs the service worker cache check that ships in
 * `@memberjunction/ng-explorer-service-worker` on MJ Explorer's build output.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SERVICE_WORKER_CHECK_SCRIPT = join('node_modules', '@memberjunction', 'ng-explorer-service-worker', 'scripts', 'verify-sw-cache-shape.js');

/**
 * The path of the check script as installed for the host at `hostDir`, or null when the host does
 * not have it. Looks in the `node_modules` of the host folder and of each folder above it.
 */
export function FindServiceWorkerCheck(hostDir: string): string | null {
    for (let dir = hostDir; ; dir = dirname(dir)) {
        const script = join(dir, SERVICE_WORKER_CHECK_SCRIPT);
        if (existsSync(script)) {
            return script;
        }
        if (dirname(dir) === dir) {
            return null;
        }
    }
}

/**
 * Runs the service worker cache check on the site folder.
 *
 * @returns `passed`, or `skipped` when the host does not have the check script
 * @throws when the check fails
 */
export function RunServiceWorkerCheck(siteDir: string, hostDir: string): 'passed' | 'skipped' {
    const script = FindServiceWorkerCheck(hostDir);
    if (!script) {
        return 'skipped';
    }
    const result = spawnSync(process.execPath, [script, siteDir], { cwd: hostDir, stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error(`The service worker cache check failed for ${siteDir}.`);
    }
    return 'passed';
}
