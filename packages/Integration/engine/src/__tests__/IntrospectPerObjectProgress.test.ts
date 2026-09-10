/**
 * Discovery reports which object it is on, out of how many.
 *
 * Sampling is the expensive half of discovery — one read-path fetch per object — and it used to
 * emit nothing between the stage's start and its completion. A consumer watching a 23-object
 * source therefore saw exactly what a 5-object source looked like: a stage that had started, for
 * an unbounded stretch of time, with no way to tell slow progress from a wedged run.
 *
 * These tests pin the CONTRACT the consumer reads, not the loop that produces it: every in-scope
 * object is announced exactly once, and the denominator is fixed before the first sample so the
 * number a user is watching never revises upward mid-run.
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

type Beat = { message: string; counts: { processed?: number; totalKnown?: number; skipped?: number } };

function makeEmitter() {
    const beats: Beat[] = [];
    const errors: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    return {
        beats,
        errors,
        /** Only the per-object announcements; IntrospectSchema's own scan progress is a separate beat. */
        samples: () => beats.filter((b) => b.message.startsWith('Sampling ')),
        stageStart: () => undefined,
        stageComplete: () => undefined,
        heartbeat: (_stage: string, message: string, counts: Beat['counts']) => { beats.push({ message, counts }); },
        checkpoint: () => undefined,
        stageError: (_stage: string, message: string, meta?: Record<string, unknown>) => { errors.push({ message, meta }); },
    };
}

const declaredObject = (ExternalName: string): SourceObjectInfo => ({
    ExternalName,
    ExternalLabel: ExternalName,
    Description: '',
    Fields: [
        { Name: 'id', Label: 'id', SourceType: 'string', MaxLength: 50, IsPrimaryKey: true } as SourceObjectInfo['Fields'][number],
    ],
    PrimaryKeyFields: ['id'],
    Relationships: [],
} as unknown as SourceObjectInfo);

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
        ?? vi.fn(async () => [sampledField('id', 50, true)]);
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

describe('StageIntrospect — per-object progress', () => {
    it('announces every object it samples, counting up to the catalog size', async () => {
        const declared = Array.from({ length: 5 }, (_v, i) => declaredObject(`Obj${i}`));
        const emitter = makeEmitter();

        await host().StageIntrospect(emitter, makeOpts({ declared }));

        const beats = emitter.samples();
        expect(beats).toHaveLength(5);
        expect(beats.map((b) => b.counts.processed)).toEqual([1, 2, 3, 4, 5]);
        expect(beats.every((b) => b.counts.totalKnown === 5)).toBe(true);
        // The message stands on its own, so a consumer that renders only the text still reads right.
        expect(beats[2].message).toBe('Sampling "Obj2" (3 of 5)');
    });

    it('fixes the denominator across BOTH passes before the first sample', async () => {
        // The runtime pass and the declared-only pass sample disjoint halves of the union. Counting
        // per-loop would show "1 of 2" and then restart, so the number a user is watching would
        // revise upward the moment the second pass began.
        const emitter = makeEmitter();
        const opts = makeOpts({
            declared: [declaredObject('Invoice'), declaredObject('Customer')],
            discoverObjects: async () => [
                { Name: 'Vendor', Label: 'Vendor', Description: '' },
                { Name: 'Payment', Label: 'Payment', Description: '' },
            ],
        });

        await host().StageIntrospect(emitter, opts);

        const beats = emitter.samples();
        expect(beats).toHaveLength(4);                                        // 2 runtime + 2 declared
        expect(beats.every((b) => b.counts.totalKnown === 4)).toBe(true);     // never 2, never revised
        expect(beats.map((b) => b.counts.processed)).toEqual([1, 2, 3, 4]);   // one continuous count
    });

    it('counts an object declared AND surfaced at runtime once, not twice', async () => {
        // It is sampled once, so it must be announced once — and the total must not double-count it.
        const emitter = makeEmitter();
        const opts = makeOpts({
            declared: [declaredObject('Invoice')],
            discoverObjects: async () => [{ Name: 'Invoice', Label: 'Invoice', Description: '' }],
        });

        await host().StageIntrospect(emitter, opts);

        expect(emitter.samples()).toHaveLength(1);
        expect(emitter.samples()[0].counts.totalKnown).toBe(1);
    });

    it('never reports more processed than the total when the runtime catalog repeats a name', async () => {
        // A connector that lists the same object twice would walk a bare counter past its own
        // denominator — "3 of 2" — which reads as a bug in the progress, not in the vendor.
        const emitter = makeEmitter();
        const opts = makeOpts({
            declared: [],
            discoverObjects: async () => [
                { Name: 'Vendor', Label: 'Vendor', Description: '' },
                { Name: 'Vendor', Label: 'Vendor', Description: '' },
                { Name: 'Payment', Label: 'Payment', Description: '' },
            ],
        });

        await host().StageIntrospect(emitter, opts);

        const beats = emitter.samples();
        expect(beats.every((b) => (b.counts.processed ?? 0) <= (b.counts.totalKnown ?? 0))).toBe(true);
        expect(beats.map((b) => b.counts.processed)).toEqual([1, 2]);
    });

    it('narrows the denominator to a scoped introspection', async () => {
        // A run asked about one object must not count itself against the whole catalog.
        const emitter = makeEmitter();
        const opts = makeOpts({
            declared: [declaredObject('Invoice'), declaredObject('Customer')],
            discoverObjects: async () => [{ Name: 'Vendor', Label: 'Vendor', Description: '' }],
            objectNames: ['Invoice'],
        });

        await host().StageIntrospect(emitter, opts);

        const beats = emitter.samples();
        expect(beats).toHaveLength(1);
        expect(beats[0].counts.totalKnown).toBe(1);
    });

    it('walks the count to the end when the budget is spent, and says how many were passed over', async () => {
        // An exhausted budget must read as a run that reached the end of its object list. Stopping
        // the count where sampling stopped leaves the progress frozen at "2 of 12" while the stage
        // races to completion — the exact shape of a wedged run.
        const fetchFields = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 30));
            return [sampledField('id', 50, true)];
        });
        const declared = Array.from({ length: 12 }, (_v, i) => declaredObject(`Obj${i}`));
        const emitter = makeEmitter();

        await host().StageIntrospect(emitter, makeOpts({ declared, discoverFieldsViaFetch: fetchFields, runDeadlineMs: 60 }));

        const beats = emitter.samples();
        expect(fetchFields.mock.calls.length).toBeLessThan(12);   // sampling really did stop early
        expect(beats).toHaveLength(12);                           // the count still reached the end
        expect(beats[11].counts.processed).toBe(12);
        expect(beats[11].counts.skipped ?? 0).toBeGreaterThan(0); // and said the tail was passed over
    });

    it('says nothing per-object when every object is out of scope', async () => {
        const emitter = makeEmitter();
        const opts = makeOpts({ declared: [declaredObject('Invoice')], objectNames: ['NotHere'] });

        await host().StageIntrospect(emitter, opts);

        expect(emitter.samples()).toHaveLength(0);
    });
});
