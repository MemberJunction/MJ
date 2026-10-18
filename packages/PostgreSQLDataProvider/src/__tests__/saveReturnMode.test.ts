/**
 * PostgreSQLDataProvider.WrapSaveCallForResult — SaveReturnMode ('full' vs 'datestamps_only')
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import type { SaveCallBinding, SaveSQLFragment } from '@memberjunction/generic-database-provider';

type Host = {
    WrapSaveCallForResult: (
        binding: SaveCallBinding,
        entity: BaseEntity,
        spName: string,
        options?: EntitySaveOptions,
    ) => SaveSQLFragment;
};

function makeHost(): Host {
    return Object.create(PostgreSQLDataProvider.prototype) as Host;
}

function makeEntity(saveReturnMode: 'full' | 'datestamps_only'): BaseEntity {
    const datestampFields = [
        { Name: 'ID', IsPrimaryKey: true },
        { Name: '__mj_CreatedAt', IsPrimaryKey: false },
        { Name: '__mj_UpdatedAt', IsPrimaryKey: false },
    ];
    return {
        EntityInfo: {
            Name: 'Widgets',
            SchemaName: '__mj',
            SaveReturnMode: saveReturnMode,
            DatestampReturnFields: datestampFields,
            PrimaryKeys: [datestampFields[0]],
            Fields: datestampFields,
        },
    } as unknown as BaseEntity;
}

describe('PostgreSQLDataProvider.WrapSaveCallForResult — SaveReturnMode', () => {
    const binding: SaveCallBinding = {
        kind: 'pg-positional',
        callArgsSQL: 'p_id => $1, p_name => $2',
        values: ['uuid-1', 'Widget A'],
    };

    it('emits SELECT * FROM schema.fn(...) when entity SaveReturnMode is full and no per-call override is passed', () => {
        const entity = makeEntity('full');
        const res = makeHost().WrapSaveCallForResult(binding, entity, 'spCreateWidget');
        expect(res.sql).toBe('SELECT * FROM "__mj"."spCreateWidget"(p_id => $1, p_name => $2)');
        expect(res.parameters).toEqual(['uuid-1', 'Widget A']);
    });

    it('projects only PK + timestamp columns when per-call SaveReturnMode is datestamps_only on a full entity', () => {
        const entity = makeEntity('full');
        const res = makeHost().WrapSaveCallForResult(binding, entity, 'spCreateWidget', {
            SaveReturnMode: 'datestamps_only',
        } as EntitySaveOptions);
        expect(res.sql).toBe('SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM "__mj"."spCreateWidget"(p_id => $1, p_name => $2)');
    });

    it('emits SELECT * FROM schema.fn(...) when entity SaveReturnMode is already datestamps_only (function already returns narrow table)', () => {
        const entity = makeEntity('datestamps_only');
        const res = makeHost().WrapSaveCallForResult(binding, entity, 'spCreateWidget');
        expect(res.sql).toBe('SELECT * FROM "__mj"."spCreateWidget"(p_id => $1, p_name => $2)');
    });
});
