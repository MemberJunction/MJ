/**
 * The Predictive Studio gate suites' ordering invariant (issue #3251), enforced instead of remembered.
 *
 * A server-transport bundle cannot follow a client-transport one in one `mj test suite` process: the client bundle
 * rebinds the process-global provider to a `Network` provider, and the server bundle's bootstrap then refuses
 * ("transport 'server' resolved a 'Network' provider"). `suite-sequencing.test.ts` checks the deterministic and
 * live-model integration suites; this file checks every `.ps-gates-*.json` suite against the gate and truth test
 * records it selects, so a PS gate added at the end of a suite with client bundles before it is red here, not an
 * `Error` row at the wave's integration (PR 5 wave 2: `C1 -> C2.4` landed at Sequence 7 of the Feature Pipelines
 * suite, after six client-transport bundles).
 *
 * @module @memberjunction/integration-test-suite
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Transport = 'server' | 'client';

/** The fields of a test record this check reads. */
interface TestRecordFields {
    readonly Name?: string;
    readonly Configuration?: { readonly transport?: string };
}

/** The fields of a suite-membership row this check reads. */
interface SuiteMemberFields {
    readonly TestID?: string;
    readonly Sequence?: number;
}

/** One suite record of a `.ps-gates-*.json` file. */
interface SuiteRecord {
    readonly fields: { readonly Name: string };
    readonly relatedEntities?: { readonly 'MJ: Test Suite Tests'?: ReadonlyArray<{ readonly fields: SuiteMemberFields }> };
}

/** A suite member resolved to its test's transport. */
interface ResolvedMember {
    readonly Name: string;
    readonly Sequence: number;
    readonly Transport: Transport | null;
}

const LOOKUP_PREFIX = '@lookup:MJ: Tests.Name=';

function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'mj.config.cjs'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error(`could not locate the repo root from ${process.cwd()}`);
}

const ROOT = repoRoot();
const IT_DIR = path.join(ROOT, 'metadata-optional/integration-test');
const SUITES_DIR = path.join(IT_DIR, 'test-suites');
/** Every folder a PS gate suite selects tests from: the gate rows, and the integration bundles (a suite may mix them). */
const TEST_DIRS = [path.join(IT_DIR, 'tests/gates'), path.join(IT_DIR, 'tests/integration')];

function readRecords<T>(file: string): T[] {
    const parsed: T | T[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [parsed];
}

/** Transport per test name, read from the test records themselves. */
function transportByTestName(): Map<string, Transport | null> {
    const map = new Map<string, Transport | null>();
    for (const dir of TEST_DIRS) {
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
            for (const rec of readRecords<{ readonly fields?: TestRecordFields }>(path.join(dir, file))) {
                const name = rec.fields?.Name;
                if (!name) continue;
                const t = rec.fields?.Configuration?.transport;
                map.set(name, t === 'server' || t === 'client' ? t : null);
            }
        }
    }
    return map;
}

/** Every PS gate suite with its members resolved, by suite name. */
function psGateSuites(): Map<string, ResolvedMember[]> {
    const transports = transportByTestName();
    const suites = new Map<string, ResolvedMember[]>();
    for (const file of fs.readdirSync(SUITES_DIR).filter((f) => f.startsWith('.ps-gates-') && f.endsWith('.json'))) {
        for (const suite of readRecords<SuiteRecord>(path.join(SUITES_DIR, file))) {
            const members = (suite.relatedEntities?.['MJ: Test Suite Tests'] ?? []).map((m): ResolvedMember => {
                const ref = m.fields.TestID ?? '';
                const name = ref.startsWith(LOOKUP_PREFIX) ? ref.slice(LOOKUP_PREFIX.length) : ref;
                return { Name: name, Sequence: m.fields.Sequence ?? Number.NaN, Transport: transports.get(name) ?? null };
            });
            suites.set(suite.fields.Name, members);
        }
    }
    return suites;
}

const SUITES = psGateSuites();

describe('Predictive Studio gate suite sequencing (#3251)', () => {
    it('finds the PS gate suites and their members — an empty scan would make every check below vacuous', () => {
        expect(SUITES.size).toBeGreaterThanOrEqual(3);
        for (const [name, members] of SUITES) expect(members.length, name).toBeGreaterThan(0);
    });

    it('declares a transport for every member of every PS gate suite', () => {
        const undeclared = [...SUITES].flatMap(([suite, members]) =>
            members.filter((m) => m.Transport === null).map((m) => `${suite}: ${m.Name}`));
        expect(undeclared).toEqual([]);
    });

    it('gives every member a real sequence', () => {
        const bad = [...SUITES].flatMap(([suite, members]) =>
            members.filter((m) => !Number.isInteger(m.Sequence)).map((m) => `${suite}: ${m.Name}`));
        expect(bad).toEqual([]);
    });

    it('sequences EVERY server-transport bundle before EVERY client-transport one, in every PS gate suite', () => {
        const violations: string[] = [];
        for (const [suite, members] of SUITES) {
            const clientSequences = members.filter((m) => m.Transport === 'client').map((m) => m.Sequence);
            if (clientSequences.length === 0) continue;
            const firstClient = Math.min(...clientSequences);
            for (const m of members) {
                if (m.Transport === 'server' && m.Sequence >= firstClient) {
                    violations.push(`${suite}: server-transport "${m.Name}" at Sequence ${m.Sequence}, a client-transport bundle runs at ${firstClient}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
