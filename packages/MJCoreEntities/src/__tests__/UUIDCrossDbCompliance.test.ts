/**
 * UUID Cross-Database Compliance Tests
 *
 * These tests verify that engine lookup methods work correctly with
 * mixed-case UUIDs — as would happen when switching between SQL Server
 * (returns uppercase UUIDs) and PostgreSQL (returns lowercase UUIDs).
 *
 * Each test stores data with one case and looks it up with the opposite case,
 * simulating a cross-database scenario.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pass through real UUID utilities — these are the functions we're testing integration with
vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        RegisterClass: () => () => {},
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
        BaseSingleton: class {
            static getInstance() { return new this(); }
        },
        ENCRYPTION_MARKER: '__MJ_ENCRYPTED__',
        UUIDsEqual: actual.UUIDsEqual,
        NormalizeUUID: actual.NormalizeUUID,
    };
});

vi.mock('@memberjunction/core', () => {
    class MockBaseEngine {
        static _instances = new Map<Function, unknown>();
        static getInstance<T>(): T {
            const ctor = this;
            if (!MockBaseEngine._instances.has(ctor)) {
                MockBaseEngine._instances.set(ctor, new (ctor as unknown as new () => T)());
            }
            return MockBaseEngine._instances.get(ctor) as T;
        }
        Config() { return Promise.resolve(); }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        IStartupSink: class {},
        RegisterForStartup: () => (target: unknown) => target,
        Metadata: class {
            CurrentUser = { ID: 'user-1' };
            Entities: unknown[] = [];
            Applications: unknown[] = [];
        },
        UserInfo: class {},
        ApplicationInfo: class {},
    };
});

vi.mock('../generated/entity_subclasses', () => ({}));

// Test constants: same UUID in different cases
const UUID_UPPER = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const UUID_LOWER = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const UUID_OTHER = 'BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF';

describe('UUID Cross-Database Compliance', () => {
    describe('MCPEngine', () => {
        it('should find server by ID regardless of UUID case', async () => {
            const { MCPEngine } = await import('../engines/MCPEngine');
            const engine = MCPEngine.Instance;

            // Simulate data loaded from SQL Server (uppercase)
            (engine as Record<string, unknown>)['_Servers'] = [
                { ID: UUID_UPPER, Name: 'Test Server' },
                { ID: UUID_OTHER, Name: 'Other Server' },
            ];

            // Look up with PostgreSQL-style lowercase UUID
            const found = engine.GetServerById(UUID_LOWER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('Test Server');
        });

        it('should find connection by ID regardless of UUID case', async () => {
            const { MCPEngine } = await import('../engines/MCPEngine');
            const engine = MCPEngine.Instance;

            (engine as Record<string, unknown>)['_Connections'] = [
                { ID: UUID_LOWER, Name: 'Test Connection' },
            ];

            // Look up with SQL Server-style uppercase UUID
            const found = engine.GetConnectionById(UUID_UPPER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('Test Connection');
        });

        it('should find tool by ID regardless of UUID case', async () => {
            const { MCPEngine } = await import('../engines/MCPEngine');
            const engine = MCPEngine.Instance;

            (engine as Record<string, unknown>)['_Tools'] = [
                { ID: UUID_UPPER, Name: 'Test Tool' },
            ];

            const found = engine.GetToolById(UUID_LOWER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('Test Tool');
        });
    });

    describe('EncryptionEngineBase', () => {
        it('should find encryption key by ID regardless of UUID case', async () => {
            const { EncryptionEngineBase } = await import('../engines/EncryptionEngineBase');
            const engine = EncryptionEngineBase.Instance;

            (engine as Record<string, unknown>)['_encryptionKeys'] = [
                { ID: UUID_UPPER, Name: 'AES-256 Key' },
            ];

            const found = engine.GetKeyByID(UUID_LOWER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('AES-256 Key');
        });

        it('should find algorithm by ID regardless of UUID case', async () => {
            const { EncryptionEngineBase } = await import('../engines/EncryptionEngineBase');
            const engine = EncryptionEngineBase.Instance;

            (engine as Record<string, unknown>)['_encryptionAlgorithms'] = [
                { ID: UUID_LOWER, Name: 'AES-256-GCM' },
            ];

            const found = engine.GetAlgorithmByID(UUID_UPPER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('AES-256-GCM');
        });

        it('should find key source by ID regardless of UUID case', async () => {
            const { EncryptionEngineBase } = await import('../engines/EncryptionEngineBase');
            const engine = EncryptionEngineBase.Instance;

            (engine as Record<string, unknown>)['_encryptionKeySources'] = [
                { ID: UUID_UPPER, Name: 'Azure Key Vault' },
            ];

            const found = engine.GetKeySourceByID(UUID_LOWER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('Azure Key Vault');
        });
    });

    describe('FileStorageEngine', () => {
        it('should find account by ID regardless of UUID case', async () => {
            const { FileStorageEngine } = await import('../engines/FileStorageEngine');
            const engine = FileStorageEngine.Instance;

            (engine as Record<string, unknown>)['_accounts'] = [
                { ID: UUID_UPPER, Name: 'S3 Bucket' },
            ];

            const found = engine.GetAccountById(UUID_LOWER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('S3 Bucket');
        });

        it('should find provider by ID regardless of UUID case', async () => {
            const { FileStorageEngine } = await import('../engines/FileStorageEngine');
            const engine = FileStorageEngine.Instance;

            (engine as Record<string, unknown>)['_providers'] = [
                { ID: UUID_LOWER, Name: 'AWS S3' },
            ];

            const found = engine.GetProviderById(UUID_UPPER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('AWS S3');
        });
    });

    describe('UserViewEngine', () => {
        it('should find view by ID regardless of UUID case', async () => {
            const { UserViewEngine } = await import('../engines/UserViewEngine');
            const engine = UserViewEngine.Instance;

            (engine as Record<string, unknown>)['_views'] = [
                { ID: UUID_UPPER, Name: 'My View' },
            ];

            const found = engine.GetViewById(UUID_LOWER);
            expect(found).toBeDefined();
            expect(found?.Name).toBe('My View');
        });
    });

    describe('UUIDsEqual integration sanity check', () => {
        it('should match uppercase SQL Server UUID with lowercase PostgreSQL UUID', async () => {
            const { UUIDsEqual } = await import('@memberjunction/global');
            // Simulates: data loaded from SQL Server (uppercase) looked up with PG-style (lowercase)
            expect(UUIDsEqual(UUID_UPPER, UUID_LOWER)).toBe(true);
        });

        it('should not match different UUIDs regardless of case', async () => {
            const { UUIDsEqual } = await import('@memberjunction/global');
            expect(UUIDsEqual(UUID_UPPER, UUID_OTHER)).toBe(false);
        });

        it('should work in .find() with mixed-case data (simulating cross-DB)', async () => {
            const { UUIDsEqual } = await import('@memberjunction/global');
            // SQL Server returns uppercase IDs in the array
            const items = [
                { ID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', Name: 'First' },
                { ID: UUID_UPPER, Name: 'Target' },
                { ID: 'CCCCCCCC-DDDD-EEEE-FFFF-000000000000', Name: 'Third' },
            ];
            // PostgreSQL sends lowercase ID in the query
            const found = items.find(item => UUIDsEqual(item.ID, UUID_LOWER));
            expect(found).toBeDefined();
            expect(found?.Name).toBe('Target');
        });

        it('should work in .filter() with mixed-case data (simulating cross-DB)', async () => {
            const { UUIDsEqual } = await import('@memberjunction/global');
            const items = [
                { UserID: UUID_UPPER, Name: 'Match 1' },
                { UserID: UUID_OTHER.toLowerCase(), Name: 'No Match' },
                { UserID: UUID_UPPER, Name: 'Match 2' },
            ];
            const matches = items.filter(item => UUIDsEqual(item.UserID, UUID_LOWER));
            expect(matches).toHaveLength(2);
        });

        it('should work with NormalizeUUID for Set operations (simulating cross-DB)', async () => {
            const { NormalizeUUID } = await import('@memberjunction/global');
            // Build Set from SQL Server data (uppercase)
            const ids = new Set([NormalizeUUID(UUID_UPPER), NormalizeUUID(UUID_OTHER)]);
            // Check with PostgreSQL-style lowercase
            expect(ids.has(NormalizeUUID(UUID_LOWER))).toBe(true);
            expect(ids.has(NormalizeUUID('00000000-0000-0000-0000-000000000000'))).toBe(false);
        });
    });
});
