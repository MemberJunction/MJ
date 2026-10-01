/**
 * A streamed discovery must learn and keep exactly what an accumulated one does — only its peak
 * memory may differ.
 *
 * The streaming shape as first written handed each declared object straight from the connector to
 * Persist. Every pipeline step that runs AFTER IntrospectSchema returns read `schema.Objects` — and
 * in streaming mode that array is empty by design. So, silently, on every connector that streams:
 *
 *   - no declared object was sampled: catalog-guessed widths, no undeclared columns, no PK evidence;
 *   - every runtime object looked brand new, was sampled, held in memory, and then never persisted
 *     (the streamed path persisted only the names it had been handed);
 *   - a runtime-only object was therefore lost outright, and on an authoritative comprehensive
 *     refresh the final pass retired it as "absent";
 *   - the final name pass wrote each object's NAME over its stored DisplayName (a stub's label is an
 *     opinion to the overlay), and ran even when nothing could be retired;
 *   - the Introspect stage reported 0 objects discovered;
 *   - an override that forwarded OnObject but rebuilt its result without `Streamed` got a
 *     whole-schema persist of an EMPTY schema — which, on an authoritative comprehensive refresh,
 *     retires every object.
 *
 * Each test below pins one of those against the behaviour of the accumulate path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as V8 from 'node:v8';
import type * as OS from 'node:os';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions } from '../IntegrationConnectorCreationPipeline.js';
import {
    IntegrationSchemaSync,
    DecideSemanticOverlay,
    type PersistSchemaOptions,
    type PersistSchemaResult,
} from '../IntegrationSchemaSync.js';
import type { IntrospectSchemaOptions, SourceObjectInfo, SourceSchemaInfo } from '../types.js';

/** Heap reading for the memory-budget test; 0/0 (= unknown) means "no pressure" everywhere else. */
const reading = vi.hoisted(() => ({ used: 0, limit: 0 }));
vi.mock('node:v8', async (importOriginal) => {
    const actual = await importOriginal<typeof V8>();
    return {
        ...actual,
        getHeapStatistics: () => ({ ...actual.getHeapStatistics(), used_heap_size: reading.used, heap_size_limit: reading.limit }),
    };
});
vi.mock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof OS>();
    return { ...actual, totalmem: () => 0 };
});

const MB = 1024 * 1024;

const declaredObject = (ExternalName: string): SourceObjectInfo => ({
    ExternalName,
    ExternalLabel: `${ExternalName} (declared label)`,
    Fields: [
        { Name: 'id', Label: 'id', SourceType: 'string', IsRequired: true, AllowsNull: false, MaxLength: 50, IsPrimaryKey: true },
        { Name: 'note', Label: 'note', SourceType: 'string', IsRequired: false, AllowsNull: true, MaxLength: 255 },
    ],
    PrimaryKeyFields: ['id'],
    Relationships: [],
});

const sampledField = (Name: string, MaxLength: number | null, IsPrimaryKey = false) => ({
    Name, Label: Name, Description: '', DataType: 'string',
    IsRequired: false, AllowsNull: true, MaxLength,
    IsPrimaryKey, IsUniqueKey: false, IsReadOnly: false, IsForeignKey: false,
});

type Persisted = { Names: string[]; Objects: SourceObjectInfo[]; IsAuthoritative?: boolean; Opts: Partial<PersistSchemaOptions> };

const clearCaches = () => {
    const cls = IntegrationConnectorCreationPipeline as unknown as { inFlightRuns: Map<string, unknown>; recentRuns: Map<string, unknown> };
    cls.inFlightRuns.clear();
    cls.recentRuns.clear();
};

