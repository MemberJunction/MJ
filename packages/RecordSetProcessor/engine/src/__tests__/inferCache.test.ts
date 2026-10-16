import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InferProcessor } from '../processors/InferProcessor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import { RecordRef, RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { EntityInfo, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { DataFeatureSpec, FeaturePipelineVersionService, FeatureValueCacheService, PromptTemplateContent, type PromptTemplateContentRow, type RecordFeatureValuesOutcome } from '@memberjunction/feature-pipelines';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
            Prompts: [
                { ID: 'prompt-1', Name: 'Normalize Job Title', TemplateText: 'Normalize the job title {{record.Title}}',
                  Temperature: null, TopP: null, TopK: null, MinP: null, FrequencyPenalty: null, PresencePenalty: null,
                  Seed: null, ResponseFormat: 'JSON', EffortLevel: null },
            ],
            PromptModels: [
                { PromptID: 'prompt-1', ModelID: 'model-A', Priority: 1, Status: 'Active', EffortLevel: null, ModelParameters: null },
            ],
        },
    },
}));

/** The template engine's cache as the processor reads it: one template whose rendered content has `CachedText`. */
const templateEngine = vi.hoisted(() => {
    const state = { CachedText: 'old', TextAfterReload: 'old' };
    return {
        State: state,
        Instance: {
            Config: vi.fn(async (forceRefresh?: boolean, _contextUser?: UserInfo) => {
                if (forceRefresh) {
                    state.CachedText = state.TextAfterReload;
                }
            }),
            get Templates() {
                return [{ ID: '7e000000-0000-4000-8000-000000000001', GetHighestPriorityContent: () => ({ ID: '7e000000-0000-4000-8000-0000000000c1', TemplateText: state.CachedText }) }];
            },
        },
    };
});

vi.mock('@memberjunction/templates', () => ({ TemplateEngineServer: { Instance: templateEngine.Instance } }));

vi.mock('@memberjunction/ai-prompts', () => {
    return {
        AIPromptRunner: class {
            public async ExecutePrompt(params: { data: { record: { Title: string } } }) {
                const title = params.data?.record?.Title;
                return {
                    success: true,
                    promptRun: { ID: 'prompt-run-1' },
                    result: {
                        StandardTitle: title?.toUpperCase(),
                        Department: title?.includes('Engineer') ? 'Engineering' : 'Sales',
                    },
                };
            }
        },
    };
});

/** What a history write that inserted both outputs returns. */
const UPSERTED: RecordFeatureValuesOutcome = { Upserted: 2, Unchanged: 0, Previous: { StandardTitle: null, Department: null } };


/** The `MJ: Feature Value Caches` fields the processor reads from a cache row. */
type CacheRowFields = Partial<Pick<MJFeatureValueCacheEntity, 'ID' | 'OutputsJSON' | 'Reasoning' | 'AIPromptRunID'>>;

/** Enough of `MJ: Feature Value Caches` for a real cache row to hold the fields in {@link CacheRowFields}. */
const CACHE_ENTITY = new EntityInfo({
    ID: 'ent-feature-value-caches', Name: 'MJ: Feature Value Caches',
    Fields: (['ID', 'OutputsJSON', 'Reasoning', 'AIPromptRunID'] as const).map((Name, i) => ({
        ID: `fvc-${Name}`, EntityID: 'ent-feature-value-caches', Entity: 'MJ: Feature Value Caches', Name, CodeName: Name, Sequence: i + 1,
        Type: Name === 'ID' || Name === 'AIPromptRunID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: Name === 'ID', AllowsNull: Name !== 'ID',
    })),
});

/** A cache row (a real entity, loaded from `fields`) as the cache service would return it. */
async function cacheRow(fields: CacheRowFields): Promise<MJFeatureValueCacheEntity> {
    const row = new MJFeatureValueCacheEntity(CACHE_ENTITY);
    await row.LoadFromData(fields);
    return row;
}

