import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InferProcessor } from '../processors/InferProcessor';
import { RecordRef, RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { DataFeatureSpec, FeaturePipelinePin, FeatureValueCacheService, type RecordFeatureValuesOutcome } from '@memberjunction/feature-pipelines';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

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
                ID: `cache-for-${params.KeyDisplay}`,
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
        const distinctKeys = batchLookupSpy.mock.calls[0][0].KeyHashes;
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
            map.set(params.KeyHashes[0], mockCacheEntry);
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
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);

        await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        const first = lookup.mock.calls[0][0];
        expect(first.AIModelID).toBe('model-A');

        const prompt = AIEngine.Instance.Prompts[0];
        prompt.Temperature = 0;
        try {
            await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        } finally {
            prompt.Temperature = null;
        }
        expect(lookup.mock.calls[1][0].ParametersHash).not.toBe(first.ParametersHash);
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
        expect(history.mock.calls[0][0].FeatureValueCacheID ?? null).toBeNull();
        expect(logged.mock.calls.flat().join(' ')).toContain('UQ_FeatureValueCache_Scoped');
    });

    it('gives every record of a key group its own copy of the failed-store warning', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const records: RecordRef[] = [
            { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } },
            { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'Owner' } },
        ];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockRejectedValue(new Error('UQ_FeatureValueCache_Scoped'));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(store).toHaveBeenCalledTimes(1);
        const w1 = results.get('r1')?.Warnings;
        const w2 = results.get('r2')?.Warnings;
        expect(w1?.[0]).toContain('UQ_FeatureValueCache_Scoped');
        expect(w2).toEqual(w1);
        expect(w2).not.toBe(w1);
        expect(logged).toHaveBeenCalled();
    });
    it('marks a record Unchanged when every Feature Value already existed with the same value', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue({ Upserted: 0, Unchanged: 2, Previous: { StandardTitle: null, Department: null } });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Outcome).toBe('Unchanged');
    });

    it('marks a record Upserted and keys its Feature Values on the pin and the input hash', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const key = await FeatureValueCacheService.Instance.ComputeCacheKey({ KeyFields: ['Title'], RecordData: { Title: 'Owner' } });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Outcome).toBe('Upserted');
        expect(results.get('r1')?.PipelineVersion).toBeNull();
        expect(history.mock.calls[0][0]).toMatchObject({ AIModelID: 'model-A', InputHash: key.KeyHash, PipelineVersion: null });
        expect(typeof history.mock.calls[0][0].ParametersHash).toBe('string');
    });

    it('keys a cache hit\'s Feature Values on the pin and the input hash, and reports an unchanged hit Unchanged', async () => {
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockImplementation(async (p) => new Map([[p.KeyHashes[0],
            { ID: 'cache-1', OutputsJSON: '{"StandardTitle":"OWNER","Department":"Sales"}', Reasoning: null, AIPromptRunID: 'run-0' } as unknown as MJFeatureValueCacheEntity]]));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues')
            .mockResolvedValue({ Upserted: 0, Unchanged: 2, Previous: { StandardTitle: null, Department: null } });
        const key = await FeatureValueCacheService.Instance.ComputeCacheKey({ KeyFields: ['Title'], RecordData: { Title: 'Owner' } });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Outcome).toBe('Unchanged');
        expect(history.mock.calls[0][0]).toMatchObject({ AIModelID: 'model-A', InputHash: key.KeyHash, FeatureValueCacheID: 'cache-1' });
    });

    it('keys an uncacheable pipeline\'s Feature Values on the hash of its context fields', async () => {
        const uncached: DataFeatureSpec = { ...spec, Caching: { Cacheable: false } };
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const key = await FeatureValueCacheService.Instance.ComputeCacheKey({ KeyFields: ['Title'], RecordData: { Title: 'Owner' } });
        await new InferProcessor('prompt-1', undefined, uncached, null).ProcessRecord({ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }, context);
        expect(history.mock.calls[0][0].InputHash).toBe(key.KeyHash);
    });

    it('keeps each record\'s Feature Values as they were before this run wrote them', async () => {
        const records: RecordRef[] = [
            { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } },
            { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'Owner' } },
        ];
        const before = { ValueText: 'MANAGER', ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (p) => ({
            Upserted: 2, Unchanged: 0, Previous: { StandardTitle: p.RecordID === 'r1' ? before : null, Department: null },
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
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockRejectedValue(new Error('FK_FeatureValue_Entity'));
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Status).toBe('Failed');
        expect(results.get('r1')?.ErrorMessage).toContain('FK_FeatureValue_Entity');
        expect(logged.mock.calls.flat().join(' ')).toContain('Feature Value write failed: FK_FeatureValue_Entity');
    });

    it('fails a fanned-out record whose own Feature Values cannot be written', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const records: RecordRef[] = [
            { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } },
            { EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'Owner' } },
        ];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (p) => {
            if (p.RecordID === 'r2') {
                throw new Error('FK_FeatureValue_Entity');
            }
            return UPSERTED;
        });
        const results = await new InferProcessor('prompt-1', undefined, spec, null).ProcessBatch(records, context);
        expect(results.get('r1')?.Status).toBe('Succeeded');
        expect(results.get('r2')?.Status).toBe('Failed');
        expect(results.get('r2')?.ErrorMessage).toContain('FK_FeatureValue_Entity');
        expect(logged.mock.calls.flat().join(' ')).toContain("(record 'r2')");
    });

    it('keeps a record\'s Feature Value key only once its values were written', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const records: RecordRef[] = [{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }];
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        const write = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockRejectedValueOnce(new Error('FK_FeatureValue_Entity'));
        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        await processor.ProcessBatch(records, context);
        expect(processor.FeatureValueKeyOf('r1')).toBeUndefined();
        write.mockResolvedValue(UPSERTED);
        await processor.ProcessBatch(records, context);
        expect(processor.FeatureValueKeyOf('r1')?.Pin.AIModelID).toBe('model-A');
        expect(logged).toHaveBeenCalled();
    });

    it('drops the previous batch\'s per-record state when the next batch starts', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (p) => ({ ID: 'c1', ...p } as unknown as MJFeatureValueCacheEntity));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        await processor.ProcessBatch([{ EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } }], context);
        expect(processor.PreviousFeatureValues('r1')).toBeDefined();
        expect(processor.FeatureValueKeyOf('r1')).toBeDefined();
        await processor.ProcessBatch([{ EntityID: 'ent-1', RecordID: 'r2', Record: { Title: 'VP Sales' } }], context);
        expect(processor.PreviousFeatureValues('r1')).toBeUndefined();
        expect(processor.FeatureValueKeyOf('r1')).toBeUndefined();
        expect(processor.FeatureValueKeyOf('r2')).toBeDefined();
    });

    it('hashes the pin only when something it reads changed', async () => {
        const rec: RecordRef = { EntityID: 'ent-1', RecordID: 'r1', Record: { Title: 'Owner' } };
        const parametersHash = vi.spyOn(FeaturePipelinePin, 'ComputeParametersHash');
        const processor = new InferProcessor('prompt-1', undefined, spec, null);
        const first = await processor.ComputeBasisHash(rec, context);
        await processor.ComputeBasisHash(rec, context);
        await processor.ComputeBasisHash(rec, context);
        expect(parametersHash).toHaveBeenCalledTimes(1);
        const prompt = AIEngine.Instance.Prompts[0];
        prompt.Temperature = 0.3;
        try {
            expect(await processor.ComputeBasisHash(rec, context)).not.toBe(first);
        } finally {
            prompt.Temperature = null;
        }
        expect(parametersHash).toHaveBeenCalledTimes(2);
    });

    it('puts the OutputMapping in the spec hash on every construction path', async () => {
        // a Pick double of the Record Process row: the fields FromRecordProcess reads (no EntityID: no target check)
        const row = (outputMapping: string | null): MJRecordProcessEntity => ({
            Name: 'Job titles', PromptID: 'prompt-1', InputMapping: null, OutputMapping: outputMapping, EntityID: null,
            Configuration: JSON.stringify(spec),
        } as Pick<MJRecordProcessEntity, 'Name' | 'PromptID' | 'InputMapping' | 'OutputMapping' | 'Configuration'> as MJRecordProcessEntity);
        const prompt = AIEngine.Instance.Prompts[0];
        const fromRow = await InferProcessor.FromRecordProcess(row('{"fields":{"A":"$.StandardTitle"}}')).ResolvePin(prompt);
        const direct = await new InferProcessor('prompt-1', undefined, spec, '{"fields":{"A":"$.StandardTitle"}}').ResolvePin(prompt);
        const otherMapping = await InferProcessor.FromRecordProcess(row('{"fields":{"B":"$.StandardTitle"}}')).ResolvePin(prompt);
        const emptyMapping = await InferProcessor.FromRecordProcess(row('')).ResolvePin(prompt);
        const noMapping = await InferProcessor.FromRecordProcess(row(null)).ResolvePin(prompt);
        expect(fromRow.SpecHash).toBe(direct.SpecHash);
        expect(otherMapping.SpecHash).not.toBe(fromRow.SpecHash);
        expect(emptyMapping.SpecHash).toBe(noMapping.SpecHash);
    });
});
