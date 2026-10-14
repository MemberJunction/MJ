/**
 * ComponentMetadataEngineServer embeds the component vectors that `mj sync push` left empty (SkipEmbeddings). A
 * running server starts it: the class is a deferred `@RegisterForStartup` engine, and `HandleStartup` starts the
 * backfill (without waiting), reading only the components that lack a vector — never the bulk component list — and
 * runs it again after a component save in this process that leaves a vector missing. Each missing vector is computed
 * from its own text with the local model and the component is saved; vectors that exist and empty texts are left
 * alone; nothing runs while the host has switched save-time embeddings off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal, MJEventType, Base64ToFloat32Vector } from '@memberjunction/global';
import { BaseEntity, EntityInfo, StartupManager, type RunViewParams } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

const { state, embedTextLocal, baseConfig, BASE_PROVIDER } = vi.hoisted(() => ({
    /** The base engine's provider (ProviderToUse), the fallback when no provider is passed. */
    BASE_PROVIDER: { name: 'base engine provider' },
    /** What the fake database returns for a read of the components, and every read made. */
    state: { components: [] as object[], reads: [] as RunViewParams[], providers: [] as object[] },
    embedTextLocal: vi.fn(),
    baseConfig: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        public static FromMetadataProvider(provider: object): FakeRunView {
            state.providers.push(provider);
            return new FakeRunView();
        }
        public async RunView(params: RunViewParams): Promise<{ Success: boolean; Results: object[] }> {
            state.reads.push(params);
            return { Success: true, Results: state.components };
        }
    }
    return { ...actual, RunView: FakeRunView, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    /** Stands in for the component entity: the vector fields the engine reads and writes, and a spied Save. */
    class MJComponentEntityExtended {
        public ID = '';
        public Name = '';
        public FunctionalRequirements: string | null = null;
        public TechnicalDesign: string | null = null;
        public FunctionalRequirementsVector: string | null = null;
        public FunctionalRequirementsVectorBinary: string | null = null;
        public FunctionalRequirementsVectorEmbeddingModelID: string | null = null;
        public TechnicalDesignVector: string | null = null;
        public TechnicalDesignVectorBinary: string | null = null;
        public TechnicalDesignVectorEmbeddingModelID: string | null = null;
        public LatestResult = null;
        public ContextCurrentUser = null;
        public Save = vi.fn().mockResolvedValue(true);
        public EntityInfo = { Name: 'MJ: Components' };
        public get PrimaryKey(): { ToConcatenatedString(): string } {
            return { ToConcatenatedString: () => `ID|${this.ID}` };
        }
    }
    return {
        ...actual,
        MJComponentEntityExtended,
        ComponentMetadataEngine: { Instance: { Config: baseConfig, ProviderToUse: BASE_PROVIDER } },
    };
});

vi.mock('@memberjunction/aiengine', async () => {
    // The real shared backfill from the package entry; the local model is the mocked AIEngine below, whose entity
    // embedding call (AIEngine.EmbedTextLocalForEntity) embeds through the mocked EmbedTextLocal with the real check.
    const { EmbeddingBackfill } = await vi.importActual<typeof import('@memberjunction/aiengine')>('@memberjunction/aiengine');
    return {
        EmbeddingBackfill,
        AIEngine: {
            Instance: { Config: vi.fn().mockResolvedValue(undefined), EmbedTextLocal: embedTextLocal },
            EmbedTextLocalForEntity: async (_entity: object, text: string) => EmbeddingBackfill.RequireLocalVector(await embedTextLocal(text)),
        },
    };
});

import { MJComponentEntityExtended } from '@memberjunction/core-entities';
import { ComponentMetadataEngineServer } from '../engines/ComponentMetadataEngineServer';
import { SaveTimeAISettings } from '@memberjunction/ai';

const VECTOR = [0.5, -0.25, 3];
/** The provider HandleStartup is given; the fake RunView ignores it. */
const PROVIDER = new EntitiesOnlyProvider([]);

function component(id: string, functional: string | null, technical: string | null, fVector: string | null = null): MJComponentEntityExtended {
    const c = new MJComponentEntityExtended(new EntityInfo({ Name: 'MJ: Components' }));
    c.ID = id;
    c.Name = id;
    c.FunctionalRequirements = functional;
    c.TechnicalDesign = technical;
    c.FunctionalRequirementsVector = fVector;
    return c;
}

/** Starts the engine as a server would, then waits for the backfill it started. */
async function startAndWait(): Promise<void> {
    await ComponentMetadataEngineServer.Instance.HandleStartup(undefined, PROVIDER);
    await ComponentMetadataEngineServer.Instance.EmbedMissingComponentVectors();
}

