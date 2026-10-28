/**
 * Describing a statement on PostgreSQL (statementDescription.ts): the wrapper the statement runs
 * in, the catalog lookup's parameters, and the row description mapped to MJ's description.
 */
import { describe, it, expect } from 'vitest';
import { TypedQueryParameter } from '@memberjunction/generic-database-provider';
import {
    DescribeCatalogParameters, DescribeWrapperSQL, MapPostgreSQLDescribeFields,
    type PostgreSQLDescribeCatalogRow, type PostgreSQLFieldDescription,
} from '../statementDescription.js';
import { PGQueryParameterProcessor } from '../queryParameterProcessor.js';

const fields: PostgreSQLFieldDescription[] = [
    { Name: 'ID', TableID: 16401, ColumnID: 1, DataTypeID: 2950, DataTypeModifier: -1 },
    { Name: 'memberid', TableID: 16401, ColumnID: 3, DataTypeID: 1043, DataTypeModifier: 104 },
    { Name: 'total', TableID: 0, ColumnID: 0, DataTypeID: 1700, DataTypeModifier: -1 },
];

const catalog: PostgreSQLDescribeCatalogRow[] = [
    { SchemaName: 'crm', RelationName: 'vwMembers', ColumnName: 'ID', FullType: 'uuid', BaseType: 'uuid', IsGenerated: false },
    { SchemaName: 'crm', RelationName: 'vwMembers', ColumnName: 'MemberID', FullType: 'character varying(100)', BaseType: 'character varying', IsGenerated: false },
    { SchemaName: null, RelationName: null, ColumnName: null, FullType: 'numeric', BaseType: 'numeric', IsGenerated: false },
];

describe('PostgreSQL statement description', () => {
    it('wraps the statement so it returns no rows, dropping a trailing semicolon', () => {
        expect(DescribeWrapperSQL('SELECT 1;  ')).toBe('SELECT * FROM (SELECT 1\n) _q LIMIT 0');
        expect(DescribeWrapperSQL('SELECT 1 -- note')).toBe('SELECT * FROM (SELECT 1 -- note\n) _q LIMIT 0');
    });

    it('passes the table, column and type numbers aligned, for one catalog lookup', () => {
        expect(DescribeCatalogParameters(fields)).toEqual([[16401, 16401, 0], [1, 3, 0], [2950, 1043, 1700], [-1, 104, -1]]);
    });

    it('maps names as the client receives them, exact types, sources, and no nullability', () => {
        const result = MapPostgreSQLDescribeFields(fields, catalog);
        expect(result.Success).toBe(true);
        expect(result.Columns).toEqual([
            { Name: 'ID', Ordinal: 1, SQLBaseType: 'uuid', SQLFullType: 'uuid', IsNullable: null, IsComputed: false, Source: { Schema: 'crm', Object: 'vwMembers', Column: 'ID' } },
            { Name: 'memberid', Ordinal: 2, SQLBaseType: 'character varying', SQLFullType: 'character varying(100)', IsNullable: null, IsComputed: false, Source: { Schema: 'crm', Object: 'vwMembers', Column: 'MemberID' } },
            { Name: 'total', Ordinal: 3, SQLBaseType: 'numeric', SQLFullType: 'numeric', IsNullable: null, IsComputed: true, Source: null },
        ]);
    });

    it('marks a generated source column as computed', () => {
        const result = MapPostgreSQLDescribeFields([fields[0]], [{ ...catalog[0], IsGenerated: true }]);
        expect(result.Columns[0].IsComputed).toBe(true);
    });

    it('binds a typed parameter by position, with its value', () => {
        expect(PGQueryParameterProcessor.ProcessParameters([new TypedQueryParameter('$1', 'boolean', true), new TypedQueryParameter('$2', 'timestamp', new Date('2026-01-02T03:04:05Z'))]))
            .toEqual([true, '2026-01-02T03:04:05.000Z']);
    });
});
