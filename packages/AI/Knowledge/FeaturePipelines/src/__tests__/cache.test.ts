import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureValueCacheService, FeatureValueKeyError, FeatureValueSaveError } from '../cache/FeatureValueCacheService';
import { FeatureValueKey, type FeatureValueKeyInput } from '../spec/feature-value-key';
import type { UserInfo, IMetadataProvider, RunQueryParams, RunViewParams } from '@memberjunction/core';
import { FEATURE_VALUE_LOCK_QUERIES } from '../cache/feature-value-locks';

/**
 * Wall-clock ceiling for the pathological-input check (5,000-digit string). It guards against
 * catastrophic/polynomial backtracking (seconds), not machine speed: tight millisecond bounds
 * fail on shared CI runners (v6.3.0-edge.0's publish gate failed one at 211 ms vs 200 ms).
 */
const PATHOLOGICAL_INPUT_CEILING_MS = 1000;

/**
 * The RunView stand-in: each call returns the next entry of `queue` when there is one, else `mockResults`; tests read
 * the `lastParams` (and every call's params in `calls`) the service passed.
 */
const { MockRunView, MockRunQuery, logErrorSpy } = vi.hoisted(() => {
    class MockRunView {
        public static mockResults: object[] = [];
        public static queue: object[][] = [];
        public static lastParams: RunViewParams | undefined;
        public static calls: RunViewParams[] = [];
        /** Each RunViews batch the service sent. */
        public static batches: RunViewParams[][] = [];
        /** When set, every read fails with this message. */
        public static failWith: string | undefined;
        public static FromMetadataProvider() { return new MockRunView(); }
        public async RunView(params: RunViewParams) {
            MockRunView.lastParams = params;
            MockRunView.calls.push(params);
            if (MockRunView.failWith) {
                return { Success: false, Results: [], ErrorMessage: MockRunView.failWith };
            }
            const rawResults = MockRunView.queue.shift() ?? MockRunView.mockResults;
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            const filtered = filter.includes("Role = 'Champion'")
                ? rawResults.filter((r) => (r as { Role?: string }).Role !== 'Challenger')
                : rawResults;
            const results = typeof params.MaxRows === 'number' && params.MaxRows > 0
                ? filtered.slice(0, params.MaxRows)
                : filtered;
            return {
                Success: true,
                Results: results,
            };
        }
        public async RunViews(params: RunViewParams[]) {
            MockRunView.batches.push(params);
            return Promise.all(params.map((p) => this.RunView(p)));
        }
    }
    /** The open-row lock Queries: each call returns the next entry of `queue` (the locked rows), else none. */
    class MockRunQuery {
        public static queue: Array<Record<string, string | number | null>[]> = [];
        public static calls: RunQueryParams[] = [];
        public async RunQuery(params: RunQueryParams) {
            MockRunQuery.calls.push(params);
            return { Success: true, Results: MockRunQuery.queue.shift() ?? [], ErrorMessage: '' };
        }
    }
    return { MockRunView, MockRunQuery, logErrorSpy: vi.fn() };
});

// Mock RunView so we don't hit a real database in unit tests; LogError is captured so failures are asserted, not printed
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: MockRunView,
        RunQuery: MockRunQuery,
        LogError: logErrorSpy,
    };
});

/**
 * A provider exposing GetEntityObject, saved queries (the mocked RunQuery runs them) and no entity metadata (so a Human
 * value's record stamp is unknown).
 */
function stubProvider(getEntityObject: ReturnType<typeof vi.fn>): IMetadataProvider {
    return { GetEntityObject: getEntityObject, RunQuery: vi.fn(), EntityByID: vi.fn(() => undefined) } as Partial<IMetadataProvider> as IMetadataProvider;
}

/** The latest-value order every latest-value read shares: newest ComputedAt, ties broken by creation time, then ID. */
const LATEST_ORDER = 'ComputedAt DESC, __mj_CreatedAt DESC, ID DESC';

