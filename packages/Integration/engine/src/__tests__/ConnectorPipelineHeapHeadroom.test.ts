/**
 * The heap gate needs an absolute floor beside its fraction.
 *
 * V8's `heap_size_limit` is the old space PLUS a fixed young-generation reserve (192 MB on Node
 * 20-24, measured at every `--max-old-space-size` from 1 to 16 GB). Live data can only ever occupy
 * the old space, so the process aborts at `heap_size_limit - 192 MB`, not at `heap_size_limit`.
 * A gate written as 0.92 of the limit therefore sits ABOVE the abort line for every old space under
 * ~2.4 GB — 95 MB above at 1 GB, 13 MB above at 2 GB, 16 MB above for the ~2 GB ceiling the deploy
 * derives on a 4 GB box. On such a box the gate cannot fire before the abort it exists to prevent:
 * measured 2026-09-24, a 1 GB heap pre-filled to 85-95% of its limit aborted before the gated stage
 * ran, while at 4 GB the same gate stopped after 25 of 888 objects.
 *
 * So a heap reading also stops when fewer than HEAP_STOP_MIN_HEADROOM_BYTES (320 MB = the reserve
 * plus 128 MB of old space) remain. Above ~4 GB the 8% margin already exceeds that, so large
 * workspaces see no change. RSS readings (limit = the box) stay fraction-only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as V8 from 'node:v8';
import type * as OS from 'node:os';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    IntegrationConnectorCreationPipeline,
    ShouldStopSamplingForHeap,
    ShouldStopForMemory,
    HEAP_STOP_MIN_HEADROOM_BYTES,
} from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions } from '../IntegrationConnectorCreationPipeline.js';
import type { SourceObjectInfo } from '../types.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** The heap reading the pipeline's gates will see. The box size is pinned to 0 (= unknown) so
 *  the RSS gate stays out of these tests, whatever the machine running them looks like. */
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

describe('ShouldStopSamplingForHeap — absolute headroom floor', () => {
    it('is 320 MB: the 192 MB young reserve plus 128 MB of old space', () => {
        expect(HEAP_STOP_MIN_HEADROOM_BYTES).toBe(320 * MB);
    });

    it('stops on a small heap the fraction can never stop', () => {
        // 1 GB limit, 800 MB used: 78% — the 0.92 fraction says "keep going", but only 224 MB
        // remain, which is inside the young reserve. This is the abort the fraction cannot see.
        expect(ShouldStopSamplingForHeap(800 * MB, 1 * GB, 0.92)).toBe(false);
        expect(ShouldStopSamplingForHeap(800 * MB, 1 * GB, 0.92, HEAP_STOP_MIN_HEADROOM_BYTES)).toBe(true);
    });

    it('stops AT the floor, not only past it', () => {
        expect(ShouldStopSamplingForHeap(1000 - 320, 1000, 0.92, 320)).toBe(true);
        expect(ShouldStopSamplingForHeap(1000 - 321, 1000, 0.92, 320)).toBe(false);
    });

    it('changes nothing on a large heap, where 8% already exceeds the floor', () => {
        // 10 GB limit: 91% leaves ~920 MB — far above the floor — and 92% still stops on the fraction.
        expect(ShouldStopSamplingForHeap(Math.ceil(10 * GB * 0.91), 10 * GB, 0.92, HEAP_STOP_MIN_HEADROOM_BYTES)).toBe(false);
        expect(ShouldStopSamplingForHeap(Math.ceil(10 * GB * 0.92), 10 * GB, 0.92, HEAP_STOP_MIN_HEADROOM_BYTES)).toBe(true);
    });

    it('is off by default, and an unknown ceiling is still not pressure', () => {
        expect(ShouldStopSamplingForHeap(800 * MB, 1 * GB, 0.92, 0)).toBe(false);
        expect(ShouldStopSamplingForHeap(800 * MB, 0, 0.92, HEAP_STOP_MIN_HEADROOM_BYTES)).toBe(false);
    });
});

describe('ShouldStopForMemory — the floor applies to the heap reading only', () => {
    it('stops on a small heap with plenty of fraction left', () => {
        const s = { HeapUsed: 800 * MB, HeapLimit: 1 * GB, RSS: 1 * GB, TotalMemory: 16 * GB };
        expect(ShouldStopForMemory(s, 0.92, 0.8)).toBe(false);
        expect(ShouldStopForMemory(s, 0.92, 0.8, HEAP_STOP_MIN_HEADROOM_BYTES)).toBe(true);
    });

    it('does not apply the floor to resident memory, whose ceiling is the whole box', () => {
        // 1.5 GB box, 1.19 GB resident: 79% — under the RSS fraction, and only 310 MB left, which a
        // floor would have stopped on. The RSS gate is fraction-only by design.
        const s = { HeapUsed: 100 * MB, HeapLimit: 8 * GB, RSS: 1190 * MB, TotalMemory: 1500 * MB };
        expect(ShouldStopForMemory(s, 0.92, 0.8, HEAP_STOP_MIN_HEADROOM_BYTES)).toBe(false);
    });
});

