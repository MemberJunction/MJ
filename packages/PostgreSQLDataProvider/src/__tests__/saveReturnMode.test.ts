/**
 * PostgreSQLDataProvider.WrapSaveCallForResult — SaveReturnMode ('full' vs 'datestamps_only')
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { BaseEntity, EntitySaveOptions, RecordChangePayload } from '@memberjunction/core';
import type { SaveCallBinding, SaveSQLFragment, SaveReturnContext } from '@memberjunction/generic-database-provider';

type Host = {
    WrapSaveCallForResult: (
        binding: SaveCallBinding,
        entity: BaseEntity,
        spName: string,
        options?: EntitySaveOptions,
        returnContext?: SaveReturnContext,
    ) => SaveSQLFragment;
    ProjectSaveCallToDatestamps: (
        binding: SaveCallBinding,
        entity: BaseEntity,
        spName: string,
        returnContext: SaveReturnContext,
    ) => SaveSQLFragment;
    WrapSaveCallWithRecordChange: (
        saveSQL: SaveSQLFragment,
        binding: SaveCallBinding,
        payload: RecordChangePayload,
        entity: BaseEntity,
        options?: EntitySaveOptions,
        returnContext?: SaveReturnContext,
    ) => SaveSQLFragment;
    buildRecordIDFromCTE: (entityInfo: BaseEntity['EntityInfo'], cteName: string) => string;
    _schemaName: string;
};

function makeHost(): Host {
    const host = Object.create(PostgreSQLDataProvider.prototype) as Host;
    host._schemaName = '__mj';
    return host;
}

function makeEntity(saveReturnMode: 'full' | 'datestamps_only'): BaseEntity {
    const datestampFields = [
        { Name: 'ID', CodeName: 'ID', IsPrimaryKey: true },
        { Name: '__mj_CreatedAt', CodeName: '__mj_CreatedAt', IsPrimaryKey: false },
        { Name: '__mj_UpdatedAt', CodeName: '__mj_UpdatedAt', IsPrimaryKey: false },
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

    it('WrapSaveCallWithRecordChange projects finalSelectColumnsSQL from save_result when effectiveReturnMode is datestamps_only', () => {
        const entity = makeEntity('full');
        const saveOpts = { SaveReturnMode: 'datestamps_only' } as EntitySaveOptions;
        const host = makeHost();
        const saveSQL = host.WrapSaveCallForResult(binding, entity, 'spUpdateWidget', saveOpts);
        const payload: RecordChangePayload = {
            entityID: 'ent-1',
            recordID: 'ID|uuid-1',
            userID: 'usr-1',
            type: 'Update',
            source: 'Internal',
            changesJSON: '{"Name":{"oldValue":"A","newValue":"B"}}',
            changesDescription: 'Name changed',
            fullRecordJSON: '{"ID":"uuid-1","Name":"B"}',
            restoredFromID: null,
            restoreReason: null,
        };
        const wrapped = host.WrapSaveCallWithRecordChange(saveSQL, binding, payload, entity, saveOpts);
        expect(wrapped.sql).toContain('SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM "__mj"."spUpdateWidget"(p_id => $1, p_name => $2)');
        expect(wrapped.sql.trim().endsWith('SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM save_result')).toBe(true);
    });
});
