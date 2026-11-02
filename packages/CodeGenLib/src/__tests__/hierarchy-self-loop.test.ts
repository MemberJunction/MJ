import { describe, it, expect } from 'vitest';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

/**
 * A column cannot be its own hierarchy parent.
 *
 * FK auto-detection matches a `<prefix>_key`-style column to its own table without excluding
 * that table's own primary key, so the key itself can arrive carrying a self-referencing
 * `RelatedEntityID`. Treating that as a hierarchy makes the recursive root-id CTE join the key
 * to itself and select the same column three times, which the database rejects: 15 entities on
 * one Postgres instance failed to compile with `column reference "tea_key" is ambiguous`.
 *
 * Real hierarchies always parent on a DIFFERENT column (ParentID -> ID), so excluding the key
 * costs nothing and is the whole fix.
 */
class TestableSQLCodeGen extends SQLCodeGenBase {
    public Detect(entity: EntityInfo): EntityFieldInfo[] {
        return this.detectRecursiveForeignKeys(entity);
    }
}

const ENTITY_ID = 'A1B2C3D4-0000-4000-8000-000000000001';

function field(over: Partial<EntityFieldInfo>): EntityFieldInfo {
    return {
        Name: 'Unnamed',
        RelatedEntityID: null,
        IsPrimaryKey: false,
        IsVirtual: false,
        IsHierarchy: false,
        ...over
    } as unknown as EntityFieldInfo;
}

function entity(fields: EntityFieldInfo[], primaryKeyCount = 1): EntityInfo {
    return {
        ID: ENTITY_ID,
        Name: 'Team',
        SchemaName: 'netforum',
        Fields: fields,
        PrimaryKeys: Array.from({ length: primaryKeyCount }, () => ({ Name: 'tea_key' }))
    } as unknown as EntityInfo;
}

describe('detectRecursiveForeignKeys — a column is never its own hierarchy parent', () => {
    it('excludes the primary key even when it self-references and is flagged as a hierarchy', () => {
        // The netForum shape: tea_key is the PK, auto-detection pointed it at its own entity,
        // and it carries IsHierarchy. Every other gate passes, so only the PK check can stop it.
        const gen = new TestableSQLCodeGen();
        const result = gen.Detect(
            entity([
                field({ Name: 'tea_key', RelatedEntityID: ENTITY_ID, IsPrimaryKey: true, IsHierarchy: true })
            ])
        );
        expect(result).toEqual([]);
    });

    it('still detects a genuine hierarchy parented on a non-key column', () => {
        // The guard must not cost us real hierarchies — this is the case the feature exists for.
        const gen = new TestableSQLCodeGen();
        const result = gen.Detect(
            entity([
                field({ Name: 'tea_key', IsPrimaryKey: true }),
                field({ Name: 'ParentTeamID', RelatedEntityID: ENTITY_ID, IsHierarchy: true })
            ])
        );
        expect(result.map(f => f.Name)).toEqual(['ParentTeamID']);
    });

    it('keeps the real hierarchy and drops the self-loop when an entity has both', () => {
        const gen = new TestableSQLCodeGen();
        const result = gen.Detect(
            entity([
                field({ Name: 'tea_key', RelatedEntityID: ENTITY_ID, IsPrimaryKey: true, IsHierarchy: true }),
                field({ Name: 'ParentTeamID', RelatedEntityID: ENTITY_ID, IsHierarchy: true })
            ])
        );
        expect(result.map(f => f.Name)).toEqual(['ParentTeamID']);
    });

    it('does not rely on the multi-PK guard to catch the self-loop', () => {
        // The pre-existing multi-primary-key warning returns [] for a different reason. With a
        // single PK — the netForum case — that guard never fires, so it cannot mask a regression
        // of the fix under test.
        const gen = new TestableSQLCodeGen();
        const selfLoopOnly = entity([
            field({ Name: 'tea_key', RelatedEntityID: ENTITY_ID, IsPrimaryKey: true, IsHierarchy: true })
        ]);
        expect(selfLoopOnly.PrimaryKeys.length).toBe(1);
        expect(gen.Detect(selfLoopOnly)).toEqual([]);
    });
});
