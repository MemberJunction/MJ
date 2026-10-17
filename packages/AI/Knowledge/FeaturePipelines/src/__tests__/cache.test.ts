import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureValueCacheService, FeatureValueSaveError } from '../cache/FeatureValueCacheService';
import { FeatureValueKey, type FeatureValueKeyInput } from '../spec/feature-value-key';
import type { UserInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';

/**
 * The RunView stand-in: each call returns the next entry of `queue` when there is one, else `mockResults`; tests read
 * the `lastParams` (and every call's params in `calls`) the service passed.
 */
const { MockRunView, logErrorSpy } = vi.hoisted(() => {
    class MockRunView {
        public static mockResults: object[] = [];
        public static queue: object[][] = [];
        public static lastParams: RunViewParams | undefined;
        public static calls: RunViewParams[] = [];
        public static FromMetadataProvider() { return new MockRunView(); }
        public async RunView(params: RunViewParams) {
            MockRunView.lastParams = params;
            MockRunView.calls.push(params);
            return {
                Success: true,
                Results: MockRunView.queue.shift() ?? MockRunView.mockResults,
            };
        }
        public async RunViews(params: RunViewParams[]) {
            return Promise.all(params.map((p) => this.RunView(p)));
        }
    }
    return { MockRunView, logErrorSpy: vi.fn() };
});

// Mock RunView so we don't hit a real database in unit tests; LogError is captured so failures are asserted, not printed
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: MockRunView,
        LogError: logErrorSpy,
    };
});

