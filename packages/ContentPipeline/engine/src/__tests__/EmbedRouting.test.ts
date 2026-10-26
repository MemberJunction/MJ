/**
 * @fileoverview Embed routes per record.
 *
 * A page is not guaranteed to belong to one source, so resolving one target from the first record
 * wrote two organizations' chunks into one index and namespace. These stub the shared resolver
 * (`ContentVectorInfrastructure`) with an org-per-index policy and check that each record lands where
 * its own route says, and that a record the provider refuses fails alone.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NormalizeUUID } from '@memberjunction/global';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';
import { ContentVectorInfrastructure, ResolvedVectorInfrastructure } from '@memberjunction/content-autotagging';
import type { MJContentItemEntity } from '@memberjunction/core-entities';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { EmbedStage } from '../stages/EmbedStage.js';

interface Written {
    index: string;
    ids: string[];
    namespaces: (string | undefined)[];
}
const written: Written[] = [];

const orgOf = (item: MJContentItemEntity) => item.ContentSourceID.split('-')[0];

function infrastructureFor(index: string): ResolvedVectorInfrastructure {
    return {
        indexName: index,
        embeddingModelID: 'model',
        embeddingModelName: 'model',
        vectorDB: {
            CreateRecords: async (records: { id: string; providerTemporaryDirectives?: Record<string, unknown> }[]) => {
                written.push({
                    index,
                    ids: records.map((r) => r.id),
                    namespaces: records.map((r) => r.providerTemporaryDirectives?.namespace as string | undefined),
                });
                return { success: true, message: '', data: null };
            },
        },
    } as unknown as ResolvedVectorInfrastructure;
}

function chunk(key: string): WorkingRecord {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', `u/${key}`, key));
    r.Propose('Text', `text of ${key}`, 6, 'Segment');
    r.SetExtension('Embed', 'operation', 'Full');
    r.SetExtension('Pipeline', 'contentItemID', `${key.split('-')[0]}-item`);
    return r;
}

const item = (org: string) => ({ ID: `${org}-item`, ContentSourceID: `${org}-src`, ContentTypeID: 'ct', GetAll: () => ({}) });
const context = {
    ContextUser: {},
    Provider: {
        RunView: async (p: { EntityName: string }) => ({
            Success: true,
            Results: p.EntityName === 'MJ: Content Items' ? ['a', 'b', 'orphan'].map(item) : [],
        }),
        EntityByName: () => undefined,
    },
    Configuration: {},
    ReportProgress: () => {},
} as unknown as StageContext;

let original: typeof AIEmbeddingRunner.prototype.RunEmbedding;
// beforeEach, not beforeAll: the shared config restores spies before every test.
beforeEach(() => {
    // One index per organization; the provider refuses the orphan's record (no tenant to route it to).
    vi.spyOn(ContentVectorInfrastructure.prototype, 'GroupByInfrastructure').mockImplementation(async (items) => {
        const groups = new Map<string, MJContentItemEntity[]>();
        for (const i of items) groups.set(`m|index-${orgOf(i)}`, [...(groups.get(`m|index-${orgOf(i)}`) ?? []), i]);
        return groups;
    });
    vi.spyOn(ContentVectorInfrastructure.prototype, 'Resolve').mockImplementation(async (key) => infrastructureFor(key.split('|')[1]));
    vi.spyOn(ContentVectorInfrastructure.prototype, 'BuildDirectives').mockImplementation(async (items) => ({
        Directives: new Map(items.map((i) => [NormalizeUUID(i.ID), { namespace: orgOf(i) }])),
        Rejected: items.filter((i) => orgOf(i) === 'orphan').map((i) => ({ Item: i, Reason: 'no organization for this record' })),
    }));
});
beforeAll(() => {
    original = AIEmbeddingRunner.prototype.RunEmbedding;
    AIEmbeddingRunner.prototype.RunEmbedding = async (p: EmbeddingRunParams): Promise<EmbeddingRunResult> => ({
        Success: true,
        Vectors: p.Texts.map(() => [1, 2, 3]),
        PromptRunID: null,
        TokensUsed: 0,
        Cost: 0,
        ErrorMessage: null,
        ExecutionTimeMs: 0,
    });
});
afterAll(() => {
    AIEmbeddingRunner.prototype.RunEmbedding = original;
});

describe('Embed routes each record by its own route', () => {
    it("writes a page holding two organizations' chunks into each one's own index and namespace", async () => {
        written.length = 0;
        const outcomes = await new EmbedStage().Finalize!([chunk('a-1'), chunk('b-1'), chunk('a-2')], context);

        expect(outcomes.every((o) => o.Outcome.Status === 'Complete')).toBe(true);
        expect(written).toEqual([
            { index: 'index-a', ids: ['a-1', 'a-2'], namespaces: ['a', 'a'] },
            { index: 'index-b', ids: ['b-1'], namespaces: ['b'] },
        ]);
    });

    it('fails a record the provider rejects, alone — the rest of the page is written', async () => {
        written.length = 0;
        const outcomes = await new EmbedStage().Finalize!([chunk('a-1'), chunk('orphan-1')], context);

        expect(outcomes.find((o) => o.Key === 'orphan-1')?.Outcome.Status).toBe('Failed');
        expect(outcomes.find((o) => o.Key === 'a-1')?.Outcome.Status).toBe('Complete');
        expect(written.flatMap((w) => w.ids)).toEqual(['a-1']);
    });

    it('dry-run (IsTest = true) still routes and reports route failures, without calling the embedding model or vector store', async () => {
        written.length = 0;
        const runEmbeddingSpy = vi.spyOn(AIEmbeddingRunner.prototype, 'RunEmbedding');
        const outcomes = await new EmbedStage().Finalize!([chunk('a-1'), chunk('orphan-1')], {
            ...context,
            IsTest: true,
        });

        expect(outcomes.find((o) => o.Key === 'orphan-1')?.Outcome.Status).toBe('Failed');
        expect(outcomes.find((o) => o.Key === 'a-1')?.Outcome.Status).toBe('Complete');
        expect(runEmbeddingSpy).not.toHaveBeenCalled();
        expect(written).toEqual([]);
    });
});
