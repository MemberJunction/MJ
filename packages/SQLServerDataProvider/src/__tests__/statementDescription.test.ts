/**
 * Describing a statement on SQL Server (statementDescription.ts) and binding typed parameters
 * (typedParameters.ts): the rows of `sys.dm_exec_describe_first_result_set` mapped to MJ's
 * description, and each SQL type mapped to its `mssql` driver type.
 *
 * Uses the real `mssql` module: the types under test are the driver's own.
 */
import { describe, it, expect } from 'vitest';
import sql from 'mssql';
import { TypedQueryParameter } from '@memberjunction/generic-database-provider';
import { MapSQLServerDescribeRows, type SQLServerDescribeRow } from '../statementDescription';
import { BindTypedParameters, MssqlTypeFor } from '../typedParameters';

function row(over: Partial<SQLServerDescribeRow>): SQLServerDescribeRow {
    return {
        ColumnOrdinal: 1, Name: 'ID', IsHidden: false, IsNullable: false, SystemTypeName: 'uniqueidentifier',
        SourceSchema: null, SourceTable: null, SourceColumn: null, IsComputedColumn: false,
        ErrorNumber: null, ErrorMessage: null, ErrorTypeDesc: null, ...over,
    };
}

describe('MapSQLServerDescribeRows', () => {
    it('maps names, order, types, nullability and the view column a pass-through column comes from', () => {
        const result = MapSQLServerDescribeRows([
            row({ ColumnOrdinal: 1, Name: 'ID', SourceSchema: 'crm', SourceTable: 'vwMembers', SourceColumn: 'ID' }),
            row({ ColumnOrdinal: 2, Name: 'Total', IsNullable: true, SystemTypeName: 'decimal(38,3)' }),
            row({ ColumnOrdinal: 3, Name: 'Upper', SystemTypeName: 'nvarchar(100)', SourceSchema: 'crm', SourceTable: 'vwMembers', SourceColumn: 'NameUpper', IsComputedColumn: true }),
        ]);
        expect(result.Success).toBe(true);
        expect(result.Columns).toEqual([
            { Name: 'ID', Ordinal: 1, SQLBaseType: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', IsNullable: false, IsComputed: false, Source: { Schema: 'crm', Object: 'vwMembers', Column: 'ID' } },
            { Name: 'Total', Ordinal: 2, SQLBaseType: 'decimal', SQLFullType: 'decimal(38,3)', IsNullable: true, IsComputed: true, Source: null },
            { Name: 'Upper', Ordinal: 3, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)', IsNullable: false, IsComputed: true, Source: { Schema: 'crm', Object: 'vwMembers', Column: 'NameUpper' } },
        ]);
    });

    it('drops the hidden ROWSTAT column mode 2 adds', () => {
        const result = MapSQLServerDescribeRows([row({ Name: 'ID' }), row({ ColumnOrdinal: 2, Name: 'ROWSTAT', IsHidden: true })]);
        expect(result.Columns.map(c => c.Name)).toEqual(['ID']);
    });

    it('reports the server\'s error text when the statement cannot be described', () => {
        const result = MapSQLServerDescribeRows([row({ ColumnOrdinal: null, Name: null, ErrorNumber: 208, ErrorTypeDesc: 'INVALID_OBJECT', ErrorMessage: "Invalid object Name 'vwNope'." })]);
        expect(result).toEqual({ Success: false, Columns: [], Diagnostics: ["208 INVALID_OBJECT: Invalid object Name 'vwNope'."] });
    });

    it('describes an unnamed column with an empty Name, and no rows as no columns', () => {
        expect(MapSQLServerDescribeRows([row({ Name: null, SystemTypeName: 'int' })]).Columns[0].Name).toBe('');
        expect(MapSQLServerDescribeRows([])).toEqual({ Success: true, Columns: [], Diagnostics: [] });
    });
});

describe('MssqlTypeFor', () => {
    it('maps character types with their length, max included', () => {
        expect(MssqlTypeFor('varchar(50)')).toMatchObject({ type: sql.VarChar, length: 50 });
        expect(MssqlTypeFor('nvarchar(max)')).toMatchObject({ type: sql.NVarChar, length: sql.MAX });
        expect(MssqlTypeFor('NCHAR(3)')).toMatchObject({ type: sql.NChar, length: 3 });
    });

    it('maps numeric, date and other types with their precision and scale', () => {
        expect(MssqlTypeFor('decimal(18,2)')).toMatchObject({ type: sql.Decimal, precision: 18, scale: 2 });
        expect(MssqlTypeFor('datetime2(7)')).toMatchObject({ type: sql.DateTime2, scale: 7 });
        expect(MssqlTypeFor('int')).toMatchObject({ type: sql.Int });
        expect(MssqlTypeFor('bit')).toMatchObject({ type: sql.Bit });
        expect(MssqlTypeFor('uniqueidentifier')).toMatchObject({ type: sql.UniqueIdentifier });
    });

    it('knows nothing it cannot Name', () => {
        expect(MssqlTypeFor('geography')).toBeNull();
        expect(MssqlTypeFor('varchar(50); DROP TABLE x')).toBeNull();
    });

    it('allows whitespace around the name and its arguments', () => {
        expect(MssqlTypeFor('  decimal ( 18 , 2 )  ')).toMatchObject({ type: sql.Decimal, precision: 18, scale: 2 });
        expect(MssqlTypeFor('\tint\n')).toMatchObject({ type: sql.Int });
    });

    it('refuses a long malformed type string in linear time', () => {
        const started = Date.now();
        expect(MssqlTypeFor('A(' + '\t'.repeat(100_000) + 'x')).toBeNull();
        expect(MssqlTypeFor('A' + '\t'.repeat(100_000) + 'x')).toBeNull();
        expect(Date.now() - started).toBeLessThan(500);
    });
});

describe('BindTypedParameters', () => {
    it('adds each parameter as a named input declared with its type; booleans bind as BIT 1/0', () => {
        const inputs: Array<[string, unknown, unknown]> = [];
        const request = { input: (Name: string, type: unknown, value: unknown) => { inputs.push([Name, type, value]); } } as unknown as sql.Request;
        BindTypedParameters(request, [new TypedQueryParameter('mj_p0', 'varchar(20)', 'Open'), new TypedQueryParameter('mj_p1', 'bit', true)]);
        expect(inputs.map(([Name, , value]) => [Name, value])).toEqual([['mj_p0', 'Open'], ['mj_p1', 1]]);
        expect(inputs[0][1]).toMatchObject({ type: sql.VarChar, length: 20 });
    });

    it('refuses a parameter whose type it does not know', () => {
        const request = { input: () => undefined } as unknown as sql.Request;
        expect(() => BindTypedParameters(request, [new TypedQueryParameter('mj_p0', 'geography', 'x')])).toThrow(/does not know/);
    });
});
