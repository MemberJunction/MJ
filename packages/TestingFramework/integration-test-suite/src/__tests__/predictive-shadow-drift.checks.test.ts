import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ActionInfo } from '@memberjunction/actions-base';
import {
    EVALUATE_DRIFT_DRIVER_CLASS,
    EvaluateFeatureAndPredictionDriftAction,
} from '@memberjunction/predictive-studio';
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

    const provider = {
        Entities: [
            { ID: 'ent-members', Name: 'Members' },
            { ID: 'ent-fv', Name: 'MJ: Feature Values' },
        ],
        EntityByID(id: string) {
            return this.Entities.find((e) => e.ID === id);
        },
        EntityByName(name: string) {
            return this.Entities.find((e) => e.Name === name);
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
                const compMatch = /ComputedAt >= '([^']+)'/.exec(filter);
                if (compMatch) {
                    const rowTs = new Date(r['ComputedAt'] as string | Date).getTime();
                    const minTs = new Date(compMatch[1]).getTime();
                    if (rowTs < minTs) {
                        return false;
                    }
                }
                return true;
            });
            return { Success: true, Results: results };
        }
        if (params.EntityName === 'MJ: User Notifications') {
            return { Success: true, Results: [...notificationRows] };
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

    const user = { ID: 'user-it-1', Name: 'IT Tester', Email: 'it@example.com' } as unknown as UserInfo;
    const ctx = { Provider: provider, User: user } as unknown as IntegrationCheckContext;

    return { ctx, featureValueRows, notificationRows, runViewCalls, runViewSpy };
}

describe('PredictiveShadowDriftChecks and IT166 metadata (R1, R3, R6)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        EvaluateFeatureAndPredictionDriftAction.SetDefaultAlertEmitter(null);
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

    it('PSD1 persists Role=Champion via MLModelInferenceProcessor + ShadowScoringCoordinator without manual RecordFeatureValues seeding in the check (R1)', async () => {
        const source = fs.readFileSync(CHECKS_SOURCE, 'utf8');
        expect(source).not.toContain('RecordFeatureValues(');

        const { ctx } = buildInMemoryHarness();
        const psd1 = PredictiveShadowDriftChecks.find((c) => c.Id === 'predictive-shadow-drift.PSD1');
        expect(psd1).toBeDefined();

        await expect(psd1!.Fn(ctx)).resolves.toBeUndefined();
    });

    it('PSD2 verifies real ActionEngineServer registration (no fallback action object) and exercises both MinSampleSize=100 InsufficientData and MinSampleSize=10 Critical drift (R6b, R6c)', async () => {
        const source = fs.readFileSync(CHECKS_SOURCE, 'utf8');
        expect(source).not.toContain('6A2D5E81-3C49-4F8B-91B2-0D8E4F7C1A00');

        const { ctx } = buildInMemoryHarness();
        const psd2 = PredictiveShadowDriftChecks.find((c) => c.Id === 'predictive-shadow-drift.PSD2');
        expect(psd2).toBeDefined();

        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([
            {
                ID: '9673E816-6985-4773-B172-E669522FC13D',
                Name: 'Evaluate Feature and Prediction Drift',
                DriverClass: EVALUATE_DRIFT_DRIVER_CLASS,
                Type: 'Custom',
                Status: 'Active',
            } as unknown as ActionInfo,
        ]);
        const runActionSpy = vi
            .spyOn(ActionEngineServer.Instance, 'RunAction')
            .mockImplementation(async (runParams) => {
                const action = new EvaluateFeatureAndPredictionDriftAction();
                return await action.Run(runParams);
            });

        await expect(psd2!.Fn(ctx)).resolves.toBeUndefined();
        expect(runActionSpy).toHaveBeenCalledTimes(3);
    });
});