describe('InferProcessor dedup cache & two-phase execution', () => {
    const mockUser = { ID: 'u1' } as unknown as UserInfo;
    const context: RecordProcessorContext = {
        contextUser: mockUser,
        provider: {} as unknown as IMetadataProvider,
        recordProcessID: 'rp-1',
        entityID: 'ent-1',
        processRunID: 'pr-1',
    };

    const spec: DataFeatureSpec = {
        Name: 'Job Title Normalization',
        Description: 'Normalizes job titles into standard functions',
        PromptID: 'prompt-1',
        Context: {
            Fields: ['Title'],
        },
        Outputs: [
            {
                Name: 'StandardTitle',
                Ref: '$.StandardTitle',
                Target: { Mode: 'field', EntityFieldName: 'StandardTitle' },
            },
            {
                Name: 'Department',
                Ref: '$.Department',
                Target: { Mode: 'field', EntityFieldName: 'Department' },
            },
        ],
        Caching: {
            Cacheable: true,
            KeyFields: ['Title'],
            Scope: 'pipeline',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // An empty Feature Pipeline Types catalog: the pipeline runs on the built-in LLM driver
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([]);
    });

    it('ProcessBatch deduplicates distinct keys, executes prompt once per distinct key, and fans out', async () => {
        const records: RecordRef[] = [
            { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Software Engineer' } },
            { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'VP Sales' } },
            { EntityID: 'ent-1', RecordID: 'r3', Record: { Title: 'Software Engineer' } },
            { EntityID: 'ent-1', RecordID: 'r4', Record: { Title: 'VP Sales' } },
        ];

        // Spy on FeatureValueCacheService BatchLookup, Store, RecordFeatureValues
        const batchLookupSpy = vi
            .spyOn(FeatureValueCacheService.Instance, 'BatchLookup')
            .mockResolvedValue(new Map()); // all misses initially

        const storeSpy = vi
            .spyOn(FeatureValueCacheService.Instance, 'Store')
            .mockImplementation(async (params) => ({
                ID: `cache-for-${params.keyDisplay}`,
                ...params,
            } as unknown as MJFeatureValueCacheEntity));

        const recordHistorySpy = vi
            .spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues')
            .mockResolvedValue(UPSERTED);

        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        const results = await processor.ProcessBatch(records, context);

        expect(results.size).toBe(4);
        expect(batchLookupSpy).toHaveBeenCalledTimes(1);

        // BatchLookup was called with 2 distinct keys, NOT 4!
        const distinctKeys = batchLookupSpy.mock.calls[0][0].keyHashes;
        expect(distinctKeys.length).toBe(2);

        // Store was called only TWICE (once for Software Engineer, once for VP Sales), NOT 4 times!
        expect(storeSpy).toHaveBeenCalledTimes(2);

        // Results fanned out properly to all 4 rows
        const r1 = results.get('r1');
        const r2 = results.get('r2');
        const r3 = results.get('r3');
        const r4 = results.get('r4');

        expect(r1?.Status).toBe('Succeeded');
        expect(r3?.Status).toBe('Succeeded');
        expect((r1?.ResultPayload as { StandardTitle: string }).StandardTitle).toBe('SOFTWARE ENGINEER');
        expect((r3?.ResultPayload as { StandardTitle: string }).StandardTitle).toBe('SOFTWARE ENGINEER');

        expect(r2?.Status).toBe('Succeeded');
        expect(r4?.Status).toBe('Succeeded');
        expect((r2?.ResultPayload as { StandardTitle: string }).StandardTitle).toBe('VP SALES');
        expect((r4?.ResultPayload as { StandardTitle: string }).StandardTitle).toBe('VP SALES');

        // History recorded for every individual row
        expect(recordHistorySpy).toHaveBeenCalled();
    });

    it('ProcessBatch immediately resolves cache hits without calling prompt', async () => {
        const records: RecordRef[] = [
            { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Software Engineer' } },
            { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'Software Engineer' } },
        ];

        const cachedOutputs = { StandardTitle: 'SOFTWARE ENGINEER (CACHED)', Department: 'Engineering' };
        const mockCacheEntry = {
            ID: 'cache-hit-123',
            OutputsJSON: JSON.stringify(cachedOutputs),
            PromptVersionHash: 'p-hash-cached',
            Reasoning: 'From prior run',
            AIPromptRunID: 'old-prompt-run',
        };

        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockImplementation(async (params) => {
            const map = new Map();
            map.set(params.keyHashes[0], mockCacheEntry);
            return map;
        });

        const storeSpy = vi.spyOn(FeatureValueCacheService.Instance, 'Store');
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        const results = await processor.ProcessBatch(records, context);

        expect(results.size).toBe(2);
        // Zero stores because of cache hit
        expect(storeSpy).not.toHaveBeenCalled();

        // Both rows received cached payload
        expect(results.get('r1')?.ResultPayload).toEqual(cachedOutputs);
        expect(results.get('r2')?.ResultPayload).toEqual(cachedOutputs);
        expect(results.get('r1')?.FeatureValueCacheID).toBe('cache-hit-123');
        expect(results.get('r2')?.FeatureValueCacheID).toBe('cache-hit-123');
    });

    it('looks the cache up under the primary model and the parameters hash, which a temperature change alters', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Software Engineer' } }];
        const lookup = vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async () => cacheRow({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);

        await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        const first = lookup.mock.calls[0][0];
        expect(first.aiModelID).toBe('model-A');

        const prompt = AIEngine.Instance.Prompts[0];
        prompt.Temperature = 0;
        try {
            await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        } finally {
            prompt.Temperature = null;
        }
        expect(lookup.mock.calls[1][0].parametersHash).not.toBe(first.parametersHash);
    });

    it('changes the watermark basis when the model or a parameter changes', async () => {
        const rec: RecordRef = { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } };
        const basis = (): Promise<string> => new InferProcessor('prompt-1', undefined, spec, null).ComputeBasisHash(rec, context);
        const before = await basis();

        const models = AIEngine.Instance.PromptModels;
        models[0].ModelID = 'model-B';
        let afterModel: string;
        try {
            afterModel = await basis();
        } finally {
            models[0].ModelID = 'model-A';
        }

        const prompt = AIEngine.Instance.Prompts[0];
        prompt.Temperature = 0.7;
        let afterTemperature: string;
        try {
            afterTemperature = await basis();
        } finally {
            prompt.Temperature = null;
        }

        expect(new Set([before, afterModel, afterTemperature]).size).toBe(3);
        expect(await basis()).toBe(before);
    });

    it('reports a failed cache store as a record warning and does not link a cache row', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockRejectedValue(new Error('UQ_FeatureValueCache_Scoped'));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        const r1 = results.get('r1');
        expect(r1?.Status).toBe('Succeeded');
        expect(r1?.Warnings?.[0]).toContain('UQ_FeatureValueCache_Scoped');
        expect(history.mock.calls[0][0].featureValueCacheID ?? null).toBeNull();
        expect(logged.mock.calls.flat().join(' ')).toContain('UQ_FeatureValueCache_Scoped');
    });
    it('marks a record Unchanged when every Feature Value already existed with the same value', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async () => cacheRow({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue({ Upserted: 0, Unchanged: 2, Previous: { StandardTitle: null, Department: null } });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Outcome).toBe('Unchanged');
    });

    it('marks a record Upserted and keys its Feature Values on the pin and the input hash', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async () => cacheRow({ ID: 'c1' }));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const key = await FeatureValueCacheService.Instance.ComputeCacheKey({ keyFields: ['Title'], recordData: { Title: 'Owner' } });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Outcome).toBe('Upserted');
        expect(results.get('r1')?.PipelineVersion).toBeNull();
        expect(history.mock.calls[0][0]).toMatchObject({ aiModelID: 'model-A', inputHash: key.keyHash, pipelineVersion: null });
        expect(typeof history.mock.calls[0][0].parametersHash).toBe('string');
    });

    it('gives each written record the pin its values were keyed on, and reports it as the run pin', async () => {
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const processor = new InferProcessor('prompt-1', undefined, { ...spec, Caching: { Cacheable: false } }, null);
        expect(processor.CurrentRunPin()).toBeNull();
        const result = await processor.ProcessRecord({ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }, context);
        const written = history.mock.calls[0][0];
        const pin = { PipelineVersion: null, PromptVersionHash: written.promptVersionHash, AIModelID: 'model-A', ParametersHash: written.parametersHash };
        expect(result.PipelinePin).toEqual(pin);
        expect(processor.CurrentRunPin()).toEqual(pin);
        expect(new WriteBackProcessor(processor, { fields: {} }).CurrentRunPin()).toEqual(pin);
    });

    it('writes the resolved version into the record result and every Feature Value', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }, { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'Engineer' } }];
        vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 7, Status: 'Active' });
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        // uncached, so each record computes and writes its own Feature Values
        const processor = new InferProcessor('prompt-1', undefined, { ...spec, Caching: { Cacheable: false } }, null);
        await processor.Preflight(context);
        const results = await processor.ProcessBatch(records, context);
        expect([...results.values()].map((r) => r.PipelineVersion)).toEqual([7, 7]);
        expect(history).toHaveBeenCalledTimes(2);
        expect(history.mock.calls.map((c) => c[0].pipelineVersion)).toEqual([7, 7]);
    });

    it('keys a cache hit\'s Feature Values on the pin and the input hash, and reports an unchanged hit Unchanged', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockImplementation(async (p) => new Map([[p.keyHashes[0],
            await cacheRow({ ID: 'cache-1', OutputsJSON: '{"StandardTitle":"OWNER","Department":"Sales"}', Reasoning: null, AIPromptRunID: 'run-0' })]]));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues')
            .mockResolvedValue({ Upserted: 0, Unchanged: 2, Previous: { StandardTitle: null, Department: null } });
        const key = await FeatureValueCacheService.Instance.ComputeCacheKey({ keyFields: ['Title'], recordData: { Title: 'Owner' } });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Outcome).toBe('Unchanged');
        expect(history.mock.calls[0][0]).toMatchObject({ aiModelID: 'model-A', inputHash: key.keyHash, featureValueCacheID: 'cache-1' });
    });

    it('keys an uncacheable pipeline\'s Feature Values on the hash of its context fields', async () => {
        const uncached: DataFeatureSpec = { ...spec, Caching: { Cacheable: false } };
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const key = await FeatureValueCacheService.Instance.ComputeCacheKey({ keyFields: ['Title'], recordData: { Title: 'Owner' } });
        await new InferProcessor('prompt-1', undefined, uncached, null).ProcessRecord({ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }, context);
        expect(history.mock.calls[0][0].inputHash).toBe(key.keyHash);
    });

    it('keeps each record\'s Feature Values as they were before this run wrote them', async () => {
        const records: RecordRef[] = [
            { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } },
            { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'Owner' } },
        ];
        const before = { ValueText: 'MANAGER', ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async () => cacheRow({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (p) => ({
            Upserted: 2, Unchanged: 0, Previous: { StandardTitle: p.recordID === 'r1' ? before : null, Department: null },
        }));
        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        await processor.ProcessBatch(records, context);
        expect(processor.PreviousFeatureValues('r1')).toEqual({ StandardTitle: before, Department: null });
        expect(processor.PreviousFeatureValues('r2')).toEqual({ StandardTitle: null, Department: null });
        expect(processor.PreviousFeatureValues('r3')).toBeUndefined();
    });

    it('fails the record when its Feature Values cannot be written', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async () => cacheRow({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockRejectedValue(new Error('FK_FeatureValue_Entity'));
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Status).toBe('Failed');
        expect(results.get('r1')?.ErrorMessage).toContain('FK_FeatureValue_Entity');
        expect(logged.mock.calls.flat().join(' ')).toContain('Feature Value write failed: FK_FeatureValue_Entity');
    });

    it('puts the OutputMapping in the spec hash on every construction path', async () => {
        // a Pick double of the Record Process row: the fields FromRecordProcess reads (no EntityID: no target check)
        const row = (outputMapping: string | null): MJRecordProcessEntity => ({
            Name: 'Job titles', PromptID: 'prompt-1', InputMapping: null, OutputMapping: outputMapping, EntityID: null,
            Configuration: JSON.stringify(spec),
        } as Pick<MJRecordProcessEntity, 'Name' | 'PromptID' | 'InputMapping' | 'OutputMapping' | 'Configuration'> as MJRecordProcessEntity);
        const prompt = AIEngine.Instance.Prompts[0];
        const fromRow = await InferProcessor.FromRecordProcess(row('{"fields":{"A":"$.StandardTitle"}}')).ResolvePin(prompt, context);
        const direct = await new InferProcessor('prompt-1', undefined, spec, '{"fields":{"A":"$.StandardTitle"}}').ResolvePin(prompt, context);
        const otherMapping = await InferProcessor.FromRecordProcess(row('{"fields":{"B":"$.StandardTitle"}}')).ResolvePin(prompt, context);
        const emptyMapping = await InferProcessor.FromRecordProcess(row('')).ResolvePin(prompt, context);
        const noMapping = await InferProcessor.FromRecordProcess(row(null)).ResolvePin(prompt, context);
        expect(fromRow.SpecHash).toBe(direct.SpecHash);
        expect(otherMapping.SpecHash).not.toBe(fromRow.SpecHash);
        expect(emptyMapping.SpecHash).toBe(noMapping.SpecHash);
    });
    it('a dry run looks the cache up without counting hits and writes no cache or Feature Value rows', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        const lookup = vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store');
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues');
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, { ...context, DryRun: true });
        expect(results.get('r1')?.Status).toBe('Succeeded');
        expect(lookup.mock.calls[0][0].recordHit).toBe(false);
        expect(store).not.toHaveBeenCalled();
        expect(history).not.toHaveBeenCalled();
    });

    it('a dry run of a pipeline with write-back queues no Feature Values for the write-back unit', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues');
        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        processor.DeferFeatureValuesToWriteBack();
        await processor.ProcessBatch([{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }], { ...context, DryRun: true });
        expect(await processor.WriteDeferredFeatureValues('r1', context.provider)).toBeNull();
        expect(history).not.toHaveBeenCalled();
    });

    it('BypassCache treats every key as a miss without reading the cache', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        const lookup = vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup');
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, { ...context, DryRun: true, BypassCache: true });
        expect(results.get('r1')?.Status).toBe('Succeeded');
        expect(lookup).not.toHaveBeenCalled();
        const single = await new InferProcessor('prompt-1', undefined, spec, null).ProcessRecord(records[0], { ...context, DryRun: true, BypassCache: true });
        expect(single.Status).toBe('Succeeded');
        expect(lookup).not.toHaveBeenCalled();
    });
    describe('the prompt template a run pins and renders (F-FP-6)', () => {
        const TEMPLATE_ID = '7e000000-0000-4000-8000-000000000001';
        const CONTENT_ID = '7e000000-0000-4000-8000-0000000000c1';
        /** The job-title prompt with `templateID` and the text it loaded at startup. */
        const promptWith = (templateText: string, templateID: string | null): MJAIPromptEntityExtended =>
            ({ ...AIEngine.Instance.Prompts[0], TemplateID: templateID, TemplateText: templateText }) as MJAIPromptEntityExtended;
        /** The content row the database holds for the template now. */
        const row = (text: string): PromptTemplateContentRow => ({ ID: CONTENT_ID, Priority: 1, __mj_CreatedAt: '2026-01-01', TemplateText: text });
        const reloads = (): number => templateEngine.Instance.Config.mock.calls.filter(([force]) => force === true).length;

        beforeEach(() => {
            templateEngine.State.CachedText = 'new';
            templateEngine.State.TextAfterReload = 'new';
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('hashes the template text in the database, not the text the prompt loaded', async () => {
            const read = vi.spyOn(PromptTemplateContent, 'ReadCurrent').mockResolvedValue(row('new'));
            const fromNew = await new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('old', TEMPLATE_ID), context);
            read.mockResolvedValue(row('old'));
            const fromOld = await new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('old', TEMPLATE_ID), context);
            const loadedNew = await new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('new', null), context);
            expect(read).toHaveBeenCalledWith(context.provider, TEMPLATE_ID, context.contextUser);
            expect(fromNew.PromptVersionHash).not.toBe(fromOld.PromptVersionHash);
            expect(fromNew.PromptVersionHash).toBe(loadedNew.PromptVersionHash);
        });

        it('reloads the template engine once when its cached text differs, and not when it matches', async () => {
            vi.spyOn(PromptTemplateContent, 'ReadCurrent').mockResolvedValue(row('new'));
            templateEngine.State.CachedText = 'old';
            await new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('old', TEMPLATE_ID), context);
            expect(reloads()).toBe(1);
            expect(templateEngine.Instance.Config).toHaveBeenCalledWith(true, context.contextUser);

            templateEngine.Instance.Config.mockClear();
            await new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('old', TEMPLATE_ID), context);
            expect(reloads()).toBe(0);
        });

        it('does not read or reload for a prompt without a template', async () => {
            const read = vi.spyOn(PromptTemplateContent, 'ReadCurrent');
            const pin = await new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('inline', null), context);
            expect(read).not.toHaveBeenCalled();
            expect(reloads()).toBe(0);
            expect(pin.PromptVersionHash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('fails the record with the read error when the template content cannot be read', async () => {
            vi.spyOn(PromptTemplateContent, 'ReadCurrent').mockRejectedValue(new Error(`The content of template '${TEMPLATE_ID}' could not be read: timeout`));
            await expect(new InferProcessor('prompt-1', undefined, spec, null).ResolvePin(promptWith('old', TEMPLATE_ID), context))
                .rejects.toThrow(/could not be read: timeout/);
        });
    });
});
