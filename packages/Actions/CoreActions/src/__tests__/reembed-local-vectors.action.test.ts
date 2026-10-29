/**
 * Tests for ReembedLocalVectorsAction: the filters it selects rows with, the per-row re-embed through the
 * record set processor (including putting a Force row back when its re-embed fails), dry-run counts, the
 * preflight embed, and result codes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Fields = Record<string, unknown>;
type SaveFn = (fields: Fields) => boolean;

const h = vi.hoisted(() => ({
    rows: [] as Array<{ id: string; fields: Fields; save: SaveFn }>,
    sources: [] as Array<{ entityName: string; filter: string }>,
    countRunView: vi.fn(),
    embedTextLocal: vi.fn(),
    defaultModel: { ID: 'model-new', Name: 'EmbeddingGemma 2 (Local)' } as { ID: string; Name: string } | null,
}));

vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    EscapeSQLString: (s: string) => s.replace(/'/g, "''"),
    UUIDsEqual: (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(),
}));
vi.mock('@memberjunction/core', () => ({
    CompositeKey: { FromURLSegment: (_entity: unknown, segment: string) => segment },
    RunView: { FromMetadataProvider: () => ({ RunView: h.countRunView }) },
}));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(), EmbedTextLocal: h.embedTextLocal, get DefaultLocalEmbeddingModel() { return h.defaultModel; } } },
}));
vi.mock('@memberjunction/record-set-processor-base', () => ({
    KeysetSource: class { constructor(entityName: string, filter: string) { h.sources.push({ entityName, filter }); } },
}));
// Runs the processor over h.rows, as the engine does over a source's pages.
vi.mock('@memberjunction/record-set-processor', () => ({
    FunctionRecordProcessor: class {
        constructor(public fn: (record: { RecordID: string }, ctx: unknown) => Promise<{ Status: string }>) {}
    },
    RecordSetProcessor: {
        Instance: {
            async Process(options: { Processor: { fn: (record: { RecordID: string }, ctx: unknown) => Promise<{ Status: string }> }; Provider: unknown }) {
                let success = 0;
                for (const row of h.rows) {
                    const result = await options.Processor.fn({ RecordID: row.id }, { Provider: options.Provider, ContextUser: { ID: 'user-1' } });
                    if (result.Status === 'Succeeded') success++;
                }
                return { Status: 'Completed', Processed: h.rows.length, Success: success, Error: h.rows.length - success };
            },
        },
    },
}));

import { ReembedLocalVectorsAction } from '../custom/utilities/reembed-local-vectors.action';

/** A row whose save re-embeds a stale vector (its model isn't 'model-new'), or fails as told. */
function row(id: string, model: string | null, save?: SaveFn) {
    const fields: Fields = { EmbeddingVector: '[1,0]', EmbeddingModelID: model };
    h.rows.push({ id, fields, save: save ?? (f => { if (f.EmbeddingModelID !== 'model-new') f.EmbeddingModelID = 'model-new'; return true; }) });
    return fields;
}

/** The provider the action passes down: entity objects backed by h.rows. */
const provider = {
    async GetEntityObject() {
        let current: (typeof h.rows)[number] | undefined;
        return {
            EntityInfo: {},
            LatestResult: { CompleteMessage: 'boom' },
            async InnerLoad(id: string) { current = h.rows.find(r => r.id === id); return current != null; },
            GetFieldByName(name: string) {
                if (!current || !(name in current.fields)) return null;
                const fields = current.fields;
                return { get Value() { return fields[name]; }, set Value(v: unknown) { fields[name] = v; } };
            },
            async Save() { return current!.save(current!.fields); },
        };
    },
};

type Param = { Name: string; Type: string; Value: unknown };

class TestableAction extends ReembedLocalVectorsAction {
    public async Invoke(params: Param[]) {
        const result = await this.InternalRunAction({ Params: params, ContextUser: { ID: 'user-1' }, Provider: provider } as never);
        return { result, report: params.find(p => p.Name === 'Report')?.Value as { Entities: Array<Record<string, unknown>> } | undefined };
    }
}

const notesOnly: Param = { Name: 'EntityNames', Type: 'Input', Value: 'mj: ai agent notes' };