/** A provider exposing only GetEntityObject. */
function stubProvider(getEntityObject: ReturnType<typeof vi.fn>): IMetadataProvider {
    return { GetEntityObject: getEntityObject } as Partial<IMetadataProvider> as IMetadataProvider;
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

    describe('RecordFeatureValues (upsert on the Feature Value key)', () => {
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

        it('inserts a keyed Pipeline row when the key is new', async () => {
            MockRunView.mockResults = [];
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith(saved)));
            expect(outcome).toEqual({ Upserted: 1, Unchanged: 0, Previous: { SeniorityLevel: null } });
            expect(saved[0].Source).toBe('Pipeline');
            expect(saved[0].PipelineVersion).toBe(3);
            expect(saved[0].ValueKeyHash).toBe(await FeatureValueKey.ComputeHash(keyInput));
            expect(saved[0].ValueText).toBe('Director');
            expect(saved[0].AIModelID).toBe('m-1');
            expect(saved[0].ParametersHash).toBe('ph');
            expect(saved[0].InputHash).toBe('in-1');
            const filter = MockRunView.lastParams?.ExtraFilter ?? '';
            expect(filter).toContain("RecordProcessID = 'rp-1'");
            expect(filter).toContain(`ValueKeyHash IN ('${await FeatureValueKey.ComputeHash(keyInput)}')`);
        });

        it('leaves an identical keyed row untouched (no new row, no save)', async () => {
            const save = vi.fn();
            const keyHash = await FeatureValueKey.ComputeHash(keyInput);
            MockRunView.mockResults = [{
                FeatureName: 'SeniorityLevel', ValueKeyHash: keyHash, ValueText: 'Director', ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null,
                Reasoning: 'Title says Director', Confidence: 0.9, Save: save,
            }];
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith(saved)));
            expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Director' } } });
            expect(save).not.toHaveBeenCalled();
            expect(saved).toHaveLength(0);
        });

        it('makes an unchanged keyed row the latest again when another key holds the latest value', async () => {
            const keyHash = await FeatureValueKey.ComputeHash(keyInput);
            // a newer version wrote Manager last; this version's row still holds Director, which the run computes again
            const newer = { FeatureName: 'SeniorityLevel', ValueKeyHash: 'newer-version-key', ValueText: 'Manager', ValueNumeric: null,
                ValueBoolean: null, ValueDate: null, ValueJSON: null };
            const computedBefore = new Date('2026-10-01T00:00:00Z');
            const own: Record<string, unknown> = { FeatureName: 'SeniorityLevel', ValueKeyHash: keyHash, ValueText: 'Director', ValueNumeric: null,
                ValueBoolean: null, ValueDate: null, ValueJSON: null, Reasoning: 'Title says Director', Confidence: 0.9,
                ComputedAt: computedBefore, ProcessRunID: 'run-1', Save: vi.fn().mockResolvedValue(true), NewRecord: vi.fn() };
            MockRunView.queue = [[newer], [own]];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith([])));
            expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(own.Save).toHaveBeenCalledTimes(1);
            expect(own.NewRecord).not.toHaveBeenCalled();
            expect(own.ProcessRunID).toBe('run-2');
            expect(own.ComputedAt).not.toBe(computedBefore);
        });

        it('leaves an unchanged history row (a superseded decision) untouched even when another key holds the latest value', async () => {
            const keyHash = await FeatureValueKey.ComputeHash(keyInput);
            // the escalated answer's row (another key) is the latest; the superseded decision's row is written again unchanged
            const answer = { FeatureName: 'SeniorityLevel', ValueKeyHash: 'answer-key', ValueText: 'Manager', ValueNumeric: null,
                ValueBoolean: null, ValueDate: null, ValueJSON: null };
            const own: Record<string, unknown> = { FeatureName: 'SeniorityLevel', ValueKeyHash: keyHash, ValueText: 'Director', ValueNumeric: null,
                ValueBoolean: null, ValueDate: null, ValueJSON: null, Reasoning: 'Title says Director', Confidence: 0.9,
                ProcessRunID: 'run-1', Save: vi.fn().mockResolvedValue(true), NewRecord: vi.fn() };
            MockRunView.queue = [[answer], [own]];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith([])), historyOnly: true });
            expect(outcome).toEqual({ Upserted: 0, Unchanged: 1, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(own.Save).not.toHaveBeenCalled();
            expect(own.ProcessRunID).toBe('run-1');
        });

        it('updates the keyed row in place when its value changed, returning the value it had before', async () => {
            const keyHash = await FeatureValueKey.ComputeHash(keyInput);
            const existing: Record<string, unknown> = { FeatureName: 'SeniorityLevel', ValueKeyHash: keyHash, ValueText: 'Manager', Reasoning: null, Confidence: null,
                Save: vi.fn().mockResolvedValue(true), NewRecord: vi.fn() };
            MockRunView.mockResults = [existing];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues(params(providerWith([])));
            expect(outcome).toEqual({ Upserted: 1, Unchanged: 0, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(existing.NewRecord).not.toHaveBeenCalled();
            expect(existing.ValueText).toBe('Director');
            expect(existing.ProcessRunID).toBe('run-2');
        });

        it('returns the latest pipeline value of the feature as Previous when the key changed', async () => {
            const oldRow = { FeatureName: 'SeniorityLevel', ValueKeyHash: 'old-key', ValueText: 'Manager', ValueNumeric: null,
                ValueBoolean: null, ValueDate: null, ValueJSON: null };
            MockRunView.queue = [[oldRow], []];
            const saved: Array<Record<string, unknown>> = [];
            const outcome = await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), inputHash: 'in-2' });
            expect(outcome).toEqual({ Upserted: 1, Unchanged: 0, Previous: { SeniorityLevel: { ...noValue, ValueText: 'Manager' } } });
            expect(saved[0].InputHash).toBe('in-2');
            const latest = MockRunView.calls[0];
            expect(latest.ExtraFilter).toContain("RecordProcessID = 'rp-1' AND EntityID = 'ent-1'");
            expect(latest.ExtraFilter).toContain("RecordID = 'rec-1' AND Source = 'Pipeline'");
            expect(latest.ExtraFilter).toContain("FeatureName = 'SeniorityLevel'");
            expect(latest.ExtraFilter).not.toContain('ValueKeyHash');
            expect(latest.OrderBy).toBe(LATEST_ORDER);
        });

        it('reads only each feature\'s newest row, and only its value columns, in one batch', async () => {
            const row = (name: string, v: string) => ({ FeatureName: name, ValueText: v, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null });
            MockRunView.queue = [[row('SeniorityLevel', 'VP')], [row('Department', 'Sales')], []];
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
                expect(view.Fields).toEqual(['FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean', 'ValueDate', 'ValueJSON', 'ValueKeyHash']);
            }
            expect(second.ExtraFilter).toContain("FeatureName = 'Department'");
        });

        it('keys a row the same for a UUID record ID in any case', async () => {
            MockRunView.mockResults = [];
            const saved: Array<Record<string, unknown>> = [];
            const upper = '0F1A7E00-0000-4000-8000-000000000101';
            await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), recordID: upper });
            await FeatureValueCacheService.Instance.RecordFeatureValues({ ...params(providerWith(saved)), recordID: upper.toLowerCase() });
            expect(saved[0].ValueKeyHash).toBe(saved[1].ValueKeyHash);
        });

        it('writes the typed value columns for each value type', async () => {
            MockRunView.mockResults = [];
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
            MockRunView.mockResults = [];
            const provider = stubProvider(vi.fn().mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(false),
                LatestResult: { CompleteMessage: 'FK_FeatureValue_Entity' } }));
            const failure = FeatureValueCacheService.Instance.RecordFeatureValues(params(provider));
            await expect(failure).rejects.toBeInstanceOf(FeatureValueSaveError);
            await expect(failure).rejects.toMatchObject({ FeatureName: 'SeniorityLevel', RecordID: 'rec-1', ProviderMessage: 'FK_FeatureValue_Entity' });
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
    });

    describe('Human values', () => {
        it('upserts a Human row keyed without a pin', async () => {
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

        const humanRef = { RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1', FeatureName: 'SeniorityLevel', ContextUser: mockUser, Provider: lookupProvider };

        it('retires the record\'s Human rows of a feature through the entity layer', async () => {
            const rows = [{ Delete: vi.fn().mockResolvedValue(true), LatestResult: null }];
            MockRunView.mockResults = rows;
            expect(await FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).toBe(1);
            expect(rows[0].Delete).toHaveBeenCalledTimes(1);
            const view = MockRunView.lastParams;
            expect(view?.ExtraFilter).toContain("RecordID = 'person-1' AND FeatureName = 'SeniorityLevel'");
            expect(view?.ExtraFilter).toContain("Source = 'Human'");
            expect(view?.ResultType).toBe('entity_object');
            expect(view?.BypassCache).toBe(true);
        });

        it('RetireHumanValue returns 0 without a Human row, and throws when a row cannot be deleted', async () => {
            MockRunView.mockResults = [];
            expect(await FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).toBe(0);
            MockRunView.mockResults = [{ Delete: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'FK violation' } }];
            await expect(FeatureValueCacheService.Instance.RetireHumanValue(humanRef)).rejects.toThrow(/failed retiring the Human 'SeniorityLevel' value of record 'person-1': FK violation/);
        });
    });
});