describe('FeatureValueCacheService', () => {
    const mockUser = { ID: 'user-1', Email: 'test@example.com' } as unknown as UserInfo;

    beforeEach(() => {
        MockRunView.mockResults = [];
        MockRunView.queue = [];
        MockRunView.lastParams = undefined;
        MockRunView.calls = [];
        MockRunView.batches = [];
        MockRunView.failWith = undefined;
        MockRunQuery.queue = [];
        MockRunQuery.calls = [];
        logErrorSpy.mockClear();
    });
    /** The provider the cache calls run on; the mocked RunView ignores it. */
    const lookupProvider = stubProvider(vi.fn());

    describe('computeCacheKey', () => {
        it('computes deterministic key hash and legible display with KeyFields', async () => {
            const keyResult1 = await FeatureValueCacheService.Instance.computeCacheKey({
                keyFields: ['Title', 'Department'],
                recordData: { Title: 'Director of Marketing', Department: 'Marketing', ExtraField: 'ignored' },
            });

            // Reordered fields in recordData should produce identical hash (canonical JSON)
            const keyResult2 = await FeatureValueCacheService.Instance.computeCacheKey({
                keyFields: ['Title', 'Department'],
                recordData: { Department: 'Marketing', Title: 'Director of Marketing', OtherField: 123 },
            });

            expect(keyResult1.keyHash).toBe(keyResult2.keyHash);
            expect(keyResult1.keyDisplay).toBe('Director of Marketing | Marketing');
            expect(keyResult1.keyJSON).toBe(JSON.stringify({ Department: 'marketing', Title: 'director of marketing' }));
        });

        it('falls back to whole rendered context when KeyFields is omitted', async () => {
            const contextText = 'Customer reported high satisfaction with support agent Alice.';
            const keyResult = await FeatureValueCacheService.Instance.computeCacheKey({
                renderedContext: contextText,
                recordData: { ID: 'rec-123' },
            });

            expect(keyResult.keyHash).toBeDefined();
            expect(keyResult.keyDisplay).toBe(contextText);
            expect(keyResult.keyJSON).toContain('customer reported high satisfaction');
        });
    });

    describe('Lookup and BatchLookup', () => {
        it('returns cached entry and increments HitCount on valid cache hit', async () => {
            const mockSave = vi.fn().mockResolvedValue(true);
            const mockEntry = {
                ID: 'cache-1',
                KeyHash: 'key-abc',
                OutputsJSON: JSON.stringify({ seniority: 'Director', function: 'Marketing' }),
                Reasoning: 'Role title contains Director and Marketing',
                HitCount: 3,
                ExpiresAt: null,
                Save: mockSave,
            };

            MockRunView.mockResults = [mockEntry];

            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                aiModelID: 'model-1',
                parametersHash: 'params-1',
                provider: lookupProvider,
                keyHash: 'key-abc',
                contextUser: mockUser,
            });

            expect(result).toBeDefined();
            expect(result?.ID).toBe('cache-1');
            expect(mockEntry.HitCount).toBe(4);
            expect(mockSave).toHaveBeenCalled();
        });

        it('discards and ignores expired cache entries', async () => {
            const expiredEntry = {
                ID: 'cache-expired',
                KeyHash: 'key-expired',
                OutputsJSON: JSON.stringify({ role: 'Junior' }),
                ExpiresAt: new Date(Date.now() - 60000), // 1 minute ago
                HitCount: 5,
                Save: vi.fn(),
            };

            MockRunView.mockResults = [expiredEntry];

            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                aiModelID: 'model-1',
                parametersHash: 'params-1',
                provider: lookupProvider,
                keyHash: 'key-expired',
                contextUser: mockUser,
            });

            expect(result).toBeNull();
        });

        it('filters on the pin (AI model and parameters hash) and can skip recording the hit', async () => {
            const mockSave = vi.fn().mockResolvedValue(true);
            const mockEntry = { ID: 'cache-2', KeyHash: 'key-pin', OutputsJSON: '{}', HitCount: 1, ExpiresAt: null, Save: mockSave };
            const mockRunView = MockRunView;
            mockRunView.mockResults = [mockEntry];

            const hits = await FeatureValueCacheService.Instance.BatchLookup({
                recordProcessID: 'rp-1',
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                aiModelID: 'model-1',
                parametersHash: 'params-1',
                provider: lookupProvider,
                keyHashes: ['key-pin'],
                recordHit: false,
                contextUser: mockUser,
            });

            expect(hits.get('key-pin')?.ID).toBe('cache-2');
            expect(mockRunView.lastParams?.ExtraFilter).toContain("RecordProcessID = 'rp-1'");
            expect(mockRunView.lastParams?.ExtraFilter).toContain("AIModelID = 'model-1' AND ParametersHash = 'params-1'");
            expect(mockRunView.lastParams?.ExtraFilter).toContain("KeyHash IN ('key-pin')");
            expect(mockEntry.HitCount).toBe(1);
            expect(mockSave).not.toHaveBeenCalled();
        });

        it('matches a prompt without an Active model on AIModelID IS NULL', async () => {
            const mockRunView = MockRunView;
            await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                aiModelID: null,
                parametersHash: 'params-1',
                provider: lookupProvider,
                keyHash: 'key-any',
                contextUser: mockUser,
            });
            expect(mockRunView.lastParams?.ExtraFilter).toContain('RecordProcessID IS NULL');
            expect(mockRunView.lastParams?.ExtraFilter).toContain('AIModelID IS NULL');
        });

        it('returns null on cache miss', async () => {
            MockRunView.mockResults = [];

            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                aiModelID: 'model-1',
                parametersHash: 'params-1',
                provider: lookupProvider,
                keyHash: 'key-nonexistent',
                contextUser: mockUser,
            });

            expect(result).toBeNull();
        });

        it('logs a hit count that cannot be saved and still returns the entry', async () => {
            const mockEntry = { ID: 'cache-3', KeyHash: 'key-3', OutputsJSON: '{}', HitCount: 0, ExpiresAt: null,
                Save: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'deadlock victim' } };
            MockRunView.mockResults = [mockEntry];
            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1', promptVersionHash: 'p-hash-1', constraintHash: 'c-hash-1', aiModelID: 'model-1',
                parametersHash: 'params-1', keyHash: 'key-3', contextUser: mockUser, provider: lookupProvider,
            });
            expect(result?.ID).toBe('cache-3');
            expect(mockEntry.Save).toHaveBeenCalledTimes(1);
            await vi.waitFor(() => expect(logErrorSpy).toHaveBeenCalled());
            expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining("failed updating HitCount on cache 'cache-3': deadlock victim"));
        });
    });

    describe('RecordFeatureValues (effective-dated, on the identity\'s open row)', () => {
        const pin = { pipelineVersion: 3, aiModelID: 'm-1', parametersHash: 'ph', inputHash: 'in-1', source: 'Pipeline' as const };
        const keyInput: FeatureValueKeyInput = {
            EntityID: 'ent-1', RecordID: 'rec-1', FeatureName: 'SeniorityLevel', PipelineVersion: 3, PromptVersionHash: 'pv',
            AIModelID: 'm-1', ParametersHash: 'ph', InputHash: 'in-1', Source: 'Pipeline' as const,
        };
        const noValue = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
        function providerWith(rowsSaved: Array<Record<string, unknown>>): IMetadataProvider {
            return stubProvider(vi.fn().mockImplementation(async () => {
                const row: Record<string, unknown> = {
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockImplementation(async () => { rowsSaved.push({ ...row }); return true; }),
                };
                return row;
            }));
        }
        const params = (provider: IMetadataProvider) => ({
            recordProcessID: 'rp-1', entityID: 'ent-1', recordID: 'rec-1', promptID: 'p-1', promptVersionHash: 'pv',
            constraintHash: 'c', processRunID: 'run-2', ...pin,
            outputs: [{ featureName: 'SeniorityLevel', value: 'Director', reasoning: 'Title says Director', confidence: 0.9 }],
            contextUser: mockUser, provider,
        });
        /** The identity's open row of version 3, as the lock and the read by ID return it. */
        const openRow = (columns: Record<string, unknown>): Record<string, unknown> => ({
            ID: 'fv-1', RecordProcessID: 'rp-1', MLModelScoringBindingID: null, EntityID: 'ent-1', RecordID: 'rec-1', FeatureName: 'SeniorityLevel',
            PipelineVersion: 3, Source: 'Pipeline', Role: 'Champion', InputHash: 'in-1', EffectiveAsOf: new Date('2026-10-01T00:00:00Z'), EffectiveTo: null,
            ...noValue, Save: vi.fn().mockResolvedValue(true), NewRecord: vi.fn(), ...columns,
        });

        it('inserts a dated, keyed Pipeline row when the identity has no open row, under the Pipeline lock', async () => {
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith(saved)));
            expect(outcome).toEqual({ Upserted: 1, Unchanged: 0, Closed: 0, Previous: { SeniorityLevel: null } });
            expect(saved[0]).toMatchObject({ Source: 'Pipeline', PipelineVersion: 3, ValueText: 'Director', AIModelID: 'm-1', ParametersHash: 'ph', InputHash: 'in-1', EffectiveTo: null });
            expect(saved[0].ValueKeyHash).toBe(await FeatureValueKey.ComputeHash(keyInput));
            expect(saved[0].EffectiveAsOf).toBeInstanceOf(Date);
            expect(MockRunQuery.calls.map((c) => [c.QueryName, c.Parameters])).toEqual([
                [FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, { EntityID: 'ent-1', RecordID: 'rec-1', FeatureNames: ['SeniorityLevel'], RecordProcessID: 'rp-1' }],
            ]);
        });

        it('leaves an open row holding the same value for the same input untouched (no new row, no save)', async () => {
            const own = openRow({ ValueText: 'Director' });
            MockRunQuery.queue = [[{ ID: 'fv-1', FeatureName: 'SeniorityLevel', PipelineVersion: 3 }]];
            MockRunView.queue = [[own], [own]];
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith(saved)));
            expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Closed: 0, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Director' } } });
            expect(own.Save).not.toHaveBeenCalled();
            expect(saved).toHaveLength(0);
            expect(MockRunView.calls[0].ExtraFilter).toBe("ID IN ('fv-1') AND EffectiveTo IS NULL");
        });

        it('makes an unchanged open row the latest again when another row holds the latest value, touching no range column', async () => {
            // a newer version wrote Manager last; this version's open row still holds Director, which the run computes again
            const computedBefore = new Date('2026-10-01T00:00:00Z');
            const own = openRow({ ValueText: 'Director', ComputedAt: computedBefore, ProcessRunID: 'run-1' });
            const newer = { ID: 'fv-9', FeatureName: 'SeniorityLevel', ValueKeyHash: 'newer-version-key', ...noValue, ValueText: 'Manager' };
            MockRunQuery.queue = [[{ ID: 'fv-1', FeatureName: 'SeniorityLevel', PipelineVersion: 3 }]];
            MockRunView.queue = [[own], [newer]];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith([])));
            expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Closed: 0, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(own.Save).toHaveBeenCalledTimes(1);
            expect(own.ProcessRunID).toBe('run-2');
            expect(own.ComputedAt).not.toBe(computedBefore);
            expect([own.EffectiveAsOf, own.EffectiveTo]).toEqual([new Date('2026-10-01T00:00:00Z'), null]);
        });

        it('leaves an identical history row (a superseded decision) alone, and never opens one', async () => {
            const keyHash = await FeatureValueKey.ComputeHash(keyInput);
            const answer = { ID: 'fv-9', FeatureName: 'SeniorityLevel', ValueKeyHash: 'answer-key', ...noValue, ValueText: 'Manager' };
            const history = openRow({ ID: 'fv-2', ValueKeyHash: keyHash, ValueText: 'Director', EffectiveTo: new Date('2026-10-01T00:00:00Z') });
            MockRunView.queue = [[answer], [history]];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith([])), historyOnly: true });
            expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Closed: 0, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(history.Save).not.toHaveBeenCalled();
            expect(MockRunView.calls[1].ExtraFilter).toBe(`RecordProcessID = 'rp-1' AND ValueKeyHash = '${keyHash}' AND Role = 'Champion' AND EffectiveTo IS NOT NULL`);
        });

        it('writes a new historyOnly row already closed', async () => {
            const saved: Array<Record<string, unknown>> = [];
            await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), historyOnly: true });
            expect(saved).toHaveLength(1);
            expect(saved[0].EffectiveTo).toEqual(saved[0].EffectiveAsOf);
        });

        it('closes the open row and opens a new one when the value changed, returning the value it had before', async () => {
            const existing = openRow({ ValueText: 'Manager' });
            MockRunQuery.queue = [[{ ID: 'fv-1', FeatureName: 'SeniorityLevel', PipelineVersion: 3 }]];
            MockRunView.queue = [[existing], [existing]];
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith(saved)));
            expect(outcome).toEqual({ Upserted: 1, Unchanged: 0, Closed: 1, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(existing.ValueText).toBe('Manager');
            expect(existing.EffectiveTo).toEqual(saved[0].EffectiveAsOf);
            expect(saved[0]).toMatchObject({ ValueText: 'Director', EffectiveTo: null, ProcessRunID: 'run-2' });
        });

        it('returns the latest pipeline value of the feature as Previous when the input changed', async () => {
            const oldRow = { ID: 'fv-7', FeatureName: 'SeniorityLevel', ValueKeyHash: 'old-key', ...noValue, ValueText: 'Manager' };
            MockRunView.queue = [[oldRow]];
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), inputHash: 'in-2' });
            expect(outcome).toEqual({ Upserted: 1, Unchanged: 0, Closed: 0, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(saved[0].InputHash).toBe('in-2');
            const latest = MockRunView.calls[0];
            expect(latest.ExtraFilter).toContain("RecordProcessID = 'rp-1' AND EntityID = 'ent-1'");
            expect(latest.ExtraFilter).toContain("RecordID = 'rec-1' AND Source = 'Pipeline'");
            expect(latest.ExtraFilter).toContain("FeatureName = 'SeniorityLevel'");
            expect(latest.ExtraFilter).not.toContain('ValueKeyHash');
            expect(latest.OrderBy).toBe(LATEST_ORDER);
        });

        it('reads only each feature\'s newest row, and only its value, ID and key columns, in one batch', async () => {
            const row = (name: string, v: string) => ({ ID: `fv-${name}`, FeatureName: name, ...noValue, ValueText: v });
            MockRunView.queue = [[row('SeniorityLevel', 'VP')], [row('Department', 'Sales')]];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({
                ...params(providerWith([])),
                outputs: [{ featureName: 'SeniorityLevel', value: 'Director' }, { featureName: 'Department', value: 'Sales' }],
            });
            expect(outcome.Previous.SeniorityLevel?.ValueText).toBe('VP');
            expect(outcome.Previous.Department?.ValueText).toBe('Sales');
            const [first, second] = MockRunView.calls;
            for (const view of [first, second]) {
                expect(view.MaxRows).toBe(1);
                expect(view.OrderBy).toBe(LATEST_ORDER);
                expect(view.ResultType).toBeUndefined();
                expect(view.Fields).toEqual(['FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean', 'ValueDate', 'ValueJSON', 'ID', 'ValueKeyHash']);
            }
            expect(second.ExtraFilter).toContain("FeatureName = 'Department'");
        });

        it('keys a row the same for a UUID record ID in any case', async () => {
            const saved: Array<Record<string, unknown>> = [];
            const upper = '0F1A7E00-0000-4000-8000-000000000101';
            await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), recordID: upper });
            await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), recordID: upper.toLowerCase() });
            expect(saved[0].ValueKeyHash).toBe(saved[1].ValueKeyHash);
        });

        it('writes the typed value columns for each value type', async () => {
            const saved: Array<Record<string, unknown>> = [];
            await FeatureValueCacheService.Instance.RecordFeatureValues({
                ...params(providerWith(saved)),
                outputs: [
                    { featureName: 'RiskScore', value: 0.85, confidence: 0.95 },
                    { featureName: 'IsEscalated', value: true },
                    { featureName: 'Functions', value: [{ ID: 'f-1' }] },
                ],
            });
            expect(saved.map((r) => [r.ValueNumeric, r.ValueBoolean, r.ValueJSON])).toEqual([
                [0.85, null, null], [null, true, null], [null, null, '[{"ID":"f-1"}]'],
            ]);
            expect(saved[0].Confidence).toBe(0.95);
        });

        it('throws when a Feature Value cannot be saved', async () => {
            const provider = stubProvider(vi.fn().mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(false),
                LatestResult: { CompleteMessage: 'FK_FeatureValue_Entity' } }));
            const failure = FeatureValueCacheService.Instance.RecordFeatureValues(params(provider));
            await expect(failure).rejects.toBeInstanceOf(FeatureValueSaveError);
            await expect(failure).rejects.toMatchObject({ FeatureName: 'SeniorityLevel', RecordID: 'rec-1', ProviderMessage: 'FK_FeatureValue_Entity' });
        });

        // a writer the lock did not serialise opened the identity's row between this write's lock and its insert
        describe('an insert that fails on an open-row index', () => {
            const duplicate = "Cannot insert duplicate key row in object '__mj.FeatureValue' with unique index 'UQ_FeatureValue_OpenPipeline'. The duplicate key value is (rp-1, abc).";
            const stored = (valueText: string) => ({ ID: 'fv-5', FeatureName: 'SeniorityLevel', ...noValue, ValueText: valueText, Reasoning: 'another run', Confidence: 0.5 });

            it.each([
                ['returns false', () => vi.fn().mockResolvedValue(false)],
                ['rejects', () => vi.fn().mockRejectedValue(new Error(duplicate))],
            ])('counts it Unchanged when the save %s and the open row read again holds the same typed value', async (_how, makeSave) => {
                MockRunView.queue = [[], [stored('Director')]];
                const save = makeSave();
                const provider = stubProvider(vi.fn().mockResolvedValue({ NewRecord: vi.fn(), Save: save, LatestResult: { CompleteMessage: duplicate } }));
                const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(provider));
                expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Closed: 0, Previous: { SeniorityLevel: null } });
                expect(save).toHaveBeenCalledTimes(1);
                const reread = MockRunView.calls[1];
                expect(reread.ExtraFilter).toBe("RecordProcessID = 'rp-1' AND EntityID = 'ent-1' AND RecordID = 'rec-1' AND FeatureName = 'SeniorityLevel' AND Source = 'Pipeline' AND Role = 'Champion' AND EffectiveTo IS NULL AND PipelineVersion = 3");
                expect(reread.BypassCache).toBe(true);
            });

            it('throws the save error when the open row another writer stored holds a different value', async () => {
                MockRunView.queue = [[], [stored('Manager')]];
                const provider = stubProvider(vi.fn().mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(false),
                    LatestResult: { CompleteMessage: duplicate } }));
                const failure = FeatureValueCacheService.Instance.RecordFeatureValues(params(provider));
                await expect(failure).rejects.toBeInstanceOf(FeatureValueSaveError);
                await expect(failure).rejects.toMatchObject({ ProviderMessage: duplicate });
            });

            it('throws a rejected save that is not a duplicate key without re-reading', async () => {
                MockRunView.queue = [[]];
                const provider = stubProvider(vi.fn().mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockRejectedValue(new Error('deadlock victim')) }));
                const failure = FeatureValueCacheService.Instance.RecordFeatureValues(params(provider));
                await expect(failure).rejects.toMatchObject({ ProviderMessage: 'deadlock victim' });
                expect(MockRunView.calls).toHaveLength(1);
            });
        });
    });

    describe('Store', () => {
        const base = {
            recordProcessID: 'rp-1', promptID: 'p-1', promptVersionHash: 'pv', constraintHash: 'c', aiModelID: 'm-1',
            parametersHash: 'ph', keyHash: 'k-owner', keyDisplay: 'Owner', keyJSON: '{"t":"owner"}',
            outputsJSON: '{"SeniorityLevel":"C-Level"}', ttlSeconds: 2592000, contextUser: mockUser,
        };

        it('refreshes an expired row in place instead of inserting a duplicate', async () => {
            const expired = {
                ID: 'cache-owner', KeyHash: 'k-owner', OutputsJSON: '{"SeniorityLevel":"Manager"}', HitCount: 9,
                ExpiresAt: new Date(Date.now() - 60_000), Save: vi.fn().mockResolvedValue(true), LatestResult: null,
            };
            MockRunView.mockResults = [expired];
            const getEntityObject = vi.fn();
            const provider = stubProvider(getEntityObject);
            const stored = await FeatureValueCacheService.Instance.Store({ ...base, provider });
            expect(getEntityObject).not.toHaveBeenCalled();
            expect(stored.ID).toBe('cache-owner');
            expect(stored.OutputsJSON).toBe('{"SeniorityLevel":"C-Level"}');
            expect(new Date(stored.ExpiresAt as Date).getTime()).toBeGreaterThan(Date.now());
            expect(expired.Save).toHaveBeenCalledTimes(1);
            const filter = MockRunView.lastParams?.ExtraFilter ?? '';
            expect(filter).toContain("RecordProcessID = 'rp-1'");
            expect(filter).toContain("PromptID = 'p-1'");
            expect(filter).toContain("PromptVersionHash = 'pv'");
            expect(filter).toContain("ConstraintHash = 'c'");
            expect(filter).toContain("AIModelID = 'm-1'");
            expect(filter).toContain("ParametersHash = 'ph'");
            expect(filter).toContain("KeyHash = 'k-owner'");
            expect(filter).not.toContain('ExpiresAt');
        });

        it('inserts when no row exists for the key', async () => {
            MockRunView.mockResults = [];
            const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) };
            const provider = stubProvider(vi.fn().mockResolvedValue(row));
            await FeatureValueCacheService.Instance.Store({ ...base, provider });
            expect(row.NewRecord).toHaveBeenCalled();
            expect(row.AIModelID).toBe('m-1');
            expect(row.ParametersHash).toBe('ph');
            expect(row.HitCount).toBe(0);
        });

        it('throws with the provider message when the save fails', async () => {
            MockRunView.mockResults = [];
            const row = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'UQ violation' } };
            const provider = stubProvider(vi.fn().mockResolvedValue(row));
            await expect(FeatureValueCacheService.Instance.Store({ ...base, provider })).rejects.toThrow(/UQ violation/);
        });

        describe('KeyDisplay longer than its column (#4917)', () => {
            /** A new row whose metadata gives KeyDisplay the nvarchar(500) limit. */
            const rowWithLimit = (): Record<string, unknown> => ({
                NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true),
                EntityInfo: { Fields: [{ Name: 'KeyDisplay', MaxLength: 500 }, { Name: 'KeyJSON', MaxLength: 0 }] },
            });

            it('clamps an over-long display to MaxLength, ending with an ellipsis, and still saves', async () => {
                MockRunView.mockResults = [];
                const row = rowWithLimit();
                const provider = stubProvider(vi.fn().mockResolvedValue(row));
                const longDisplay = 'x'.repeat(1200);
                await FeatureValueCacheService.Instance.Store({ ...base, keyDisplay: longDisplay, provider });
                const display = row.KeyDisplay as string;
                expect(display.length).toBe(500);
                expect(display.endsWith('…')).toBe(true);
                expect(display.startsWith('x'.repeat(499))).toBe(true);
                expect(row.KeyHash).toBe('k-owner');
                expect(row.Save).toHaveBeenCalledTimes(1);
            });

            it('leaves a display within the limit unchanged', async () => {
                MockRunView.mockResults = [];
                const row = rowWithLimit();
                const provider = stubProvider(vi.fn().mockResolvedValue(row));
                const exact = 'y'.repeat(500);
                await FeatureValueCacheService.Instance.Store({ ...base, keyDisplay: exact, provider });
                expect(row.KeyDisplay).toBe(exact);
                await FeatureValueCacheService.Instance.Store({ ...base, provider });
                expect(row.KeyDisplay).toBe('Owner');
            });

            it('ClampToLength treats 0 as unlimited', () => {
                expect(FeatureValueCacheService.ClampToLength('abcdef', 0)).toBe('abcdef');
                expect(FeatureValueCacheService.ClampToLength('abcdef', 4)).toBe('abc…');
            });
        });
    });

    describe('Human values', () => {
        it('records a dated Human row keyed without a pin, under the Pipeline then the Human lock', async () => {
            MockRunView.mockResults = [];
            const saved: Array<Record<string, unknown>> = [];
            const provider = stubProvider(vi.fn().mockImplementation(async () => {
                const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn().mockImplementation(async () => { saved.push({ ...row }); return true; }) };
                return row;
            }));
            await FeatureValueCacheService.Instance.RecordHumanValue({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1',
                FeatureName: 'SeniorityLevel', Value: 'board-id', ProcessRunID: 'run-9', ContextUser: mockUser, Provider: provider });
            expect(saved[0].Source).toBe('Human');
            expect(saved[0].PipelineVersion).toBeNull();
            expect(saved[0].AIModelID).toBeNull();
            expect(saved[0].ParametersHash).toBeNull();
            expect(saved[0].PromptVersionHash).toBeNull();
            expect(saved[0].InputHash).toBeNull();
            expect(saved[0].ValueText).toBe('board-id');
            expect(saved[0].ProcessRunID).toBe('run-9');
            expect(saved[0].EffectiveAsOf).toBeInstanceOf(Date);
            expect(saved[0].EffectiveTo).toBeNull();
            expect(MockRunQuery.calls.map((c) => c.QueryName)).toEqual([FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman]);
        });

        it('reads the newest row of one source, excluding the current run, as its typed columns', async () => {
            MockRunView.mockResults = [{ ValueText: null, ValueNumeric: 0, ValueBoolean: null, ValueDate: null, ValueJSON: null }];
            const latest = await FeatureValueCacheService.Instance.GetLatestValue({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1',
                FeatureName: 'SeniorityLevel', Source: 'Pipeline', ExcludeProcessRunID: 'run-9', ContextUser: mockUser, Provider: lookupProvider });
            expect(latest).toEqual({ ValueText: null, ValueNumeric: 0, ValueBoolean: null, ValueDate: null, ValueJSON: null });
            const view = MockRunView.lastParams;
            expect(view?.ExtraFilter).toContain("RecordProcessID = 'rp-1' AND EntityID = 'ENT-P'");
            expect(view?.ExtraFilter).toContain("RecordID = 'person-1' AND FeatureName = 'SeniorityLevel'");
            expect(view?.ExtraFilter).toContain("Source = 'Pipeline'");
            expect(view?.ExtraFilter).toContain("(ProcessRunID IS NULL OR ProcessRunID <> 'run-9')");
            expect(view?.OrderBy).toBe(LATEST_ORDER);
            expect(view?.MaxRows).toBe(1);
            expect(view?.BypassCache).toBe(true);
        });

        it('reads the newest Pipeline row of each named feature: one batched read, one bounded view per feature', async () => {
            const empty = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
            MockRunView.queue = [
                [{ FeatureName: 'Years', ...empty, ValueNumeric: 7 }],
                [{ FeatureName: 'Level', ...empty, ValueText: 'Director' }],
                [],
            ];
            const latest = await FeatureValueCacheService.Instance.GetLatestPipelineValues({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1',
                FeatureNames: ['Years', 'Level', 'Years', 'Missing'], ContextUser: mockUser, Provider: lookupProvider, ExcludeProcessRunID: 'run-9' });
            expect([...latest.keys()].sort()).toEqual(['level', 'years']);
            expect(latest.get('years')?.ValueNumeric).toBe(7);
            expect(latest.get('level')?.ValueText).toBe('Director');
            expect(MockRunView.batches).toHaveLength(1);
            const views = MockRunView.batches[0];
            expect(views.map((v) => (typeof v.ExtraFilter === 'string' ? v.ExtraFilter.match(/FeatureName = '([^']+)'/)?.[1] : undefined))).toEqual(['Years', 'Level', 'Missing']);
            for (const view of views) {
                expect(view.ExtraFilter).toContain("RecordProcessID = 'rp-1' AND EntityID = 'ENT-P' AND RecordID = 'person-1'");
                expect(view.ExtraFilter).toContain("Source = 'Pipeline'");
                expect(view.ExtraFilter).toContain("(ProcessRunID IS NULL OR ProcessRunID <> 'run-9')");
                expect(view.OrderBy).toBe(LATEST_ORDER);
                expect(view.MaxRows).toBe(1);
                expect(view.BypassCache).toBe(true);
            }
        });

        it('fails naming the feature whose read failed', async () => {
            MockRunView.failWith = 'db down';
            await expect(FeatureValueCacheService.Instance.GetLatestPipelineValues({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1',
                FeatureNames: ['Years'], ContextUser: mockUser, Provider: lookupProvider })).rejects.toThrow("reading the latest Feature Value 'Years' of record 'person-1' failed: db down");
        });

        it('reads nothing for no features', async () => {
            MockRunView.lastParams = undefined;
            const latest = await FeatureValueCacheService.Instance.GetLatestPipelineValues({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1',
                FeatureNames: [], ContextUser: mockUser, Provider: lookupProvider });
            expect(latest.size).toBe(0);
            expect(MockRunView.lastParams).toBeUndefined();
        });

        const humanRef = { RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1', FeatureName: 'SeniorityLevel', ContextUser: mockUser, Provider: lookupProvider };

        it('retires the record\'s open Human row of a feature by closing it, under the locks (the history keeps it)', async () => {
            const row = { ID: 'h-1', RecordProcessID: 'rp-1', MLModelScoringBindingID: null, EntityID: 'ENT-P', RecordID: 'person-1', FeatureName: 'SeniorityLevel',
                Source: 'Human', Role: 'Champion', PipelineVersion: null, EffectiveAsOf: new Date('2026-01-01T00:00:00Z'), EffectiveTo: null as Date | null,
                Save: vi.fn().mockResolvedValue(true), Delete: vi.fn(), LatestResult: null };
            MockRunQuery.queue = [[], [{ ID: 'h-1', FeatureName: 'SeniorityLevel' }]];
            MockRunView.mockResults = [row];
            expect(await FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).toBe(1);
            expect(row.Save).toHaveBeenCalledTimes(1);
            expect(row.Delete).not.toHaveBeenCalled();
            expect(row.EffectiveTo).toBeInstanceOf(Date);
            expect(MockRunQuery.calls.map((c) => c.QueryName)).toEqual([FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman]);
            expect(MockRunView.lastParams?.ExtraFilter).toBe("ID IN ('h-1') AND EffectiveTo IS NULL");
            expect(MockRunView.lastParams?.ResultType).toBe('entity_object');
        });

        it('RetireHumanValue returns 0 without an open Human row, and throws when a row cannot be closed', async () => {
            expect(await FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).toBe(0);
            MockRunQuery.queue = [[], [{ ID: 'h-1', FeatureName: 'SeniorityLevel' }]];
            MockRunView.mockResults = [{ ID: 'h-1', RecordProcessID: 'rp-1', MLModelScoringBindingID: null, EntityID: 'ENT-P', RecordID: 'person-1', FeatureName: 'SeniorityLevel',
                Source: 'Human', PipelineVersion: null, EffectiveTo: null, Save: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'FK violation' } }];
            await expect(FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).rejects.toMatchObject({ name: 'FeatureValueSaveError', ProviderMessage: 'FK violation' });
        });

        describe('a Human value on a binding with no Record Process (§6.2a)', () => {
            const BIND = '9F1C2A7E-0B4D-4C55-8E21-3A6F0D9B7C11';
            const bindingRef = { ...humanRef, RecordProcessID: null, MLModelScoringBindingID: BIND };
            const scope = "RecordProcessID IS NULL AND MLModelScoringBindingID = '9f1c2a7e-0b4d-4c55-8e21-3a6f0d9b7c11'";

            it('locks by binding, skips the Pipeline lock and read, and saves the binding on the row', async () => {
                MockRunView.mockResults = [];
                const saved: Array<Record<string, unknown>> = [];
                const provider = stubProvider(vi.fn().mockImplementation(async () => {
                    const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn().mockImplementation(async () => { saved.push({ ...row }); return true; }) };
                    return row;
                }));
                await FeatureValueCacheService.Instance.RecordHumanValue({ ...bindingRef, Value: 'Gold', Provider: provider });
                expect(MockRunView.batches).toHaveLength(0);
                expect(MockRunView.calls).toHaveLength(0);
                expect(MockRunQuery.calls.map((c) => [c.QueryName, c.Parameters])).toEqual([[FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman,
                    { EntityID: 'ENT-P', RecordID: 'person-1', FeatureNames: ['SeniorityLevel'], RecordProcessID: '', MLModelScoringBindingID: BIND }]]);
                expect(saved[0]).toMatchObject({ Source: 'Human', RecordProcessID: null, MLModelScoringBindingID: BIND, ValueText: 'Gold' });
            });

            it('keys the row with its binding, so two bindings never share a ValueKeyHash; a pipeline row\'s key leaves the binding out', async () => {
                MockRunView.mockResults = [];
                const saved: Array<Record<string, unknown>> = [];
                const provider = stubProvider(vi.fn().mockImplementation(async () => {
                    const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn().mockImplementation(async () => { saved.push({ ...row }); return true; }) };
                    return row;
                }));
                const OTHER = '2B7E1F40-6C3A-4D8E-9A15-7F0E4C2B9D33';
                await FeatureValueCacheService.Instance.RecordHumanValue({ ...bindingRef, Value: 'Gold', Provider: provider });
                await FeatureValueCacheService.Instance.RecordHumanValue({ ...bindingRef, MLModelScoringBindingID: OTHER, Value: 'Gold', Provider: provider });
                await FeatureValueCacheService.Instance.RecordHumanValue({ ...humanRef, Value: 'Gold', Provider: provider });
                const key = { EntityID: 'ENT-P', RecordID: 'person-1', FeatureName: 'SeniorityLevel', PipelineVersion: null, PromptVersionHash: null,
                    AIModelID: null, ParametersHash: null, InputHash: null, Source: 'Human' as const };
                expect(saved.map((r) => r.ValueKeyHash)).toEqual([
                    await FeatureValueKey.ComputeHash({ ...key, MLModelScoringBindingID: BIND }),
                    await FeatureValueKey.ComputeHash({ ...key, MLModelScoringBindingID: OTHER }),
                    await FeatureValueKey.ComputeHash(key),
                ]);
                expect(new Set(saved.map((r) => r.ValueKeyHash)).size).toBe(3);
            });

            it('GetLatestValue and RetireHumanValue filter by the binding, never by RecordProcessID = \'null\'', async () => {
                MockRunView.mockResults = [];
                await FeatureValueCacheService.Instance.GetLatestValue({ ...bindingRef, Source: 'Human' });
                await FeatureValueCacheService.Instance.RetireHumanValue(bindingRef);
                expect(MockRunQuery.calls.map((c) => [c.QueryName, c.Parameters?.RecordProcessID, c.Parameters?.MLModelScoringBindingID]))
                    .toEqual([[FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman, '', BIND]]);
                for (const view of MockRunView.calls) {
                    expect(view.ExtraFilter).toContain(`${scope} AND EntityID = 'ENT-P' AND RecordID = 'person-1' AND FeatureName = 'SeniorityLevel'`);
                    expect(view.ExtraFilter).not.toContain("RecordProcessID = 'null'");
                    expect(view.ExtraFilter).toContain("Role = 'Champion'");
                }
            });

            it('a pipeline-scoped Human row writes no binding ID', async () => {
                MockRunView.mockResults = [];
                const saved: Array<Record<string, unknown>> = [];
                const provider = stubProvider(vi.fn().mockImplementation(async () => {
                    const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn().mockImplementation(async () => { saved.push({ ...row }); return true; }) };
                    return row;
                }));
                await FeatureValueCacheService.Instance.RecordHumanValue({ ...humanRef, Value: 'Gold', Provider: provider });
                expect(saved[0]).toMatchObject({ RecordProcessID: 'rp-1', MLModelScoringBindingID: null });
            });

            it('refuses a scope with neither or both IDs before reading', async () => {
                await expect(FeatureValueCacheService.Instance.RetireHumanValue({ ...humanRef, RecordProcessID: null }))
                    .rejects.toMatchObject({ name: 'FeatureValueKeyError', Field: 'MLModelScoringBindingID' });
                await expect(FeatureValueCacheService.Instance.GetLatestValue({ ...humanRef, MLModelScoringBindingID: BIND, Source: 'Human' }))
                    .rejects.toBeInstanceOf(FeatureValueKeyError);
                expect(MockRunView.calls).toHaveLength(0);
            });

            it('RecordFeatureValues refuses a Model row and a Pipeline row with no Record Process', async () => {
                const base = {
                    recordProcessID: null, mlModelScoringBindingID: BIND, entityID: 'ENT-P', recordID: 'person-1', promptVersionHash: null,
                    pipelineVersion: null, aiModelID: null, parametersHash: null, inputHash: null,
                    outputs: [{ featureName: 'SeniorityLevel', value: 'Gold' }], contextUser: mockUser, provider: lookupProvider,
                };
                await expect(FeatureValueCacheService.Instance.RecordFeatureValues({ ...base, source: 'Model' }))
                    .rejects.toMatchObject({ name: 'FeatureValueKeyError', Field: 'Source' });
                await expect(FeatureValueCacheService.Instance.RecordFeatureValues({ ...base, source: 'Pipeline' }))
                    .rejects.toMatchObject({ name: 'FeatureValueKeyError', Field: 'RecordProcessID' });
                expect(MockRunView.calls).toHaveLength(0);
            });
        });

        it('ignores a newer Role = Challenger row in GetLatestValue, GetLatestPipelineValues, and RetireHumanValue (D2)', async () => {
            const empty = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
            const newerChallenger = {
                FeatureName: 'SeniorityLevel',
                ...empty,
                ValueText: 'Challenger-VP',
                Role: 'Challenger',
                ComputedAt: new Date('2026-11-06T12:00:00Z'),
            };
            const olderChampion = {
                FeatureName: 'SeniorityLevel',
                ...empty,
                ValueText: 'Champion-Director',
                Role: 'Champion',
                ComputedAt: new Date('2026-11-06T11:00:00Z'),
            };

            // 1. GetLatestValue returns Champion even when Challenger is first (newest ComputedAt)
            MockRunView.mockResults = [newerChallenger, olderChampion];
            const latestSingle = await FeatureValueCacheService.Instance.GetLatestValue({
                RecordProcessID: 'rp-1',
                EntityID: 'ENT-P',
                RecordID: 'person-1',
                FeatureName: 'SeniorityLevel',
                Source: 'Pipeline',
                ContextUser: mockUser,
                Provider: lookupProvider,
            });
            expect(latestSingle?.ValueText).toBe('Champion-Director');
            expect(MockRunView.lastParams?.ExtraFilter).toContain("Role = 'Champion'");

            // 2. GetLatestPipelineValues returns Champion even when Challenger is first
            MockRunView.queue = [[newerChallenger, olderChampion]];
            const latestBatch = await FeatureValueCacheService.Instance.GetLatestPipelineValues({
                RecordProcessID: 'rp-1',
                EntityID: 'ENT-P',
                RecordID: 'person-1',
                FeatureNames: ['SeniorityLevel'],
                ContextUser: mockUser,
                Provider: lookupProvider,
            });
            expect(latestBatch.get('senioritylevel')?.ValueText).toBe('Champion-Director');
            expect(MockRunView.lastParams?.ExtraFilter).toContain("Role = 'Champion'");

            // 3. RetireHumanValue closes only the rows the Human lock Query returns (its WHERE is the open-Human-Champion index
            // predicate, so a Challenger row is never among them): none returned, none closed
            const challengerSave = vi.fn().mockResolvedValue(true);
            MockRunView.mockResults = [{ Role: 'Challenger', Save: challengerSave, LatestResult: null }];
            MockRunQuery.queue = [[], []];
            expect(await FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).toBe(0);
            expect(challengerSave).not.toHaveBeenCalled();
            expect(MockRunQuery.calls.at(-1)?.QueryName).toBe(FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman);
        });
    });

    describe('ToTypedValue with a constraint type', () => {
        const T = FeatureValueCacheService.ToTypedValue;
        it('coerces numeric strings, trimmed, including exponents and money', () => {
            expect(T('0.75', 'numeric')).toMatchObject({ ValueNumeric: 0.75, ValueText: null });
            expect(T('  12 ', 'numeric')).toMatchObject({ ValueNumeric: 12 });
            expect(T('1e3', 'numeric')).toMatchObject({ ValueNumeric: 1000 });
            expect(T('19.99', 'money')).toMatchObject({ ValueNumeric: 19.99 });
        });
        it('keeps non-decimal numeric strings as text', () => {
            for (const v of ['Infinity', 'NaN', '0x10', 'abc', '']) {
                expect(T(v, 'numeric')).toMatchObject({ ValueText: v, ValueNumeric: null });
            }
        });
        it('keeps a decimal string that overflows to Infinity as text', () => {
            expect(T('1e400', 'numeric')).toMatchObject({ ValueText: '1e400', ValueNumeric: null });
            expect(T('-1e400', 'money')).toMatchObject({ ValueText: '-1e400', ValueNumeric: null });
        });
        it('coerces boolean strings', () => {
            expect(T('TRUE', 'boolean')).toMatchObject({ ValueBoolean: true, ValueText: null });
            expect(T('false', 'boolean')).toMatchObject({ ValueBoolean: false, ValueText: null });
        });
        it('coerces ISO date strings and keeps other strings as text', () => {
            expect(T('2026-10-16', 'date').ValueDate).toBeInstanceOf(Date);
            expect(T('12', 'date')).toMatchObject({ ValueText: '12', ValueDate: null });
            expect(T('2026-13-45', 'date')).toMatchObject({ ValueText: '2026-13-45', ValueDate: null });
        });
        it('keeps the JavaScript-type mapping with no constraint', () => {
            expect(T('0.75')).toMatchObject({ ValueText: '0.75', ValueNumeric: null });
        });
        it('rejects long digit strings with trailing non-numeric characters without polynomial backtracking', () => {
            const start = Date.now();
            const result = T('1'.repeat(5000) + 'a', 'numeric');
            expect(Date.now() - start).toBeLessThan(PATHOLOGICAL_INPUT_CEILING_MS);
            expect(result.ValueNumeric).toBeNull();
            expect(result.ValueText).toBe('1'.repeat(5000) + 'a');
        });
    });
});
