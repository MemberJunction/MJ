import { describe, it, expect, beforeEach } from 'vitest';
import { GetGlobalObjectStore, RegisterClassEx } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { WellKnownUserSource } from '../generic/wellKnownUserSource';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, ProviderType, RunViewResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';

/**
 * Server-side engine load identity: on a `Database` provider, BaseEngine executes its internal
 * reads as the MJ system user rather than as whichever caller reached `Config()` first.
 *
 * Why it matters: engine caches are process-wide. A first caller carrying entity-permission
 * denials, RLS row scoping, or field-level denials would otherwise seal a partial, empty, or
 * permission-constrained cache that then serves every other user of the process until restart.
 *
 * The two failure modes pinned down here:
 *  - substituting nowhere (the pre-change behavior) — a restricted caller poisons the cache;
 *  - substituting ONLY on the initial load — the first background refresh re-poisons it, since
 *    every refresh path historically re-fetched as the stored `_contextUser`.
 */

/**
 * The system-user GUID. Declared locally because the canonical constant now lives in
 * `@memberjunction/generic-database-provider` (a server-side package MJCore must not depend
 * on) — shared code asks `WellKnownUserSource.Instance.IsSystemUser()` instead of importing it.
 */
const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';

const SYSTEM_USER = { ID: SYSTEM_USER_ID, Name: 'System', Email: 'system@memberjunction.com' } as unknown as UserInfo;
const RESTRICTED_USER = { ID: 'aaaaaaaa-1111-2222-3333-444444444444', Name: 'Dana', Email: 'dana@example.com' } as unknown as UserInfo;

/**
 * What the registered source should do for the current test. A single registration with a
 * switchable behavior keeps the class factory (a process-global registry) from needing per-test
 * teardown. `'null'` covers BOTH "no server-side source registered" and "registered but this
 * database has no system user" — the resolution step cannot tell them apart, and shouldn't.
 */
let sourceBehavior: 'system' | 'null' | 'throw' = 'system';
let sourceCallCount = 0;

@RegisterClassEx(WellKnownUserSource, { priority: 10, skipNullKeyWarning: true })
class TestEngineWellKnownUserSource extends WellKnownUserSource {
    public override async GetSystemUser(_provider: IMetadataProvider): Promise<UserInfo | null> {
        sourceCallCount++;
        if (sourceBehavior === 'throw') {
            throw new Error('simulated lookup failure');
        }
        return sourceBehavior === 'system' ? SYSTEM_USER : null;
    }
}

function makeResult(items: BaseEntity[]): RunViewResult {
    return {
        Success: true,
        Results: items,
        RowCount: items.length,
        TotalRowCount: items.length,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
    } as unknown as RunViewResult;
}

function makeItem(id: string): BaseEntity {
    return { ID: id, EntityInfo: { Name: 'Items' } } as unknown as BaseEntity;
}

/**
 * Records the identity every read executes as, and can deny CanRead to specific users so a
 * restricted caller is simulated without any database.
 */
class RecordingProvider {
    public ProviderTypeValue: ProviderType = ProviderType.Database;
    public RunViewsUsers: Array<UserInfo | undefined> = [];
    public RunViewUsers: Array<UserInfo | undefined> = [];
    /** User IDs that lack CanRead on every entity. */
    public DeniedUserIDs: Set<string> = new Set();

    constructor(private readonly connectionKey: string) {}

    public get ProviderType(): ProviderType {
        return this.ProviderTypeValue;
    }

    public get InstanceConnectionString(): string {
        return this.connectionKey;
    }

    public EntityByName(entityName: string): unknown {
        return {
            Name: entityName,
            GetUserPermisions: (user: UserInfo | undefined) => ({
                CanRead: !user || !this.DeniedUserIDs.has(user.ID),
            }),
        };
    }

