/**
 * sibling-parity.test.ts — the tsx↔metadata drift-check.
 *
 * The check *logic* for an integration suite lives ONCE, in a registry bundle. The two "siblings"
 * are thin pointers to that bundle: a `tsx` dispatcher script (packages/MJServer/integration-test-scripts)
 * and a metadata `Test` record (metadata/tests/integration). This test enforces that every bundle keeps
 * BOTH siblings in sync, so a bundle can never be added — or an IT record / dispatcher pointed at a
 * bundle that doesn't exist — without a red build.
 *
 * When you add a new bundle: add its dispatcher script AND its IT record (see the Testing guide / the
 * Integration Testing Quickstart). When you intentionally omit a tsx dispatcher (a driver/MJAPI-only
 * bundle), add it to NO_TSX_DISPATCHER below with a one-line reason.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IntegrationCheckRegistry } from '../check-registry';
import '../index'; // side effect: evaluate every checks module so the registry is fully populated

/** Walk up from the vitest cwd (the package dir) until the repo root (holds both sibling trees). */
function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 12; i++) {
        if (
            fs.existsSync(path.join(dir, 'packages/MJServer/integration-test-scripts')) &&
            fs.existsSync(path.join(dir, 'metadata/tests/integration'))
        ) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    throw new Error(`could not locate the repo root from ${process.cwd()}`);
}

/**
 * Bundles intentionally WITHOUT a tsx dispatcher (run only via the IntegrationTestDriver / require a
 * live MJAPI). Keep this list small + reasoned. Every entry must still have an IT record.
 */
const NO_TSX_DISPATCHER = new Set<string>([
    'rls-isolation-client', // client-transport companion to rls-isolation (RLS7); driver/MJAPI-only, seeded Skip via IT23
]);

/** Internal, non-graduated registrations that are neither a suite nor exposed via a sibling. */
const NON_SUITE_BUNDLES = new Set<string>([
    'self-test', // the permanent Phase-0 cache-warm smoke check
]);

const ROOT = repoRoot();
const SCRIPTS_DIR = path.join(ROOT, 'packages/MJServer/integration-test-scripts');
const META_DIR = path.join(ROOT, 'metadata/tests/integration');

/** The bundle each `*-tests.ts` dispatcher points at (`const BUNDLE = '..'` or `GetBundle('..')`). */
function dispatcherBundles(): Map<string, string> {
    const map = new Map<string, string>();
    for (const file of fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('-tests.ts'))) {
        const src = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
        const m = src.match(/const BUNDLE = '([^']+)'/) ?? src.match(/GetBundle\('([^']+)'\)/);
        if (m) {
            map.set(m[1], file);
        }
    }
    return map;
}

/** The bundle each IT metadata record selects (`Configuration.checks[].type`). */
function metadataBundles(): Map<string, string> {
    const map = new Map<string, string>();
    for (const file of fs.readdirSync(META_DIR).filter(f => f.endsWith('.json'))) {
        const rec = JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf8'));
        const checks: Array<{ type?: string }> = rec?.fields?.Configuration?.checks ?? [];
        for (const c of checks) {
            if (c.type) {
                map.set(c.type, file);
            }
        }
    }
    return map;
}

describe('tsx↔metadata sibling parity (drift-check)', () => {
    const bundles = IntegrationCheckRegistry.Instance.GetBundleNames().filter(b => !NON_SUITE_BUNDLES.has(b));
    const dispatchers = dispatcherBundles();
    const metadata = metadataBundles();

    it('every registered bundle has an IT metadata record', () => {
        const missing = bundles.filter(b => !metadata.has(b));
        expect(missing, `bundles with no metadata Test record (add one under metadata/tests/integration): ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('every registered bundle has a tsx dispatcher (except documented driver-only bundles)', () => {
        const missing = bundles.filter(b => !NO_TSX_DISPATCHER.has(b) && !dispatchers.has(b));
        expect(missing, `bundles with no tsx dispatcher (add one under integration-test-scripts, or add to NO_TSX_DISPATCHER): ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('every IT record type resolves to a registered bundle', () => {
        const orphans = [...metadata.keys()].filter(b => !bundles.includes(b));
        expect(orphans, `IT records selecting a non-existent bundle: ${orphans.map(b => `${b} (${metadata.get(b)})`).join(', ') || 'none'}`).toEqual([]);
    });

    it('every tsx dispatcher references a registered bundle', () => {
        const orphans = [...dispatchers.keys()].filter(b => !bundles.includes(b));
        expect(orphans, `tsx dispatchers referencing a non-existent bundle: ${orphans.map(b => `${b} (${dispatchers.get(b)})`).join(', ') || 'none'}`).toEqual([]);
    });

    it('the newly-graduated bundles have both siblings', () => {
        for (const b of ['lists', 'open-app-teardown', 'user-routines']) {
            expect(dispatchers.has(b), `${b} missing tsx dispatcher`).toBe(true);
            expect(metadata.has(b), `${b} missing IT record`).toBe(true);
        }
    });
});
