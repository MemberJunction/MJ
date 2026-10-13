/**
 * Per-delete Record Change suppression in the PG delete SQL builder.
 *
 * The property: with `SkipRecordChanges`, the generated delete is EXACTLY the plain CRUD
 * function call — no audit CTE wrapped around it — while the same delete without the option
 * still carries the Record Change write. Per-operation, not per-entity: both cases run against
 * the SAME entity with TrackRecordChanges on.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { BaseEntity, UserInfo, EntityDeleteOptions } from '@memberjunction/core';

type Host = {
    GenerateDeleteSQL: (e: BaseEntity, u: UserInfo, o?: EntityDeleteOptions) => { fullSQL: string; simpleSQL?: string };
};

function makeHost(): Host {
    const host = Object.create(PostgreSQLDataProvider.prototype) as Record<string, unknown>;
    // The entity DOES track changes — the suppression must come from the option alone.
    host.ShouldTrackRecordChanges = () => true;
    host.buildRecordIDFromEntity = () => 'ID|42';
    host.BuildRecordChangePayload = () => ({
        entityID: 'e-1', recordID: 'ID|42', userID: 'u-1', source: null,
        fullRecordJSON: '{}', restoredFromID: null, restoreReason: null,
    });
    return host as unknown as Host;
}

const entity = {
    EntityInfo: {
        Name: 'Widgets',
        SchemaName: 'app',
        ClassName: 'Widgets',
        BaseTableCodeName: 'Widget',
        PrimaryKeys: [{ Name: 'ID' }],
        TrackRecordChanges: true,
    },
    Get: () => 42,
    GetAll: () => ({ ID: 42 }),
    RestoreContext: null,
} as unknown as BaseEntity;
const user = { ID: 'u-1' } as UserInfo;

describe('GenerateDeleteSQL — SkipRecordChanges', () => {
    it('without the option, the delete carries the Record Change write', () => {
        const r = makeHost().GenerateDeleteSQL(entity, user);
        expect(r.fullSQL).not.toBe(r.simpleSQL);
        expect(r.fullSQL.toLowerCase()).toContain('delete_result'); // the audit CTE wrapper
    });

    it('with the option, the delete is EXACTLY the plain CRUD call — no audit wrapper', () => {
        const r = makeHost().GenerateDeleteSQL(entity, user, { SkipRecordChanges: true } as EntityDeleteOptions);
        expect(r.fullSQL).toBe(r.simpleSQL ?? r.fullSQL);
        expect(r.fullSQL.toLowerCase()).not.toContain('delete_result');
    });
});