    public async RunViews(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult[]> {
        this.RunViewsUsers.push(contextUser);
        return params.map(() => makeResult([makeItem('row1')]));
    }

    public async RunView(_params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> {
        this.RunViewUsers.push(contextUser);
        return makeResult([makeItem('row1')]);
    }
}

class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Load(
            [new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Items', PropertyName: '_items' })],
            provider,
            forceRefresh,
            contextUser
        );
    }
}

/** Distinct subclasses so the once-per-class fallback warning doesn't leak between tests. */
class WarnOnceEngine extends TestEngine {}
class ThrowingSourceEngine extends TestEngine {}

let connectionCounter = 0;
function newProvider(): RecordingProvider {
    // Unique connection key per test so BaseEngine's per-connection instance cache never hands
    // one test's engine to another.
    return new RecordingProvider(`mssql://test/db-${++connectionCounter}`);
}

/**
 * BaseEngine extends BaseSingleton, whose constructor returns the already-registered instance
 * for the class name. Tests need a genuinely unloaded engine each time — otherwise the second
 * test's `Config()` short-circuits on the first test's `_loaded` flag and issues no query.
 */
function freshEngine<T extends BaseEngine<unknown>>(ctor: new () => T): T {
    const store = GetGlobalObjectStore();
    if (store) {
        delete store[`___SINGLETON__${ctor.name}`];
    }
    return new ctor();
}

beforeEach(() => {
    sourceBehavior = 'system';
    sourceCallCount = 0;
    (BaseEngine as unknown as { _systemUserFallbackWarned: Set<string> })._systemUserFallbackWarned.clear();
});

describe('BaseEngine server-side load identity', () => {
    it('runs loads as the system user when a restricted caller configures the engine first', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(provider.RunViewsUsers).toHaveLength(1);
        expect(provider.RunViewsUsers[0]?.ID).toBe(SYSTEM_USER_ID);
        expect(engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
    });

    it('reports the system user as the engine identity on a server', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        // Single identity by design: a server-side engine acts as the platform, not as whoever
        // configured it first. Attribution reads of ContextUser therefore record the system user.
        expect(engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
    });

    it('does not revert to a later caller — the identity is sticky once resolved', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);
        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        // A forceRefresh by a restricted user must not pull the shared cache back under their
        // permissions, which is exactly what first-caller-wins used to allow.
        await engine.Config(true, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
        expect(provider.RunViewsUsers.every((u) => u?.ID === SYSTEM_USER_ID)).toBe(true);
    });

    it('does not seal the engine when the caller lacks CanRead — the gate evaluates the load user', async () => {
        const provider = newProvider();
        provider.DeniedUserIDs.add(RESTRICTED_USER.ID);
        const engine = freshEngine(TestEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        // Pre-change, the all-or-nothing CanRead pre-flight skipped every config, marked the
        // engine permission-constrained, and cached [] for the whole process.
        expect(engine.IsPermissionConstrained).toBe(false);
        expect(provider.RunViewsUsers).toHaveLength(1);
        expect(engine._items).toHaveLength(1);
    });

    it('refreshes as the system user too, so an invalidation cannot re-poison the cache', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);
        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        // Single-property refresh (expiration timer / entity event / cross-tab cache path).
        await engine.RefreshItem('_items');
        expect(provider.RunViewUsers).toHaveLength(1);
        expect(provider.RunViewUsers[0]?.ID).toBe(SYSTEM_USER_ID);

        // Full refresh (RefreshAllItems → LoadConfigs).
        await engine.RefreshAllItems();
        expect(provider.RunViewsUsers[provider.RunViewsUsers.length - 1]?.ID).toBe(SYSTEM_USER_ID);
    });

    it('reloads as the system user on forceRefresh even when a restricted user forces it', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);
        await engine.Config(false, SYSTEM_USER, provider as unknown as IMetadataProvider);

