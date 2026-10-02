/**
 * `RecordChange.ChangeContext` is named only when a write carries a change context (clones).
 * Until the PostgreSQL migration adds the column, naming it on every tracked write would fail
 * every tracked save and delete, not just clones.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { BaseEntity, UserInfo } from '@memberjunction/core';

type Host = {
    GenerateDeleteSQL: (e: BaseEntity, u: UserInfo) => { fullSQL: string; parameters: unknown[] };
    WrapSaveCallWithRecordChange: (
        saveSQL: { sql: string; parameters?: unknown[] },
        binding: { kind: string },
        payload: Record<string, unknown>,
        entity: BaseEntity
    ) => { sql: string; parameters?: unknown[] };
};

const basePayload = {
    entityID: 'e-1', recordID: 'ID|42', userID: 'u-1', type: 'Create', source: 'Internal',
    changesJSON: '{}', changesDescription: '', fullRecordJSON: '{}', restoredFromID: null, restoreReason: null,
};

function makeHost(changeContext: string | null): Host {
    const host = Object.create(PostgreSQLDataProvider.prototype) as Record<string, unknown>;
    host._schemaName = '__mj';
    host.ShouldTrackRecordChanges = () => true;
    host.buildRecordIDFromEntity = () => 'ID|42';
    host.buildRecordIDFromCTE = () => `'42'`;
    host.BuildRecordChangePayload = () => ({ ...basePayload, changeContext });
    return host as unknown as Host;
}

const entity = {
    EntityInfo: { Name: 'Widgets', SchemaName: 'app', ClassName: 'Widgets', BaseTableCodeName: 'Widget', PrimaryKeys: [{ Name: 'ID' }], TrackRecordChanges: true },
    Get: () => 42,
    GetAll: () => ({ ID: 42 }),
    RestoreContext: null,
} as unknown as BaseEntity;
const user = { ID: 'u-1' } as UserInfo;
const save = { sql: 'SELECT * FROM app."spCreateWidget"($1)', parameters: ['w'] };

describe('RecordChange.ChangeContext on PostgreSQL', () => {
    it('leaves the column out of an ordinary save and delete', () => {
        const saved = makeHost(null).WrapSaveCallWithRecordChange(save, { kind: 'pg-positional' }, { ...basePayload, changeContext: null }, entity);
        expect(saved.sql).not.toContain('ChangeContext');
        expect(saved.parameters).toHaveLength(1 + 9);

        const deleted = makeHost(null).GenerateDeleteSQL(entity, user);
        expect(deleted.fullSQL).not.toContain('ChangeContext');
    });

    it('names the column and binds the context for a clone', () => {
        const ctx = '{"Kind":"Clone"}';
        const saved = makeHost(ctx).WrapSaveCallWithRecordChange(save, { kind: 'pg-positional' }, { ...basePayload, changeContext: ctx }, entity);
        expect(saved.sql).toContain('"RestoreReason", "ChangeContext")');
        expect(saved.sql).toContain('$11::text');
        expect(saved.parameters?.at(-1)).toBe(ctx);

        const deleted = makeHost(ctx).GenerateDeleteSQL(entity, user);
        expect(deleted.fullSQL).toContain('"ChangeContext"');
        expect(deleted.parameters.at(-1)).toBe(ctx);
    });
});
