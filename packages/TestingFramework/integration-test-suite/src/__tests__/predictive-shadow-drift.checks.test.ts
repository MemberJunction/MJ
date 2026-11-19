import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { ResourceTypeEngine, type MJResourceTypeEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { PredictiveShadowDriftChecks } from '../checks/predictive-shadow-drift.checks';

function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'mj.config.cjs'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error(`could not locate the repo root from ${process.cwd()}`);
}

const ROOT = repoRoot();
const META_DIR = path.join(ROOT, 'metadata-optional/integration-test/tests/integration');
const SUITE_FILE = path.join(ROOT, 'metadata-optional/integration-test/test-suites/.integration-suite.json');
const CHECKS_SOURCE = path.join(
    ROOT,
    'packages/TestingFramework/integration-test-suite/src/checks/predictive-shadow-drift.checks.ts',
);

interface MockRecord {
    ID: string;
    IsSaved: boolean;
    LatestResult?: { CompleteMessage: string };
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Delete: () => Promise<boolean>;
    [key: string]: unknown;
}

function buildInMemoryHarness() {
    let seq = 1;
    const featureValueRows: MockRecord[] = [];
    const notificationRows: MockRecord[] = [];
    const recordProcessRows: MockRecord[] = [];

    const makeEntity = (entityName: string): MockRecord => {
        const rec: MockRecord = {
            ID: `${entityName.replace(/[^A-Za-z]/g, '')}-${seq++}`,
            IsSaved: false,
            NewRecord() {
                this.IsSaved = false;
            },
            async Save() {
                this.IsSaved = true;
                if (entityName === 'MJ: Feature Values') {
                    if (!this['ComputedAt']) {
                        this['ComputedAt'] = new Date();
                    }
                    if (!featureValueRows.includes(this)) {
                        featureValueRows.push(this);
                    }
                } else if (entityName === 'MJ: User Notifications') {
                    if (!notificationRows.includes(this)) {
                        notificationRows.push(this);
                    }
                } else if (entityName === 'MJ: Record Processes') {
                    if (!recordProcessRows.includes(this)) {
                        recordProcessRows.push(this);
                    }
                }
                return true;
            },
            async Delete() {
                this.IsSaved = false;
                if (entityName === 'MJ: Feature Values') {
                    const idx = featureValueRows.indexOf(this);
                    if (idx >= 0) featureValueRows.splice(idx, 1);
                } else if (entityName === 'MJ: User Notifications') {
                    const idx = notificationRows.indexOf(this);
                    if (idx >= 0) notificationRows.splice(idx, 1);
                }
                return true;
            },
        };
        if (entityName === 'MJ: Record Processes') {
            let challengerObj: Record<string, unknown> | null = null;
            Object.defineProperty(rec, 'ChallengerConfigurationObject', {
                get() {
                    return challengerObj;
                },
                set(v: Record<string, unknown> | null) {
                    challengerObj = v;
                    rec['ChallengerConfiguration'] = v ? JSON.stringify(v) : null;
                },
                enumerable: true,
                configurable: true,
            });
        }
        return rec;
    };

    const entities: ReadonlyArray<{ readonly ID: string; readonly Name: string }> = [
        { ID: 'ent-members', Name: 'Members' },
        { ID: 'ent-fv', Name: 'MJ: Feature Values' },
    ];
    const provider = {
        Entities: entities,
        EntityByID(id: string) {
            return entities.find((e) => e.ID === id);
        },
        EntityByName(name: string) {
            return entities.find((e) => e.Name === name);
        },
        async GetEntityObject(entityName: string) {
            return makeEntity(entityName);
        },
    } as unknown as IMetadataProvider;

    const runViewCalls: Array<{ EntityName: string; ExtraFilter?: string }> = [];
    const runSingleView = async (params: { EntityName: string; ExtraFilter?: string }) => {
        runViewCalls.push({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter });
        if (params.EntityName === 'MJ: Entities') {
            return { Success: true, Results: [{ ID: 'ent-members' }] };
        }
        if (params.EntityName === 'MJ: ML Algorithms') {
            return { Success: true, Results: [{ ID: 'alg-xgb' }] };
        }
        if (params.EntityName === 'MJ: Feature Values') {
            const filter = params.ExtraFilter ?? '';
            const results = featureValueRows.filter((r) => {
                if (
                    filter.includes("Role = 'Champion'") &&
                    r['Role'] !== 'Champion'
                ) {
                    return false;
                }
                const rpMatch = /RecordProcessID = '([^']+)'/.exec(filter);
                if (rpMatch && r['RecordProcessID'] !== rpMatch[1]) {
                    return false;
                }
                const recMatch = /RecordID = '([^']+)'/.exec(filter);
                if (recMatch && r['RecordID'] !== recMatch[1]) {
                    return false;
                }
                const keyMatch = /ValueKeyHash IN \('([^']+)'\)/.exec(filter);
                if (keyMatch && r['ValueKeyHash'] !== keyMatch[1]) {
                    return false;
                }
                const rowTs = new Date(r['ComputedAt'] as string | Date).getTime();
                const fromMatch = /ComputedAt >= '([^']+)'/.exec(filter);
                if (fromMatch && rowTs < new Date(fromMatch[1]).getTime()) {
                    return false;
                }
                const beforeMatch = /ComputedAt < '([^']+)'/.exec(filter);
                if (beforeMatch && rowTs >= new Date(beforeMatch[1]).getTime()) {
                    return false;
                }
                return true;
            });
            return { Success: true, Results: results };
        }
        if (params.EntityName === 'MJ: User Notifications' || params.EntityName === 'MJ: Record Processes') {
            // Reads by `ID = '…'` or `ID IN ('…', …)`
            const ids = [...(params.ExtraFilter ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
            const rows = params.EntityName === 'MJ: User Notifications' ? notificationRows : recordProcessRows;
            return { Success: true, Results: rows.filter((r) => r.IsSaved && ids.includes(r.ID)) };
        }
        return { Success: true, Results: [] };
    };
    const runViewSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation(
        () =>
            ({
                RunView: runSingleView,
                RunViews: async (batch: Array<{ EntityName: string; ExtraFilter?: string }>) =>
                    Promise.all(batch.map((p) => runSingleView(p))),
            }) as unknown as RunView,
    );

    // The harness runs as an Owner (BootstrapIntegrationServer's resolveContextUser), not as the system user.
    const user = new UserInfo(undefined, {
        ID: 'A6F3D2C1-4B5E-4F70-8A9B-0C1D2E3F4A5B',
        Name: 'Integration Owner',
        Email: 'integration-owner@example.com',
        Type: 'Owner',
        IsActive: true,
    });
    UserCache.Instance.SetUsers([user]);
    vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) =>
        name === 'Records' ? ({ ID: 'rt-records', Name: 'Records' } as MJResourceTypeEntity) : undefined,
    );
    const ctx = { Provider: provider, User: user } as unknown as IntegrationCheckContext;

    return { ctx, featureValueRows, notificationRows, recordProcessRows, runViewCalls, runViewSpy };
}