// ── The two live gates actually pass the floor ─────────────────────────────────────────────────

function makeEmitter() {
    const checkpoints: Array<{ stage: string; data: Record<string, unknown> }> = [];
    const warnings: Array<{ stage: string; code: string; data?: Record<string, unknown> }> = [];
    return {
        checkpoints,
        warnings,
        stageStart: () => undefined,
        stageComplete: () => undefined,
        stageError: () => undefined,
        heartbeat: () => undefined,
        entityGenerated: () => undefined,
        entitySkippedNoPK: () => undefined,
        pkClassifierInvoked: () => undefined,
        pkClassifierResult: () => undefined,
        checkpoint: (stage: string, data: Record<string, unknown>) => { checkpoints.push({ stage, data }); },
        warning: (stage: string, code: string, _msg: string, data?: Record<string, unknown>) => { warnings.push({ stage, code, data }); },
    };
}

const declared = (ExternalName: string): SourceObjectInfo => ({
    ExternalName,
    ExternalLabel: ExternalName,
    Fields: [{ Name: 'id', Label: 'id', SourceType: 'string', IsRequired: true, AllowsNull: false, IsPrimaryKey: true }],
    PrimaryKeyFields: ['id'],
    Relationships: [],
});

type StageHost = {
    StageIntrospect: (emitter: unknown, opts: ConnectorCreationPipelineOptions) => Promise<{ Objects: SourceObjectInfo[] }>;
    StagePKClassify: (emitter: unknown, opts: ConnectorCreationPipelineOptions) => Promise<{ unresolved: string[] }>;
};
const host = () => Object.create(IntegrationConnectorCreationPipeline.prototype) as unknown as StageHost;

describe('the pipeline gates use the floor', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        // A 1 GB heap at 78%: the fraction alone keeps going, the floor stops.
        reading.used = 800 * MB;
        reading.limit = 1 * GB;
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('Introspect stops sampling on a small heap the fraction cannot protect', async () => {
        const fetchFields = vi.fn(async () => []);
        const opts = {
            Connector: {
                IntrospectSchema: async () => ({ Objects: [declared('Invoice'), declared('Customer')] }),
                DiscoverObjects: async () => [],
                DiscoverFieldsViaFetch: fetchFields,
            },
            CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1' },
            ContextUser: { ID: 'U-1' },
        } as unknown as ConnectorCreationPipelineOptions;
        const emitter = makeEmitter();

        await host().StageIntrospect(emitter, opts);

        expect(fetchFields).not.toHaveBeenCalled();
        expect(emitter.checkpoints.find(c => c.stage === 'Introspect')?.data.unsampledForMemory).toBe(2);
        expect(emitter.warnings.some(w => w.stage === 'Introspect' && w.code === 'HOST_MEMORY_PRESSURE')).toBe(true);
    });

    it('PKClassify sheds the tail on a small heap the fraction cannot protect', async () => {
        // 30 objects: the gate is read every 25, so the last 5 are shed.
        const objects = Array.from({ length: 30 }, (_, i) => ({ ID: `o${i}`, Name: `Obj${i}` }));
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            Config: async () => undefined,
            RefreshCatalog: async () => undefined,
            GetIntegrationObjectsByIntegrationID: () => objects,
            GetIntegrationObjectFields: () => [{ Name: 'id', IsPrimaryKey: true }],
        } as unknown as IntegrationEngineBase);
        const opts = {
            CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1' },
            ContextUser: { ID: 'U-1' },
            Provider: {},
        } as unknown as ConnectorCreationPipelineOptions;
        const emitter = makeEmitter();

        const { unresolved } = await host().StagePKClassify(emitter, opts);

        expect(unresolved).toEqual(['Obj25', 'Obj26', 'Obj27', 'Obj28', 'Obj29']);
        expect(emitter.warnings.some(w => w.stage === 'PKClassify' && w.code === 'HOST_MEMORY_PRESSURE')).toBe(true);
    });

    it('a large heap at the same fill is untouched', async () => {
        // Same 78% on a 10 GB heap leaves ~2.2 GB: neither the fraction nor the floor fires.
        reading.used = Math.ceil(10 * GB * 0.78);
        reading.limit = 10 * GB;
        const fetchFields = vi.fn(async () => []);
        const opts = {
            Connector: {
                IntrospectSchema: async () => ({ Objects: [declared('Invoice')] }),
                DiscoverObjects: async () => [],
                DiscoverFieldsViaFetch: fetchFields,
            },
            CompanyIntegration: { ID: 'CI-1', IntegrationID: 'INT-1' },
            ContextUser: { ID: 'U-1' },
        } as unknown as ConnectorCreationPipelineOptions;
        const emitter = makeEmitter();

        await host().StageIntrospect(emitter, opts);

        expect(fetchFields).toHaveBeenCalledTimes(1);
        expect(emitter.checkpoints.find(c => c.stage === 'Introspect')?.data.unsampledForMemory).toBe(0);
    });
});
