import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';
import { EntityInfo } from '../generic/entityInfo';
import { CacheChangedEvent } from '../generic/localCacheManager';

/**
 * A peer server's cache event must never put ciphertext into an engine.
 *
 * Server caches store encrypted fields as ciphertext at rest (`$ENC$…`), and only the
 * provider's cache-read path decrypts them. A peer's `set` or `row_delta` event carries those
 * stored rows, so applying it in place left `CredentialEngine` holding encrypted `Values` and
 * every credential read returned empty values until the next local save. Such a payload must
 * fall back to a reload, which reads the slot through the decrypting path.
 */

const CIPHERTEXT = '$ENC$$85B8A1C2-0000-0000-0000-000000000000$AES-256-GCM$iv$tag$Y2lwaGVy';

/** Duck-typed entity, matching the MJCore convention: implements only what the transform calls. */
class MockEntity {
    public data: Record<string, unknown> = {};

    public LoadFromData(data: Record<string, unknown>): boolean {
        this.data = data;
        return true;
    }

    public Save(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

class TestEngine extends BaseEngine<TestEngine> {
    public _items: unknown[] = [];
    public loadSingleConfigCalls = 0;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // no-op — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public SetProviderForTest(provider: IMetadataProvider): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
    }

    /** Stubbed so the reload fallback is observable without a real RunView. */
    protected override async LoadSingleConfig(_config: BaseEnginePropertyConfig, _contextUser: UserInfo): Promise<void> {
        this.loadSingleConfigCalls++;
    }

    public OnExternalCacheChangeForTest(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        return (this as unknown as {
            OnExternalCacheChange: (c: BaseEnginePropertyConfig, e: CacheChangedEvent) => Promise<void>;
        }).OnExternalCacheChange(config, event);
    }
}

/** The slice of `MJ: Credentials` metadata the cache-event path reads: one encrypted field. */
function credentialEntityInfo(): EntityInfo {
    const fields = [
        { Name: 'ID', IsUniqueIdentifier: true, IsUpdatedAtField: false, Encrypt: false },
        { Name: 'Values', IsUniqueIdentifier: false, IsUpdatedAtField: false, Encrypt: true },
        { Name: '__mj_UpdatedAt', IsUniqueIdentifier: false, IsUpdatedAtField: true, Encrypt: false },
    ];
    return {
        Name: 'MJ: Credentials',
        IsParentType: false,
        IsChildType: false,
        Fields: fields,
        EncryptedFields: fields.filter(f => f.Encrypt),
        PrimaryKeys: [fields[0]],
        FieldByName: (name: string) => fields.find(f => f.Name === name),
    } as unknown as EntityInfo;
}

function createProvider() {
    const entityInfo = credentialEntityInfo();
    const getEntityObject = vi.fn(async <T>(): Promise<T> => new MockEntity() as object as T);
    return {
        GetEntityObject: getEntityObject,
        EntityByName: (name: string) => (name === 'MJ: Credentials' ? entityInfo : undefined),
    } as object as IMetadataProvider & { GetEntityObject: typeof getEntityObject };
}

function makeConfig(overrides?: Partial<BaseEnginePropertyConfig>): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        Type: 'entity',
        EntityName: 'MJ: Credentials',
        PropertyName: '_items',
        CacheLocal: true,
        ...overrides,
    });
}

function setEvent(rows: Array<Record<string, unknown>>): CacheChangedEvent {
    return {
        CacheKey: 'MJ: Credentials|_|_|-1|0|_|_|imr:1',
        Category: 'RunViewCache',
        Action: 'set',
        Timestamp: Date.now(),
        SourceServerId: 'peer-server',
        Data: JSON.stringify({ results: rows, totalRowCount: rows.length }),
    };
}

