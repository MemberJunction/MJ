/**
 * A tracked save's `FullRecordJSON` is built in the save's statement from `save_result`, the row
 * the save function returned, so it records what the database stored. When `save_result` does not
 * hold the whole row (datestamps-only returns), the payload's in-memory snapshot is bound instead.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { BaseEntity } from '@memberjunction/core';
import type { SaveReturnContext } from '@memberjunction/generic-database-provider';

type Host = {
    WrapSaveCallWithRecordChange: (
        saveSQL: { sql: string; parameters?: unknown[] },
        binding: { kind: string },
        payload: Record<string, unknown>,
        entity: BaseEntity,
        options?: undefined,
        returnContext?: SaveReturnContext,
    ) => { sql: string; parameters?: unknown[] };
};

const FULL_RECORD_FROM_MEMORY = '{"ID":42,"Name":"from memory"}';

const payload = {
    entityID: 'e-1', recordID: '', userID: 'u-1', type: 'Update', source: 'Internal',
    changesJSON: '{"Name":{}}', changesDescription: 'Name changed', fullRecordJSON: FULL_RECORD_FROM_MEMORY,
    restoredFromID: null, restoreReason: null, changeContext: null,
};

function makeHost(): Host {
    const host = Object.create(PostgreSQLDataProvider.prototype) as Record<string, unknown>;
    host._schemaName = '__mj';
    host.buildRecordIDFromCTE = () => `'ID|' || save_result."ID"`;
    return host as unknown as Host;
}

const entity = {
    EntityInfo: {
        Name: 'Widgets', SchemaName: 'app', PrimaryKeys: [{ Name: 'ID' }], TrackRecordChanges: true,
        DatestampReturnFields: [{ Name: 'ID' }, { Name: '__mj_CreatedAt' }, { Name: '__mj_UpdatedAt' }],
        Fields: [
            { Name: 'ID', Type: 'int' },
            { Name: 'Name', Type: 'nvarchar' },
            { Name: 'IsActive', Type: 'bit' },
            { Name: 'RunAt', Type: 'datetime2' },
            { Name: '__mj_UpdatedAt', Type: 'datetimeoffset' },
            { Name: 'DueDate', Type: 'date' },
            { Name: 'StartsAt', Type: 'time' },
            { Name: 'Big', Type: 'bigint' },
            { Name: 'Blob', Type: 'varbinary' },
            { Name: 'Settings', Type: 'jsonb' },
        ],
    },
} as unknown as BaseEntity;

const save = { sql: 'SELECT * FROM app."spUpdateWidget"($1)', parameters: ['w'] };

function returnContext(overrides: Partial<SaveReturnContext> = {}): SaveReturnContext {
    return {
        spReturnMode: 'full', effectiveReturnMode: 'full', spReturnsDatestampsOnly: false, needsDatestampProjection: false,
        datestampSelectColumnsSQL: '"ID", "__mj_CreatedAt", "__mj_UpdatedAt"', routineSelectColumnsSQL: '*', finalSelectColumnsSQL: '*',
        ...overrides,
    };
}

describe('FullRecordJSON built from save_result on PostgreSQL', () => {
    it('renders the snapshot from the returned row and does not bind the in-memory one', () => {
        const wrapped = makeHost().WrapSaveCallWithRecordChange(save, { kind: 'pg-positional' }, payload, entity, undefined, returnContext());

        expect(wrapped.sql).toContain('(SELECT row_to_json(snapshot_row)::text FROM (SELECT save_result."ID" AS "ID", save_result."Name" AS "Name"');
        expect(wrapped.parameters).not.toContain(FULL_RECORD_FROM_MEMORY);
        // Base parameter, then EntityID, UserID, Type, Source, ChangesJSON, ChangesDescription, RestoredFromID, RestoreReason.
        expect(wrapped.parameters).toEqual(['w', 'e-1', 'u-1', 'Update', 'Internal', '{"Name":{}}', 'Name changed', null, null]);
        expect(wrapped.sql).toContain(`SELECT $2::uuid, 'ID|' || save_result."ID", $3::uuid, $4::varchar, $5::varchar, $6::text, $7::text, (SELECT row_to_json`);
        expect(wrapped.sql).toContain(`'Complete', $8::uuid, $9::text`);
    });

    it('writes each column as a loaded entity serializes it', () => {
        const { sql } = makeHost().WrapSaveCallWithRecordChange(save, { kind: 'pg-positional' }, payload, entity, undefined, returnContext());

        expect(sql).toContain(`save_result."IsActive" AS "IsActive"`);
        expect(sql).toContain(`to_char(save_result."RunAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "RunAt"`);
        expect(sql).toContain(`to_char(save_result."__mj_UpdatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "__mj_UpdatedAt"`);
        expect(sql).toContain(`to_char(save_result."DueDate", 'YYYY-MM-DD') || 'T00:00:00.000Z' AS "DueDate"`);
        expect(sql).toContain(`'1970-01-01T' || to_char(save_result."StartsAt", 'HH24:MI:SS.MS') || 'Z' AS "StartsAt"`);
        expect(sql).toContain(`(save_result."Big")::text AS "Big"`);
        expect(sql).toContain(`translate(encode(save_result."Blob", 'base64'), E'\\n', '') AS "Blob"`);
        expect(sql).toContain(`(save_result."Settings")::text AS "Settings"`);
    });

    it.each([
        ['the compiled function returns datestamps only', { spReturnsDatestampsOnly: true, spReturnMode: 'datestamps_only' as const }],
        ['this call projects the result to datestamps', { needsDatestampProjection: true, effectiveReturnMode: 'datestamps_only' as const }],
    ])('binds the in-memory snapshot when %s', (_label, overrides) => {
        const wrapped = makeHost().WrapSaveCallWithRecordChange(save, { kind: 'pg-positional' }, payload, entity, undefined, returnContext(overrides));

        expect(wrapped.sql).not.toContain('row_to_json');
        expect(wrapped.parameters).toContain(FULL_RECORD_FROM_MEMORY);
        expect(wrapped.sql).toContain('$7::text, $8::text, \'Complete\'');
    });
});
