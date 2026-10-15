import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadCalls, loadSpy, ProviderDouble } = vi.hoisted(() => {
    /**
     * Stands in for DatabaseProviderBase (the mock exports it under that name, so `instanceof` matches). A record can be
     * bound to it; the record's data calls are never made here.
     */
    class ProviderDouble implements IEntityDataProvider {
        public TransactionDepth = 0;
        public async Config(): Promise<boolean> { throw new Error('not used by these tests'); }
        public async Load(): Promise<{}> { throw new Error('not used by these tests'); }
        public async Save(): Promise<{}> { throw new Error('not used by these tests'); }
        public async Delete(): Promise<boolean> { throw new Error('not used by these tests'); }
        public async GetRecordChanges(): Promise<never[]> { throw new Error('not used by these tests'); }
        public readonly AfterCommit: Array<() => Promise<void>> = [];
        public CapturePostCommitToken(): string { return 'token'; }
        public RunAfterCommit(task: () => Promise<void>): void { this.AfterCommit.push(task); }
    }
    /** Each reload the engine asked BaseEngine.Load for: whether it was forced, and where its dataset reads run. */
    const calls: Array<{ Force: boolean | undefined; ReadOptions: { ReadOnPool?: boolean } | undefined }> = [];
    return { loadCalls: calls, loadSpy: vi.fn().mockResolvedValue(undefined), ProviderDouble };
});
vi.mock('@memberjunction/core', () => {
    class BaseEngine {
        public ContextUser = { ID: 'u1' };
        public IsPermissionConstrained = false;
        public ProviderToUse = {};
        protected static getInstance<U>(this: new () => U): U { return new this(); }
        protected static readonly BackgroundReloadReads = { ReadOnPool: true };
        protected async Load(_configs: unknown, _provider: unknown, force?: boolean, _user?: unknown, readOptions?: { ReadOnPool?: boolean }): Promise<void> {
            loadCalls.push({ Force: force, ReadOptions: readOptions });
            await loadSpy();
        }
        protected DatasetEntityNames(): ReadonlySet<string> { return new Set<string>(); }
        // the same deferral as the real BaseEngine.RunAfterCommitOrNow (tested in MJCore)
        protected async RunAfterCommitOrNow(event: { baseEntity: { ProviderToUse?: unknown } | null }, description: string, task: () => Promise<void>): Promise<void> {
            const provider = event.baseEntity?.ProviderToUse;
            if (provider instanceof ProviderDouble && provider.TransactionDepth > 0) {
                provider.RunAfterCommit(task);
                return;
            }
            await task();
        }
        protected async HandleIndividualBaseEntityEvent(): Promise<boolean> { return false; }
    }
    /** The members of a record and its metadata the handler reads: the entity's name and the record's provider. */
    class BaseEntity {
        public constructor(private readonly entity: unknown, private readonly provider: unknown = null) {}
        public get EntityInfo(): unknown { return this.entity; }
        public get ProviderToUse(): unknown { return this.provider; }
    }
    class EntityInfo {
        public constructor(initData: Record<string, unknown>) { Object.assign(this, initData); }
    }
    return { BaseEngine, BaseEntity, EntityInfo, BaseEnginePropertyConfig: class {}, UserInfo: class {}, IMetadataProvider: class {}, BaseEntityEvent: class {}, DatabaseProviderBase: ProviderDouble, LogError: vi.fn() };
});
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/global', () => ({
    NormalizeUUID: (s: string) => s.toLowerCase(),
    UUIDsEqual: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
}));

import { BaseEntity, EntityInfo, type BaseEntityEvent, type IEntityDataProvider } from '@memberjunction/core';
import { TemplateEngineBase } from '../TemplateEngineBase';

/** A record of an entity (this file mocks BaseEntity and EntityInfo down to what the handler reads). */
class SavedRecord extends BaseEntity {}

/** An event raised by a record of `entityName`, saved through `provider` when one is given. */
function recordEvent(type: BaseEntityEvent['type'], entityName: string, provider?: IEntityDataProvider): BaseEntityEvent {
    return { type, baseEntity: new SavedRecord(new EntityInfo({ Name: entityName }), provider), payload: null };
}

/** Exposes the engine's constructor and event handler to the tests. */
class TestTemplateEngine extends TemplateEngineBase {
    /** The entities the loaded dataset holds; the real BaseEngine reads them from the dataset (tested in MJCore). */
    public readonly LoadedEntityNames = new Set<string>(['mj: templates', 'mj: template contents', 'mj: template params']);
    public constructor() {
        super();
    }
    protected override DatasetEntityNames(): ReadonlySet<string> {
        return this.LoadedEntityNames;
    }
    public Handle(event: BaseEntityEvent): Promise<boolean> {
        return this.HandleIndividualBaseEntityEvent(event);
    }
}

describe('TemplateEngineBase refresh on template saves', () => {
    beforeEach(() => {
        loadCalls.length = 0;
        loadSpy.mockClear();
    });

    it('reloads on the pool when a Template Content is saved', async () => {
        await new TestTemplateEngine().Handle(recordEvent('save', 'MJ: Template Contents'));
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].Force).toBe(true);
        expect(loadCalls[0].ReadOptions).toEqual({ ReadOnPool: true });
    });
    it('reloads on a remote invalidation of Templates', async () => {
        await new TestTemplateEngine().Handle({ type: 'remote-invalidate', baseEntity: null, entityName: 'MJ: Templates', payload: null });
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].ReadOptions).toEqual({ ReadOnPool: true });
    });
    it('reloads after the commit when the save is inside an open transaction', async () => {
        const provider = new ProviderDouble();
        provider.TransactionDepth = 1;
        await new TestTemplateEngine().Handle(recordEvent('save', 'MJ: Template Contents', provider));
        expect(loadCalls).toHaveLength(0);
        expect(provider.AfterCommit).toHaveLength(1);
        await provider.AfterCommit[0]();
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].ReadOptions).toEqual({ ReadOnPool: true });
    });
    it('ignores entities the template dataset does not hold', async () => {
        await new TestTemplateEngine().Handle(recordEvent('save', 'MJ: AI Prompts'));
        expect(loadCalls).toHaveLength(0);
    });
});

describe('TemplateEngineBase before its first load', () => {
    it('returns empty collections instead of throwing', () => {
        const engine = new TestTemplateEngine();
        expect(engine.TemplateContents).toEqual([]);
        expect(engine.Templates).toEqual([]);
        expect(engine.FindRenderedContent('T1')).toBeUndefined();
    });
});
