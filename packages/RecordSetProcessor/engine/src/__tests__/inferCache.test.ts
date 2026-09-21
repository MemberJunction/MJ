import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InferProcessor } from '../processors/InferProcessor';
import { RecordRef, RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { UserInfo } from '@memberjunction/core';
import { DataFeatureSpec, FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
            Prompts: [
                {
                    ID: 'prompt-1',
                    Name: 'Normalize Job Title',
                    TemplateText: 'Normalize the job title {{record.Title}}',
                },
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

describe('InferProcessor dedup cache & two-phase execution (P1-7c)', () => {
    const mockUser = { ID: 'u1' } as unknown as UserInfo;
    const context: RecordProcessorContext = {
        contextUser: mockUser,
        provider: {} as unknown as any,
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
            } as unknown as any));

        const recordHistorySpy = vi
            .spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues')
            .mockResolvedValue();

        const processor = new InferProcessor('prompt-1', undefined, spec);
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
        const processor = new InferProcessor('prompt-1', undefined, spec);
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
});