function rowDeltaEvent(upsertedRows: Array<Record<string, string>>, rowCount: number): CacheChangedEvent {
    return {
        CacheKey: 'MJ: Credentials|_|_|-1|0|_|_|imr:1',
        Category: 'RunViewCache',
        Action: 'row_delta',
        Timestamp: Date.now(),
        SourceServerId: 'peer-server',
        Data: JSON.stringify({
            primaryKeyFields: ['ID'],
            upsertedRows,
            deletedPrimaryKeys: [],
            rowCount,
            maxUpdatedAt: '2026-11-08T15:00:00.000Z',
        }),
    };
}

const PLAINTEXT_ROW = { ID: 'cred-1', Values: '{"apiKey":"sk-live"}', __mj_UpdatedAt: '2026-11-08T14:00:00.000Z' };
const CIPHERTEXT_ROW = { ID: 'cred-1', Values: CIPHERTEXT, __mj_UpdatedAt: '2026-11-08T15:00:00.000Z' };

async function seededEngine(config: BaseEnginePropertyConfig) {
    const engine = new TestEngine();
    const provider = createProvider();
    engine.SetProviderForTest(provider);
    engine.SetConfigsForTest([config]);
    await engine.OnExternalCacheChangeForTest(config, setEvent([PLAINTEXT_ROW]));
    expect(engine.loadSingleConfigCalls).toBe(0);
    return { engine, provider };
}

function heldValues(engine: TestEngine): unknown[] {
    return engine._items.map(row => (row instanceof MockEntity ? row.data.Values : (row as Record<string, unknown>).Values));
}

describe('BaseEngine.OnExternalCacheChange — ciphertext payloads', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('applies a payload whose encrypted fields are plaintext', async () => {
        const { engine } = await seededEngine(makeConfig());
        expect(heldValues(engine)).toEqual(['{"apiKey":"sk-live"}']);
    });

    it('reloads instead of applying a set payload that carries ciphertext', async () => {
        const config = makeConfig();
        const { engine, provider } = await seededEngine(config);
        provider.GetEntityObject.mockClear();

        await engine.OnExternalCacheChangeForTest(config, setEvent([CIPHERTEXT_ROW]));

        expect(engine.loadSingleConfigCalls).toBe(1);
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
        expect(heldValues(engine)).toEqual(['{"apiKey":"sk-live"}']);
    });

    it('reloads instead of applying a row_delta that carries ciphertext', async () => {
        const config = makeConfig();
        const { engine } = await seededEngine(config);

        await engine.OnExternalCacheChangeForTest(config, rowDeltaEvent([CIPHERTEXT_ROW], 1));

        expect(engine.loadSingleConfigCalls).toBe(1);
        expect(heldValues(engine)).toEqual(['{"apiKey":"sk-live"}']);
    });

    it('reloads a simple-result config too, which would otherwise assign the rows verbatim', async () => {
        const config = makeConfig({ ResultType: 'simple' });
        const { engine } = await seededEngine(config);

        await engine.OnExternalCacheChangeForTest(config, setEvent([CIPHERTEXT_ROW]));

        expect(engine.loadSingleConfigCalls).toBe(1);
        expect(heldValues(engine)).toEqual(['{"apiKey":"sk-live"}']);
    });

    it('still applies ciphertext-looking text on an entity with no encrypted fields', async () => {
        const engine = new TestEngine();
        const getEntityObject = vi.fn(async <T>(): Promise<T> => new MockEntity() as object as T);
        // No EntityByName: the engine cannot see encrypted fields, and the transform takes its slow path.
        engine.SetProviderForTest({ GetEntityObject: getEntityObject } as object as IMetadataProvider);
        const config = makeConfig({ EntityName: 'MJ: AI Agent Notes' });
        engine.SetConfigsForTest([config]);

        await engine.OnExternalCacheChangeForTest(config, setEvent([{ ID: 'n1', Note: CIPHERTEXT }]));

        expect(engine.loadSingleConfigCalls).toBe(0);
        expect((engine._items[0] as MockEntity).data.Note).toBe(CIPHERTEXT);
    });
});
