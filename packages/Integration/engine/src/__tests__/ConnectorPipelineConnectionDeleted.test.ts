/**
 * A discovery must not persist for a connection that no longer exists.
 *
 * `startSchemaRefreshPipelineDetached` is fire-and-forget and nothing cancels it, so a delete landing
 * mid-run leaves the pipeline holding an in-memory `CompanyIntegration` whose row is gone. Observed on
 * the sandbox 2026-09-11: one full pass wrote 27 objects for a connection the connection list reported
 * as absent. The credential had gone with it, so every object fell back to its catalog DESCRIPTION —
 * each fallback legitimate in isolation, which is why 27 of them raised no alarm.
 *
 * The severity is decided by which catalog is the target, and THAT is the finding. Per-connection,
 * every row carries `CompanyIntegrationID` and the FK rejects all 27 — loud, atomic, nothing lands.
 * SHARED (the default: no `catalogSource` in Configuration), every row is keyed by `IntegrationID`,
 * which never goes away — so the identical run SUCCEEDS and overwrites the declared floor that every
 * other connection of that connector rebases from. These tests therefore pin the refusal on a
 * SHARED-catalog connection, which is exactly where it used to succeed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions } from '../IntegrationConnectorCreationPipeline.js';
import { IntegrationSchemaSync } from '../IntegrationSchemaSync.js';
import { ResolveCatalogSource } from '../CatalogSource.js';
import type { SourceSchemaInfo } from '../types.js';

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) { return mockRunViewFn(...args); }
        },
    };
});

type StageEvent = { kind: 'start' | 'error' | 'complete' | 'other'; stage: string; message?: string; code?: unknown };

function fakeEmitter(events: StageEvent[]) {
    return {
        stageStart: (stage: string, message?: string) => events.push({ kind: 'start', stage, message }),
        stageError: (stage: string, message: string, data?: { code?: unknown }) =>
            events.push({ kind: 'error', stage, message, code: data?.code }),
        stageComplete: (stage: string) => events.push({ kind: 'complete', stage }),
        checkpoint: () => events.push({ kind: 'other', stage: 'checkpoint' }),
        objectAdded: () => events.push({ kind: 'other', stage: 'objectAdded' }),
        fieldAdded: () => events.push({ kind: 'other', stage: 'fieldAdded' }),
        warning: () => events.push({ kind: 'other', stage: 'warning' }),
    };
}

/** A SHARED-catalog connection: no `catalogSource` in Configuration is the default, and Shared. */
const sharedCatalogOpts = (): ConnectorCreationPipelineOptions => ({
    CompanyIntegration: {
        ID: 'ci-gone',
        IntegrationID: 'int-1',
        Integration: 'PheedLoop',
        Configuration: '{}',
    },
    ContextUser: { ID: 'user-1' },
    Connector: {},
} as unknown as ConnectorCreationPipelineOptions);

const sourceSchema: SourceSchemaInfo = {
    Objects: [{
        ExternalName: 'attendees',
        ExternalLabel: 'Attendees',
        Fields: [{
            Name: 'code', Label: 'Code', SourceType: 'string',
            IsRequired: true, IsPrimaryKey: true,
            MaxLength: null, Precision: null, Scale: null, DefaultValue: null, ForeignKeyTarget: null,
        }],
        PrimaryKeyFields: ['code'],
        Relationships: [],
    }],
};

/** Invokes the private stage — the seam the whole harm lands in. */
function stagePersist(
    pipeline: IntegrationConnectorCreationPipeline,
    emitter: ReturnType<typeof fakeEmitter>,
    opts: ConnectorCreationPipelineOptions,
): Promise<unknown> {
    return (pipeline as unknown as {
        StagePersist: (e: unknown, o: ConnectorCreationPipelineOptions, s: unknown) => Promise<unknown>;
    }).StagePersist(emitter, opts, sourceSchema);
}

describe('IntegrationConnectorCreationPipeline — StagePersist re-checks the connection', () => {
    let persistSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockRunViewFn = vi.fn();
        persistSpy = vi.spyOn(IntegrationSchemaSync, 'PersistDiscoveredSchema').mockResolvedValue({
            ObjectsCreated: 27, ObjectsUpdated: 0, FieldsCreated: 0, FieldsUpdated: 0,
            ObjectMergeLog: [], FieldMergeLog: [],
            ObjectsDeactivated: [], FieldsDeactivated: [],
        } as unknown as Awaited<ReturnType<typeof IntegrationSchemaSync.PersistDiscoveredSchema>>);
    });

    afterEach(() => { persistSpy.mockRestore(); });

    it('the fixture really is a SHARED-catalog connection — where this used to SUCCEED', () => {
        // Stated, not assumed: on the per-connection catalog the FK would have rejected every row, so
        // a refusal proven only there would prove nothing about the case that corrupted a tenant.
        expect(ResolveCatalogSource(sharedCatalogOpts().CompanyIntegration)).toBe('Shared');
    });

    it('writes NOTHING and fails the stage by name when the connection has been deleted', async () => {
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });   // the row is gone
        const events: StageEvent[] = [];
        const pipeline = new IntegrationConnectorCreationPipeline();

        await expect(stagePersist(pipeline, fakeEmitter(events), sharedCatalogOpts()))
            .rejects.toThrow(/deleted while this discovery was running/);

        // The refusal, not a warning: nothing reached the catalog.
        expect(persistSpy).not.toHaveBeenCalled();
        const error = events.find(e => e.kind === 'error');
        expect(error?.stage).toBe('Persist');
        expect(error?.code).toBe('connection-deleted');
        expect(error?.message).toContain('ci-gone');
        // And the operator is told why it matters, not just that it stopped.
        expect(error?.message).toContain('declared catalog');
    });

    it('asks the database, not the cache — a cached row is the stale answer this cannot accept', async () => {
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        const pipeline = new IntegrationConnectorCreationPipeline();

        await expect(stagePersist(pipeline, fakeEmitter([]), sharedCatalogOpts())).rejects.toThrow();

        const params = mockRunViewFn.mock.calls[0][0] as Record<string, unknown>;
        expect(params['EntityName']).toBe('MJ: Company Integrations');
        expect(params['BypassCache']).toBe(true);
        expect(params['ExtraFilter']).toContain('ci-gone');
    });

    it('persists normally when the connection is still there', async () => {
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'ci-gone' }] });
        const events: StageEvent[] = [];

        await stagePersist(new IntegrationConnectorCreationPipeline(), fakeEmitter(events), sharedCatalogOpts());

        expect(persistSpy).toHaveBeenCalledTimes(1);
        expect(events.some(e => e.kind === 'error')).toBe(false);
    });

    it('does not refuse the run when the liveness READ itself failed', async () => {
        // A transient DB blip must not turn into "the connection was deleted" — that would fail
        // discoveries for a reason that has nothing to do with the connection.
        mockRunViewFn.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'connection reset' });

        await stagePersist(new IntegrationConnectorCreationPipeline(), fakeEmitter([]), sharedCatalogOpts());

        expect(persistSpy).toHaveBeenCalledTimes(1);
    });
});
