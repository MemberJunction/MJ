/**
 * sibling-parity.test.ts — the bundle↔metadata drift-check.
 *
 * The check *logic* for an integration suite lives ONCE, in a registry bundle (this package).
 * Its single sibling is a metadata `Test` record under metadata-optional/integration-test/tests/
 * (`integration/` for the integration tiers, `gates/` for the gate suites) that the `mj test`
 * driver dispatches. This test enforces that every bundle keeps
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
 * When you add a new bundle: add its IT record and join it to a suite under test-suites/. That's it.
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
const TESTS_ROOT = path.join(ROOT, 'metadata-optional/integration-test/tests');
const SUITES_DIR = path.join(ROOT, 'metadata-optional/integration-test/test-suites');

/**
 * A directory of test records and the suite files its records belong to — and only those. The integration tiers'
 * records must run in the integration suites (the CI tier); the gate records need bizapps-common, so they must stay in
 * the gate suites and never reach the deterministic tier.
 */
interface DirSuitePair {
    /** Directory under tests/. */
    Dir: string;
    /** Whether a suite file (its name under test-suites/) is one of this directory's own. */
    IsOwnSuiteFile: (file: string) => boolean;
    /** A missing directory is a failure (the integration tier always exists). */
    Required: boolean;
}

const DIR_SUITE_PAIRS: DirSuitePair[] = [
    { Dir: 'integration', IsOwnSuiteFile: f => f === '.integration-suite.json', Required: true },
    { Dir: 'gates', IsOwnSuiteFile: f => /^\.ps-gates-.*\.json$/.test(f), Required: false },
];

/** Every directory of test records. */
const TEST_DIRS = DIR_SUITE_PAIRS.map(p => path.join(TESTS_ROOT, p.Dir));
const MJ_CONFIG = path.join(ROOT, 'mj.config.cjs');

interface ItRecord {
    fields?: {
        Name?: string;
        Configuration?: { checks?: Array<{ type?: string }> };
    };
}

interface SuiteRecord {
    fields?: { Name?: string };
    relatedEntities?: { 'MJ: Test Suite Tests'?: Array<{ fields?: { TestID?: string } }> };
}

/**
 * The records of one metadata file (one record or an array of them). `unknown` because the file is untyped JSON; each
 * caller narrows the records with {@link isMetadataRecord}.
 */
function fileRecords(file: string): unknown[] {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [parsed];
}

/** A metadata record: an object (its `fields`/`relatedEntities` are read optionally, so their absence is fine). `unknown` in: a parsed JSON value. */
function isMetadataRecord(value: unknown): value is ItRecord & SuiteRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The records of one test directory (none when it does not exist; {@link PairingProblems} judges that). */
function dirRecords(dir: string): ItRecord[] {
    return fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f)).flatMap(fileRecords).filter(isMetadataRecord)
        : [];
}

function itRecords(): ItRecord[] {
    return TEST_DIRS.flatMap(dirRecords);
}

/** Test names per test directory (`undefined` for a directory that does not exist). */
function recordNamesByDir(): Map<string, string[] | undefined> {
    return new Map(DIR_SUITE_PAIRS.map(p => {
        const dir = path.join(TESTS_ROOT, p.Dir);
        const names = dirRecords(dir).map(r => r.fields?.Name).filter((n): n is string => !!n);
        return [p.Dir, fs.existsSync(dir) ? names : undefined];
    }));
}

/** Member test names per suite file under test-suites/. */
function membersBySuiteFile(): Map<string, Set<string>> {
    return new Map(fs.readdirSync(SUITES_DIR)
        .filter(f => f.endsWith('.json') && f !== '.mj-sync.json')
        .map(f => [f, suiteMembers(fileRecords(path.join(SUITES_DIR, f)).filter(isMetadataRecord))]));
}

/**
 * Where test records sit in the wrong suites: a required directory that is missing, a record joined to none of its own
 * directory's suite files, or a record joined to another directory's suite file.
 */
function PairingProblems(pairs: DirSuitePair[], namesByDir: Map<string, string[] | undefined>, members: Map<string, Set<string>>): string[] {
    const problems: string[] = [];
    for (const pair of pairs) {
        const names = namesByDir.get(pair.Dir);
        if (!names) {
            if (pair.Required) {
                problems.push(`tests/${pair.Dir} is missing`);
            }
            continue;
        }
        for (const name of names) {
            const joined = [...members.entries()].filter(([, m]) => m.has(name)).map(([f]) => f);
            if (!joined.some(pair.IsOwnSuiteFile)) {
                problems.push(`${name} (tests/${pair.Dir}) is joined to none of its own suites`);
            }
            for (const foreign of joined.filter(f => !pair.IsOwnSuiteFile(f))) {
                problems.push(`${name} (tests/${pair.Dir}) is joined to ${foreign}, another directory's suite`);
            }
        }
    }
    return problems;
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

/** The test names a suite file's suites join (`@lookup:MJ: Tests.Name=…`). */
function suiteMembers(parsed: SuiteRecord[]): Set<string> {
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
        expect(missing, `bundles with no IT record (add one under ${TEST_DIRS.join(' or ')}): ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('every IT record type resolves to a registered bundle', () => {
        const registered = new Set(IntegrationCheckRegistry.Instance.GetBundleNames());
        const dangling = [...metaMap.entries()].filter(([type]) => !registered.has(type));
        expect(dangling, `IT records pointing at non-existent bundles: ${dangling.map(([t, n]) => `${n}→${t}`).join(', ') || 'none'}`).toEqual([]);
    });

    it('every test record is joined to its own directory\'s suites, and to no other directory\'s', () => {
        const problems = PairingProblems(DIR_SUITE_PAIRS, recordNamesByDir(), membersBySuiteFile());
        expect(problems, `test records in the wrong suites: ${problems.join('; ') || 'none'}`).toEqual([]);
    });

    it('the pairing fails an integration record joined only to a gate suite', () => {
        const members = new Map([['.integration-suite.json', new Set(['IT01'])], ['.ps-gates-x.json', new Set(['IT02'])]]);
        expect(PairingProblems(DIR_SUITE_PAIRS, new Map([['integration', ['IT01', 'IT02']], ['gates', []]]), members)).toEqual([
            'IT02 (tests/integration) is joined to none of its own suites',
            'IT02 (tests/integration) is joined to .ps-gates-x.json, another directory\'s suite',
        ]);
    });

    it('the pairing fails a gate record joined to the integration suite, and a missing integration directory', () => {
        const members = new Map([['.integration-suite.json', new Set(['G1'])], ['.ps-gates-x.json', new Set(['G1'])]]);
        expect(PairingProblems(DIR_SUITE_PAIRS, new Map([['integration', undefined], ['gates', ['G1']]]), members)).toEqual([
            'tests/integration is missing',
            'G1 (tests/gates) is joined to .integration-suite.json, another directory\'s suite',
        ]);
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
