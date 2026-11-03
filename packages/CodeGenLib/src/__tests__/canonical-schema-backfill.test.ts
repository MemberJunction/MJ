/**
 * CanonicalSchemaName backfill (#5641): Open App records first, then the mj.config
 * `canonicalSchemaNames` map; never overwrites, case-insensitive, honors excluded schemas.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import {
    ResolveCanonicalSchemaNames,
    BuildCanonicalSchemaCandidatesSQL,
    BuildCanonicalSchemaUpdateSQL,
    BuildOpenAppSchemaNamesSQL,
} from '../Database/canonical-schema-backfill';

const rows = [
    { ID: 'a1', SchemaName: '__mj_bizappscommon' },
    { ID: 'b2', SchemaName: 'crm' },
    { ID: 'c3', SchemaName: 'staging' },
    { ID: 'd4', SchemaName: 'other' },
];

describe('ResolveCanonicalSchemaNames', () => {
    it('fills from the Open App record, then from the declared map', () => {
        const r = ResolveCanonicalSchemaNames(rows, ['__mj_BizAppsCommon'], { CRM: 'CRM' }, []);
        expect(r.Assignments).toEqual([
            { ID: 'a1', SchemaName: '__mj_bizappscommon', CanonicalSchemaName: '__mj_BizAppsCommon', Source: 'OpenApp' },
            { ID: 'b2', SchemaName: 'crm', CanonicalSchemaName: 'CRM', Source: 'Config' },
        ]);
        expect(r.Ignored).toEqual([]);
    });

    it('lets the Open App record win over a declared name for the same schema', () => {
        const r = ResolveCanonicalSchemaNames(rows, ['__mj_BizAppsCommon'], { __mj_bizappscommon: '__MJ_BIZAPPSCOMMON' }, []);
        expect(r.Assignments).toHaveLength(1);
        expect(r.Assignments[0]).toMatchObject({ CanonicalSchemaName: '__mj_BizAppsCommon', Source: 'OpenApp' });
    });

    it('ignores a declared value that is a different name, and reports it', () => {
        const r = ResolveCanonicalSchemaNames(rows, [], { crm: 'Sales' }, []);
        expect(r.Assignments).toEqual([]);
        expect(r.Ignored).toHaveLength(1);
        expect(r.Ignored[0]).toContain("canonicalSchemaNames['crm']");
    });

    it('skips excluded schemas, case-insensitively', () => {
        const r = ResolveCanonicalSchemaNames(rows, [], { staging: 'Staging', CRM: 'CRM' }, ['STAGING', 'crm']);
        expect(r.Assignments).toEqual([]);
    });

    it('does nothing with no sources (only NULL rows are ever candidates)', () => {
        expect(ResolveCanonicalSchemaNames(rows, [], undefined, []).Assignments).toEqual([]);
        expect(ResolveCanonicalSchemaNames([], ['X'], { x: 'X' }, []).Assignments).toEqual([]);
    });
});

describe('canonical schema SQL', () => {
    const assignment = { ID: 'b2', SchemaName: 'crm', CanonicalSchemaName: "C'RM", Source: 'Config' as const };

    it('PostgreSQL: quoted identifiers, NULL guard, escaped literal', () => {
        const d = new PostgreSQLDialect();
        const candidates = BuildCanonicalSchemaCandidatesSQL(d, '__mj');
        expect(candidates).toMatch(/^SELECT "ID", "SchemaName" FROM .*"SchemaInfo" WHERE "CanonicalSchemaName" IS NULL$/);
        const sql = BuildCanonicalSchemaUpdateSQL(d, '__mj', assignment);
        expect(sql).toContain(`SET "CanonicalSchemaName" = 'C''RM'`);
        expect(sql).toContain(`WHERE "ID" = 'b2' AND "CanonicalSchemaName" IS NULL`);
        expect(BuildOpenAppSchemaNamesSQL(d, '__mj')).toContain('"SchemaName" IS NOT NULL');
    });

    it('SQL Server: bracketed identifiers, NULL guard', () => {
        const d = new SQLServerDialect();
        const sql = BuildCanonicalSchemaUpdateSQL(d, '__mj', assignment);
        expect(sql).toContain('UPDATE [__mj].[SchemaInfo] SET [CanonicalSchemaName] = ');
        expect(sql).toContain("[ID] = 'b2' AND [CanonicalSchemaName] IS NULL");
    });
});
