/**
 * suite-sharding.test.ts — unit tests for deterministic transport filtering,
 * duration-aware LPT shard assignment, and TestEngine.RunSuite sharding invariants.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJTestEntity,
    MJTestRunEntity,
    MJTestSuiteEntity,
    MJTestSuiteRunEntity,
    MJTestSuiteTestEntity,
    MJTestTypeEntity,
} from '@memberjunction/core-entities';
import {
    AssignTestsToShard,
    DEFAULT_TEST_WEIGHT_SECONDS,
    EstimateTestWeightSeconds,
    FilterTestsByTransport,
    KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS,
    ParseShardSpec,
    ResolveTestTransport,
    ValidateShardSpec,
    type ShardableTest,
} from '../utils/suite-sharding';
import { TestEngine } from '../engine/TestEngine';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import type { DriverExecutionContext, DriverExecutionResult, ResolvedTestVariables } from '../types';

function makeTest(
    id: string,
    name: string,
    configObj?: Record<string, unknown> | string | null
): ShardableTest {
    const Configuration =
        typeof configObj === 'string' || configObj === null
            ? configObj
            : configObj !== undefined
              ? JSON.stringify(configObj)
              : null;
    return { ID: id, Name: name, Configuration };
}

describe('ParseShardSpec & ValidateShardSpec', () => {
    it('parses valid 1-based <index>/<total> specifications', () => {
        expect(ParseShardSpec('1/1')).toEqual({ index: 1, total: 1 });
        expect(ParseShardSpec('1/3')).toEqual({ index: 1, total: 3 });
        expect(ParseShardSpec('3/3')).toEqual({ index: 3, total: 3 });
        expect(ParseShardSpec(' 2/4 ')).toEqual({ index: 2, total: 4 });
        expect(ValidateShardSpec({ index: 2, total: 5 })).toEqual({ index: 2, total: 5 });
    });

    it('rejects malformed or out-of-range shard specifications', () => {
        expect(() => ParseShardSpec('')).toThrow(/Invalid --shard value/);
        expect(() => ParseShardSpec('abc')).toThrow(/Invalid --shard value/);
        expect(() => ParseShardSpec('1/2/3')).toThrow(/Invalid --shard value/);
        expect(() => ParseShardSpec('0/3')).toThrow(/requires integer 1 <= index <= total/);
        expect(() => ParseShardSpec('4/3')).toThrow(/requires integer 1 <= index <= total/);
        expect(() => ParseShardSpec('1/0')).toThrow(/requires integer 1 <= index <= total/);
        expect(() => ValidateShardSpec({ index: 0, total: 2 })).toThrow(/requires integer 1 <= index <= total/);
        expect(() => ValidateShardSpec({ index: 3, total: 2 })).toThrow(/requires integer 1 <= index <= total/);
    });
});

describe('ResolveTestTransport & FilterTestsByTransport', () => {
    it('honors explicit Configuration.transport and falls back to bundle inference or server', () => {
        const explicitServer = makeTest('1', 'IT01 - Server Cache', {
            transport: 'server',
            checks: [{ type: 'server-cache' }],
        });
        const explicitClient = makeTest('2', 'IT25 - View Execution', {
            transport: 'client',
            checks: [{ type: 'view-execution' }],
        });
        const inferredClient = makeTest('3', 'IT03 - Client Cache', {
            checks: [{ type: 'client-cache' }],
        });
        const inferredServer = makeTest('4', 'IT02 - RunQuery Cache', {
            checks: [{ type: 'runquery-cache' }],
        });
        const nullConfig = makeTest('5', 'Plain Test', null);
        const badJson = makeTest('6', 'Broken Config', '{not-json');

        expect(ResolveTestTransport(explicitServer)).toBe('server');
        expect(ResolveTestTransport(explicitClient)).toBe('client');
        expect(ResolveTestTransport(inferredClient)).toBe('client');
        expect(ResolveTestTransport(inferredServer)).toBe('server');
        expect(ResolveTestTransport(nullConfig)).toBe('server');
        expect(ResolveTestTransport(badJson)).toBe('server');
    });

    it('routes wire-companion server bundles (realtime-session-guard, calendar-event-links) to the client worker group', () => {
        const rsg = makeTest('111', 'IT111 - Realtime Session Config Guard', {
            transport: 'server',
            checks: [{ type: 'realtime-session-guard' }],
        });
        const cal = makeTest('127', 'IT127 - Calendar Event Links and Sync', {
            transport: 'server',
            checks: [{ type: 'calendar-event-links' }],
        });
        const pureServer = makeTest('143', 'IT143 - SQL Pipeline Scenario Matrix', {
            transport: 'server',
            checks: [{ type: 'sqlpipe-matrix' }],
        });

        expect(ResolveTestTransport(rsg)).toBe('client');
        expect(ResolveTestTransport(cal)).toBe('client');
        expect(ResolveTestTransport(pureServer)).toBe('server');

        const all = [pureServer, rsg, cal];
        expect(FilterTestsByTransport(all, 'server').map(t => t.ID)).toEqual(['143']);
        expect(FilterTestsByTransport(all, 'client').map(t => t.ID)).toEqual(['111', '127']);
        expect(FilterTestsByTransport(all, 'all').map(t => t.ID)).toEqual(['143', '111', '127']);
        expect(FilterTestsByTransport(all, undefined).map(t => t.ID)).toEqual(['143', '111', '127']);
    });

    it('promotes server tests with Configuration.requiresSharedServerDatabase = true to the client worker group', () => {
        const declarativeCompanion = makeTest('999', 'IT999 - Custom MJAPI Companion', {
            transport: 'server',
            requiresSharedServerDatabase: true,
            checks: [{ type: 'custom-server-bundle' }],
        });
        expect(ResolveTestTransport(declarativeCompanion)).toBe('client');
    });
});

describe('EstimateTestWeightSeconds & AssignTestsToShard', () => {
    it('resolves explicit config weight, known IT prefix weight, and default weight', () => {
        expect(
            EstimateTestWeightSeconds(makeTest('1', 'IT143 - Custom', { estimatedDurationSeconds: 42 }))
        ).toBe(42);
        expect(EstimateTestWeightSeconds(makeTest('2', 'IT143 - SQL Pipeline Scenario Matrix'))).toBe(
            KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS.IT143
        );
        expect(EstimateTestWeightSeconds(makeTest('3', 'IT146 - Cross Products'))).toBe(
            KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS.IT146
        );
        expect(EstimateTestWeightSeconds(makeTest('4', 'IT01 - Server RunView Cache'))).toBe(
            DEFAULT_TEST_WEIGHT_SECONDS
        );
    });

    it('partitions uniform-weight tests via exact round-robin while preserving sequence order', () => {
        const tests = Array.from({ length: 10 }, (_, i) =>
            makeTest(`t-${i + 1}`, `Uniform Test ${i + 1}`)
        );

        const s1 = AssignTestsToShard(tests, { index: 1, total: 3 });
        const s2 = AssignTestsToShard(tests, { index: 2, total: 3 });
        const s3 = AssignTestsToShard(tests, { index: 3, total: 3 });

        expect(s1.map(t => t.ID)).toEqual(['t-1', 't-4', 't-7', 't-10']);
        expect(s2.map(t => t.ID)).toEqual(['t-2', 't-5', 't-8']);
        expect(s3.map(t => t.ID)).toEqual(['t-3', 't-6', 't-9']);
    });

    it('spreads heavyweight integration bundles across distinct shards and balances total duration', () => {
        const serverTests: ShardableTest[] = [
            makeTest('1', 'IT01 - Server RunView Cache'),
            makeTest('2', 'IT02 - RunQuery Cache Integrity'),
            makeTest('3', 'IT90 - Field-Level Security Enforcement'),
            makeTest('4', 'IT102 - RunQuery Rendering Matrix'),
            makeTest('5', 'IT133 - FLS Close-out (server)'),
            makeTest('6', 'IT135 - FLS Close-out (cache segmentation)'),
            makeTest('7', 'IT140 - MetadataSync Declared Query Children'),
            makeTest('8', 'IT142 - Query Security'),
            makeTest('9', 'IT143 - SQL Pipeline Scenario Matrix'),
            makeTest('10', 'IT146 - SQL Pipeline Scenario Cross Products'),
            makeTest('11', 'IT151 - Video Studio Production'),
            ...Array.from({ length: 30 }, (_, i) => makeTest(`light-${i + 1}`, `IT20${i} - Light Check`)),
        ];

        const shards = [1, 2, 3].map(index => AssignTestsToShard(serverTests, { index, total: 3 }));

        // 1. Disjoint & complete coverage
        const allAssignedIds = shards.flatMap(s => s.map(t => t.ID));
        expect(allAssignedIds.length).toBe(serverTests.length);
        expect(new Set(allAssignedIds).size).toBe(serverTests.length);

        // 2. IT143 (194s) and IT146 (172s) never land in the same shard, and neither shares a shard with IT02 (60s) + IT142 (55s)
        const shard1Names = shards[0].map(t => t.Name);
        const shard2Names = shards[1].map(t => t.Name);
        const shard3Names = shards[2].map(t => t.Name);
        expect(shard1Names.some(n => n.startsWith('IT143'))).toBe(true);
        expect(shard2Names.some(n => n.startsWith('IT146'))).toBe(true);
        expect(shard3Names.some(n => n.startsWith('IT02'))).toBe(true);
        expect(shard3Names.some(n => n.startsWith('IT142'))).toBe(true);

        // 3. Within every shard, original sequence order is strictly preserved
        const originalOrder = new Map(serverTests.map((t, idx) => [t.ID, idx] as const));
        for (const shard of shards) {
            const indices = shard.map(t => originalOrder.get(t.ID)!);
            expect(indices).toEqual([...indices].sort((a, b) => a - b));
        }

        // 4. Total weights across all 3 shards are balanced within 5 seconds
        const weights = shards.map(s => s.reduce((sum, t) => sum + EstimateTestWeightSeconds(t), 0));
        expect(Math.max(...weights) - Math.min(...weights)).toBeLessThanOrEqual(5);
    });

    it('co-locates realtime-session-guard (IT111) with realtime-session-verification (IT112) in sequence order', () => {
        const tests: ShardableTest[] = [
            makeTest('s1', 'IT143 - Heavy Server 1', { transport: 'server', checks: [{ type: 'sqlpipe-matrix' }] }),
            makeTest('s2', 'IT146 - Heavy Server 2', { transport: 'server', checks: [{ type: 'sqlpipe-cross' }] }),
            makeTest('111', 'IT111 - Realtime Session Config Guard', {
                transport: 'server',
                checks: [{ type: 'realtime-session-guard' }],
            }),
            makeTest('c1', 'IT145 - Heavy Client', {
                transport: 'client',
                checks: [{ type: 'sqlpipe-matrix-client' }],
            }),
            makeTest('112', 'IT112 - Realtime Session Identity Verification', {
                transport: 'client',
                checks: [{ type: 'realtime-session-verification' }],
            }),
        ];

        const shards = [1, 2, 3].map(index => AssignTestsToShard(tests, { index, total: 3 }));
        const shardWith111 = shards.findIndex(s => s.some(t => t.ID === '111'));
        const shardWith112 = shards.findIndex(s => s.some(t => t.ID === '112'));

        expect(shardWith111).toBeGreaterThanOrEqual(0);
        expect(shardWith111).toBe(shardWith112);

        const pairShard = shards[shardWith111].map(t => t.ID);
        expect(pairShard.indexOf('111')).toBeLessThan(pairShard.indexOf('112'));
    });

    it('co-locates custom companion bundles declared via Configuration.coLocateWithBundles', () => {
        const tests: ShardableTest[] = [
            makeTest('h1', 'IT143 - Heavy 1', { checks: [{ type: 'heavy-1' }] }),
            makeTest('h2', 'IT146 - Heavy 2', { checks: [{ type: 'heavy-2' }] }),
            makeTest('seed', 'IT900 - Custom Seed', {
                coLocateWithBundles: ['custom-verify'],
                checks: [{ type: 'custom-seed' }],
            }),
            makeTest('h3', 'IT145 - Heavy 3', { checks: [{ type: 'heavy-3' }] }),
            makeTest('verify', 'IT901 - Custom Verify', {
                estimatedDurationSeconds: 50,
                checks: [{ type: 'custom-verify' }],
            }),
        ];

        const shards = [1, 2, 3].map(index => AssignTestsToShard(tests, { index, total: 3 }));
        const seedShard = shards.findIndex(s => s.some(t => t.ID === 'seed'));
        const verifyShard = shards.findIndex(s => s.some(t => t.ID === 'verify'));

        expect(seedShard).toBeGreaterThanOrEqual(0);
        expect(seedShard).toBe(verifyShard);
        const ids = shards[seedShard].map(t => t.ID);
        expect(ids.indexOf('seed')).toBeLessThan(ids.indexOf('verify'));
    });

    it('partitions the real Integration Tests — Deterministic metadata suite cleanly and guards against weight-table drift', () => {
        const testDir = path.dirname(fileURLToPath(import.meta.url));
        const repoRoot = path.resolve(testDir, '../../../../..');
        const suitePath = path.join(
            repoRoot,
            'metadata-optional/integration-test/test-suites/.integration-suite.json'
        );
        const testsDir = path.join(repoRoot, 'metadata-optional/integration-test/tests/integration');

        interface RawTestRecord {
            fields: {
                Name: string;
                Configuration?: Record<string, unknown>;
                Status?: string;
            };
            primaryKey: { ID: string };
        }
        interface RawSuiteMember {
            fields: {
                TestID: string;
                Sequence: number;
                Status: string;
            };
        }
        interface RawSuiteRecord {
            fields: { Name: string };
            relatedEntities?: {
                'MJ: Test Suite Tests'?: RawSuiteMember[];
            };
        }

        const testsByName = new Map<string, ShardableTest>();
        for (const entry of fs.readdirSync(testsDir)) {
            if (!entry.endsWith('.json')) continue;
            const raw = JSON.parse(fs.readFileSync(path.join(testsDir, entry), 'utf8')) as
                | RawTestRecord
                | RawTestRecord[];
            const records = Array.isArray(raw) ? raw : [raw];
            for (const rec of records) {
                if (rec?.fields?.Name && rec?.primaryKey?.ID) {
                    testsByName.set(rec.fields.Name, {
                        ID: rec.primaryKey.ID,
                        Name: rec.fields.Name,
                        Configuration: rec.fields.Configuration
                            ? JSON.stringify(rec.fields.Configuration)
                            : null,
                    });
                }
            }
        }

        const suites = JSON.parse(fs.readFileSync(suitePath, 'utf8')) as RawSuiteRecord[];
        const deterministicSuite = suites.find(
            s => s.fields?.Name === 'Integration Tests — Deterministic'
        );
        expect(deterministicSuite).toBeDefined();

        const rawMembers = deterministicSuite?.relatedEntities?.['MJ: Test Suite Tests'] ?? [];
        const activeMembers: Array<{ test: ShardableTest; sequence: number }> = [];
        for (const member of rawMembers) {
            if (member.fields.Status !== 'Active') continue;
            const lookupPrefix = '@lookup:MJ: Tests.Name=';
            const testName = member.fields.TestID.startsWith(lookupPrefix)
                ? member.fields.TestID.slice(lookupPrefix.length)
                : member.fields.TestID;
            const test = testsByName.get(testName);
            expect(test, `Missing test file for suite member '${testName}'`).toBeDefined();
            activeMembers.push({ test: test!, sequence: member.fields.Sequence ?? 999999 });
        }

        // Sort identically to TestEngine.filterTestsForExecution (Sequence ASC, Name ASC, ID ASC)
        activeMembers.sort((a, b) => {
            if (a.sequence !== b.sequence) return a.sequence - b.sequence;
            const nameCmp = a.test.Name.localeCompare(b.test.Name);
            if (nameCmp !== 0) return nameCmp;
            return a.test.ID.localeCompare(b.test.ID);
        });
        const orderedTests = activeMembers.map(m => m.test);
        expect(orderedTests.length).toBeGreaterThanOrEqual(130);

        // Guard against drift in KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS: every prefix key must match an active test
        const activePrefixes = new Set(
            orderedTests
                .map(t => /^(IT\d+)\b/.exec(t.Name)?.[1] ?? '')
                .filter(Boolean)
        );
        for (const key of Object.keys(KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS)) {
            expect(
                activePrefixes.has(key),
                `KNOWN_INTEGRATION_TEST_WEIGHTS_SECONDS key '${key}' does not match any active member of Integration Tests — Deterministic`
            ).toBe(true);
        }

        // Transport split + 3-way server sharding must cover 100% of active tests with zero duplicates
        const serverTests = FilterTestsByTransport(orderedTests, 'server');
        const clientTests = FilterTestsByTransport(orderedTests, 'client');
        expect(serverTests.length + clientTests.length).toBe(orderedTests.length);

        const serverShards = [1, 2, 3].map(index =>
            AssignTestsToShard(serverTests, { index, total: 3 })
        );
        const allServerShardIds = serverShards.flatMap(s => s.map(t => t.ID));
        expect(allServerShardIds.length).toBe(serverTests.length);
        expect(new Set(allServerShardIds).size).toBe(serverTests.length);

        // Estimated weights across the 3 server shards are balanced within 5 seconds
        const shardWeights = serverShards.map(s =>
            s.reduce((sum, t) => sum + EstimateTestWeightSeconds(t), 0)
        );
        expect(Math.max(...shardWeights) - Math.min(...shardWeights)).toBeLessThanOrEqual(5);

        // Wire-companion server bundles (IT111, IT127) must be in the client worker ahead of sequence-50+ client tests
        const clientNames = clientTests.map(t => t.Name);
        const idx111 = clientNames.findIndex(n => n.startsWith('IT111 '));
        const idx127 = clientNames.findIndex(n => n.startsWith('IT127 '));
        const idx112 = clientNames.findIndex(n => n.startsWith('IT112 '));
        expect(idx111).toBeGreaterThanOrEqual(0);
        expect(idx127).toBeGreaterThanOrEqual(0);
        expect(idx112).toBeGreaterThan(idx111);
        expect(idx112).toBeGreaterThan(idx127);
    });
});

// ── TestEngine.RunSuite sharding & tied-sequence canonicalization tests ──────────────
const SUITE_ID = 'suite-shard-test';
const TYPE_ID = 'type-shard-test';
const executedNames: string[] = [];

@RegisterClass(BaseTestDriver, 'StubShardDriver')
export class StubShardDriver extends BaseTestDriver {
    public override supportsCancellation(): boolean {
        return true;
    }
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        executedNames.push(context.test.Name);
        return {
            targetType: 'Stub',
            targetLogId: context.testRun.ID,
            status: 'Passed',
            score: 1,
            oracleResults: [{ oracleType: 'stub', passed: true, score: 1, message: 'ok' }],
            passedChecks: 1,
            failedChecks: 0,
            totalChecks: 1,
        };
    }
}

interface EnginePrivates {
    createSuiteRun: (...a: unknown[]) => Promise<MJTestSuiteRunEntity>;
    createTestRun: (...a: unknown[]) => Promise<MJTestRunEntity>;
    updateSuiteRun: (...a: unknown[]) => Promise<void>;
    updateTestRun: (...a: unknown[]) => Promise<void>;
    _variableResolver: { resolveVariables: (...a: unknown[]) => ResolvedTestVariables };
    _driverCache: Map<string, unknown>;
}

function wireEngine(
    tests: MJTestEntity[],
    suiteTests: MJTestSuiteTestEntity[]
): TestEngine {
    const engine = TestEngine.Instance;
    const priv = engine as unknown as EnginePrivates;
    priv._driverCache.clear();

    vi.spyOn(engine, 'GetTestSuiteByID').mockReturnValue({
        ID: SUITE_ID,
        Name: 'Sharded Suite',
        Variables: null,
        Configuration: null,
    } as unknown as MJTestSuiteEntity);
    vi.spyOn(engine, 'GetTestsForSuite').mockReturnValue(tests);
    vi.spyOn(engine, 'GetTestByID').mockImplementation((id: string) => tests.find(t => t.ID === id));
    vi.spyOn(engine, 'GetTestTypeByID').mockReturnValue({
        ID: TYPE_ID,
        Name: 'Stub Shard Type',
        DriverClass: 'StubShardDriver',
        VariablesSchema: null,
    } as unknown as MJTestTypeEntity);
    vi.spyOn(engine, 'TestSuiteTests', 'get').mockReturnValue(suiteTests);

    vi.spyOn(priv, 'createSuiteRun').mockImplementation(
        async () =>
            ({
                ID: 'sr-1',
                StartedAt: new Date(),
                CompletedAt: new Date(),
                Status: 'Running',
            }) as unknown as MJTestSuiteRunEntity
    );
    vi.spyOn(priv, 'createTestRun').mockImplementation(
        async () =>
            ({
                ID: 'tr-1',
                StartedAt: new Date(),
                CompletedAt: new Date(),
                Status: 'Running',
            }) as unknown as MJTestRunEntity
    );
    vi.spyOn(priv, 'updateSuiteRun').mockResolvedValue(undefined);
    vi.spyOn(priv, 'updateTestRun').mockResolvedValue(undefined);
    vi.spyOn(priv._variableResolver, 'resolveVariables').mockReturnValue({
        values: {},
        sources: {},
    } as unknown as ResolvedTestVariables);

    return engine;
}

const USER = { ID: 'u-1', Name: 'Tester', Email: 't@x' } as unknown as UserInfo;

describe('TestEngine.RunSuite with transport & shard options', () => {
    beforeEach(() => {
        executedNames.length = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('produces identical shard assignments even when tied-Sequence tests arrive in different SQL scan orders', async () => {
        const rawSpecs = [
            { id: 't-1', name: 'IT99 - Alpha', seq: 49, transport: 'server' },
            { id: 't-2', name: 'IT143 - Heavy A', seq: 49, transport: 'server' },
            { id: 't-3', name: 'IT146 - Heavy B', seq: 49, transport: 'server' },
            { id: 't-4', name: 'IT102 - Medium', seq: 49, transport: 'server' },
            { id: 't-5', name: 'IT03 - Client 1', seq: 50, transport: 'client' },
            { id: 't-6', name: 'IT25 - Client 2', seq: 51, transport: 'client' },
        ];

        const makeEntities = (specs: typeof rawSpecs) => {
            const tests = specs.map(
                s =>
                    ({
                        ID: s.id,
                        Name: s.name,
                        TypeID: TYPE_ID,
                        Configuration: JSON.stringify({ transport: s.transport }),
                        Variables: null,
                        RepeatCount: null,
                        MaxExecutionTimeMS: null,
                    }) as unknown as MJTestEntity
            );
            const suiteTests = specs.map(
                s =>
                    ({
                        SuiteID: SUITE_ID,
                        TestID: s.id,
                        Sequence: s.seq,
                        Status: 'Active',
                    }) as unknown as MJTestSuiteTestEntity
            );
            return { tests, suiteTests };
        };

        // Run in normal order vs reversed tied-sequence order
        const forward = makeEntities(rawSpecs);
        const reversedTied = makeEntities([
            rawSpecs[3],
            rawSpecs[2],
            rawSpecs[1],
            rawSpecs[0],
            rawSpecs[4],
            rawSpecs[5],
        ]);

        for (let shardIdx = 1; shardIdx <= 2; shardIdx++) {
            executedNames.length = 0;
            const engineA = wireEngine(forward.tests, forward.suiteTests);
            await engineA.RunSuite(
                SUITE_ID,
                { transport: 'server', shard: { index: shardIdx, total: 2 } },
                USER
            );
            const runA = [...executedNames];

            executedNames.length = 0;
            const engineB = wireEngine(reversedTied.tests, reversedTied.suiteTests);
            await engineB.RunSuite(
                SUITE_ID,
                { transport: 'server', shard: { index: shardIdx, total: 2 } },
                USER
            );
            const runB = [...executedNames];

            expect(runA).toEqual(runB);
        }
    });
});
