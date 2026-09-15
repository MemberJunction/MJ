import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { IMetadataProvider } from '../generic/interfaces';
import { CacheChangedEvent } from '../generic/localCacheManager';
import { UserInfo } from '../generic/securityInfo';

/**
 * A cross-server cache payload replaces an engine's array with newly materialized entity
 * objects. Anything a subclass derived from the previous array in `AdditionalLoading` —
 * grouped child collections, memoized lookup maps — refers to the objects that were just
 * discarded, so it has to be rebuilt whenever the array is replaced.
 *
 * These tests pin that rebuild to the cache-event path specifically, because the failure it
 * prevents is silent: the replaced array is complete and correct, with the same row count as
 * before, so nothing about the engine's own state looks wrong. Only the derived collections
 * are empty, and consumers that read them behave as though the data were missing. Nor does
 * it self-correct — the config is still marked loaded, so `EnsureLoaded()`/`Config()`
 * short-circuit and the engine stays in that state until the process restarts.
 *
 * That the row count is unchanged is the important part: no emptiness or shrink heuristic
 * can detect this, which is why the rebuild has to be unconditional.
 */

/** Stand-in for a parent entity that receives a grouped child collection. */
class FakeModelEntity {
    public ID: string = '';
    public Name: string = '';
    /** Populated by AdditionalLoading, exactly like AIModelEntityExtended.ModelVendors. */
    public ModelVendors: unknown[] = [];

    public LoadFromData(data: Record<string, unknown>): boolean {
        Object.assign(this, data);
        return true;
    }
}

class TestEngine extends BaseEngine<TestEngine> {
    public _models: FakeModelEntity[] = [];
    public _modelVendors: Array<{ ModelID: string }> = [];

    /** Counts rebuilds so we can assert the cache path triggers one. */
    public additionalLoadingCalls = 0;

    public async Config(): Promise<void> {
        // no-op — these tests drive the cache-change path directly
    }

    /**
     * Mirrors BaseAIEngine.AdditionalLoading: group child rows onto each parent.
     * Critically it must be IDEMPOTENT — this now runs on every cache event, not only
     * after a full load, so it truncates before repopulating. The real implementation
     * appended without clearing, which multiplied ModelVendors on every call.
     */
    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.additionalLoadingCalls++;
        // Guarded exactly like the real implementation: a 'simple' ResultType config leaves
        // plain rows in the array, which have no derived collection to rebuild.
        for (const model of this._models) {
            if (model.ModelVendors) model.ModelVendors.length = 0;
        }
        for (const model of this._models) {
            if (!model.ModelVendors) continue;
            for (const mv of this._modelVendors) {
                if (mv.ModelID === model.ID) model.ModelVendors.push(mv);
            }
        }
    }

    public OnExternalCacheChangeForTest(
        config: BaseEnginePropertyConfig,
        event: CacheChangedEvent
    ): Promise<void> {
        return this.OnExternalCacheChange(config, event);
    }
}

const MODEL_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const MODEL_B = 'aaaaaaaa-0000-0000-0000-000000000002';

const MODEL_ROWS = [
    { ID: MODEL_A, Name: 'GPT-5.2' },
    { ID: MODEL_B, Name: 'Gemini 3' },
];

function makeEvent(rows: Array<Record<string, unknown>>, maxUpdatedAt = ''): CacheChangedEvent {
    return {
        CacheKey: 'MJ: AI Models|_|_|-1|0|_|_|imr:1',
        Category: 'RunViewCache',
        Action: 'set',
        Timestamp: 0,
        SourceServerId: 'some-other-server',
        Data: JSON.stringify({ results: rows, totalRowCount: rows.length, maxUpdatedAt }),
    };
}

function makeModelsConfig(overrides: Partial<BaseEnginePropertyConfig> = {}): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        PropertyName: '_models',
        EntityName: 'MJ: AI Models',
        CacheLocal: true,
        ...overrides,
    });
}

