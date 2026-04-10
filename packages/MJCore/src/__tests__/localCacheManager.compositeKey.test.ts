/**
 * Tests for LocalCacheManager CompositeKey support.
 *
 * Validates that UpsertSingleEntity, RemoveSingleEntity, HandleBaseEntityEvent,
 * and HandleRemoteInvalidateEvent all work correctly with composite (multi-field)
 * primary keys using the CompositeKey class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    delete g[key];
}

// Helper to call protected/private methods on the cache manager
type CacheManagerInternal = {
    HandleBaseEntityEvent: (e: unknown) => Promise<void>;
    HandleRemoteInvalidateEvent: (e: unknown) => Promise<void>;
    parseCompositeKeyFromJSON: (json: string | undefined) => CompositeKey | null;
    buildCompositeKeyFromRow: (row: Record<string, unknown>, pkFieldNames: string[]) => CompositeKey;
};

function asInternal(cm: LocalCacheManager): CacheManagerInternal {
    return cm as unknown as CacheManagerInternal;
}

// Shorthand for the SetRunViewResult params argument
type SetParams = Parameters<typeof LocalCacheManager.prototype.SetRunViewResult>[1];

describe('LocalCacheManager CompositeKey Support', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);
    });

    // ========================================================================
    // UpsertSingleEntity with CompositeKey
    // ========================================================================

    describe('UpsertSingleEntity with CompositeKey', () => {
        it('should upsert a record using a single-field CompositeKey', async () => {
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '1', Name: 'Alice' }, { ID: '2', Name: 'Bob' }],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '1')]);
            const result = await cacheManager.UpsertSingleEntity(
                fp,
                { ID: '1', Name: 'Alice Updated' },
                key,
                '2024-01-02T00:00:00Z'
            );

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(2);
            const updated = cached!.results.find(
                r => (r as Record<string, unknown>).ID === '1'
            ) as Record<string, unknown>;
            expect(updated.Name).toBe('Alice Updated');
        });

        it('should upsert a record using a two-field CompositeKey', async () => {
            const fp = 'UserRoles|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UserRoles' } as SetParams,
                [
                    { UserID: 'u1', RoleID: 'r1', Rank: 1 },
                    { UserID: 'u1', RoleID: 'r2', Rank: 2 },
                    { UserID: 'u2', RoleID: 'r1', Rank: 3 },
                ],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('UserID', 'u1'),
                new KeyValuePair('RoleID', 'r2'),
            ]);
            const result = await cacheManager.UpsertSingleEntity(
                fp,
                { UserID: 'u1', RoleID: 'r2', Rank: 99 },
                key,
                '2024-01-02T00:00:00Z'
            );

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(3);

            // The u1/r2 record should have Rank=99
            const updated = cached!.results.find(r => {
                const row = r as Record<string, unknown>;
                return row.UserID === 'u1' && row.RoleID === 'r2';
            }) as Record<string, unknown>;
            expect(updated.Rank).toBe(99);
        });

        it('should insert a new record when CompositeKey does not match any existing', async () => {
            const fp = 'UserRoles|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UserRoles' } as SetParams,
                [{ UserID: 'u1', RoleID: 'r1', Rank: 1 }],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('UserID', 'u2'),
                new KeyValuePair('RoleID', 'r3'),
            ]);
            const result = await cacheManager.UpsertSingleEntity(
                fp,
                { UserID: 'u2', RoleID: 'r3', Rank: 10 },
                key,
                '2024-01-02T00:00:00Z'
            );

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(2);
        });

        it('should return false when no cache exists for the fingerprint', async () => {
            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '1')]);
            const result = await cacheManager.UpsertSingleEntity(
                'nonexistent|_|_|-1|0|_',
                { ID: '1', Name: 'Test' },
                key,
                '2024-01-01T00:00:00Z'
            );
            expect(result).toBe(false);
        });

        it('should handle three-field CompositeKey correctly', async () => {
            const fp = 'Permissions|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Permissions' } as SetParams,
                [
                    { AppID: 'a1', UserID: 'u1', RoleID: 'r1', Level: 'read' },
                    { AppID: 'a1', UserID: 'u1', RoleID: 'r2', Level: 'write' },
                ],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('AppID', 'a1'),
                new KeyValuePair('UserID', 'u1'),
                new KeyValuePair('RoleID', 'r1'),
            ]);

            const result = await cacheManager.UpsertSingleEntity(
                fp,
                { AppID: 'a1', UserID: 'u1', RoleID: 'r1', Level: 'admin' },
                key,
                '2024-01-02T00:00:00Z'
            );

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(2);
            const updated = cached!.results.find(r => {
                const row = r as Record<string, unknown>;
                return row.AppID === 'a1' && row.UserID === 'u1' && row.RoleID === 'r1';
            }) as Record<string, unknown>;
            expect(updated.Level).toBe('admin');
        });
    });

    // ========================================================================
    // RemoveSingleEntity with CompositeKey
    // ========================================================================

    describe('RemoveSingleEntity with CompositeKey', () => {
        it('should remove a record using a single-field CompositeKey', async () => {
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '1', Name: 'Alice' }, { ID: '2', Name: 'Bob' }],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '1')]);
            const result = await cacheManager.RemoveSingleEntity(fp, key, '2024-01-02T00:00:00Z');

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(1);
            expect((cached!.results[0] as Record<string, unknown>).ID).toBe('2');
        });

        it('should remove a record using a two-field CompositeKey', async () => {
            const fp = 'UserRoles|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UserRoles' } as SetParams,
                [
                    { UserID: 'u1', RoleID: 'r1' },
                    { UserID: 'u1', RoleID: 'r2' },
                    { UserID: 'u2', RoleID: 'r1' },
                ],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('UserID', 'u1'),
                new KeyValuePair('RoleID', 'r2'),
            ]);
            const result = await cacheManager.RemoveSingleEntity(fp, key, '2024-01-02T00:00:00Z');

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(2);
            // u1/r2 should be gone
            const remaining = cached!.results.map(r => {
                const row = r as Record<string, unknown>;
                return `${row.UserID}/${row.RoleID}`;
            });
            expect(remaining).toContain('u1/r1');
            expect(remaining).toContain('u2/r1');
            expect(remaining).not.toContain('u1/r2');
        });

        it('should return true (no-op) when CompositeKey does not match any record', async () => {
            const fp = 'UserRoles|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UserRoles' } as SetParams,
                [{ UserID: 'u1', RoleID: 'r1' }],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([
                new KeyValuePair('UserID', 'u99'),
                new KeyValuePair('RoleID', 'r99'),
            ]);
            const result = await cacheManager.RemoveSingleEntity(fp, key, '2024-01-02T00:00:00Z');

            expect(result).toBe(true); // no-op, not an error
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(1);
        });

        it('should return false when no cache exists', async () => {
            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '1')]);
            const result = await cacheManager.RemoveSingleEntity(
                'nonexistent|_|_|-1|0|_',
                key,
                '2024-01-01T00:00:00Z'
            );
            expect(result).toBe(false);
        });

        it('should update registry rowCount after removal', async () => {
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '1' }, { ID: '2' }, { ID: '3' }],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '2')]);
            await cacheManager.RemoveSingleEntity(fp, key, '2024-01-02T00:00:00Z');

            const entries = cacheManager.GetAllEntries();
            const entry = entries.find(e => e.key === fp);
            expect(entry).toBeDefined();
            expect(entry!.rowCount).toBe(2);
        });
    });

    // ========================================================================
    // HandleBaseEntityEvent with Composite PKs
    // ========================================================================

    describe('HandleBaseEntityEvent with Composite PKs', () => {
        function createCompositePKEvent(options: {
            entityName: string;
            type: 'save' | 'delete';
            primaryKeys: Array<{ Name: string }>;
            fields: Record<string, unknown>;
        }) {
            return {
                type: options.type,
                baseEntity: {
                    EntityInfo: {
                        Name: options.entityName,
                        PrimaryKeys: options.primaryKeys,
                    },
                    Get: (fieldName: string) => options.fields[fieldName],
                    GetAll: () => ({ ...options.fields }),
                },
            };
        }

        it('should upsert composite PK entity in unfiltered cache', async () => {
            const fp = 'OrderItems|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'OrderItems' } as SetParams,
                [
                    { OrderID: 'o1', LineNum: 1, Qty: 5 },
                    { OrderID: 'o1', LineNum: 2, Qty: 3 },
                ],
                '2024-01-01T00:00:00Z'
            );

            const event = createCompositePKEvent({
                entityName: 'OrderItems',
                type: 'save',
                primaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNum' }],
                fields: { OrderID: 'o1', LineNum: 1, Qty: 10 },
            });

            await asInternal(cacheManager).HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(2);
            const updated = cached!.results.find(r => {
                const row = r as Record<string, unknown>;
                return row.OrderID === 'o1' && row.LineNum === 1;
            }) as Record<string, unknown>;
            expect(updated.Qty).toBe(10);
        });

        it('should delete composite PK entity from cache', async () => {
            const fp = 'OrderItems|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'OrderItems' } as SetParams,
                [
                    { OrderID: 'o1', LineNum: 1, Qty: 5 },
                    { OrderID: 'o1', LineNum: 2, Qty: 3 },
                    { OrderID: 'o2', LineNum: 1, Qty: 7 },
                ],
                '2024-01-01T00:00:00Z'
            );

            const event = createCompositePKEvent({
                entityName: 'OrderItems',
                type: 'delete',
                primaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNum' }],
                fields: { OrderID: 'o1', LineNum: 2 },
            });

            await asInternal(cacheManager).HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(2);
            const remaining = cached!.results.map(r => {
                const row = r as Record<string, unknown>;
                return `${row.OrderID}/${row.LineNum}`;
            });
            expect(remaining).toContain('o1/1');
            expect(remaining).toContain('o2/1');
            expect(remaining).not.toContain('o1/2');
        });

        it('should add new composite PK record to unfiltered cache', async () => {
            const fp = 'OrderItems|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'OrderItems' } as SetParams,
                [{ OrderID: 'o1', LineNum: 1, Qty: 5 }],
                '2024-01-01T00:00:00Z'
            );

            const event = createCompositePKEvent({
                entityName: 'OrderItems',
                type: 'save',
                primaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNum' }],
                fields: { OrderID: 'o1', LineNum: 3, Qty: 12 },
            });

            await asInternal(cacheManager).HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached!.results).toHaveLength(2);
        });

        it('should invalidate filtered cache even with composite PK on save', async () => {
            const fp = 'OrderItems|OrderID=o1|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'OrderItems', ExtraFilter: 'OrderID=o1' } as SetParams,
                [{ OrderID: 'o1', LineNum: 1, Qty: 5 }],
                '2024-01-01T00:00:00Z'
            );

            const event = createCompositePKEvent({
                entityName: 'OrderItems',
                type: 'save',
                primaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNum' }],
                fields: { OrderID: 'o1', LineNum: 1, Qty: 10 },
            });

            await asInternal(cacheManager).HandleBaseEntityEvent(event);

            // Filtered caches are invalidated, not updated in place
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).toBeNull();
        });

        it('should update multiple unfiltered fingerprints for the same entity', async () => {
            const fp1 = 'OrderItems|_|_|-1|0|_';
            const fp2 = 'OrderItems|_|_|-1|0|_|otherconn';

            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'OrderItems' } as SetParams,
                [{ OrderID: 'o1', LineNum: 1, Qty: 5 }],
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'OrderItems' } as SetParams,
                [{ OrderID: 'o1', LineNum: 1, Qty: 5 }],
                '2024-01-01T00:00:00Z'
            );

            const event = createCompositePKEvent({
                entityName: 'OrderItems',
                type: 'save',
                primaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNum' }],
                fields: { OrderID: 'o1', LineNum: 1, Qty: 99 },
            });

            await asInternal(cacheManager).HandleBaseEntityEvent(event);

            // Both caches should be updated
            const cached1 = await cacheManager.GetRunViewResult(fp1);
            const cached2 = await cacheManager.GetRunViewResult(fp2);
            expect((cached1!.results[0] as Record<string, unknown>).Qty).toBe(99);
            expect((cached2!.results[0] as Record<string, unknown>).Qty).toBe(99);
        });
    });

    // ========================================================================
    // HandleRemoteInvalidateEvent
    // ========================================================================

    describe('HandleRemoteInvalidateEvent', () => {
        // HandleRemoteInvalidateEvent requires Metadata to look up entity PK fields.
        // We mock it minimally — the event needs entityName in the payload.

        it('should upsert record data on remote save event', async () => {
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            // Mock entity metadata lookup
            const md = { Entities: [{ Name: 'Users', PrimaryKeys: [{ Name: 'ID' }] }] };
            const originalMetadata = (await import('../generic/metadata')).Metadata;
            const metaProto = originalMetadata.prototype;
            const origEntities = Object.getOwnPropertyDescriptor(metaProto, 'Entities');
            Object.defineProperty(metaProto, 'Entities', {
                get: () => md.Entities,
                configurable: true,
            });

            try {
                const event = {
                    type: 'remote-invalidate',
                    entityName: 'Users',
                    payload: {
                        action: 'save',
                        recordData: JSON.stringify({ ID: '1', Name: 'Alice Remote Update' }),
                        primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: '1' }]),
                    },
                };

                await asInternal(cacheManager).HandleRemoteInvalidateEvent(event);

                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached).not.toBeNull();
                expect(cached!.results).toHaveLength(1);
                expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Alice Remote Update');
            } finally {
                if (origEntities) {
                    Object.defineProperty(metaProto, 'Entities', origEntities);
                }
            }
        });

        it('should remove record on remote delete event', async () => {
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '1', Name: 'Alice' }, { ID: '2', Name: 'Bob' }],
                '2024-01-01T00:00:00Z'
            );

            const md = { Entities: [{ Name: 'Users', PrimaryKeys: [{ Name: 'ID' }] }] };
            const originalMetadata = (await import('../generic/metadata')).Metadata;
            const metaProto = originalMetadata.prototype;
            const origEntities = Object.getOwnPropertyDescriptor(metaProto, 'Entities');
            Object.defineProperty(metaProto, 'Entities', {
                get: () => md.Entities,
                configurable: true,
            });

            try {
                const event = {
                    type: 'remote-invalidate',
                    entityName: 'Users',
                    payload: {
                        action: 'delete',
                        primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: '1' }]),
                    },
                };

                await asInternal(cacheManager).HandleRemoteInvalidateEvent(event);

                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached).not.toBeNull();
                expect(cached!.results).toHaveLength(1);
                expect((cached!.results[0] as Record<string, unknown>).ID).toBe('2');
            } finally {
                if (origEntities) {
                    Object.defineProperty(metaProto, 'Entities', origEntities);
                }
            }
        });

        it('should handle composite PK delete via remote event', async () => {
            const fp = 'UserRoles|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UserRoles' } as SetParams,
                [
                    { UserID: 'u1', RoleID: 'r1' },
                    { UserID: 'u1', RoleID: 'r2' },
                ],
                '2024-01-01T00:00:00Z'
            );

            const md = {
                Entities: [{
                    Name: 'UserRoles',
                    PrimaryKeys: [{ Name: 'UserID' }, { Name: 'RoleID' }],
                }],
            };
            const originalMetadata = (await import('../generic/metadata')).Metadata;
            const metaProto = originalMetadata.prototype;
            const origEntities = Object.getOwnPropertyDescriptor(metaProto, 'Entities');
            Object.defineProperty(metaProto, 'Entities', {
                get: () => md.Entities,
                configurable: true,
            });

            try {
                const event = {
                    type: 'remote-invalidate',
                    entityName: 'UserRoles',
                    payload: {
                        action: 'delete',
                        primaryKeyValues: JSON.stringify([
                            { FieldName: 'UserID', Value: 'u1' },
                            { FieldName: 'RoleID', Value: 'r2' },
                        ]),
                    },
                };

                await asInternal(cacheManager).HandleRemoteInvalidateEvent(event);

                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached!.results).toHaveLength(1);
                expect((cached!.results[0] as Record<string, unknown>).RoleID).toBe('r1');
            } finally {
                if (origEntities) {
                    Object.defineProperty(metaProto, 'Entities', origEntities);
                }
            }
        });

        it('should invalidate when entity not found in metadata', async () => {
            const fp = 'Unknown|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Unknown' } as SetParams,
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            const originalMetadata = (await import('../generic/metadata')).Metadata;
            const metaProto = originalMetadata.prototype;
            const origEntities = Object.getOwnPropertyDescriptor(metaProto, 'Entities');
            Object.defineProperty(metaProto, 'Entities', {
                get: () => [],
                configurable: true,
            });

            try {
                const event = {
                    type: 'remote-invalidate',
                    entityName: 'Unknown',
                    payload: { action: 'save', recordData: '{}' },
                };

                await asInternal(cacheManager).HandleRemoteInvalidateEvent(event);

                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached).toBeNull();
            } finally {
                if (origEntities) {
                    Object.defineProperty(metaProto, 'Entities', origEntities);
                }
            }
        });

        it('should invalidate when primaryKeyValues JSON is malformed on delete', async () => {
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            const md = { Entities: [{ Name: 'Users', PrimaryKeys: [{ Name: 'ID' }] }] };
            const originalMetadata = (await import('../generic/metadata')).Metadata;
            const metaProto = originalMetadata.prototype;
            const origEntities = Object.getOwnPropertyDescriptor(metaProto, 'Entities');
            Object.defineProperty(metaProto, 'Entities', {
                get: () => md.Entities,
                configurable: true,
            });

            try {
                const event = {
                    type: 'remote-invalidate',
                    entityName: 'Users',
                    payload: {
                        action: 'delete',
                        primaryKeyValues: 'not-json!!!',
                    },
                };

                await asInternal(cacheManager).HandleRemoteInvalidateEvent(event);

                // Should invalidate since it can't parse the key
                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached).toBeNull();
            } finally {
                if (origEntities) {
                    Object.defineProperty(metaProto, 'Entities', origEntities);
                }
            }
        });

        it('should do nothing when entityName has no cached fingerprints', async () => {
            const md = { Entities: [{ Name: 'Users', PrimaryKeys: [{ Name: 'ID' }] }] };
            const originalMetadata = (await import('../generic/metadata')).Metadata;
            const metaProto = originalMetadata.prototype;
            const origEntities = Object.getOwnPropertyDescriptor(metaProto, 'Entities');
            Object.defineProperty(metaProto, 'Entities', {
                get: () => md.Entities,
                configurable: true,
            });

            try {
                const event = {
                    type: 'remote-invalidate',
                    entityName: 'Users',
                    payload: {
                        action: 'save',
                        recordData: JSON.stringify({ ID: '1', Name: 'Test' }),
                    },
                };

                // Should not throw
                await asInternal(cacheManager).HandleRemoteInvalidateEvent(event);
            } finally {
                if (origEntities) {
                    Object.defineProperty(metaProto, 'Entities', origEntities);
                }
            }
        });
    });

    // ========================================================================
    // parseCompositeKeyFromJSON helper
    // ========================================================================

    describe('parseCompositeKeyFromJSON', () => {
        it('should parse a single-field key', () => {
            const json = JSON.stringify([{ FieldName: 'ID', Value: 'abc123' }]);
            const key = asInternal(cacheManager).parseCompositeKeyFromJSON(json);
            expect(key).not.toBeNull();
            expect(key!.KeyValuePairs).toHaveLength(1);
            expect(key!.KeyValuePairs[0].FieldName).toBe('ID');
            expect(key!.KeyValuePairs[0].Value).toBe('abc123');
        });

        it('should parse a multi-field key', () => {
            const json = JSON.stringify([
                { FieldName: 'UserID', Value: 'u1' },
                { FieldName: 'RoleID', Value: 'r2' },
            ]);
            const key = asInternal(cacheManager).parseCompositeKeyFromJSON(json);
            expect(key).not.toBeNull();
            expect(key!.KeyValuePairs).toHaveLength(2);
        });

        it('should return null for undefined input', () => {
            const key = asInternal(cacheManager).parseCompositeKeyFromJSON(undefined);
            expect(key).toBeNull();
        });

        it('should return null for empty string', () => {
            const key = asInternal(cacheManager).parseCompositeKeyFromJSON('');
            expect(key).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            const key = asInternal(cacheManager).parseCompositeKeyFromJSON('not-json');
            expect(key).toBeNull();
        });

        it('should return null for empty array', () => {
            const key = asInternal(cacheManager).parseCompositeKeyFromJSON('[]');
            expect(key).toBeNull();
        });
    });

    // ========================================================================
    // buildCompositeKeyFromRow helper
    // ========================================================================

    describe('buildCompositeKeyFromRow', () => {
        it('should build key from single PK field', () => {
            const row = { ID: '42', Name: 'Test' };
            const key = asInternal(cacheManager).buildCompositeKeyFromRow(row, ['ID']);
            expect(key.KeyValuePairs).toHaveLength(1);
            expect(key.KeyValuePairs[0].FieldName).toBe('ID');
            expect(key.KeyValuePairs[0].Value).toBe('42');
        });

        it('should build key from multiple PK fields', () => {
            const row = { UserID: 'u1', RoleID: 'r2', Extra: 'ignored' };
            const key = asInternal(cacheManager).buildCompositeKeyFromRow(row, ['UserID', 'RoleID']);
            expect(key.KeyValuePairs).toHaveLength(2);
            expect(key.KeyValuePairs[0].Value).toBe('u1');
            expect(key.KeyValuePairs[1].Value).toBe('r2');
        });

        it('should handle missing fields as undefined values', () => {
            const row = { UserID: 'u1' };
            const key = asInternal(cacheManager).buildCompositeKeyFromRow(row, ['UserID', 'MissingField']);
            expect(key.KeyValuePairs).toHaveLength(2);
            expect(key.KeyValuePairs[1].Value).toBeUndefined();
        });

        it('should produce consistent ToConcatenatedString output', () => {
            const row = { A: '1', B: '2' };
            const key = asInternal(cacheManager).buildCompositeKeyFromRow(row, ['A', 'B']);
            expect(key.ToConcatenatedString()).toBe('A|1||B|2');
        });
    });
});
