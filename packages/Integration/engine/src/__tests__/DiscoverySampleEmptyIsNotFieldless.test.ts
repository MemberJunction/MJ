/**
 * Discovery must never persist an object with NO FIELDS AT ALL.
 *
 * A sample returns zero fields whenever it saw zero records, and an empty source table is an
 * ordinary state rather than a malfunction — so it never throws, never takes the failure fallback,
 * and the empty result was written out verbatim as the object's schema. The object then maps to
 * nothing and syncs nothing, and since discovery does not re-run on its own, the emptiness of a
 * table at one moment becomes a permanent property of the schema — while the connector's own
 * describe surface knew the columns the whole time.
 *
 * Two paths reach that outcome, and only these two, because they are the only ones where the sample
 * is the sole source of fields:
 *   - a RUNTIME-DISCOVERED object, which has no declaration behind it at all;
 *   - a NAME-ONLY declared object, whose declaration states no fields to defer to.
 *
 * The last test is the guard that matters most. Zero fields is ALSO a deliberate outcome: a
 * composition child whose parent tuple is unknowable adjourns to declared-only fields on purpose,
 * and for an object that declared fields that must stay a no-op. So the backstop is gated on the
 * declaration being empty too, rather than on the sample being empty alone.
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

function makeEmitter() {
    const errors: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    return {
        errors,
        stageStart: () => undefined,
        stageComplete: () => undefined,
        heartbeat: () => undefined,
        checkpoint: () => undefined,
        stageError: (_stage: string, message: string, meta?: Record<string, unknown>) => { errors.push({ message, meta }); },
    };
}

const field = (Name: string, MaxLength: number | null = null) => ({
    Name, Label: Name, Description: '', DataType: 'string',
    IsRequired: false, AllowsNull: true, MaxLength,
    IsPrimaryKey: false, IsUniqueKey: false, IsReadOnly: false, IsForeignKey: false,
});

/** A declaration that names the object but states no fields — the name-only shape. */
const nameOnly = (ExternalName: string): SourceObjectInfo => ({
    ExternalName, ExternalLabel: ExternalName, Description: '',
    Fields: [], PrimaryKeyFields: [], Relationships: [],
} as unknown as SourceObjectInfo);

/** A declaration that already states its fields. */
const withFields = (ExternalName: string): SourceObjectInfo => ({
    ExternalName, ExternalLabel: ExternalName, Description: '',
    Fields: [{ Name: 'declared_id', Label: 'declared_id', SourceType: 'string', MaxLength: 50, IsPrimaryKey: true }],
    PrimaryKeyFields: ['declared_id'], Relationships: [],
} as unknown as SourceObjectInfo);

function makeOpts(over: {
    declared?: SourceObjectInfo[];
    runtime?: Array<{ Name: string; Label: string; Description: string }>;
    sampled?: ReturnType<typeof field>[];
    discoverFields?: ReturnType<typeof vi.fn>;
}) {
    const discoverFields = over.discoverFields ?? vi.fn(async () => [field('id'), field('note')]);
    const opts = {
        Connector: {
            IntrospectSchema: async () => ({ Objects: over.declared ?? [] }),
            DiscoverObjects: async () => over.runtime ?? [],
            // The empty sample: the stream completed and produced no records, so nothing was inferred.
            DiscoverFieldsViaFetch: vi.fn(async () => over.sampled ?? []),
            DiscoverFields: discoverFields,
        },
        CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1' },
        ContextUser: { ID: 'U-1' },
    } as unknown as ConnectorCreationPipelineOptions;
    return { opts, discoverFields };
}

const host = () => Object.create(IntegrationConnectorCreationPipeline.prototype) as unknown as IntrospectHost;

describe('StageIntrospect — an empty sample never persists a fieldless object', () => {
    it('backstops a RUNTIME-DISCOVERED object with the connector description', async () => {
        const { opts, discoverFields } = makeOpts({
            runtime: [{ Name: 'Widgets', Label: 'Widgets', Description: '' }],
        });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        // THE regression: this object used to be persisted with Fields: [].
        expect(schema.Objects[0].Fields.map((f) => f.Name)).toEqual(['id', 'note']);
        expect(discoverFields).toHaveBeenCalledTimes(1);
    });

    it('backstops a NAME-ONLY declared object', async () => {
        const { opts, discoverFields } = makeOpts({ declared: [nameOnly('Widgets')] });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        expect(schema.Objects[0].Fields.map((f) => f.Name)).toEqual(['id', 'note']);
        expect(discoverFields).toHaveBeenCalledTimes(1);
    });

    it('announces it, so a discovery that learned nothing is not read as a success', async () => {
        const { opts } = makeOpts({ runtime: [{ Name: 'Widgets', Label: 'Widgets', Description: '' }] });
        const emitter = makeEmitter();

        await host().StageIntrospect(emitter, opts);

        // Same channel the failure fallback already uses: from the outside, "sampled" and "gave up
        // and used the catalog" must not look alike.
        expect(emitter.errors.some((e) => e.meta?.code === 'discover-fields-fallback')).toBe(true);
    });

    it('survives a describe surface that fails too, rather than failing the run', async () => {
        const { opts } = makeOpts({
            runtime: [{ Name: 'Widgets', Label: 'Widgets', Description: '' }],
            discoverFields: vi.fn(async () => { throw new Error('describe unavailable'); }),
        });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        expect(schema.Objects[0].Fields).toEqual([]);
    });

    it('leaves a DECLARED object alone, so a deliberate zero-field adjourn stays a no-op', async () => {
        // The over-reach guard. A composition child with an unknowable parent tuple returns zero
        // fields ON PURPOSE and keeps its declared fields. Consulting the describe surface here
        // would convert that designed outcome into a fallback on every discovery run.
        const { opts, discoverFields } = makeOpts({ declared: [withFields('Widgets')] });
        const emitter = makeEmitter();

        const schema = await host().StageIntrospect(emitter, opts);

        expect(discoverFields).not.toHaveBeenCalled();
        expect(schema.Objects[0].Fields.map((f) => f.Name)).toEqual(['declared_id']);
        expect(emitter.errors.some((e) => e.meta?.code === 'discover-fields-fallback')).toBe(false);
    });

    it('leaves a sample that DID yield fields completely alone', async () => {
        const { opts, discoverFields } = makeOpts({
            runtime: [{ Name: 'Widgets', Label: 'Widgets', Description: '' }],
            sampled: [field('observed', 900)],
        });

        const schema = await host().StageIntrospect(makeEmitter(), opts);

        expect(discoverFields).not.toHaveBeenCalled();
        expect(schema.Objects[0].Fields.map((f) => f.Name)).toEqual(['observed']);
    });
});
