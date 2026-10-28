/**
 * The PG delete builder records the full-width delete snapshot.
 *
 * A restricted user's entity object never holds the fields they cannot read, and a deleted
 * record is restored from its delete Record Change's `FullRecordJSON`. `Delete()` reads the
 * stored row when the object is narrower than the entity; the delete SQL builder must record
 * that snapshot, not the object's own narrower values.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { BaseEntity, UserInfo, EntityDeleteOptions } from '@memberjunction/core';

type Host = {
    GenerateDeleteSQL: (e: BaseEntity, u: UserInfo, o?: EntityDeleteOptions) => { fullSQL: string };
};

const FULL_SNAPSHOT = { ID: 42, Name: 'Ada', Salary: 123456 };

function makeHost(captured: Record<string, unknown> | null): { host: Host; payloadOldData: () => Record<string, unknown> | null } {
    let seenOldData: Record<string, unknown> | null = null;
    const host = Object.create(PostgreSQLDataProvider.prototype) as Record<string, unknown>;
    host.ShouldTrackRecordChanges = () => true;
    host.buildRecordIDFromEntity = () => 'ID|42';
    host.RecordChangeDeleteSnapshot = (_e: BaseEntity, narrow: Record<string, unknown>) => captured ?? narrow;
    host.BuildRecordChangePayload = (_newData: unknown, oldData: Record<string, unknown>) => {
        seenOldData = oldData;
        return { entityID: 'e-1', recordID: 'ID|42', userID: 'u-1', source: null, fullRecordJSON: '{}', restoredFromID: null, restoreReason: null };
    };
    return { host: host as unknown as Host, payloadOldData: () => seenOldData };
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
    GetAll: () => ({ ID: 42, Name: 'Ada' }), // the restricted deleter never held Salary
    RestoreContext: null,
} as unknown as BaseEntity;
const user = { ID: 'u-1' } as UserInfo;

describe('PG GenerateDeleteSQL — delete Record Change snapshot', () => {
    it('records the full-width snapshot Delete() captured', () => {
        const { host, payloadOldData } = makeHost(FULL_SNAPSHOT);
        host.GenerateDeleteSQL(entity, user);
        expect(payloadOldData()).toEqual(FULL_SNAPSHOT);
    });

    it("records the object's OLD values, as SQL Server does, when the object was edited before the delete", () => {
        const edited = {
            ...(entity as unknown as Record<string, unknown>),
            GetAll: (oldValues?: boolean) => (oldValues ? { ID: 42, Name: 'Ada' } : { ID: 42, Name: 'Edited, never saved' }),
        } as unknown as BaseEntity;
        const { host, payloadOldData } = makeHost(null);
        host.GenerateDeleteSQL(edited, user);
        expect(payloadOldData()).toEqual({ ID: 42, Name: 'Ada' });
    });

    it("records the object's own values when nothing was captured", () => {
        const { host, payloadOldData } = makeHost(null);
        host.GenerateDeleteSQL(entity, user);
        expect(payloadOldData()).toEqual({ ID: 42, Name: 'Ada' });
    });
});
