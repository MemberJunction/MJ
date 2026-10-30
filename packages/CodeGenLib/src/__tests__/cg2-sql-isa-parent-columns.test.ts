import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Which parent columns an IS-A child's generated view selects, and the warning for children a run
 * cannot regenerate.
 *
 * - #5899: the child's view joins each parent's BASE TABLE. A persisted computed column (registered
 *   IsVirtual = 1, IsComputed = 1, e.g. People.DisplayName) is on that table and must be selected;
 *   only view-only virtual columns (IsComputed = 0) are skipped.
 * - #4821: a parent app's run adds a column to the parent but cannot regenerate an IS-A child in
 *   another app's schema. The run warns, naming the child, its view and the missing columns.
 */

vi.mock('mssql', () => ({}));
const warnings: string[] = [];
vi.mock('../Misc/status_logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/status_logging')>();
    return { ...actual, LogWarning: (message: string) => { warnings.push(message); } };
});

import { EntityInfo } from '@memberjunction/core';
import {
    SQLCodeGenBase,
    InheritedParentColumns,
    FindOutOfScopeISAChildDrift,
    OutOfScopeISAChildrenWithInScopeParent,
} from '../Database/sql_codegen';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

type FieldSpec = { Name: string; IsPrimaryKey?: boolean; IsVirtual?: boolean; IsComputed?: boolean };

function table(name: string, schema: string, fields: FieldSpec[]): EntityInfo {
    return new EntityInfo({
        ID: `e-${name}`, Name: name, SchemaName: schema, BaseTable: name, BaseTableCodeName: name,
        BaseView: `vw${name}`, IncludeInAPI: true, EntityPermissions: [],
        EntityFields: fields.map((f, i) => ({
            ID: `f-${name}-${i}`, Name: f.Name, Sequence: i + 1, Type: 'nvarchar', Length: 100,
            IsPrimaryKey: !!f.IsPrimaryKey, IsVirtual: !!f.IsVirtual, IsComputed: !!f.IsComputed,
            AllowsNull: true, AllowUpdateAPI: !f.IsVirtual, AutoIncrement: false, DefaultValue: '',
        })),
    });
}

/** A child stand-in: ParentChain is resolved through Metadata on a real EntityInfo. */
function child(name: string, schema: string, chain: EntityInfo[], extra: Partial<Record<'GeneratedViewName', string>> = {}): EntityInfo {
    return {
        Name: name, SchemaName: schema, IsChildType: true, VirtualEntity: false, ExternalDataSourceID: null,
        ParentChain: chain, GeneratedViewName: extra.GeneratedViewName ?? `vw${name}`,
    } as unknown as EntityInfo;
}

const PERSON = table('Person', 'common', [
    { Name: 'ID', IsPrimaryKey: true },
    { Name: 'FirstName' },
    { Name: 'LastName' },
    { Name: 'DisplayName', IsVirtual: true, IsComputed: true },
    { Name: 'PrimaryAddress', IsVirtual: true },
    { Name: '__mj_CreatedAt' },
    { Name: 'SeniorityLevelID' },
]);

describe('InheritedParentColumns (#5899)', () => {
    it('selects base-table columns in field order, including persisted computed columns', () => {
        const cols = InheritedParentColumns(child('Applicant', 'ats', [PERSON]));
        expect(cols.map(c => c.Field.Name)).toEqual(['FirstName', 'LastName', 'DisplayName', 'SeniorityLevelID']);
        expect(cols.every(c => c.Alias === '__mj_isa_p1')).toBe(true);
    });

    it('skips a computed field an ancestor also carries: the ancestor join supplies it', () => {
        // Mid is itself an IS-A child of Person; its DisplayName row mirrors Person's.
        const mid = table('Employee', 'hr', [
            { Name: 'ID', IsPrimaryKey: true },
            { Name: 'BadgeNumber' },
            { Name: 'DisplayName', IsVirtual: true, IsComputed: true },
            { Name: 'FirstName', IsVirtual: true },
        ]);
        const cols = InheritedParentColumns(child('Manager', 'hr', [mid, PERSON]));
        expect(cols.map(c => `${c.Alias}.${c.Field.Name}`)).toEqual([
            '__mj_isa_p1.BadgeNumber',
            '__mj_isa_p2.FirstName',
            '__mj_isa_p2.LastName',
            '__mj_isa_p2.DisplayName',
            '__mj_isa_p2.SeniorityLevelID',
        ]);
    });

    it('returns nothing for an entity that is not an IS-A child', () => {
        expect(InheritedParentColumns({ IsChildType: false, ParentChain: [PERSON] })).toEqual([]);
    });

    it('the generated view selects the computed column from the parent table', () => {
        const gen = new (class extends SQLCodeGenBase {
            public Selects(e: EntityInfo): string {
                return this.generateParentEntityFieldSelects(e);
            }
        })();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const sql = gen.Selects(child('Applicant', 'ats', [PERSON]));
        expect(sql).toContain('__mj_isa_p1.[DisplayName]');
        expect(sql).not.toContain('PrimaryAddress');
        expect(sql).not.toContain('__mj_CreatedAt');
    });
});

