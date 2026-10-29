/**
 * Unit tests verifying ciphertext-at-rest caching and PreserveRestrictedApiCiphertext (1.5):
 * 1. LocalCacheManager stores ONLY pre-decryption `$ENC$...` ciphertext on RunView / GetDatasetByName,
 *    never decrypted plaintext.
 * 2. In-process RunView cache hits decrypt cached ciphertext for server callers while keeping the
 *    cached rows encrypted at rest.
 * 3. PreserveRestrictedApiCiphertext skips Decrypt() for fields with AllowDecryptInAPI === false
 *    (on both SQL misses and cache hits) while still decrypting AllowDecryptInAPI === true fields.
 * 4. LocalCacheManager.RowContainsPlaintextEncryptedField detects unencrypted values on encrypted
 *    columns so plaintext BaseEntity save events never write decrypted secrets into shared cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

const { decryptMock, encryptMock } = vi.hoisted(() => ({
    decryptMock: vi.fn(),
    encryptMock: vi.fn(),
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn().mockResolvedValue(undefined),
                Encrypt: encryptMock,
                Decrypt: decryptMock,
                IsEncrypted: (v: string | null | undefined) => typeof v === 'string' && v.startsWith('$ENC$'),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
    IsEncryptionKeyUnavailable: () => false,
    ReportEncryptionKeyUnavailable: vi.fn(),
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    DeleteSQLResult,
    EntityInfo,
    ILocalStorageProvider,
    LocalCacheManager,
    RunViewParams,
    SaveSQLResult,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';

type RowValue = string | number | boolean | Date | null | undefined;
type EntityRow = Record<string, RowValue>;

class MemoryStorageProvider implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    public readonly SupportsCrossProcessPersistence = false;
    private store = new Map<string, string>();

    public GetRawValues(): string[] {
        return Array.from(this.store.values());
    }

    private fullKey(key: string, category?: string): string {
        return `${category ?? 'default'}:${key}`;
    }

    public async GetItem<T>(key: string, category?: string): Promise<T | null> {
        const raw = this.store.get(this.fullKey(key, category));
        return raw !== undefined ? (JSON.parse(raw) as T) : null;
    }

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this.store.set(this.fullKey(key, category), JSON.stringify(value));
    }

    public async Remove(key: string, category?: string): Promise<void> {
        this.store.delete(this.fullKey(key, category));
    }

    public async RemoveItem(key: string, category?: string): Promise<void> {
        this.store.delete(this.fullKey(key, category));
    }

    public async ClearCategory(category?: string): Promise<void> {
        const prefix = `${category ?? 'default'}:`;
        for (const k of Array.from(this.store.keys())) {
            if (k.startsWith(prefix)) {
                this.store.delete(k);
            }
        }
    }

    public async Clear(): Promise<void> {
        this.store.clear();
    }

    public async GetCategoryKeys(category?: string): Promise<string[]> {
        const prefix = `${category ?? 'default'}:`;
        return Array.from(this.store.keys())
            .filter((k) => k.startsWith(prefix))
            .map((k) => k.slice(prefix.length));
    }
}

class CiphertextCacheTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    private _entities: EntityInfo[] = [];
    public SqlQueue: EntityRow[][] = [];
    public SqlCalls: string[] = [];

    public SeedEntities(entities: EntityInfo[]): void {
        this._entities = entities;
    }

    public override get Entities(): EntityInfo[] {
        return this._entities;
    }

    public override EntityByID(id: string): EntityInfo | undefined {
        return this._entities.find((e) => e.ID === id);
    }

    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find((e) => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }

    public override get TrustLocalCacheCompletely(): boolean {
        return true;
    }

    protected override get AllowRefresh(): boolean {
        return true;
    }

    public override async ExecuteSQL<T>(sql?: string): Promise<Array<T>> {
        this.SqlCalls.push(sql ?? '');
        const next = this.SqlQueue.shift() ?? [];
        return next as Array<T>;
    }

    protected get UUIDFunctionPattern(): RegExp {
        return CiphertextCacheTestProvider._uuidPattern;
    }
    protected get DBDefaultFunctionPattern(): RegExp {
        return CiphertextCacheTestProvider._defaultPattern;
    }
    public QuoteIdentifier(name: string): string {
        return `[${name}]`;
    }
    public QuoteSchemaAndView(schema: string, obj: string): string {
        return `[${schema}].[${obj}]`;
    }
    protected BuildChildDiscoverySQL(): string {
        return '';
    }
    protected BuildHardLinkDependencySQL(): string {
        return '';
    }
    protected BuildSoftLinkDependencySQL(): string {
        return '';
    }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> {
        return { fullSQL: '' };
    }
    protected GenerateDeleteSQL(): DeleteSQLResult {
        return { fullSQL: '' };
    }
    protected BuildRecordChangeSQL(): { sql: string } | null {
        return null;
    }
    protected BuildSiblingRecordChangeSQL(): string {
        return '';
    }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    public async BeginTransaction(): Promise<void> {}
    public async CommitTransaction(): Promise<void> {}
    public async RollbackTransaction(): Promise<void> {}
}

const ENTITY_ID = 'ent-secrets-001';
const KEY_ID = '11111111-2222-3333-4444-555555555555';
const CIPHERTEXT_RESTRICTED = `$ENC$${KEY_ID}$AES-256-GCM$iv1$cipherRestricted$tag1`;
const CIPHERTEXT_ALLOWED = `$ENC$${KEY_ID}$AES-256-GCM$iv2$cipherAllowed$tag2`;
const PLAINTEXT_RESTRICTED = 'top-secret-api-key-value';
const PLAINTEXT_ALLOWED = 'api-readable-token-value';

function buildEncryptedEntity(): EntityInfo {
    const roleId = 'role-admin';
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'API Credentials',
        SchemaName: '__mj',
        BaseTable: 'APICredential',
        BaseView: 'vwAPICredentials',
        AllowCaching: true,
        TrustServerCacheCompletely: true,
        Status: 'Active',
        EntityPermissions: [
            {
                ID: 'perm-1',
                EntityID: ENTITY_ID,
                RoleID: roleId,
                CanRead: true,
                CanCreate: true,
                CanUpdate: true,
                CanDelete: true,
            },
        ],
        EntityFields: [
            {
                ID: 'f-1',
                EntityID: ENTITY_ID,
                Sequence: 1,
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Status: 'Active',
            },
            {
                ID: 'f-2',
                EntityID: ENTITY_ID,
                Sequence: 2,
                Name: 'SecretKey',
                Type: 'nvarchar',
                Length: -1,
                AllowsNull: true,
                Encrypt: true,
                EncryptionKeyID: KEY_ID,
                AllowDecryptInAPI: false,
                SendEncryptedValue: true,
                Status: 'Active',
            },
            {
                ID: 'f-3',
                EntityID: ENTITY_ID,
                Sequence: 3,
                Name: 'ReadableToken',
                Type: 'nvarchar',
                Length: -1,
                AllowsNull: true,
                Encrypt: true,
                EncryptionKeyID: KEY_ID,
                AllowDecryptInAPI: true,
                SendEncryptedValue: false,
                Status: 'Active',
            },
            {
                ID: 'f-4',
                EntityID: ENTITY_ID,
                Sequence: 4,
                Name: '__mj_UpdatedAt',
                Type: 'datetimeoffset',
                AllowsNull: false,
                Status: 'Active',
            },
        ],
    });
}

function buildTestUser(): UserInfo {
    const role = new UserRoleInfo({ UserID: 'u-admin', RoleID: 'role-admin', Role: 'Admin' });
    return new UserInfo(null, {
        ID: 'u-admin',
        Name: 'Admin',
        Email: 'admin@example.test',
        IsActive: true,
        UserRoles: [role],
    });
}

describe('Ciphertext-preserving LocalCacheManager & PreserveRestrictedApiCiphertext (1.5)', () => {
    let storage: MemoryStorageProvider;
    let provider: CiphertextCacheTestProvider;
    let entity: EntityInfo;
    let user: UserInfo;

    beforeEach(async () => {
        vi.clearAllMocks();
        decryptMock.mockImplementation(async (val: string) => {
            if (val === CIPHERTEXT_RESTRICTED) return PLAINTEXT_RESTRICTED;
            if (val === CIPHERTEXT_ALLOWED) return PLAINTEXT_ALLOWED;
            return val;
        });

        storage = new MemoryStorageProvider();
        if (LocalCacheManager.Instance.IsInitialized) {
            await LocalCacheManager.Instance.SetStorageProvider(storage);
        } else {
            await LocalCacheManager.Instance.Initialize(storage, { enabled: true });
        }
        await LocalCacheManager.Instance.ClearAll();

        entity = buildEncryptedEntity();
        user = buildTestUser();
        provider = new CiphertextCacheTestProvider();
        provider.SeedEntities([entity]);
    });

    afterEach(async () => {
        await LocalCacheManager.Instance.ClearAll();
        vi.restoreAllMocks();
    });

    it('stores only ciphertext in LocalCacheManager while returning decrypted plaintext to in-process RunView callers', async () => {
        provider.SqlQueue.push([
            {
                ID: 'row-1',
                SecretKey: CIPHERTEXT_RESTRICTED,
                ReadableToken: CIPHERTEXT_ALLOWED,
                __mj_UpdatedAt: '2026-04-01T00:00:00.000Z',
            },
        ]);

        const params: RunViewParams = {
            EntityName: 'API Credentials',
            ResultType: 'simple',
            CacheLocal: true,
        };

        // 1) Cache miss: SQL returns ciphertext; in-process caller receives decrypted plaintext
        const missResult = await provider.RunView<EntityRow>(params, user);
        expect(missResult.Success).toBe(true);
        expect(missResult.Results[0].SecretKey).toBe(PLAINTEXT_RESTRICTED);
        expect(missResult.Results[0].ReadableToken).toBe(PLAINTEXT_ALLOWED);
        expect(provider.SqlCalls).toHaveLength(1);
        expect(decryptMock).toHaveBeenCalledTimes(2);

        // Verify underlying storage holds ONLY ciphertext, zero plaintext secrets
        const serializedPayloads = storage.GetRawValues();
        expect(serializedPayloads.length).toBeGreaterThan(0);
        for (const payload of serializedPayloads) {
            expect(payload).not.toContain(PLAINTEXT_RESTRICTED);
            expect(payload).not.toContain(PLAINTEXT_ALLOWED);
        }
        expect(serializedPayloads.some((p) => p.includes(CIPHERTEXT_RESTRICTED))).toBe(true);
        expect(serializedPayloads.some((p) => p.includes(CIPHERTEXT_ALLOWED))).toBe(true);

        // 2) Cache hit for in-process caller: 0 SQL queries, decrypts cached ciphertext on read
        decryptMock.mockClear();
        const hitResult = await provider.RunView<EntityRow>(params, user);
        expect(hitResult.Success).toBe(true);
        expect(provider.SqlCalls).toHaveLength(1);
        expect(hitResult.Results[0].SecretKey).toBe(PLAINTEXT_RESTRICTED);
        expect(hitResult.Results[0].ReadableToken).toBe(PLAINTEXT_ALLOWED);
        expect(decryptMock).toHaveBeenCalledTimes(2);

        // Cached storage still contains zero plaintext after cache-hit materialization
        for (const payload of storage.GetRawValues()) {
            expect(payload).not.toContain(PLAINTEXT_RESTRICTED);
            expect(payload).not.toContain(PLAINTEXT_ALLOWED);
        }
    });

    it('skips Decrypt() for AllowDecryptInAPI === false fields when PreserveRestrictedApiCiphertext is true (miss and cache hit)', async () => {
        provider.SqlQueue.push([
            {
                ID: 'row-1',
                SecretKey: CIPHERTEXT_RESTRICTED,
                ReadableToken: CIPHERTEXT_ALLOWED,
                __mj_UpdatedAt: '2026-04-01T00:00:00.000Z',
            },
        ]);

        const apiParams: RunViewParams = {
            EntityName: 'API Credentials',
            ResultType: 'simple',
            CacheLocal: true,
            PreserveRestrictedApiCiphertext: true,
        };

        // 1) Cache miss from GraphQL resolver: SecretKey (AllowDecryptInAPI=false) is NOT decrypted;
        //    ReadableToken (AllowDecryptInAPI=true) IS decrypted; Encrypt() is called 0 times.
        const missResult = await provider.RunView<EntityRow>(apiParams, user);
        expect(missResult.Success).toBe(true);
        expect(missResult.Results[0].SecretKey).toBe(CIPHERTEXT_RESTRICTED);
        expect(missResult.Results[0].ReadableToken).toBe(PLAINTEXT_ALLOWED);
        expect(decryptMock).toHaveBeenCalledTimes(1);
        expect(decryptMock).toHaveBeenCalledWith(CIPHERTEXT_ALLOWED, user);
        expect(encryptMock).not.toHaveBeenCalled();

        // 2) Cache hit from GraphQL resolver: SecretKey stays ciphertext with 0 Decrypt() calls on SecretKey
        decryptMock.mockClear();
        const hitResult = await provider.RunView<EntityRow>(apiParams, user);
        expect(hitResult.Success).toBe(true);
        expect(provider.SqlCalls).toHaveLength(1);
        expect(hitResult.Results[0].SecretKey).toBe(CIPHERTEXT_RESTRICTED);
        expect(hitResult.Results[0].ReadableToken).toBe(PLAINTEXT_ALLOWED);
        expect(decryptMock).toHaveBeenCalledTimes(1);
        expect(decryptMock).toHaveBeenCalledWith(CIPHERTEXT_ALLOWED, user);
        expect(encryptMock).not.toHaveBeenCalled();
    });

    it('detects plaintext values on encrypted fields via LocalCacheManager.RowContainsPlaintextEncryptedField', () => {
        expect(
            LocalCacheManager.RowContainsPlaintextEncryptedField(entity, {
                ID: 'row-1',
                SecretKey: CIPHERTEXT_RESTRICTED,
                ReadableToken: CIPHERTEXT_ALLOWED,
            })
        ).toBe(false);

        expect(
            LocalCacheManager.RowContainsPlaintextEncryptedField(entity, {
                ID: 'row-1',
                SecretKey: ENCRYPTED_SENTINEL,
                ReadableToken: null,
            })
        ).toBe(false);

        expect(
            LocalCacheManager.RowContainsPlaintextEncryptedField(entity, {
                ID: 'row-1',
                SecretKey: PLAINTEXT_RESTRICTED,
                ReadableToken: CIPHERTEXT_ALLOWED,
            })
        ).toBe(true);
    });
});
