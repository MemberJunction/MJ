/**
 * ExtractEntityMetadataFromSQL must read column references with the dialect of the platform the
 * query runs on, so PostgreSQL-only syntax still yields the referenced fields.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { ExtractEntityMetadataFromSQL } from '../custom/query-extraction/resolve';

const members = new EntityInfo({
    ID: 'entity-members',
    Name: 'Members',
    SchemaName: 'CRM',
    BaseTable: 'Member',
    BaseView: 'vwMembers',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false },
        { Name: 'Email', Type: 'nvarchar', IsPrimaryKey: false },
        { Name: 'Phone', Type: 'nvarchar', IsPrimaryKey: false }
    ]
});
const md = { Entities: [members] };
const tableRefs = [{ TableName: 'vwMembers', SchemaName: 'CRM', Alias: 'm' }];

describe('ExtractEntityMetadataFromSQL dialect', () => {
    it('finds the fields a PostgreSQL query references', () => {
        const sql = 'SELECT m."Name", m."Email"::text AS email FROM "CRM"."vwMembers" m ORDER BY m."Name" LIMIT 5';
        const result = ExtractEntityMetadataFromSQL(sql, tableRefs, md, 'postgresql');
        expect(result).toHaveLength(1);
        expect(result[0].fields.map(f => f.name).sort()).toEqual(['Email', 'ID', 'Name']);
    });

    it('still reads SQL Server syntax by default', () => {
        const sql = 'SELECT TOP 5 m.[Name], m.Email FROM CRM.vwMembers m';
        const result = ExtractEntityMetadataFromSQL(sql, tableRefs, md);
        expect(result[0].fields.map(f => f.name).sort()).toEqual(['Email', 'ID', 'Name']);
    });
});