describe('ReembedLocalVectorsAction', () => {
    beforeEach(() => {
        h.rows = [];
        h.sources = [];
        h.countRunView.mockReset();
        h.embedTextLocal.mockReset();
        h.embedTextLocal.mockResolvedValue({ result: { vector: [0.1] } });
        h.defaultModel = { ID: 'model-new', Name: 'EmbeddingGemma 2 (Local)' };
    });

    it('selects rows with a vector from another model, or an unrecorded one, escaping the model ID', async () => {
        h.defaultModel = { ID: "a'b", Name: 'odd' };
        await new TestableAction().Invoke([{ Name: 'EntityNames', Type: 'Input', Value: 'MJ: Components' }]);
        expect(h.sources[0].filter).toBe(
            "(FunctionalRequirementsVector IS NOT NULL AND (FunctionalRequirementsVectorEmbeddingModelID IS NULL OR FunctionalRequirementsVectorEmbeddingModelID <> 'a''b'))"
            + " OR (TechnicalDesignVector IS NOT NULL AND (TechnicalDesignVectorEmbeddingModelID IS NULL OR TechnicalDesignVectorEmbeddingModelID <> 'a''b'))");
    });

    it('re-embeds every stale row and counts what was fixed and what was not', async () => {
        row('ok', 'model-old');
        row('save-fails', 'model-old', () => false);
        row('embed-fails', 'model-old', () => true);
        const { result, report } = await new TestableAction().Invoke([notesOnly]);

        expect(report?.Entities).toEqual([{ EntityName: 'MJ: AI Agent Notes', Found: 3, Reembedded: 1, Failed: 2 }]);
        expect(result).toMatchObject({ Success: false, ResultCode: 'PARTIAL_FAILURE' });
        expect(result.Message).toContain('MJ: AI Agent Notes: 1 re-embedded, 2 failed');
    });

    it('with Force, re-embeds rows already on the default model by clearing their model first', async () => {
        let modelAtSave: unknown = 'not saved';
        const fields = row('current', 'model-new', f => { modelAtSave = f.EmbeddingModelID; f.EmbeddingModelID = 'model-new'; return true; });
        const { result } = await new TestableAction().Invoke([notesOnly, { Name: 'Force', Type: 'Input', Value: 'true' }]);

        expect(h.sources[0].filter).toBe('(EmbeddingVector IS NOT NULL)');
        expect(modelAtSave).toBeNull();
        expect(fields.EmbeddingModelID).toBe('model-new');
        expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
    });

    it('with Force, puts the model back when the re-embed fails, so the row is left as it was', async () => {
        const fields = row('fails', 'model-new', () => true); // saves, but nothing re-embeds
        const { report } = await new TestableAction().Invoke([notesOnly, { Name: 'Force', Type: 'Input', Value: true }]);
        expect(fields.EmbeddingModelID).toBe('model-new');
        expect(report?.Entities[0]).toMatchObject({ Reembedded: 0, Failed: 1 });
    });

    it('with Force, says so when putting the model back fails too', async () => {
        let saves = 0;
        row('stuck', 'model-new', () => ++saves === 1); // first save works but doesn't re-embed; the restore fails
        const { result } = await new TestableAction().Invoke([notesOnly, { Name: 'Force', Type: 'Input', Value: true }]);
        expect(result.ResultCode).toBe('PARTIAL_FAILURE');
        expect(saves).toBe(2);
    });

    it('changes nothing when the default model cannot embed', async () => {
        h.embedTextLocal.mockResolvedValue(null);
        row('untouched', 'model-old');
        const { result } = await new TestableAction().Invoke([]);
        expect(result).toMatchObject({ Success: false, ResultCode: 'FAILED' });
        expect(result.Message).toContain('could not embed a test text, so no rows were changed');
        expect(h.sources).toEqual([]);
    });

    it('only counts on a dry run, without the preflight embed', async () => {
        h.countRunView.mockResolvedValue({ Success: true, TotalRowCount: 7 });
        const { result, report } = await new TestableAction().Invoke([{ Name: 'DryRun', Type: 'Input', Value: 'true' }]);

        expect(report?.Entities).toHaveLength(5);
        expect(report?.Entities.every(e => e.Found === 7 && e.Reembedded === 0)).toBe(true);
        expect(h.countRunView.mock.calls.every(c => c[0].ResultType === 'count_only')).toBe(true);
        expect(h.embedTextLocal).not.toHaveBeenCalled();
        expect(result.Message).toContain('Dry run');
    });

    it('rejects an entity it does not embed', async () => {
        const { result } = await new TestableAction().Invoke([{ Name: 'EntityNames', Type: 'Input', Value: 'MJ: Users' }]);
        expect(result).toMatchObject({ ResultCode: 'FAILED', Message: expect.stringContaining('Not a locally embedded entity: mj: users') });
    });

    it('fails clearly when there is no local embedding model', async () => {
        h.defaultModel = null;
        const { result } = await new TestableAction().Invoke([]);
        expect(result).toMatchObject({ ResultCode: 'FAILED', Message: expect.stringContaining('No active local embedding model') });
    });
});
