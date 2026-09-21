import { describe, it, expect, vi } from 'vitest';
import { canonicalJSONStringify, deepEqualJSON } from '../Misc/util';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { FieldCategoryInfo } from '@memberjunction/core';

class TestableManageMetadata extends ManageMetadataBase {
    public executedSQL: Array<{ sql: string; description: string }> = [];
    public mockSettings: Map<string, string> = new Map(); // key = setting Name -> stored Value

    protected get dialect() {
        return new SQLServerDialect();
    }

    protected override async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
        // Mock check query for EntitySetting
        if (sql.includes("'FieldCategoryInfo'")) {
            const val = this.mockSettings.get('FieldCategoryInfo');
            if (val !== undefined) {
                return { recordset: [{ ID: 'setting-1', Value: val }] } as CodeGenQueryResult;
            }
            return { recordset: [] } as CodeGenQueryResult;
        }
        if (sql.includes("'FieldCategoryIcons'")) {
            const val = this.mockSettings.get('FieldCategoryIcons');
            if (val !== undefined) {
                return { recordset: [{ ID: 'setting-2', Value: val }] } as CodeGenQueryResult;
            }
            return { recordset: [] } as CodeGenQueryResult;
        }
        return { recordset: [] } as CodeGenQueryResult;
    }

    public override async LogSQLAndExecute(_pool: CodeGenConnection, sql: string, description: string): Promise<void> {
        this.executedSQL.push({ sql: sql.trim(), description });
    }

    public async callApplyCategoryInfoSettings(entityId: string, info: Record<string, FieldCategoryInfo>) {
        return this.applyCategoryInfoSettings({} as CodeGenConnection, entityId, info);
    }
}

describe('category-info-canonical (T7)', () => {
    describe('canonicalJSONStringify & deepEqualJSON', () => {
        it('sorts keys recursively and produces identical strings across different insertion orders', () => {
            const obj1 = { z: 1, a: { y: 2, b: 3 }, m: [ { beta: 2, alpha: 1 } ] };
            const obj2 = { a: { b: 3, y: 2 }, m: [ { alpha: 1, beta: 2 } ], z: 1 };

            const str1 = canonicalJSONStringify(obj1, 2);
            const str2 = canonicalJSONStringify(obj2, 2);

            expect(str1).toBe(str2);
            // Verify keys are alphabetically sorted in JSON
            expect(Object.keys(JSON.parse(str1))).toEqual(['a', 'm', 'z']);
            expect(Object.keys(JSON.parse(str1).a)).toEqual(['b', 'y']);
            expect(Object.keys(JSON.parse(str1).m[0])).toEqual(['alpha', 'beta']);
        });

        it('deepEqualJSON accurately tests structural equality regardless of key order', () => {
            const obj1 = { foo: 'bar', baz: 123, nested: { x: true, y: false } };
            const obj2 = { nested: { y: false, x: true }, baz: 123, foo: 'bar' };
            const obj3 = { nested: { y: true, x: true }, baz: 123, foo: 'bar' };

            expect(deepEqualJSON(obj1, obj2)).toBe(true);
            expect(deepEqualJSON(obj1, obj3)).toBe(false);
            expect(deepEqualJSON(null, null)).toBe(true);
            expect(deepEqualJSON(null, {})).toBe(false);
        });
    });

    describe('applyCategoryInfoSettings compare-before-write', () => {
        it('emits nothing when stored value is semantically equal (even with different key order)', async () => {
            const mm = new TestableManageMetadata();

            const currentInfo: Record<string, FieldCategoryInfo> = {
                General: { icon: 'fa-user', description: 'General fields' },
                System: { icon: 'fa-cog', description: 'System fields' },
            };

            // Database stores non-canonical key order
            const storedRaw = JSON.stringify({
                System: { description: 'System fields', icon: 'fa-cog' },
                General: { description: 'General fields', icon: 'fa-user' },
            });
            const storedIconsRaw = JSON.stringify({
                System: 'fa-cog',
                General: 'fa-user',
            });

            mm.mockSettings.set('FieldCategoryInfo', storedRaw);
            mm.mockSettings.set('FieldCategoryIcons', storedIconsRaw);

            await mm.callApplyCategoryInfoSettings('entity-001', currentInfo);

            // Zero SQL updates should have been logged or executed!
            expect(mm.executedSQL).toHaveLength(0);
        });

        it('emits UPDATE with canonical string when proposed value differs from stored', async () => {
            const mm = new TestableManageMetadata();

            const currentInfo: Record<string, FieldCategoryInfo> = {
                General: { icon: 'fa-user-new', description: 'Updated general' },
            };

            mm.mockSettings.set('FieldCategoryInfo', JSON.stringify({
                General: { icon: 'fa-user-old', description: 'Old general' }
            }));
            mm.mockSettings.set('FieldCategoryIcons', JSON.stringify({
                General: 'fa-user-old'
            }));

            await mm.callApplyCategoryInfoSettings('entity-001', currentInfo);

            expect(mm.executedSQL.length).toBe(2);
            expect(mm.executedSQL[0].sql).toContain('UPDATE');
            expect(mm.executedSQL[0].sql).toContain('FieldCategoryInfo');
            expect(mm.executedSQL[0].sql).toContain('fa-user-new');

            expect(mm.executedSQL[1].sql).toContain('UPDATE');
            expect(mm.executedSQL[1].sql).toContain('FieldCategoryIcons');
            expect(mm.executedSQL[1].sql).toContain('fa-user-new');
        });

        it('emits INSERT when no setting row exists in DB', async () => {
            const mm = new TestableManageMetadata();

            const currentInfo: Record<string, FieldCategoryInfo> = {
                General: { icon: 'fa-user', description: 'General fields' },
            };

            await mm.callApplyCategoryInfoSettings('entity-001', currentInfo);

            expect(mm.executedSQL.length).toBe(2);
            expect(mm.executedSQL[0].sql).toContain('INSERT INTO');
            expect(mm.executedSQL[0].sql).toContain('FieldCategoryInfo');
            expect(mm.executedSQL[1].sql).toContain('INSERT INTO');
            expect(mm.executedSQL[1].sql).toContain('FieldCategoryIcons');
        });
    });
});
