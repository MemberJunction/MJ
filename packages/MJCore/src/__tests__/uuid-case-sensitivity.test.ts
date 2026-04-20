import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { Metadata } from '../generic/metadata';
import { MJGlobal } from '@memberjunction/global';

/**
 * Tests that UUID comparisons throughout MJCore are case-insensitive.
 *
 * SQL Server returns UUIDs in uppercase (e.g., 'A1B2C3D4-E5F6-...')
 * while PostgreSQL returns them in lowercase ('a1b2c3d4-e5f6-...').
 * All UUID comparisons must treat both forms as equal.
 */

const UPPER_UUID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const LOWER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MIXED_UUID = 'A1b2C3d4-e5F6-7890-AbCd-eF1234567890';
const OTHER_UUID = '99999999-9999-9999-9999-999999999999';

describe('CompositeKey UUID case-insensitivity', () => {
    describe('EqualsKey', () => {
        it('should match uppercase vs lowercase UUID values', () => {
            const key = CompositeKey.FromID(UPPER_UUID);
            const kvPairs = [new KeyValuePair('ID', LOWER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should match lowercase vs uppercase UUID values', () => {
            const key = CompositeKey.FromID(LOWER_UUID);
            const kvPairs = [new KeyValuePair('ID', UPPER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should match mixed-case UUID values', () => {
            const key = CompositeKey.FromID(MIXED_UUID);
            const kvPairs = [new KeyValuePair('ID', LOWER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should match identical uppercase UUIDs', () => {
            const key = CompositeKey.FromID(UPPER_UUID);
            const kvPairs = [new KeyValuePair('ID', UPPER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should match identical lowercase UUIDs', () => {
            const key = CompositeKey.FromID(LOWER_UUID);
            const kvPairs = [new KeyValuePair('ID', LOWER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should reject different UUID values regardless of case', () => {
            const key = CompositeKey.FromID(UPPER_UUID);
            const kvPairs = [new KeyValuePair('ID', OTHER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(false);
        });

        it('should handle composite keys with multiple UUID fields in mixed case', () => {
            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('DashboardID', UPPER_UUID),
                new KeyValuePair('UserID', 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB'),
            ]);
            const kvPairs = [
                new KeyValuePair('DashboardID', LOWER_UUID),
                new KeyValuePair('UserID', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
            ];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should reject composite keys where one UUID field differs', () => {
            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('DashboardID', UPPER_UUID),
                new KeyValuePair('UserID', 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB'),
            ]);
            const kvPairs = [
                new KeyValuePair('DashboardID', LOWER_UUID),
                new KeyValuePair('UserID', OTHER_UUID),
            ];

            expect(key.EqualsKey(kvPairs)).toBe(false);
        });

        it('should still require field names to match exactly', () => {
            const key = CompositeKey.FromKeyValuePair('ID', UPPER_UUID);
            const kvPairs = [new KeyValuePair('EntityID', LOWER_UUID)];

            expect(key.EqualsKey(kvPairs)).toBe(false);
        });
    });

    describe('Equals', () => {
        it('should match CompositeKeys with different UUID casing', () => {
            const key1 = CompositeKey.FromID(UPPER_UUID);
            const key2 = CompositeKey.FromID(LOWER_UUID);

            expect(key1.Equals(key2)).toBe(true);
        });

        it('should match CompositeKeys with mixed-case UUIDs', () => {
            const key1 = CompositeKey.FromID(MIXED_UUID);
            const key2 = CompositeKey.FromID(UPPER_UUID);

            expect(key1.Equals(key2)).toBe(true);
        });

        it('should reject different UUIDs regardless of case', () => {
            const key1 = CompositeKey.FromID(UPPER_UUID);
            const key2 = CompositeKey.FromID(OTHER_UUID);

            expect(key1.Equals(key2)).toBe(false);
        });
    });

    describe('EqualsEx', () => {
        it('should match single CompositeKeys with different UUID casing', () => {
            const key1 = CompositeKey.FromID(UPPER_UUID);
            const key2 = CompositeKey.FromID(LOWER_UUID);

            expect(CompositeKey.EqualsEx(key1, key2)).toBe(true);
        });

        it('should match arrays of CompositeKeys with different UUID casing', () => {
            const arr1 = [CompositeKey.FromID(UPPER_UUID), CompositeKey.FromID('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA')];
            const arr2 = [CompositeKey.FromID(LOWER_UUID), CompositeKey.FromID('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')];

            expect(CompositeKey.EqualsEx(arr1, arr2)).toBe(true);
        });

        it('should reject arrays where one element differs in value (not just case)', () => {
            const arr1 = [CompositeKey.FromID(UPPER_UUID)];
            const arr2 = [CompositeKey.FromID(OTHER_UUID)];

            expect(CompositeKey.EqualsEx(arr1, arr2)).toBe(false);
        });
    });

    describe('EqualsKey with non-string values', () => {
        it('should still use strict equality for numeric values', () => {
            const key = new CompositeKey();
            key.KeyValuePairs = [{ FieldName: 'Sequence', Value: 42 }];
            const kvPairs: KeyValuePair[] = [{ FieldName: 'Sequence', Value: 42 } as KeyValuePair];

            expect(key.EqualsKey(kvPairs)).toBe(true);
        });

        it('should reject mismatched numeric values', () => {
            const key = new CompositeKey();
            key.KeyValuePairs = [{ FieldName: 'Sequence', Value: 42 }];
            const kvPairs: KeyValuePair[] = [{ FieldName: 'Sequence', Value: 99 } as KeyValuePair];

            expect(key.EqualsKey(kvPairs)).toBe(false);
        });
    });
});

describe('Metadata UUID case-insensitivity', () => {
    const ENTITY_ID_UPPER = 'E1E1E1E1-E1E1-E1E1-E1E1-E1E1E1E1E1E1';
    const ENTITY_ID_LOWER = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
    const ENTITY_ID_MIXED = 'E1e1E1e1-e1E1-E1e1-e1E1-e1E1e1E1e1E1';

    const mockEntities = [
        { ID: ENTITY_ID_UPPER, Name: 'Users', SchemaName: 'admin', BaseTable: 'User', Fields: [] },
        { ID: '22222222-2222-2222-2222-222222222222', Name: 'Roles', SchemaName: 'admin', BaseTable: 'Role', Fields: [] },
    ];

    const mockProvider = {
        Entities: mockEntities,
        CurrentUser: { ID: 'u-1', Name: 'TestUser' },
        Applications: [],
        Roles: [],
        Authorizations: [],
        RowLevelSecurityFilters: [],
        AuditLogTypes: [],
        Queries: [],
        QueryCategories: [],
        QueryFields: [],
        QueryPermissions: [],
        Libraries: [],
        ExplorerNavigationItems: [],
        LatestRemoteMetadata: null,
        LocalMetadataStore: null,
        Refresh: vi.fn().mockResolvedValue(true),
        GetEntityObject: vi.fn().mockResolvedValue({}),
        GetEntityObjectByID: vi.fn().mockResolvedValue({}),
    };

    let globalStore: Record<string, unknown>;

    beforeEach(() => {
        globalStore = {};
        vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(globalStore);
        Metadata.Provider = mockProvider as never;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('EntityByID', () => {
        it('should find entity when looking up with lowercase UUID (PostgreSQL format)', () => {
            const md = new Metadata();
            const entity = md.EntityByID(ENTITY_ID_LOWER);

            expect(entity).toBeDefined();
            expect(entity.Name).toBe('Users');
        });

        it('should find entity when looking up with uppercase UUID (SQL Server format)', () => {
            const md = new Metadata();
            const entity = md.EntityByID(ENTITY_ID_UPPER);

            expect(entity).toBeDefined();
            expect(entity.Name).toBe('Users');
        });

        it('should find entity when looking up with mixed-case UUID', () => {
            const md = new Metadata();
            const entity = md.EntityByID(ENTITY_ID_MIXED);

            expect(entity).toBeDefined();
            expect(entity.Name).toBe('Users');
        });

        it('should return undefined for non-existent UUID', () => {
            const md = new Metadata();
            const entity = md.EntityByID(OTHER_UUID);

            expect(entity).toBeUndefined();
        });
    });

    describe('EntityNameFromID', () => {
        it('should return entity name when looking up with lowercase UUID', () => {
            const md = new Metadata();
            const name = md.EntityNameFromID(ENTITY_ID_LOWER);

            expect(name).toBe('Users');
        });

        it('should return entity name when looking up with uppercase UUID', () => {
            const md = new Metadata();
            const name = md.EntityNameFromID(ENTITY_ID_UPPER);

            expect(name).toBe('Users');
        });

        it('should return entity name when looking up with mixed-case UUID', () => {
            const md = new Metadata();
            const name = md.EntityNameFromID(ENTITY_ID_MIXED);

            expect(name).toBe('Users');
        });
    });

    describe('EntityFromEntityID', () => {
        it('should return EntityInfo when looking up with lowercase UUID', () => {
            const md = new Metadata();
            const entity = md.EntityFromEntityID(ENTITY_ID_LOWER);

            expect(entity).toBeDefined();
            expect(entity!.Name).toBe('Users');
        });

        it('should return EntityInfo when looking up with uppercase UUID', () => {
            const md = new Metadata();
            const entity = md.EntityFromEntityID(ENTITY_ID_UPPER);

            expect(entity).toBeDefined();
            expect(entity!.Name).toBe('Users');
        });

        it('should return EntityInfo when looking up with mixed-case UUID', () => {
            const md = new Metadata();
            const entity = md.EntityFromEntityID(ENTITY_ID_MIXED);

            expect(entity).toBeDefined();
            expect(entity!.Name).toBe('Users');
        });

        it('should return null for non-existent UUID', () => {
            const md = new Metadata();
            const entity = md.EntityFromEntityID(OTHER_UUID);

            expect(entity).toBeNull();
        });
    });

    describe('Cross-platform scenario: SQL Server entity loaded, PostgreSQL ID lookup', () => {
        it('should find SQL Server uppercase entity using PostgreSQL lowercase ID', () => {
            const md = new Metadata();
            // Simulate: entity was loaded from SQL Server with uppercase ID
            // Now looking up with a PostgreSQL lowercase ID
            const entity = md.EntityByID(ENTITY_ID_LOWER);
            expect(entity).toBeDefined();
            expect(entity.ID).toBe(ENTITY_ID_UPPER); // Original casing preserved
        });
    });
});
