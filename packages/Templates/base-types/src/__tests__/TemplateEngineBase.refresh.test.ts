import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadCalls, loadSpy, logErrorSpy, ProviderDouble } = vi.hoisted(() => {
    /** Stands in for DatabaseProviderBase (the mock exports it under that name, so `instanceof` matches). */
    class ProviderDouble {
        public TransactionDepth = 0;
        public readonly AfterCommit: Array<() => Promise<void>> = [];
        public CapturePostCommitToken(): string { return 'token'; }
        public RunAfterCommit(task: () => Promise<void>): void { this.AfterCommit.push(task); }
    }
    /** Each reload the engine asked BaseEngine.Load for: whether it was forced, and where its dataset reads run. */
    const calls: Array<{ Force: boolean | undefined; ReadOptions: { ReadOnPool?: boolean } | undefined }> = [];
    return { loadCalls: calls, loadSpy: vi.fn().mockResolvedValue(undefined), logErrorSpy: vi.fn(), ProviderDouble };
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
    return { BaseEngine, BaseEnginePropertyConfig: class {}, UserInfo: class {}, IMetadataProvider: class {}, BaseEntityEvent: class {}, DatabaseProviderBase: ProviderDouble, LogError: logErrorSpy };
});
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/global', () => ({ NormalizeUUID: (s: string) => s.toLowerCase() }));

import type { BaseEntityEvent } from '@memberjunction/core';
import { TemplateEngineBase } from '../TemplateEngineBase';

/** The event fields the handler reads; cast to BaseEntityEvent as a partial test double. */
type EventLike = { type: string; baseEntity: { EntityInfo: { Name: string }; ProviderToUse?: unknown } | null; entityName?: string };

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
    public Handle(event: EventLike): Promise<boolean> {
        // EventLike carries only the fields the handler reads; BaseEntityEvent's baseEntity is a full entity class
        return this.HandleIndividualBaseEntityEvent(event as unknown as BaseEntityEvent);
    }
    /** Marks the engine as permission-constrained (the mocked BaseEngine holds the flag as a plain field). */
    public SetPermissionConstrained(value: boolean): void {
        Object.defineProperty(this, 'IsPermissionConstrained', { value, configurable: true });
    }
}

describe('TemplateEngineBase refresh on template saves', () => {
    beforeEach(() => {
        loadCalls.length = 0;
        loadSpy.mockClear();
        logErrorSpy.mockClear();
    });

    it('reloads when a Template Content is saved', async () => {
        await new TestTemplateEngine().Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Template Contents' } } });
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].Force).toBe(true);
    });
    it('reads the reloaded dataset on the pool, never inside a transaction open on the provider', async () => {
        // the reload runs detached from the save; a cascading delete can open a transaction on the same provider while
        // it is in flight, and its dataset read must not join that transaction
        await new TestTemplateEngine().Handle({ type: 'delete', baseEntity: { EntityInfo: { Name: 'MJ: Template Params' } } });
        expect(loadCalls[0].ReadOptions).toEqual({ ReadOnPool: true });
    });
    it('reloads on a remote invalidation of Templates', async () => {
        await new TestTemplateEngine().Handle({ type: 'remote-invalidate', baseEntity: null, entityName: 'MJ: Templates' });
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].ReadOptions).toEqual({ ReadOnPool: true });
    });
    it('reloads after the commit when the save is inside an open transaction', async () => {
        const provider = new ProviderDouble();
        provider.TransactionDepth = 1;
        await new TestTemplateEngine().Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Template Contents' }, ProviderToUse: provider } });
        expect(loadCalls).toHaveLength(0);
        expect(provider.AfterCommit).toHaveLength(1);
        await provider.AfterCommit[0]();
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].ReadOptions).toEqual({ ReadOnPool: true });
    });
    it('ignores entities the template dataset does not hold', async () => {
        await new TestTemplateEngine().Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: AI Prompts' } } });
        expect(loadCalls).toHaveLength(0);
    });
    it('follows the dataset: an entity the loaded dataset holds reloads, before any load nothing does', async () => {
        const engine = new TestTemplateEngine();
        const names = engine.LoadedEntityNames;
        names.add('mj: template categories');
        await engine.Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Template Categories' } } });
        expect(loadCalls).toHaveLength(1);
        names.clear();
        await engine.Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Template Contents' } } });
        expect(loadCalls).toHaveLength(1);
    });
    it('does not reload a permission-constrained engine', async () => {
        const engine = new TestTemplateEngine();
        engine.SetPermissionConstrained(true);
        expect(await engine.Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Template Contents' } } })).toBe(true);
        expect(loadCalls).toHaveLength(0);
    });
    it('logs a failed reload and reports it instead of rejecting', async () => {
        loadSpy.mockRejectedValueOnce(new Error('db down'));
        const engine = new TestTemplateEngine();
        await expect(engine.Handle({ type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Template Contents' } } })).resolves.toBe(false);
        expect(logErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    });
});

describe('TemplateEngineBase before its first load', () => {
    it('returns empty collections instead of throwing, so read-through callers can ask at any time', () => {
        const engine = new TestTemplateEngine();
        expect(engine.TemplateContents).toEqual([]);
        expect(engine.TemplateParams).toEqual([]);
        expect(engine.Templates).toEqual([]);
        expect(engine.TemplateContentTypes).toEqual([]);
        expect(engine.TemplateCategories).toEqual([]);
        expect(engine.FindTemplateByID('T1')).toBeUndefined();
        expect(engine.FindRenderedContent('T1')).toBeUndefined();
    });
});