describe('a streamed discovery keeps what an accumulated one keeps', () => {
    let rootDir: string;
    let persisted: Persisted[];

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'mj-streamkeep-'));
        clearCaches();
        persisted = [];
        reading.used = 0;
        reading.limit = 0;
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(IntegrationSchemaSync, 'PersistDiscoveredSchema').mockImplementation(async (o: PersistSchemaOptions): Promise<PersistSchemaResult> => {
            // Deep copy: the pipeline is free to release or mutate the object after persisting it.
            const objects = JSON.parse(JSON.stringify(o.SourceSchema.Objects)) as SourceObjectInfo[];
            persisted.push({
                Names: objects.map(x => x.ExternalName),
                Objects: objects,
                IsAuthoritative: o.SourceSchema.IsAuthoritative,
                Opts: { DeactivateAbsent: o.DeactivateAbsent, DeactivateAbsentObjects: o.DeactivateAbsentObjects, DeactivateAbsentFields: o.DeactivateAbsentFields },
            });
            return {
                ObjectsCreated: objects.length, ObjectsUpdated: 0, FieldsCreated: 0, FieldsUpdated: 0,
                ObjectMergeLog: [], FieldMergeLog: [], ObjectsDeactivated: [], FieldsDeactivated: [],
            };
        });
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            Config: async () => undefined,
            RefreshCatalog: async () => undefined,
            GetIntegrationObjectsByIntegrationID: () => [],
            GetIntegrationObjectFields: () => [],
        } as unknown as IntegrationEngineBase);
    });
    afterEach(() => { rmSync(rootDir, { recursive: true, force: true }); clearCaches(); vi.restoreAllMocks(); });

    /** Streams the declared catalog through OnObject, as both base implementations do. */
    const connector = (over: {
        declared: SourceObjectInfo[];
        runtime?: string[];
        fetchFields?: ReturnType<typeof vi.fn>;
        concurrent?: boolean;
        dropStreamedFlag?: boolean;
        authoritative?: boolean;
    }) => ({
        TestConnection: async () => ({ Success: true, Message: 'ok' }),
        IntrospectSchema: async (_ci: unknown, _u: unknown, options?: IntrospectSchemaOptions): Promise<SourceSchemaInfo> => {
            const isAuth = over.authoritative ?? true;
            if (!options?.OnObject) return { Objects: over.declared, IsAuthoritative: isAuth };
            const handler = options.OnObject;
            if (over.concurrent) await Promise.all(over.declared.map(o => handler(o)));
            else for (const o of over.declared) await handler(o);
            // An override that rebuilds its result without the flag (a real shape: `{ Objects, IsAuthoritative }`).
            return over.dropStreamedFlag ? { Objects: [], IsAuthoritative: isAuth } : { Objects: [], IsAuthoritative: isAuth, Streamed: true };
        },
        DiscoverObjects: async () => (over.runtime ?? []).map(Name => ({ Name, Label: Name, Description: '' })),
        DiscoverFieldsViaFetch: over.fetchFields
            ?? vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900), sampledField('undeclared_col', 64)]),
    });

    const run = (c: object, deactivateAbsent = true) => new IntegrationConnectorCreationPipeline().Run({
        CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1', Integration: 'Synthetic' },
        Connector: c,
        ContextUser: {},
        Provider: {},
        ArtifactRootDir: rootDir,
        DeactivateAbsent: deactivateAbsent,
    } as unknown as ConnectorCreationPipelineOptions);

    /** Every object persisted with field data (i.e. not a final-pass name stub). */
    const persistedObjects = () => persisted.flatMap(p => p.Objects).filter(o => o.Fields.length > 0);
    const tailCall = () => persisted.find(p => p.Objects.length > 0 && p.Objects.every(o => o.Fields.length === 0));

    it('samples a streamed declared object BEFORE persisting it', async () => {
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900), sampledField('undeclared_col', 64)]);
        await run(connector({ declared: [declaredObject('Invoice')], fetchFields }));

        expect(fetchFields).toHaveBeenCalledTimes(1);
        const invoice = persistedObjects().find(o => o.ExternalName === 'Invoice');
        expect(invoice?.Fields.find(f => f.Name === 'note')?.MaxLength).toBe(900);   // widened by the data
        expect(invoice?.Fields.map(f => f.Name)).toContain('undeclared_col');        // learned from the data
    });

    it('persists a runtime-only object, and keeps it out of the absent set', async () => {
        await run(connector({ declared: [declaredObject('Invoice')], runtime: ['Invoice', 'Vendor'] }));

        const vendor = persistedObjects().find(o => o.ExternalName === 'Vendor');
        expect(vendor?.Fields.map(f => f.Name)).toEqual(['id', 'note', 'undeclared_col']);
        expect(tailCall()?.Names).toEqual(expect.arrayContaining(['Invoice', 'Vendor']));
    });

    it('samples and persists a declared object the connector ALSO surfaces at runtime exactly once', async () => {
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900)]);
        await run(connector({ declared: [declaredObject('Invoice')], runtime: ['Invoice'], fetchFields }));

        expect(fetchFields).toHaveBeenCalledTimes(1);
        const invoices = persistedObjects().filter(o => o.ExternalName === 'Invoice');
        expect(invoices.length).toBe(1);
        expect(invoices[0].Fields.find(f => f.Name === 'note')?.MaxLength).toBe(900);
    });

    it('samples one object at a time even when the connector streams concurrently', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const fetchFields = vi.fn(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise(r => setTimeout(r, 5));
            inFlight--;
            return [sampledField('id', 50, true)];
        });
        await run(connector({ declared: ['A', 'B', 'C'].map(declaredObject), fetchFields, concurrent: true }));

        expect(fetchFields).toHaveBeenCalledTimes(3);
        expect(maxInFlight).toBe(1);   // the accumulate path samples serially; streaming must not fan out vendor reads
    });

    it('the final name pass cannot overwrite a stored DisplayName', async () => {
        await run(connector({ declared: [declaredObject('Invoice')] }));

        const stub = tailCall()?.Objects.find(o => o.ExternalName === 'Invoice');
        expect(stub).toBeDefined();
        // The overlay treats any non-empty label as the source's opinion. A stub carries no opinion.
        expect(DecideSemanticOverlay('Invoices (curated)', stub?.ExternalLabel).changed).toBe(false);
        expect(DecideSemanticOverlay('Curated description', stub?.Description).changed).toBe(false);
    });

    it('runs no final name pass when nothing may be retired', async () => {
        await run(connector({ declared: [declaredObject('Invoice'), declaredObject('Customer')] }), false);

        expect(tailCall()).toBeUndefined();
        expect(persisted.map(p => p.Names)).toEqual([['Invoice'], ['Customer']]);
    });

    it('reports the objects it streamed as discovered', async () => {
        const result = await run(connector({ declared: [declaredObject('Invoice'), declaredObject('Customer')], runtime: ['Vendor'] }));
        expect(result.Success).toBe(true);

        const introspect = readCheckpoint(rootDir, result.RunID, 'Introspect');
        expect(introspect?.objectsDiscovered).toBe(3);
    });

    it('still honours the memory budget: an unsampled object is persisted with its declaration and counted', async () => {
        // A 1 GB heap at 78%: under the fraction, inside the absolute floor — the gate fires.
        reading.used = 800 * MB;
        reading.limit = 1024 * MB;
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true)]);
        const result = await run(connector({ declared: [declaredObject('Invoice'), declaredObject('Customer')], fetchFields }));

        expect(fetchFields).not.toHaveBeenCalled();
        expect(persistedObjects().map(o => o.ExternalName)).toEqual(['Invoice', 'Customer']);
        expect(persistedObjects()[0].Fields.find(f => f.Name === 'note')?.MaxLength).toBe(255);   // the declaration, intact
        expect(readCheckpoint(rootDir, result.RunID, 'Introspect')?.unsampledForMemory).toBe(2);
    });

    it('an override that streams but drops the Streamed flag is still treated as streamed', async () => {
        // The dangerous case: a whole-schema persist of the now-EMPTY schema, on an authoritative
        // comprehensive refresh, finds every stored object absent and retires all of them.
        await run(connector({ declared: [declaredObject('Invoice'), declaredObject('Customer')], dropStreamedFlag: true }));

        const emptyWholeSchema = persisted.find(p => p.Objects.length === 0);
        expect(emptyWholeSchema).toBeUndefined();
        expect(tailCall()?.Names).toEqual(['Invoice', 'Customer']);
    });
});

/** Reads one stage checkpoint's payload back from the run's progress stream. */
function readCheckpoint(rootDir: string, runID: string, stage: string): Record<string, unknown> | undefined {
    const lines = readFileSync(join(rootDir, runID, 'progress.jsonl'), 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
        const e = JSON.parse(line) as { eventType?: string; stage?: string; resumableState?: Record<string, unknown> };
        if (e.eventType === 'checkpoint' && e.stage === stage) return e.resumableState;
    }
    return undefined;
}
