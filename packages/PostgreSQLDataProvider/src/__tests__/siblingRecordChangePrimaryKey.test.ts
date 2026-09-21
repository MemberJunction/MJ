/**
 * BuildSiblingRecordChangeSQL must address the IS-A sibling row by the entity's REAL primary key
 * column. MJ entities can have any key name; every core entity happens to use `ID`, so a hardcoded
 * `ID` fallback works on the core product and emits SQL against a non-existent column on a customer
 * entity keyed `individual_id`.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { EntityInfo } from '@memberjunction/core';

type Host = {
    BuildSiblingRecordChangeSQL: (varName: string, entityInfo: EntityInfo, changesJSON: string, changesDesc: string, pkValue: string, userId: string) => string;
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
});