describe('ComponentMetadataEngineServer — embedding components saved without vectors', () => {
    beforeEach(() => {
        embedTextLocal.mockReset();
        embedTextLocal.mockResolvedValue({ result: { vector: VECTOR }, model: { ID: 'model-local' } });
        baseConfig.mockReset();
        state.reads = [];
        SaveTimeAISettings.Instance.Config = {};
    });
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('is a deferred startup engine, so a running server starts it', () => {
        const registration = StartupManager.Instance.GetRegistrations().find(r => r.constructor.name === 'ComponentMetadataEngineServer');
        expect(registration).toBeDefined();
        expect(registration?.options.deferred).toBe(true);
    });

    it('at startup: reads only the components lacking a vector (bounded), embeds each missing vector from its own text and saves', async () => {
        const pushed = component('c-pushed', 'functional text', 'technical text');
        const half = component('c-half', 'functional text', '   ', JSON.stringify(VECTOR));
        state.components = [pushed, half];

        await startAndWait();

        expect(baseConfig).not.toHaveBeenCalled(); // no bulk load at startup
        expect(state.reads.length).toBeGreaterThan(0);
        for (const read of state.reads) {
            expect(read.EntityName).toBe('MJ: Components');
            expect(read.ExtraFilter).toContain('FunctionalRequirementsVector IS NULL');
            expect(read.ExtraFilter).toContain('TechnicalDesignVector IS NULL');
            expect(read.MaxRows).toBe(101); // the default batch of 100, plus one to see whether more remain
            expect(read.ResultType).toBe('entity_object');
        }
        expect(embedTextLocal).toHaveBeenCalledTimes(2);
        expect(embedTextLocal).toHaveBeenCalledWith('functional text');
        expect(embedTextLocal).toHaveBeenCalledWith('technical text');
        expect(pushed.Save).toHaveBeenCalledTimes(1);
        expect(JSON.parse(pushed.FunctionalRequirementsVector || 'null')).toEqual(VECTOR);
        expect(Array.from(Base64ToFloat32Vector(pushed.TechnicalDesignVectorBinary) || [])).toEqual(VECTOR);
        expect(pushed.TechnicalDesignVectorEmbeddingModelID).toBe('model-local');
        expect(half.Save).not.toHaveBeenCalled();
    });

    it('startup does not wait for the backfill', async () => {
        const slow = component('c-slow', 'functional text', null);
        state.components = [slow];
        let answer: (value: { result: { vector: number[] }; model: { ID: string } }) => void = () => undefined;
        embedTextLocal.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));

        await ComponentMetadataEngineServer.Instance.HandleStartup(undefined, PROVIDER); // resolves before the model answers
        await vi.waitFor(() => expect(embedTextLocal).toHaveBeenCalledTimes(1));
        expect(slow.Save).not.toHaveBeenCalled();
        answer({ result: { vector: VECTOR }, model: { ID: 'model-local' } });
        await vi.waitFor(() => expect(slow.Save).toHaveBeenCalledTimes(1));
    });

    it('after a component save in this process that leaves a vector missing, the backfill runs; a save with its vectors does not start it', async () => {
        state.components = [];
        await startAndWait();
        const readsAfterStartup = state.reads.length;

        const complete = component('c-complete', 'text', null, JSON.stringify(VECTOR));
        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            args: { type: 'save', baseEntity: complete, payload: null },
            component: complete,
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(state.reads.length).toBe(readsAfterStartup);

        const saved = component('c-saved-later', 'later text', null);
        state.components = [saved];
        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            args: { type: 'save', baseEntity: saved, payload: null },
            component: saved,
        });

        await vi.waitFor(() => expect(saved.Save).toHaveBeenCalledTimes(1));
        expect(saved.FunctionalRequirementsVector).not.toBeNull();
    });

    it('a failed save puts the vector columns back to empty, so the next pass retries', async () => {
        const failing = component('c-fail', 'functional text', null);
        failing.Save = vi.fn().mockResolvedValue(false);
        state.components = [failing];

        await startAndWait();

        expect(failing.FunctionalRequirementsVector).toBeNull();
        expect(failing.FunctionalRequirementsVectorEmbeddingModelID).toBeNull();
    });

    it('Config bulk-loads through the passed provider, else the base engine\'s — never a bare RunView', async () => {
        state.components = [];
        state.providers = [];
        const passed = new EntitiesOnlyProvider([]);
        await ComponentMetadataEngineServer.Instance.Config(true, undefined, passed);
        await ComponentMetadataEngineServer.Instance.Config(true, undefined);

        expect(state.providers).toEqual([passed, BASE_PROVIDER]);
        expect(state.reads.every(r => r.ExtraFilter === '')).toBe(true);
    });

    it('does nothing while the host has switched save-time embeddings off', async () => {
        SaveTimeAISettings.Instance.Config = { Embeddings: false };
        const pushed = component('c-off', 'functional text', null);
        state.components = [pushed];

        await startAndWait();

        expect(state.reads).toHaveLength(0);
        expect(embedTextLocal).not.toHaveBeenCalled();
        expect(pushed.Save).not.toHaveBeenCalled();
    });
});