describe('out-of-scope IS-A child drift (#4821)', () => {
    const salesContact = child('SalesContact', 'sales', [PERSON], { GeneratedViewName: 'vwSalesContactsGenerated' });
    const inScopeChild = child('Applicant', 'common', [PERSON]);

    beforeEach(() => {
        warnings.length = 0;
    });

    it('considers only excluded-schema children whose parent is in scope', () => {
        const otherApp = table('Vendor', 'billing', [{ Name: 'ID', IsPrimaryKey: true }]);
        const foreignChild = child('VendorContact', 'sales', [otherApp]);
        const found = OutOfScopeISAChildrenWithInScopeParent([salesContact, inScopeChild, foreignChild], ['sales', 'billing']);
        expect(found.map(e => e.Name)).toEqual(['SalesContact']);
    });

    it('reports the parent columns the live view lacks', () => {
        const live = new Map([['sales.vwsalescontactsgenerated', new Set(['id', 'firstname', 'lastname', 'displayname'])]]);
        const drift = FindOutOfScopeISAChildDrift([salesContact], ['sales'], live);
        expect(drift).toEqual([{
            ChildName: 'SalesContact', ChildSchema: 'sales', ViewName: 'vwSalesContactsGenerated', MissingColumns: ['SeniorityLevelID'],
        }]);
    });

    it('skips a view the catalog read did not return instead of reporting every column', () => {
        expect(FindOutOfScopeISAChildDrift([salesContact], ['sales'], new Map())).toEqual([]);
    });

    it('WarnOnOutOfScopeISAChildDrift reads the catalog once and warns per drifted child', async () => {
        const queries: string[] = [];
        const pool = {
            query: async (sql: string): Promise<CodeGenQueryResult> => {
                queries.push(sql);
                return {
                    recordset: ['ID', 'FirstName', 'LastName', 'DisplayName'].map(c => ({
                        TableSchema: 'sales', TableName: 'vwSalesContactsGenerated', ColumnName: c,
                    })),
                } as CodeGenQueryResult;
            },
        } as unknown as CodeGenConnection;
        const gen = new SQLCodeGenBase();

        const drift = await gen.WarnOnOutOfScopeISAChildDrift(pool, [salesContact, inScopeChild], ['sales']);

        expect(queries).toHaveLength(1);
        expect(queries[0]).toContain("TABLE_SCHEMA = 'sales' AND TABLE_NAME = 'vwSalesContactsGenerated'");
        expect(drift).toHaveLength(1);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('SalesContact');
        expect(warnings[0]).toContain('SeniorityLevelID');
    });

    it('never queries when no out-of-scope child exists, and swallows a failed catalog read', async () => {
        const failing = { query: async (): Promise<CodeGenQueryResult> => { throw new Error('boom'); } } as unknown as CodeGenConnection;
        const gen = new SQLCodeGenBase();
        expect(await gen.WarnOnOutOfScopeISAChildDrift(failing, [inScopeChild], ['sales'])).toEqual([]);
        expect(await gen.WarnOnOutOfScopeISAChildDrift(failing, [salesContact], ['sales'])).toEqual([]);
        expect(warnings).toHaveLength(0);
    });
});
