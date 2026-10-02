/**
 * Streaming introspect + persist: one traversal of the source, persisted object by object.
 *
 * Introspect used to hand Persist the WHOLE schema at the end, so the run's peak was every object
 * with every field at once — 888 objects / ~97k field descriptors on a large source, and twice that
 * on a first discovery. With a connector that honours `OnObject`, each object is persisted as it is
 * produced and then released; only object NAMES are carried to the end, because that is all
 * absent-object retirement needs.
 *
 * Retirement is split across the two moments (see PersistRetirementSplit.test.ts):
 *   per object  — absent FIELDS may retire, absent OBJECTS may not;
 *   final pass  — absent OBJECTS may retire, absent FIELDS may not.
 *
 * A connector override that ignores `OnObject` returns `Streamed` falsy and gets the old
 * whole-schema persist, unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions } from '../IntegrationConnectorCreationPipeline.js';
import { IntegrationSchemaSync, type PersistSchemaOptions, type PersistSchemaResult } from '../IntegrationSchemaSync.js';
import type { IntrospectSchemaOptions, SourceObjectInfo, SourceSchemaInfo } from '../types.js';

type PersistCall = {
    Names: string[];
    FieldCounts: number[];
    IsAuthoritative: boolean | undefined;
    DeactivateAbsent: boolean | undefined;
    DeactivateAbsentObjects: boolean | undefined;
    DeactivateAbsentFields: boolean | undefined;
};

const declared = (ExternalName: string): SourceObjectInfo => ({
    ExternalName,
    ExternalLabel: `${ExternalName} label`,
    Fields: [{ Name: 'id', Label: 'id', SourceType: 'string', IsRequired: true, AllowsNull: false, IsPrimaryKey: true }],
    PrimaryKeyFields: ['id'],
    Relationships: [],
});

const clearCaches = () => {
    const cls = IntegrationConnectorCreationPipeline as unknown as { inFlightRuns: Map<string, unknown>; recentRuns: Map<string, unknown> };
    cls.inFlightRuns.clear();
    cls.recentRuns.clear();
};

describe('streaming introspect + persist', () => {
    let rootDir: string;
    let calls: PersistCall[];
    let events: string[];

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'mj-stream-'));
        clearCaches();
        calls = [];
        events = [];
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(IntegrationSchemaSync, 'PersistDiscoveredSchema').mockImplementation(async (o: PersistSchemaOptions): Promise<PersistSchemaResult> => {
            const names = o.SourceSchema.Objects.map(x => x.ExternalName);
            events.push(`persist:${names.join(',')}`);
            calls.push({
                Names: names,
                FieldCounts: o.SourceSchema.Objects.map(x => x.Fields.length),
                IsAuthoritative: o.SourceSchema.IsAuthoritative,
                DeactivateAbsent: o.DeactivateAbsent,
                DeactivateAbsentObjects: o.DeactivateAbsentObjects,
                DeactivateAbsentFields: o.DeactivateAbsentFields,
            });
            const isTail = o.SourceSchema.Objects.every(x => x.Fields.length === 0);
            return {
                ObjectsCreated: isTail ? 0 : names.length,
                ObjectsUpdated: 0,
                FieldsCreated: o.SourceSchema.Objects.reduce((n, x) => n + x.Fields.length, 0),
                FieldsUpdated: 0,
                ObjectMergeLog: [],
                FieldMergeLog: [],
                ObjectsDeactivated: isTail ? ['Ghost'] : [],
                FieldsDeactivated: [],
            };
        });
        // PKClassify, the stage after Persist, reads the engine; nothing to classify here.
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            Config: async () => undefined,
            RefreshCatalog: async () => undefined,
            GetIntegrationObjectsByIntegrationID: () => [],
            GetIntegrationObjectFields: () => [],
        } as unknown as IntegrationEngineBase);
    });
    afterEach(() => { rmSync(rootDir, { recursive: true, force: true }); clearCaches(); vi.restoreAllMocks(); });

    /** A connector whose IntrospectSchema honours OnObject the way both base implementations do. */
    const streamingConnector = (objects: SourceObjectInfo[]) => ({
        TestConnection: async () => ({ Success: true, Message: 'ok' }),
        IntrospectSchema: async (_ci: unknown, _u: unknown, options?: IntrospectSchemaOptions): Promise<SourceSchemaInfo> => {
            if (!options?.OnObject) return { Objects: objects, IsAuthoritative: true };
            for (const o of objects) {
                events.push(`built:${o.ExternalName}`);
                await options.OnObject(o);
            }
            return { Objects: [], IsAuthoritative: true, Streamed: true };
        },
        DiscoverObjects: async () => [],
        DiscoverFieldsViaFetch: vi.fn(async () => []),
    });

    const run = (connector: object, deactivateAbsent = true) => new IntegrationConnectorCreationPipeline().Run({
        CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1', Integration: 'Synthetic' },
        Connector: connector,
        ContextUser: {},
        Provider: {},
        ArtifactRootDir: rootDir,
        DeactivateAbsent: deactivateAbsent,
    } as unknown as ConnectorCreationPipelineOptions);

    it('persists each object as it is produced, before the next one is built', async () => {
        const result = await run(streamingConnector([declared('Invoice'), declared('Customer')]));

        expect(result.Success).toBe(true);
        expect(events.slice(0, 4)).toEqual(['built:Invoice', 'persist:Invoice', 'built:Customer', 'persist:Customer']);
    });

    it('retires absent FIELDS per object and absent OBJECTS only in the final name pass', async () => {
        await run(streamingConnector([declared('Invoice'), declared('Customer')]));

        const perObject = calls.slice(0, 2);
        for (const c of perObject) {
            expect(c.Names.length).toBe(1);
            expect(c.DeactivateAbsentObjects).toBe(false);
            expect(c.DeactivateAbsentFields).toBe(true);
        }
        const tail = calls[2];
        expect(tail.Names).toEqual(['Invoice', 'Customer']);
        expect(tail.FieldCounts).toEqual([0, 0]);              // names only — no field data carried to the end
        expect(tail.IsAuthoritative).toBe(true);                // the SOURCE's claim gates object retirement
        expect(tail.DeactivateAbsentObjects).toBe(true);
        expect(tail.DeactivateAbsentFields).toBe(false);
    });

    it('reports the per-object counts plus what the final pass retired', async () => {
        const result = await run(streamingConnector([declared('Invoice'), declared('Customer')]));

        expect(result.PersistResult?.ObjectsCreated).toBe(2);
        expect(result.PersistResult?.FieldsCreated).toBe(2);
        expect(result.PersistResult?.ObjectsDeactivated).toEqual(['Ghost']);
    });

    it('a connector that ignores OnObject gets the old whole-schema persist, unchanged', async () => {
        const accumulating = {
            ...streamingConnector([]),
            IntrospectSchema: async (): Promise<SourceSchemaInfo> => ({ Objects: [declared('Invoice'), declared('Customer')], IsAuthoritative: true }),
        };
        await run(accumulating);

        expect(calls.length).toBe(1);
        expect(calls[0].Names).toEqual(['Invoice', 'Customer']);
        expect(calls[0].DeactivateAbsent).toBe(true);
        expect(calls[0].DeactivateAbsentObjects).toBeUndefined();
        expect(calls[0].DeactivateAbsentFields).toBeUndefined();
    });
});
