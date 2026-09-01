/**
 * Discovery samples the UNION of what the connector declares and what it surfaces at runtime.
 *
 * Sampling used to be reachable only through a DiscoverObjects hit: the loop that sampled iterated
 * the runtime list, so a declared object the connector does not re-surface at runtime — the normal
 * shape for a catalog-driven connector, and for EVERY object when DiscoverObjects fails — was never
 * sampled at all. It kept whatever widths the catalog guessed, which is how a column declared at 255
 * silently drops every longer record at sync time, and it could only gain its undeclared columns
 * later, one sync at a time, through the overflow path.
 *
 * These tests pin the union, not the mechanism: for each shape of connector, the object gets sampled.
 */
import { describe, it, expect, vi } from 'vitest';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions } from '../IntegrationConnectorCreationPipeline.js';
import type { SourceObjectInfo } from '../types.js';

type IntrospectHost = {
    StageIntrospect: (
        emitter: unknown,
        opts: ConnectorCreationPipelineOptions
    ) => Promise<{ Objects: SourceObjectInfo[] }>;
};

/** Collects what the stage emitted so a test can assert on the checkpoint/stageError payloads. */
function makeEmitter() {
    const checkpoints: Array<{ stage: string; data: Record<string, unknown> }> = [];
    const errors: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    return {
        checkpoints,
        errors,
        stageStart: () => undefined,
        stageComplete: () => undefined,
        heartbeat: () => undefined,
        checkpoint: (stage: string, data: Record<string, unknown>) => { checkpoints.push({ stage, data }); },
        stageError: (_stage: string, message: string, meta?: Record<string, unknown>) => { errors.push({ message, meta }); },
    };
}

/** A declared object as IntrospectSchema returns it — fields already stated, width guessed narrow. */
const declaredObject = (ExternalName: string, maxLength: number | null = 255): SourceObjectInfo => ({
    ExternalName,
    ExternalLabel: ExternalName,
    Description: '',
    Fields: [
        { Name: 'id', Label: 'id', SourceType: 'string', MaxLength: 50, IsPrimaryKey: true } as SourceObjectInfo['Fields'][number],
        { Name: 'note', Label: 'note', SourceType: 'string', MaxLength: maxLength } as SourceObjectInfo['Fields'][number],
    ],
    PrimaryKeyFields: ['id'],
    Relationships: [],
} as unknown as SourceObjectInfo);

/** A sampled field as DiscoverFieldsViaFetch returns it. */
const sampledField = (Name: string, MaxLength: number | null, IsPrimaryKey = false) => ({
    Name, Label: Name, Description: '', DataType: 'string',
    IsRequired: false, AllowsNull: true, MaxLength,
    IsPrimaryKey, IsUniqueKey: false, IsReadOnly: false, IsForeignKey: false,
});

function makeOpts(over: {
    declared: SourceObjectInfo[];
    discoverObjects?: () => Promise<Array<{ Name: string; Label: string; Description: string }>>;
    discoverFieldsViaFetch?: ReturnType<typeof vi.fn>;
    objectNames?: string[];
    runDeadlineMs?: number;
}): ConnectorCreationPipelineOptions {
    const discoverFieldsViaFetch = over.discoverFieldsViaFetch
        ?? vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900), sampledField('undeclared_col', 64)]);
    return {
        Connector: {
            IntrospectSchema: async () => ({ Objects: over.declared }),
            DiscoverObjects: over.discoverObjects ?? (async () => []),
            DiscoverFieldsViaFetch: discoverFieldsViaFetch,
        },
        CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1' },
        ContextUser: { ID: 'U-1' },
        IntrospectOptions: over.objectNames ? { ObjectNames: over.objectNames } : undefined,
        RunDeadlineMs: over.runDeadlineMs,
    } as unknown as ConnectorCreationPipelineOptions;
}

const host = () => Object.create(IntegrationConnectorCreationPipeline.prototype) as unknown as IntrospectHost;