describe('BaseEngine.OnExternalCacheChange — derived-index rebuild', () => {
    let engine: TestEngine;
    let provider: IMetadataProvider;

    beforeEach(async () => {
        const store = GetGlobalObjectStore() as Record<string, unknown> | undefined;
        if (store) delete store['___SINGLETON__TestEngine'];

        engine = new TestEngine();
        engine._modelVendors = [{ ModelID: MODEL_A }, { ModelID: MODEL_A }, { ModelID: MODEL_B }];
        engine._models = MODEL_ROWS.map(r => {
            const m = new FakeModelEntity();
            m.LoadFromData(r);
            return m;
        });

        provider = { GetEntityObject: vi.fn(async () => new FakeModelEntity()) } as unknown as IMetadataProvider;
        engine.SetProvider(provider);

        // Establish the derived state the way a normal engine load would.
        await (engine as unknown as { AdditionalLoading: () => Promise<void> }).AdditionalLoading();
        engine.additionalLoadingCalls = 0;
    });

    /** Total child rows attached across all parents — 0 means the derived state is gone. */
    const attachedVendors = () => engine._models.reduce((n, m) => n + m.ModelVendors.length, 0);

    it('starts with derived state populated', () => {
        expect(engine._models).toHaveLength(2);
        expect(attachedVendors()).toBe(3);
    });

    it('rebuilds derived state after applying a cache payload', async () => {
        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS));

        expect(engine.additionalLoadingCalls).toBe(1);
        expect(attachedVendors()).toBe(3);
    });

    it('keeps derived state intact even when row counts are unchanged', async () => {
        const before = { models: engine._models.length, attached: attachedVendors() };

        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS));

        // Row count identical — this is precisely why a shrink guard cannot detect the bug.
        expect(engine._models).toHaveLength(before.models);
        // Without the rebuild this is 0 and model selection finds no candidates.
        expect(attachedVendors()).toBe(before.attached);
    });

    it('attaches derived state to the NEW objects, not the discarded ones', async () => {
        const originals = engine._models;

        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS));

        expect(engine._models[0]).not.toBe(originals[0]);
        for (const m of engine._models) {
            expect(m.ModelVendors.length).toBeGreaterThan(0);
        }
    });

    it('rebuilds on the full-reload fallback path too', async () => {
        vi.spyOn(
            engine as unknown as { LoadSingleConfig: (c: BaseEnginePropertyConfig, u?: UserInfo) => Promise<void> },
            'LoadSingleConfig'
        ).mockResolvedValue(undefined);

        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), {
            ...makeEvent(MODEL_ROWS),
            Data: 'not json',
        });

        expect(engine.additionalLoadingCalls).toBe(1);
    });

    it('rebuilds for a simple-result config as well', async () => {
        await engine.OnExternalCacheChangeForTest(
            makeModelsConfig({ ResultType: 'simple' }),
            makeEvent(MODEL_ROWS)
        );

        expect(engine.additionalLoadingCalls).toBe(1);
    });

    it('does not accumulate duplicates across repeated cache events', async () => {
        // The rebuild runs on every applied cache event, so it must converge rather than
        // accumulate. A rebuild that appends into the previous contents instead of replacing
        // them multiplies each derived collection on every pass, which on a long-lived
        // process is unbounded growth.
        // Vary maxUpdatedAt so each event is genuinely new and actually forces a rebuild —
        // otherwise the no-op skip would short-circuit them and prove nothing.
        for (let i = 0; i < 5; i++) {
            await engine.OnExternalCacheChangeForTest(
                makeModelsConfig(),
                makeEvent(MODEL_ROWS, `2026-09-13T00:00:0${i}.000Z`)
            );
        }

        expect(engine.additionalLoadingCalls).toBe(5);
        expect(attachedVendors()).toBe(3);
    });

    it('still applies a payload whose contents genuinely changed', async () => {
        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS));
        expect(engine.additionalLoadingCalls).toBe(1);

        // Different row count => different identity => must be applied.
        await engine.OnExternalCacheChangeForTest(
            makeModelsConfig(),
            makeEvent([...MODEL_ROWS, { ID: 'aaaaaaaa-0000-0000-0000-000000000003', Name: 'Claude' }])
        );

        expect(engine.additionalLoadingCalls).toBe(2);
        expect(engine._models).toHaveLength(3);
    });

    it('serializes rebuilds so concurrent cache events cannot overlap', async () => {
        // The rebuild may perform database I/O (some AdditionalLoading overrides call
        // Config() on another engine). Cache events are dispatched per fingerprint from a
        // fire-and-forget callback, so overlapping rebuilds would share a connection.
        let active = 0;
        let maxConcurrent = 0;
        vi.spyOn(engine as unknown as { AdditionalLoading: () => Promise<void> }, 'AdditionalLoading')
            .mockImplementation(async () => {
                active++;
                maxConcurrent = Math.max(maxConcurrent, active);
                await new Promise((r) => setTimeout(r, 5));
                active--;
            });

        await Promise.all([
            engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS)),
            engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS)),
            engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS)),
        ]);

        expect(maxConcurrent).toBe(1);
    });

    it('contains a rebuild failure instead of escaping the event callback', async () => {
        // Nothing upstream of a pub/sub callback can handle a rejection, and one engine's
        // failed rebuild must not stop the next event from being applied.
        const failing = vi
            .spyOn(engine as unknown as { AdditionalLoading: () => Promise<void> }, 'AdditionalLoading')
            .mockRejectedValueOnce(new Error('rebuild blew up'));

        await expect(
            engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS))
        ).resolves.toBeUndefined();

        failing.mockRestore();
        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS));
        expect(attachedVendors()).toBe(3);
    });

    it('does not rebuild when a newer refresh supersedes this event', async () => {
        // Claim a newer generation mid-flight so the event is dropped as stale.
        const internals = engine as unknown as {
            beginConfigRefresh: (p: string) => number;
            isLatestConfigRefresh: (p: string, g: number) => boolean;
        };
        vi.spyOn(internals, 'isLatestConfigRefresh').mockReturnValue(false);

        await engine.OnExternalCacheChangeForTest(makeModelsConfig(), makeEvent(MODEL_ROWS));

        expect(engine.additionalLoadingCalls).toBe(0);
    });
});
