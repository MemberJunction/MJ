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
const SUITE_FILE = path.join(ROOT, 'metadata/test-suites/.integration-suite.json');

/**
 * `*-tests.ts` dispatchers intentionally NOT wired into the run-all.ts aggregator — special rigs
 * that need a live MJAPI or a second server, so they can't run in the headless deterministic
 * aggregator. Keep small + reasoned; each still has its own IT record + (where applicable) sibling.
 */
const NOT_IN_AGGREGATOR = new Set<string>([
    'client-cache-tests.ts',              // client transport — needs a live MJAPI (run standalone)
    'cross-server-invalidation-tests.ts', // two-server cross-invalidation rig (run standalone)
]);

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

/** The `*.ts` script filenames referenced by run-all.ts's GROUPS arrays. */
function aggregatorScripts(): Set<string> {
    const src = fs.readFileSync(path.join(SCRIPTS_DIR, 'run-all.ts'), 'utf8');
    // Scripts appear as quoted '<name>.ts' entries; the DIR const + tier labels don't match this shape.
    return new Set([...src.matchAll(/'([\w-]+\.ts)'/g)].map(m => m[1]));
}

/** The display Name of every IT metadata record (e.g. "IT01 - Server RunView Cache Integrity"). */
function itRecordNames(): string[] {
    const names: string[] = [];
    for (const file of fs.readdirSync(META_DIR).filter(f => f.endsWith('.json'))) {
        const rec = JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf8'));
        if (rec?.fields?.Name) {
            names.push(rec.fields.Name);
        }
    }
    return names;
}

/** The Test names joined to a suite via `MJ: Test Suite Tests` in the integration suite metadata. */
function suiteMemberTestNames(): Set<string> {
    const src = fs.readFileSync(SUITE_FILE, 'utf8');
    return new Set([...src.matchAll(/@lookup:MJ: Tests\.Name=([^"]+)"/g)].map(m => m[1].trim()));
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

    it('every tsx dispatcher is wired into the run-all.ts aggregator (except documented special rigs)', () => {
        const scripts = aggregatorScripts();
        const missing = [...dispatchers.values()].filter(f => !NOT_IN_AGGREGATOR.has(f) && !scripts.has(f));
        expect(missing, `dispatchers not referenced by run-all.ts GROUPS (add them, or to NOT_IN_AGGREGATOR): ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('every script referenced by run-all.ts GROUPS exists on disk', () => {
        const missing = [...aggregatorScripts()].filter(f => !fs.existsSync(path.join(SCRIPTS_DIR, f)));
        expect(missing, `run-all.ts references scripts that do not exist: ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('every IT metadata record is joined to the integration suite (MJ: Test Suite Tests)', () => {
        const members = suiteMemberTestNames();
        const orphans = itRecordNames().filter(n => !members.has(n));
        expect(orphans, `IT records not joined to any suite in .integration-suite.json: ${orphans.join(', ') || 'none'}`).toEqual([]);
    });
});
