/**
 * @fileoverview Embed routes per record — and a layer above MJ decides how.
 *
 * A page is not guaranteed to belong to one source, so resolving one target from the first record
 * wrote two organizations' chunks into one index and namespace. These register a router at
 * VECTOR_RECORD_ROUTER — the same seam a deployment uses to route by tenant — and check that each
 * record lands where ITS route says.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { EmbedStage } from '../stages/EmbedStage.js';
import { VECTOR_RECORD_ROUTER, VectorRecordRouter, VectorRoute, VectorRouteFailure } from '../VectorRouting.js';

interface Written {
    index: string;
    ids: string[];
    namespaces: (string | undefined)[];
}
const written: Written[] = [];

function target(index: string) {
    return {
        IndexName: index,
        EmbeddingModelID: null,
        Dimensions: null,
        ProviderConfig: undefined,
        Index: { ID: `${index}-id` },
        Database: {
            IsReadOnly: false,
            CreateRecords: async (records: { id: string; providerTemporaryDirectives?: Record<string, unknown> }[]) => {
                written.push({
                    index,
                    ids: records.map((r) => r.id),
                    namespaces: records.map((r) => r.providerTemporaryDirectives?.namespace as string | undefined),
                });
                return { success: true, message: '', data: null };
            },
        },
    } as unknown as VectorRoute['Target'];
}

/** A deployment's router: chunks of org A go to index A, org B to index B, each in its own namespace. */
@RegisterClass(VectorRecordRouter, VECTOR_RECORD_ROUTER)
class TenantRouter extends VectorRecordRouter {
    public override async Route(records: readonly WorkingRecord[]): Promise<Map<string, VectorRoute | VectorRouteFailure>> {
        const routes = new Map<string, VectorRoute | VectorRouteFailure>();
        for (const r of records) {
            const org = r.Identity.Key.split('-')[0];
            routes.set(
                r.Identity.Key,
                org === 'orphan'
                    ? { Error: 'no organization for this record' }
                    : {
                          Target: target(`index-${org}`),
                          Directives: { namespace: org },
                          Item: { ID: `${org}-item`, ContentSourceID: `${org}-src`, Name: 'doc', GetAll: () => ({}) } as never,
                      },
            );
        }
        return routes;
    }
}

function chunk(key: string): WorkingRecord {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', `u/${key}`, key));
    r.Propose('Text', `text of ${key}`, 6, 'Segment');
    r.SetExtension('Embed', 'operation', 'Full');
    return r;
}

const context = {
    ContextUser: {},
    Provider: { RunView: async () => ({ Success: true, Results: [] }), EntityByName: () => undefined },
    Configuration: {},
    ReportProgress: () => {},
} as unknown as StageContext;

let original: typeof AIEmbeddingRunner.prototype.RunEmbedding;
beforeAll(() => {
    // Keep the router reachable: TenantRouter only registers if the class is referenced.
    expect(TenantRouter).toBeDefined();
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

    it('fails a record the router rejects, alone — the rest of the page is written', async () => {
        written.length = 0;
        const outcomes = await new EmbedStage().Finalize!([chunk('a-1'), chunk('orphan-1')], context);

        expect(outcomes.find((o) => o.Key === 'orphan-1')?.Outcome.Status).toBe('Failed');
        expect(outcomes.find((o) => o.Key === 'a-1')?.Outcome.Status).toBe('Complete');
        expect(written.flatMap((w) => w.ids)).toEqual(['a-1']);
    });
});