        await engine.Config(true, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(provider.RunViewsUsers).toHaveLength(2);
        expect(provider.RunViewsUsers[1]?.ID).toBe(SYSTEM_USER_ID);
    });

    it('consults the source exactly once on the startup pre-warm path', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);

        // Startup passes the system user already. BaseEngine deliberately does NOT special-case
        // that — it has no notion of WHICH account is the system user; it just asks the source
        // and uses the answer. One lookup per engine, then sticky.
        await engine.Config(false, SYSTEM_USER, provider as unknown as IMetadataProvider);

        expect(sourceCallCount).toBe(1);
        expect(provider.RunViewsUsers[0]?.ID).toBe(SYSTEM_USER_ID);
        expect(engine.ContextUser.ID).toBe(SYSTEM_USER_ID);
    });

    it('resolves at most once per engine, so hot forceRefresh paths do not re-query', async () => {
        // RunTemplateResolver calls Config(true, user) on every render.
        const provider = newProvider();
        const engine = freshEngine(TestEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);
        await engine.Config(true, RESTRICTED_USER, provider as unknown as IMetadataProvider);
        await engine.Config(true, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(sourceCallCount).toBe(1);
        expect(provider.RunViewsUsers).toHaveLength(3);
        expect(provider.RunViewsUsers.every((u) => u?.ID === SYSTEM_USER_ID)).toBe(true);
    });
});

describe('BaseEngine load identity — client provider', () => {
    it('is a no-op on Network providers: loads run as the caller', async () => {
        const provider = newProvider();
        provider.ProviderTypeValue = ProviderType.Network;
        const engine = freshEngine(TestEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(sourceCallCount).toBe(0);
        expect(provider.RunViewsUsers[0]?.ID).toBe(RESTRICTED_USER.ID);
    });
});

describe('BaseEngine load identity — degradation', () => {
    it('falls back to the caller and warns once per engine class when no system user resolves', async () => {
        sourceBehavior = 'null';
        const provider = newProvider();
        const engine = freshEngine(WarnOnceEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);
        expect(provider.RunViewsUsers[0]?.ID).toBe(RESTRICTED_USER.ID);

        const warned = (BaseEngine as unknown as { _systemUserFallbackWarned: Set<string> })._systemUserFallbackWarned;
        expect(warned.has('WarnOnceEngine')).toBe(true);

        // A second load must not re-warn.
        await engine.Config(true, RESTRICTED_USER, provider as unknown as IMetadataProvider);
        expect(warned.size).toBe(1);
    });

    it('retries resolution on a later load after an unsuccessful one', async () => {
        sourceBehavior = 'null';
        const provider = newProvider();
        const engine = freshEngine(TestEngine);
        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);
        expect(provider.RunViewsUsers[0]?.ID).toBe(RESTRICTED_USER.ID);

        // The system user becomes resolvable (cache warmed, row added) — the next load picks it up.
        sourceBehavior = 'system';
        await engine.Config(true, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(provider.RunViewsUsers[1]?.ID).toBe(SYSTEM_USER_ID);
    });

    it('degrades to the caller when the source throws, instead of failing the load', async () => {
        sourceBehavior = 'throw';
        const provider = newProvider();
        const engine = freshEngine(ThrowingSourceEngine);

        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);

        expect(provider.RunViewsUsers[0]?.ID).toBe(RESTRICTED_USER.ID);
        expect(engine.Loaded).toBe(true);
    });

    it('still requires a contextUser server-side — substitution does not make user-less loads legal', async () => {
        const provider = newProvider();
        const engine = freshEngine(TestEngine);
        // Bind the provider with a normal load first. (Pre-existing quirk, unchanged here: the
        // server-side contextUser guard reads the engine's ALREADY-BOUND provider because it
        // runs ahead of SetProvider, so a first-ever load with a provider passed only as an
        // argument doesn't reach it. Load-user resolution deliberately runs AFTER SetProvider,
        // so it always sees the provider this load actually uses.)
        await engine.Config(false, RESTRICTED_USER, provider as unknown as IMetadataProvider);
        const callsBefore = provider.RunViewsUsers.length;

        await expect(
            engine.Config(true, undefined, provider as unknown as IMetadataProvider)
        ).rejects.toThrow(/must provide the contextUser/);

        expect(provider.RunViewsUsers).toHaveLength(callsBefore);
    });
});
