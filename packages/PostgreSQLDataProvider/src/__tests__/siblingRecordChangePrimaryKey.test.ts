/**
 * BuildSiblingRecordChangeSQL must address the IS-A sibling row by the entity's REAL primary key
 * column. MJ entities can have any key name; every core entity happens to use `ID`, so a hardcoded
 * `ID` fallback works on the core product and emits SQL against a non-existent column on a customer
 * entity keyed `individual_id`.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { CloneContext, EntityInfo, RestoreContext, SyncContext, UserInfo } from '@memberjunction/core';

type Host = {
    BuildSiblingRecordChangeSQL: (
        varName: string,
        entityInfo: EntityInfo,
        changesJSON: string,
        changesDesc: string,
        pkValue: string,
        userId: string,
        source?: 'Internal' | 'Clone' | 'Sync',
        changeContext?: string | null,
        integrationID?: string | null,
    ) => string;
    BuildRecordChangeSQL: (
        newData: Record<string, unknown> | null,
        oldData: Record<string, unknown> | null,
        entityName: string,
        recordID: string,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
        restoreContext?: RestoreContext | null,
        cloneContext?: CloneContext | null,
        syncContext?: SyncContext | null,
    ) => { sql: string; parameters?: unknown[] } | null;
    BuildRecordChangePayload: PostgreSQLDataProvider['BuildRecordChangePayload'];
};

function makeHost(): Host {
    const host = Object.create(PostgreSQLDataProvider.prototype) as Record<string, unknown>;
    host._schemaName = '__mj';
    return host as unknown as Host;
}

function makeEntity(name: string, pkName: string): EntityInfo {
    const pk = { Name: pkName, CodeName: pkName };
    return {
        ID: 'E0000000-0000-0000-0000-000000000001',
        Name: name,
        SchemaName: 'crm',
        BaseView: `vw${name.replace(/\s+/g, '')}`,
        PrimaryKeys: [pk],
        FirstPrimaryKey: pk,
    } as unknown as EntityInfo;
}

describe('BuildSiblingRecordChangeSQL — IS-A sibling read uses the real key column', () => {
    it('uses the entity primary key name, not a hardcoded ID', () => {
        const sql = makeHost().BuildSiblingRecordChangeSQL('@_rc_prop_0', makeEntity('Individuals', 'individual_id'), '{}', 'desc', '42', 'u-1');
        expect(sql).toContain('FROM "crm"."vwIndividuals" r\nWHERE "individual_id" = \'42\'');
        expect(sql).not.toContain('"ID"');
        expect(sql).toContain("'individual_id|42'"); // RecordID segment carries the real key name too
    });

    it('ID-keyed entity is unchanged', () => {
        const sql = makeHost().BuildSiblingRecordChangeSQL('@_rc_prop_0', makeEntity('Widgets', 'ID'), '{}', 'desc', 'abc', 'u-1');
        expect(sql).toContain('FROM "crm"."vwWidgets" r\nWHERE "ID" = \'abc\'');
    });

    it('writes Source=Clone and the escaped ChangeContext on a clone, and leaves the column out otherwise', () => {
        const entity = makeEntity('Widgets', 'ID');
        const context = JSON.stringify({ Version: 1, Kind: 'Clone', Clone: { Reason: "O'Brien's copy" } });

        const clone = makeHost().BuildSiblingRecordChangeSQL('@_rc_prop_0', entity, '{}', 'desc', 'abc', 'u-1', 'Clone', context);
        expect(clone).toContain(', "ChangeContext")');
        expect(clone).toContain("'Clone'");
        expect(clone).toContain("O''Brien''s copy");
        expect(clone).toContain('::text');

        const plain = makeHost().BuildSiblingRecordChangeSQL('@_rc_prop_0', entity, '{}', 'desc', 'abc', 'u-1');
        expect(plain).not.toContain('ChangeContext');
        expect(plain).toContain("'Internal'");
    });

    it('writes Source=Sync, ChangeContext, and IntegrationID on PostgreSQL BuildRecordChangeSQL and BuildSiblingRecordChangeSQL', () => {
        const entity = {
            ...makeEntity('Widgets', 'ID'),
            TrackRecordChanges: true,
            Fields: [
                { Name: 'ID', IsPrimaryKey: true, NeedsQuotes: true },
                { Name: 'Name', IsPrimaryKey: false, NeedsQuotes: true },
            ],
        } as unknown as EntityInfo;

        const syncCtx: SyncContext = {
            OriginDeploymentID: '11111111-1111-4111-8111-111111111111',
            PairingID: 'pair-pg-1',
            RunID: 'run-pg-1',
            OriginChangeIDs: ['chg-pg-1'],
            IntegrationID: '22222222-2222-4222-8222-222222222222',
        };
        const user = { ID: '33333333-3333-4333-8333-333333333333', Name: 'PG Sync', Email: '' } as UserInfo;

        const recordChange = makeHost().BuildRecordChangeSQL(
            { ID: 'w-1', Name: 'Synced' },
            null,
            'Widgets',
            'ID|w-1',
            entity,
            'Create',
            user,
            null,
            null,
            syncCtx,
        );
        expect(recordChange).not.toBeNull();
        expect(recordChange!.sql).toContain(', "ChangeContext", "IntegrationID")');
        expect(recordChange!.sql).toContain('$11::text, $12::uuid');
        expect(recordChange!.parameters).toContain('Sync');
        expect(recordChange!.parameters).toContain('22222222-2222-4222-8222-222222222222');

        const siblingSync = makeHost().BuildSiblingRecordChangeSQL(
            '@_rc_prop_0',
            entity,
            '{}',
            'desc',
            'w-1',
            user.ID,
            'Sync',
            '{"Version":1,"Kind":"Sync"}',
            '22222222-2222-4222-8222-222222222222',
        );
        expect(siblingSync).toContain(', "ChangeContext", "IntegrationID")');
        expect(siblingSync).toContain("'22222222-2222-4222-8222-222222222222'::uuid");
    });
});
