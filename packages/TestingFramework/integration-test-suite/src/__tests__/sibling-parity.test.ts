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
        expect(raw).toContain('@memberjunction/integration-test-suite');
        expect(raw).toMatch(/checkModules/);
    });
});