describe('FeatureValueCacheService.ToTypedValue with a constraint type', () => {
    it('coerces a numeric string under a numeric constraint', () => {
        expect(FeatureValueCacheService.ToTypedValue('0.75', 'numeric')).toMatchObject({ ValueNumeric: 0.75, ValueText: null });
    });
    it('coerces a boolean string under a boolean constraint', () => {
        expect(FeatureValueCacheService.ToTypedValue('TRUE', 'boolean')).toMatchObject({ ValueBoolean: true, ValueText: null });
    });
    it('coerces a date string under a date constraint', () => {
        expect(FeatureValueCacheService.ToTypedValue('2026-10-16', 'date').ValueDate).toBeInstanceOf(Date);
    });
    it('stores a string that does not parse as typed', () => {
        expect(FeatureValueCacheService.ToTypedValue('abc', 'numeric')).toMatchObject({ ValueText: 'abc', ValueNumeric: null });
        expect(FeatureValueCacheService.ToTypedValue('', 'numeric')).toMatchObject({ ValueText: '', ValueNumeric: null });
    });
    it('keeps the JavaScript-type mapping with no constraint', () => {
        expect(FeatureValueCacheService.ToTypedValue('0.75')).toMatchObject({ ValueText: '0.75', ValueNumeric: null });
    });
});
