/**
 * PK classification reads through the catalog writer and does NOT reload the engine (MJ-RUN-42).
 *
 * The stage used to open with `IntegrationEngineBase.Config(true)` — "refresh from DB so we see
 * what Persist just wrote". Every read in the stage has since moved to the catalog writer, which
 * queries per call, so that reload bought nothing: a full eight-dataset reload, including every
 * IntegrationObject and IntegrationObjectField row, whose result the stage never reads — a second
 * in-process copy of the catalog taken immediately after the largest write of the run. On a 888-
 * object / 97,414-field catalog (2026-09-19) the run persisted both passes and then died here with
 * `Ineffective mark-compacts near heap limit`, costing primary-key classification: 412 keys
 * instead of the 797 the same catalog produced the day before.
 *
 * Removing it is safe by ordering: classification is the LAST stage, the heal re-opens its second
 * pass with its own refresh, and the callers that run this pipeline reload the engine after it
 * returns. `RefreshCatalog` is no cheaper substitute — the arrays it reloads ARE the cost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

type Field = { ID: string; Name: string; IsPrimaryKey: boolean; Save: () => Promise<boolean> };

const writerCalls: string[] = [];
const fields: Record<string, Field[]> = {};

vi.mock('../CatalogSource.js', () => ({
    ResolveCatalogSource: () => 'PerConnection',
    BuildCatalogWriter: () => ({
        Source: 'PerConnection',
        ObjectsInScope: async () => { writerCalls.push('ObjectsInScope'); return [
            { ID: 'OBJ-KEYED', Name: 'Keyed', Status: 'Active' },
            { ID: 'OBJ-KEYLESS', Name: 'Keyless', Status: 'Active' },
        ]; },
        KeyedObjectIDs: async (ids: string[]) => { writerCalls.push(`KeyedObjectIDs:${ids.length}`); return new Set(['obj-keyed']); },
        FieldsForObject: async (id: string) => { writerCalls.push(`FieldsForObject:${id}`); return fields[id] ?? []; },
    }),
}));

vi.mock('@memberjunction/integration-pk-classifier', () => ({
    SoftPKClassifier: class {
        async Classify() { return { Confident: false, Confidence: 0, Strategy: 'none', Reason: 'no signal' }; }
    },
}));

const { IntegrationConnectorCreationPipeline } = await import('../IntegrationConnectorCreationPipeline.js');

type Emitted = { event: string; objectName?: string; data?: Record<string, unknown> };

function emitter(log: Emitted[]) {
    const record = (event: string) => (objectName?: string, data?: Record<string, unknown>) => { log.push({ event, objectName, data }); };
    return {
        stageStart: record('stageStart'),
        stageComplete: record('stageComplete'),
        stageError: record('stageError'),
        checkpoint: record('checkpoint'),
        entityGenerated: record('entityGenerated'),
        entitySkippedNoPK: record('entitySkippedNoPK'),
        pkClassifierInvoked: record('pkClassifierInvoked'),
        pkClassifierResult: record('pkClassifierResult'),
    };
}

type StageHost = { StagePKClassify: (e: unknown, o: unknown) => Promise<{ unresolved: string[] }> };
const opts = { CompanyIntegration: { ID: 'ci-1', IntegrationID: 'int-1' }, ContextUser: { ID: 'u-1' }, Provider: {} };

describe('StagePKClassify', () => {
    let config: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        writerCalls.length = 0;
        fields['OBJ-KEYLESS'] = [{ ID: 'f1', Name: 'title', IsPrimaryKey: false, Save: async () => true }];
        config = vi.spyOn(IntegrationEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
    });
    afterEach(() => config.mockRestore());

    it('never reloads the engine — every read goes through the writer', async () => {
        const log: Emitted[] = [];
        const pipeline = new IntegrationConnectorCreationPipeline() as unknown as StageHost;
        const result = await pipeline.StagePKClassify(emitter(log), opts);

        expect(config).not.toHaveBeenCalled();
        expect(writerCalls).toEqual(['ObjectsInScope', 'KeyedObjectIDs:2', 'FieldsForObject:OBJ-KEYLESS']);
        expect(log.filter(e => e.event === 'entityGenerated').map(e => e.objectName)).toEqual(['Keyed']);
        expect(result.unresolved).toEqual(['Keyless']);
    });
});