describe('StageIntrospect — declared ∪ runtime sampling', () => {
    it('samples a DECLARED object the connector never surfaces at runtime', async () => {
        // The catalog-driven shape: IntrospectSchema knows the object, DiscoverObjects returns nothing.
        // Before the union this object was skipped entirely and kept its guessed 255.
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900)]);
        const opts = makeOpts({ declared: [declaredObject('Invoice')], discoverFieldsViaFetch: fetchFields });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        expect(fetchFields).toHaveBeenCalledWith(opts.CompanyIntegration, 'Invoice', opts.ContextUser);
        const note = schema.Objects[0].Fields.find((f) => f.Name === 'note');
        expect(note?.MaxLength).toBe(900); // widened from the declared 255 by what the data actually holds
    });

    it('adds columns the declaration never mentioned', async () => {
        const opts = makeOpts({ declared: [declaredObject('Invoice')] });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        expect(schema.Objects[0].Fields.map((f) => f.Name)).toContain('undeclared_col');
    });

    it('still samples every declared object when DiscoverObjects FAILS, and records that it failed', async () => {
        // The failure used to be total: runtimeObjects stayed empty, the only sampling loop iterated
        // it, and the run proceeded to Persist as though discovery had simply found nothing to add.
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900)]);
        const opts = makeOpts({
            declared: [declaredObject('Invoice'), declaredObject('Customer')],
            discoverObjects: async () => { throw new Error('vendor catalog endpoint 500'); },
            discoverFieldsViaFetch: fetchFields,
        });
        const emitter = makeEmitter();

        const schema = await host().StageIntrospect(emitter, opts);

        expect(fetchFields).toHaveBeenCalledTimes(2);
        expect(schema.Objects.every((o) => o.Fields.find((f) => f.Name === 'note')?.MaxLength === 900)).toBe(true);
        expect(emitter.errors.some((e) => e.meta?.code === 'discover-objects-failed')).toBe(true);
        const introspect = emitter.checkpoints.find((c) => c.stage === 'Introspect');
        expect(introspect?.data.discoverObjectsFailed).toBe(true);
    });

    it('samples a declared object exactly once when the connector ALSO surfaces it at runtime', async () => {
        // The union must not double-sample: sampling is the expensive part of discovery.
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900)]);
        const opts = makeOpts({
            declared: [declaredObject('Invoice')],
            discoverObjects: async () => [{ Name: 'Invoice', Label: 'Invoice', Description: '' }],
            discoverFieldsViaFetch: fetchFields,
        });

        await host().StageIntrospect(makeEmitter(), opts);

        expect(fetchFields).toHaveBeenCalledTimes(1);
    });

    it('samples an object once even when it is declared twice under different casing', async () => {
        // Both entries resolve to the same object, and sampling is the expensive half of discovery.
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900)]);
        const opts = makeOpts({ declared: [declaredObject('Invoice'), declaredObject('invoice')], discoverFieldsViaFetch: fetchFields });

        await host().StageIntrospect(makeEmitter(), opts);

        expect(fetchFields).toHaveBeenCalledTimes(1);
    });

    it('samples every declared object even when the runtime side returns a full, disjoint catalog', async () => {
        // A busy DiscoverObjects must not crowd the declared list out of the union: the second pass
        // walks what was declared, not what the runtime pass happened to leave over.
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true), sampledField('note', 900)]);
        const opts = makeOpts({
            declared: [declaredObject('Invoice'), declaredObject('Customer')],
            discoverObjects: async () => [
                { Name: 'Vendor', Label: 'Vendor', Description: '' },
                { Name: 'Payment', Label: 'Payment', Description: '' },
            ],
            discoverFieldsViaFetch: fetchFields,
        });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        const sampledNames = fetchFields.mock.calls.map((c) => (c as unknown[])[1]);
        expect(sampledNames).toEqual(expect.arrayContaining(['Invoice', 'Customer']));
        expect(schema.Objects.map((o) => o.ExternalName)).toEqual(
            expect.arrayContaining(['Invoice', 'Customer', 'Vendor', 'Payment'])
        );
    });

    it('honours a scoped introspection: an out-of-scope object is neither sampled nor fetched', async () => {
        // ObjectNames reached IntrospectSchema only; DiscoverObjects does not take it, so a scoped
        // run still pulled and sampled the entire runtime catalog.
        const fetchFields = vi.fn(async () => [sampledField('id', 50, true)]);
        const opts = makeOpts({
            declared: [declaredObject('Invoice'), declaredObject('Customer')],
            discoverObjects: async () => [{ Name: 'Vendor', Label: 'Vendor', Description: '' }],
            discoverFieldsViaFetch: fetchFields,
            objectNames: ['Invoice'],
        });

        await host().StageIntrospect(makeEmitter(), opts);

        expect(fetchFields).toHaveBeenCalledTimes(1);
        expect(fetchFields).toHaveBeenCalledWith(opts.CompanyIntegration, 'Invoice', opts.ContextUser);
    });

    it('leaves the declaration intact when sampling throws, and says which knowledge was lost', async () => {
        // The worst case of sampling failing must be the behaviour that shipped before it existed.
        const opts = makeOpts({
            declared: [declaredObject('Invoice')],
            discoverFieldsViaFetch: vi.fn(async () => { throw new Error('rate limited'); }),
        });
        const emitter = makeEmitter();

        const schema = await host().StageIntrospect(emitter, opts);

        expect(schema.Objects[0].Fields.map((f) => f.Name)).toEqual(['id', 'note']);
        expect(schema.Objects[0].Fields.find((f) => f.Name === 'note')?.MaxLength).toBe(255);
        expect(emitter.errors.some((e) => e.meta?.code === 'discover-fields-failed')).toBe(true);
    });

    it('a declared key stays authoritative even when the sample nominates another column', async () => {
        const opts = makeOpts({
            declared: [declaredObject('Invoice')],
            discoverFieldsViaFetch: vi.fn(async () => [sampledField('id', 50), sampledField('note', 900, true)]),
        });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        expect(schema.Objects[0].PrimaryKeyFields).toEqual(['id']);
    });

    describe('the sampling budget', () => {
        // Sampling is per OBJECT, so this stage's cost scales with the catalog. Execute races the
        // stage against the run deadline, but Promise.race does not CANCEL the loser — so without a
        // check the loop keeps calling the vendor for hours on behalf of an already-failed run.

        it('stops sampling once the run budget is spent, and keeps the declarations', async () => {
            // Each sample burns 30ms against a 60ms budget, so the first one or two land and the
            // rest are passed over. The objects still come back — with their declared fields.
            const fetchFields = vi.fn(async () => {
                await new Promise((r) => setTimeout(r, 30));
                return [sampledField('id', 50, true), sampledField('undeclared_col', 64)];
            });
            const declared = Array.from({ length: 12 }, (_v, i) => declaredObject(`Obj${i}`));
            const opts = makeOpts({ declared, discoverFieldsViaFetch: fetchFields, runDeadlineMs: 60 });
            const emitter = makeEmitter();

            const schema = await host().StageIntrospect(emitter, opts);

            expect(fetchFields.mock.calls.length).toBeLessThan(12);   // did NOT walk the whole catalog
            expect(schema.Objects).toHaveLength(12);                  // every object still returned
            // An unsampled object keeps its declaration — the behaviour that shipped before sampling.
            const last = schema.Objects[11];
            expect(last.Fields.map((f) => f.Name)).toEqual(['id', 'note']);
            expect(emitter.errors.some((e) => e.meta?.code === 'sample-budget-exhausted')).toBe(true);
        });

        it('samples everything when the budget is ample, and says nothing about time', async () => {
            const fetchFields = vi.fn(async () => [sampledField('id', 50, true)]);
            const declared = Array.from({ length: 6 }, (_v, i) => declaredObject(`Obj${i}`));
            const opts = makeOpts({ declared, discoverFieldsViaFetch: fetchFields, runDeadlineMs: 60_000 });
            const emitter = makeEmitter();

            await host().StageIntrospect(emitter, opts);

            expect(fetchFields.mock.calls.length).toBe(6);
            expect(emitter.errors.some((e) => e.meta?.code === 'sample-budget-exhausted')).toBe(false);
        });

        it('treats a budget of 0 as disabled, matching RunDeadlineMs elsewhere', async () => {
            const fetchFields = vi.fn(async () => [sampledField('id', 50, true)]);
            const declared = Array.from({ length: 4 }, (_v, i) => declaredObject(`Obj${i}`));
            const opts = makeOpts({ declared, discoverFieldsViaFetch: fetchFields, runDeadlineMs: 0 });

            await host().StageIntrospect(makeEmitter(), opts);

            expect(fetchFields.mock.calls.length).toBe(4);   // 0 disables, it does not mean "no time"
        });
    });
});