/**
 * sibling-parity.test.ts — the bundle↔metadata drift-check.
 *
 * The check *logic* for an integration suite lives ONCE, in a registry bundle (this package).
 * Its single sibling is a metadata `Test` record (metadata-optional/integration-test/tests/
 * integration) that the `mj test` driver dispatches. This test enforces that every bundle keeps
 * its sibling in sync, so a bundle can never be added — or an IT record pointed at a bundle
 * that doesn't exist — without a red build.
 *
 * HISTORY: this check used to enforce THREE-way parity (bundle ↔ tsx dispatcher ↔ IT record).
 * The July-2026 restructure removed the tsx dispatchers entirely — `mj test` is the single
 * entry path — so the dispatcher leg is gone. What replaced it: an assertion that the repo's
 * mj.config.cjs actually loads this package via `testing.checkModules` (the runtime seam the
 * published CLI uses to find these bundles; without it every IT record dispatches to an
 * "Unknown integration check bundle" failure).
 *
 * When you add a new bundle: add its IT record and join it to the integration suite. That's it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import '../index'; // side effect: evaluate every checks module so the registry is fully populated

/** Walk up from the vitest cwd (the package dir) until the repo root (holds the metadata tree). */
function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 12; i++) {
        if (
            fs.existsSync(path.join(dir, 'metadata-optional/integration-test/tests/integration')) &&
            fs.existsSync(path.join(dir, 'mj.config.cjs'))
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

/** Internal, non-graduated registrations that are neither a suite member nor exposed via a sibling. */
const NON_SUITE_BUNDLES = new Set<string>([
    'self-test', // the permanent Phase-0 cache-warm smoke check (lives in the framework package)
]);

const ROOT = repoRoot();
// The integration test/suite metadata was relocated OUT of the default-pushed metadata/ tree into
// the optional sibling root metadata-optional/integration-test/ (test-only records, never production).
const META_DIR = path.join(ROOT, 'metadata-optional/integration-test/tests/integration');
const SUITE_FILE = path.join(ROOT, 'metadata-optional/integration-test/test-suites/.integration-suite.json');
const MJ_CONFIG = path.join(ROOT, 'mj.config.cjs');

interface ItRecord {
    fields: {
        Name?: string;
        Configuration?: { checks?: Array<{ type?: string }> };
    };
}

function itRecords(): ItRecord[] {
    const records: ItRecord[] = [];
    for (const file of fs.readdirSync(META_DIR).filter(f => f.endsWith('.json'))) {
        const parsed = JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf-8'));
        for (const rec of Array.isArray(parsed) ? parsed : [parsed]) {
            records.push(rec as ItRecord);
        }
    }
    return records;
}

/** bundle type → IT record Name, from every record's Configuration.checks[].type. */
function metadataBundles(): Map<string, string> {
    const map = new Map<string, string>();
    for (const rec of itRecords()) {
        for (const check of rec.fields?.Configuration?.checks ?? []) {
            if (check.type) {
                map.set(check.type, rec.fields?.Name ?? '(unnamed record)');
            }
        }
    }
    return map;
}

function suiteMemberTestNames(): Set<string> {
    const parsed = JSON.parse(fs.readFileSync(SUITE_FILE, 'utf-8')) as Array<{
        fields?: { Name?: string };
        relatedEntities?: { 'MJ: Test Suite Tests'?: Array<{ fields?: { TestID?: string } }> };
    }>;
    const names = new Set<string>();
    for (const suite of parsed) {
        for (const member of suite.relatedEntities?.['MJ: Test Suite Tests'] ?? []) {
            const lookup = member.fields?.TestID ?? '';
            const m = lookup.match(/Name=(.+)$/);
            if (m) {
                names.add(m[1]);
            }
        }
    }
    return names;
}

describe('bundle↔metadata sibling parity (drift-check)', () => {
    const bundles = IntegrationCheckRegistry.Instance.GetBundleNames().filter(b => !NON_SUITE_BUNDLES.has(b));
    const metaMap = metadataBundles();

    it('the registry is populated (the side-effect import chain is intact)', () => {
        expect(bundles.length).toBeGreaterThan(20);
    });

    it('every registered bundle has an IT metadata record', () => {
        const missing = bundles.filter(b => !metaMap.has(b));
        expect(missing, `bundles with no IT record (add one under ${META_DIR}): ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('every IT record type resolves to a registered bundle', () => {
        const registered = new Set(IntegrationCheckRegistry.Instance.GetBundleNames());
        const dangling = [...metaMap.entries()].filter(([type]) => !registered.has(type));
        expect(dangling, `IT records pointing at non-existent bundles: ${dangling.map(([t, n]) => `${n}→${t}`).join(', ') || 'none'}`).toEqual([]);
    });

    it('every IT metadata record is joined to the integration suite (MJ: Test Suite Tests)', () => {
        const members = suiteMemberTestNames();
        const unjoined = itRecords()
            .map(r => r.fields?.Name)
            .filter((n): n is string => !!n)
            .filter(n => !members.has(n));
        expect(unjoined, `IT records not joined to any suite: ${unjoined.join(', ') || 'none'}`).toEqual([]);
    });

    it('mj.config.cjs loads this package via testing.checkModules (the mj-test runtime seam)', () => {
        // Without this key, `mj test` resolves ZERO of these bundles — every IT record would
        // dispatch to "Unknown integration check bundle". Assert on the raw text so the check
        // stays independent of config evaluation (env vars, dotenv side effects).
        const raw = fs.readFileSync(MJ_CONFIG, 'utf-8');
        expect(raw).toMatch(/checkModules/);
        expect(raw).toContain('packages/TestingFramework/integration-test-suite/dist/index.js');
    });
});

describe('the default metadata tree stays free of integration test records (R2)', () => {
    // The integration Tests/Suites live ONLY under metadata-optional/integration-test/ — the
    // default-pushed metadata/ tree must never carry them, because everything in metadata/ reaches
    // every database including production (R2: synthetic test records and accounts stay optional).
    // This was violated once (Aug 2026): a commit added a parallel 78-record set under
    // metadata/tests/integration/, and because metadata/'s pull configs vacuum ALL Tests/Suites
    // from whatever dev database `mj sync pull` runs against — and every dev DB that ran the
    // integration workflow HAS those rows — each subsequent "md sync" re-committed them. The pull
    // configs now carry filters excluding integration records; this test is the backstop that goes
    // red if either the filters or the policy regress.

    const DEFAULT_TESTS_DIR = path.join(ROOT, 'metadata/tests');
    const DEFAULT_SUITES_DIR = path.join(ROOT, 'metadata/test-suites');

    function jsonRecordsUnder(dir: string): Array<{ file: string; rec: { fields?: Record<string, unknown> } }> {
        const out: Array<{ file: string; rec: { fields?: Record<string, unknown> } }> = [];
        if (!fs.existsSync(dir)) {
            return out;
        }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                out.push(...jsonRecordsUnder(p));
            } else if (entry.name.endsWith('.json') && entry.name !== '.mj-sync.json' && entry.name !== '.mj-folder.json') {
                const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
                for (const rec of Array.isArray(parsed) ? parsed : [parsed]) {
                    out.push({ file: path.relative(ROOT, p), rec });
                }
            }
        }
        return out;
    }

    it('metadata/tests holds no Integration Test records', () => {
        const offenders = jsonRecordsUnder(DEFAULT_TESTS_DIR)
            .filter(({ rec }) => String(rec.fields?.TypeID ?? '').includes('Integration Test'))
            .map(({ file, rec }) => `${rec.fields?.Name} (${file})`);
        expect(offenders, `Integration Tests in the default tree (move to metadata-optional/integration-test/): ${offenders.join(', ') || 'none'}`).toEqual([]);
    });

    it('metadata/test-suites holds no Integration Tests suite', () => {
        const offenders = jsonRecordsUnder(DEFAULT_SUITES_DIR)
            .filter(({ rec }) => String(rec.fields?.Name ?? '').startsWith('Integration Tests'))
            .map(({ file, rec }) => `${rec.fields?.Name} (${file})`);
        expect(offenders, `Integration suites in the default tree (move to metadata-optional/integration-test/): ${offenders.join(', ') || 'none'}`).toEqual([]);
    });

    it("the default tree's pull configs exclude integration records, so `mj sync pull` cannot re-import them", () => {
        // The files above being clean is necessary but not sufficient: without the pull filters,
        // the very next `mj sync pull` against a dev DB re-creates them and the cycle restarts.
        const testsSync = JSON.parse(fs.readFileSync(path.join(DEFAULT_TESTS_DIR, '.mj-sync.json'), 'utf-8'));
        const suitesSync = JSON.parse(fs.readFileSync(path.join(DEFAULT_SUITES_DIR, '.mj-sync.json'), 'utf-8'));
        expect(String(testsSync.pull?.filter ?? ''), 'metadata/tests/.mj-sync.json pull.filter must exclude Integration Test records').toContain('Integration Test');
        expect(String(suitesSync.pull?.filter ?? ''), 'metadata/test-suites/.mj-sync.json pull.filter must exclude Integration Tests suites').toContain('Integration Tests');
    });
});