describe('PredictiveShadowDriftChecks and IT166 metadata (R1, R3, R6)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        UserCache.Instance.SetUsers([]);
    });

    it('registers IT166 (without colliding with IT164 or IT165) and uses non-hand-typed v4 UUIDs (R3, R6a)', () => {
        const it166Path = path.join(META_DIR, '.IT166-predictive-shadow-drift.json');
        expect(fs.existsSync(it166Path)).toBe(true);
        expect(fs.existsSync(path.join(META_DIR, '.IT164-predictive-shadow-drift.json'))).toBe(false);

        const it166 = JSON.parse(fs.readFileSync(it166Path, 'utf8')) as {
            fields: { Name: string };
            primaryKey: { ID: string };
        };
        expect(it166.fields.Name).toBe('IT166 - Predictive Shadow Scoring and Drift');
        expect(it166.primaryKey.ID).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
        expect(it166.primaryKey.ID).not.toBe('8D4E2F91-5A3B-4C7E-91D2-6E8F0A1B2C3D');

        // Verify no duplicate IT<N> prefixes exist across all integration test files
        const prefixes = new Map<string, string[]>();
        for (const file of fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json'))) {
            const m = /^\.?(IT\d+)-/.exec(file);
            if (!m) continue;
            const list = prefixes.get(m[1]) ?? [];
            list.push(file);
            prefixes.set(m[1], list);
        }
        expect(prefixes.get('IT166')).toEqual(['.IT166-predictive-shadow-drift.json']);

        const suites = JSON.parse(fs.readFileSync(SUITE_FILE, 'utf8')) as Array<{
            fields?: { Name?: string };
            relatedEntities?: {
                'MJ: Test Suite Tests'?: Array<{
                    fields: { TestID: string };
                    primaryKey: { ID: string };
                }>;
            };
        }>;
        const detSuite = suites.find((s) => s.fields?.Name === 'Integration Tests — Deterministic');
        const member = detSuite?.relatedEntities?.['MJ: Test Suite Tests']?.find(
            (t) => t.fields.TestID === '@lookup:MJ: Tests.Name=IT166 - Predictive Shadow Scoring and Drift',
        );
        expect(member).toBeDefined();
        expect(member?.primaryKey.ID).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
        expect(member?.primaryKey.ID).not.toBe('C94F1A82-7E3B-4D6A-82C1-5B9E0F3A4D2E');
    });

    it("PSD1 scores a bound process through ScoringService and asserts Model rows of two runs; it writes no Pipeline row and skips, naming why, on a provider that cannot place model status by SQL (D-069)", async () => {
        const source = fs.readFileSync(CHECKS_SOURCE, 'utf8');
        const psd1Source = source.slice(source.indexOf("Id: 'predictive-shadow-drift.PSD1'"), source.indexOf("Id: 'predictive-shadow-drift.PSD2'"));
        expect(source).not.toContain('RecordFeatureValues(');
        expect(source).not.toMatch(/new ShadowScoringCoordinator\(|FeatureValueShadowAuditSink|MLModelChallengerScoreRunner|awaits M6\.8/);
        expect(psd1Source).toContain('new ScoringService(');
        expect(source).toContain("AssertEqual(runRows.length, 2, 'one MJ: ML Scoring Runs row per role')");

        const { ctx } = buildInMemoryHarness();
        const psd1 = PredictiveShadowDriftChecks.find((c) => c.Id === 'predictive-shadow-drift.PSD1');
        expect(psd1).toBeDefined();
        await expect(psd1!.Fn(ctx)).rejects.toMatchObject({ name: 'IntegrationCheckSkip', message: 'PSD1 needs a database provider: its fixtures place model status by SQL' });
    });

    it("PSD2 measures the binding's mirror with the monitoring driver's own step and reads it back from the champion's MJ: ML Monitoring Results row; it skips, naming why, on a provider that cannot place model status by SQL (M6.8)", async () => {
        const source = fs.readFileSync(CHECKS_SOURCE, 'utf8');
        const psd2Source = source.slice(source.indexOf("Id: 'predictive-shadow-drift.PSD2'"));
        expect(source).not.toMatch(/EvaluateFeatureAndPrediction|EVALUATE_DRIFT|PSIDrift/);
        expect(source).toContain('this.MeasureDivergence(plan, join, period, monitoring)');
        expect(source).toContain("EntityName: 'MJ: ML Monitoring Results'");
        expect(psd2Source).toContain('new Psd2MirrorDriver().MeasureAndStore(');

        const { ctx } = buildInMemoryHarness();
        const psd2 = PredictiveShadowDriftChecks.find((c) => c.Id === 'predictive-shadow-drift.PSD2');
        expect(psd2).toBeDefined();
        await expect(psd2!.Fn(ctx)).rejects.toMatchObject({ name: 'IntegrationCheckSkip', message: 'PSD2 needs a database provider: its fixtures place model status by SQL' });
    });
});
