/**
 * Typed save parameters (saveParameters.ts): the driver type each column binds with, the value read
 * back from each literal, and rendering the executed statement back to its literal form.
 *
 * Uses the real `mssql` module: the types under test are the driver's own.
 */
import { describe, it, expect } from 'vitest';
import sql from 'mssql';
import { EntityFieldInfo } from '@memberjunction/core';
import {
  EXECUTED_VARIABLE_SUFFIX,
  IsSaveParameterList,
  QuotedLiteralText,
  RenderSaveSQL,
  SaveParameterCollector,
  SaveParameterFromLiteral,
  SaveParameterType,
  SQLServerSaveParameter,
} from '../saveParameters';

function field(type: string, length = 0, name = 'Col'): EntityFieldInfo {
  return new EntityFieldInfo({ Name: name, Type: type, Length: length, Precision: 18, Scale: 2, AllowsNull: true });
}

/**
 * Every type name SQL Server lists in `sys.types` (2022), plus the 2025 `json` and `vector`.
 * Customers register entities over their own tables, so any of these can reach a save.
 */
const SQL_SERVER_TYPE_NAMES = [
  'bigint', 'binary', 'bit', 'char', 'date', 'datetime', 'datetime2', 'datetimeoffset', 'decimal', 'float',
  'geography', 'geometry', 'hierarchyid', 'image', 'int', 'money', 'nchar', 'ntext', 'numeric', 'nvarchar',
  'real', 'smalldatetime', 'smallint', 'smallmoney', 'sql_variant', 'sysname', 'text', 'time', 'timestamp',
  'tinyint', 'uniqueidentifier', 'varbinary', 'varchar', 'xml', 'json', 'vector',
];

/** Server-generated, never written by a save; asking for their parameter type is a bug. */
const NEVER_WRITTEN = ['timestamp'];

describe('SaveParameterType', () => {
  it.each(SQL_SERVER_TYPE_NAMES.filter((t) => !NEVER_WRITTEN.includes(t)))('resolves a driver type for %s', (typeName) => {
    const type = SaveParameterType(field(typeName, 20));
    expect(Object.values(sql.TYPES)).toContain(type.type);
  });

  it.each([...NEVER_WRITTEN, 'rowversion', 'some_udt'])('refuses %s, naming the field and the type', (typeName) => {
    expect(() => SaveParameterType(field(typeName, 8, 'Version'))).toThrow(`Field "Version" has SQL type "${typeName}"`);
  });

  it('gives sized strings their column length (nvarchar lengths are stored in bytes)', () => {
    expect(SaveParameterType(field('nvarchar', 200))).toEqual(sql.NVarChar(100));
    expect(SaveParameterType(field('nchar', 20))).toEqual(sql.NChar(10));
    expect(SaveParameterType(field('varchar', 50))).toEqual(sql.VarChar(50));
    expect(SaveParameterType(field('char', 3))).toEqual(sql.Char(3));
  });

  it('gives unbounded columns MAX', () => {
    expect(SaveParameterType(field('nvarchar', -1))).toEqual(sql.NVarChar(sql.MAX));
    expect(SaveParameterType(field('varchar', -1))).toEqual(sql.VarChar(sql.MAX));
    expect(SaveParameterType(field('varbinary', -1))).toEqual(sql.VarBinary(sql.MAX));
  });

  it('binds binary(n) as varbinary(n), the type of the 0x literal it replaces', () => {
    expect(SaveParameterType(field('binary', 16))).toEqual(sql.VarBinary(16));
  });

  it('matches type names case-insensitively and ignores surrounding space', () => {
    expect(SaveParameterType(field(' UniqueIdentifier '))).toEqual(sql.UniqueIdentifier());
    expect(SaveParameterType(field('DATETIME2'))).toEqual(sql.DateTime2());
  });

  it('sends exact numerics as text, because the driver encodes them through a double', () => {
    for (const typeName of ['decimal', 'numeric', 'money', 'smallmoney']) {
      expect(SaveParameterType(field(typeName))).toEqual(sql.VarChar(sql.MAX));
    }
  });

  it('sends types the driver cannot bind directly as nvarchar(max) text so Unicode is preserved', () => {
    for (const typeName of ['xml', 'sql_variant', 'hierarchyid', 'geography', 'geometry', 'json', 'vector']) {
      expect(SaveParameterType(field(typeName))).toEqual(sql.NVarChar(sql.MAX));
    }
  });
});

describe('SaveParameterFromLiteral', () => {
  it('reads a Unicode string back exactly, quotes and all', () => {
    const p = SaveParameterFromLiteral(field('nvarchar', 200), "N'Zoë 😀 日本 O''Brien'");
    expect(p).toEqual({ Type: sql.NVarChar(100), Value: "Zoë 😀 日本 O'Brien" });
  });

  it('preserves Unicode strings as NVarChar(MAX) for json and xml literals', () => {
    const jsonParam = SaveParameterFromLiteral(field('json'), "N'{\"greeting\":\"こんにちは 🌍\",\"accent\":\"café\"}'");
    expect(jsonParam).toEqual({ Type: sql.NVarChar(sql.MAX), Value: '{"greeting":"こんにちは 🌍","accent":"café"}' });
    const xmlParam = SaveParameterFromLiteral(field('xml'), "N'<note>こんにちは 🌍 café</note>'");
    expect(xmlParam).toEqual({ Type: sql.NVarChar(sql.MAX), Value: '<note>こんにちは 🌍 café</note>' });
  });

  it('reads a non-Unicode string literal (no N prefix)', () => {
    expect(SaveParameterFromLiteral(field('varchar', 10), "'it''s'").Value).toBe("it's");
  });

  it('keeps an exact decimal as its text, so 1.005 is not rounded through a double', () => {
    expect(SaveParameterFromLiteral(field('decimal'), '1.005')).toEqual({ Type: sql.VarChar(sql.MAX), Value: '1.005' });
    expect(SaveParameterFromLiteral(field('money'), '-12.5')).toEqual({ Type: sql.VarChar(sql.MAX), Value: '-12.5' });
  });

  it('sends a decimal literal in exponent form as the float it is', () => {
    expect(SaveParameterFromLiteral(field('decimal'), '1e-7')).toEqual({ Type: sql.Float(), Value: 1e-7 });
    expect(SaveParameterFromLiteral(field('numeric'), '1e+21')).toEqual({ Type: sql.Float(), Value: 1e21 });
  });

  it('binds numbers as numbers in the column type', () => {
    expect(SaveParameterFromLiteral(field('int'), '42')).toEqual({ Type: sql.Int(), Value: 42 });
    expect(SaveParameterFromLiteral(field('float'), '0.1')).toEqual({ Type: sql.Float(), Value: 0.1 });
    expect(SaveParameterFromLiteral(field('real'), '1e+21')).toEqual({ Type: sql.Real(), Value: 1e21 });
  });

  it('keeps every digit of a bigint and truncates a fraction toward zero, as SQL Server converts it', () => {
    expect(SaveParameterFromLiteral(field('bigint'), '9007199254740993').Value).toBe(9007199254740993n);
    expect(SaveParameterFromLiteral(field('bigint'), '-7.9').Value).toBe(-7n);
  });

  it('reads booleans from the 1/0 the literal batch writes', () => {
    expect(SaveParameterFromLiteral(field('bit'), '1')).toEqual({ Type: sql.Bit(), Value: true });
    expect(SaveParameterFromLiteral(field('bit'), '0')).toEqual({ Type: sql.Bit(), Value: false });
  });

  it('reads dates as the same instant', () => {
    const p = SaveParameterFromLiteral(field('datetimeoffset'), "'2025-04-05T12:00:00.000Z'");
    expect(p.Type).toEqual(sql.DateTimeOffset());
    expect(p.Value).toEqual(new Date('2025-04-05T12:00:00.000Z'));
  });

  it('reads binary from the hex literal, including zero bytes', () => {
    expect(SaveParameterFromLiteral(field('varbinary', -1), '0x0102FF').Value).toEqual(Buffer.from([1, 2, 255]));
    expect(SaveParameterFromLiteral(field('varbinary', -1), '0x').Value).toEqual(Buffer.alloc(0));
  });

  it('sends a GUID as a uniqueidentifier', () => {
    const guid = '82DFF26B-2ABB-4A69-8718-1FE550B60816';
    expect(SaveParameterFromLiteral(field('uniqueidentifier'), `'${guid}'`)).toEqual({ Type: sql.UniqueIdentifier(), Value: guid });
  });
});

describe('QuotedLiteralText', () => {
  it.each([
    ["''", ''],
    ["N''", ''],
    ["''''", "'"],
    ["N'a''''b'", "a''b"],
    ["'N'", 'N'],
  ])('reads %s as %j', (literal, text) => {
    expect(QuotedLiteralText(literal)).toBe(text);
  });
});

describe('RenderSaveSQL', () => {
  function collect(...pairs: Array<[EntityFieldInfo, string]>): { refs: string[]; params: readonly SQLServerSaveParameter[] } {
    const collector = new SaveParameterCollector();
    const refs = pairs.map(([f, literal]) => collector.AddField(f, literal));
    return { refs, params: collector.Parameters };
  }

  it('puts each literal back and restores the per-record variable suffix', () => {
    const { refs, params } = collect([field('nvarchar', 200), "N'Doc'"], [field('int'), '7']);
    const executed = `DECLARE @Name$ NVARCHAR(100),\n        @Qty$ INT\n\nSET @Name$ = ${refs[0]}\nSET @Qty$ = ${refs[1]}\n\nEXEC [dbo].spCreateDoc @Name=@Name$,\n                @Qty=@Qty$`;
    expect(RenderSaveSQL(executed, params, '_a1b2c3d4e5f6')).toBe(
      "DECLARE @Name_a1b2c3d4e5f6 NVARCHAR(100),\n        @Qty_a1b2c3d4e5f6 INT\n\nSET @Name_a1b2c3d4e5f6 = N'Doc'\nSET @Qty_a1b2c3d4e5f6 = 7\n\n" +
        'EXEC [dbo].spCreateDoc @Name=@Name_a1b2c3d4e5f6,\n                @Qty=@Qty_a1b2c3d4e5f6',
    );
  });

  it('tells @p$1 from @p$10', () => {
    const literals = Array.from({ length: 11 }, (_, i) => `${i * 100}`);
    const { refs, params } = collect(...literals.map((l): [EntityFieldInfo, string] => [field('int'), l]));
    expect(RenderSaveSQL(`${refs[1]},${refs[10]}`, params, '')).toBe('100,1000');
  });

  it('never rewrites text inside a value it put back', () => {
    const { refs, params } = collect([field('nvarchar', -1), "N'see @p$0 and @Name$ here'"]);
    expect(RenderSaveSQL(`SET @Note$ = ${refs[0]}`, params, '_x')).toBe("SET @Note_x = N'see @p$0 and @Name$ here'");
  });

  it('leaves variables without the executed suffix alone (@ResultTable, @ID)', () => {
    const sqlText = 'DECLARE @ID NVARCHAR(MAX);\nINSERT INTO @ResultTable EXEC x;\nSELECT @ID = 1';
    expect(RenderSaveSQL(sqlText, [], '_x')).toBe(sqlText);
  });

  it('uses a suffix a field CodeName can never end in', () => {
    expect(EXECUTED_VARIABLE_SUFFIX).toBe('$');
  });
});

describe('IsSaveParameterList', () => {
  it('is true only for a non-empty list of save parameters', () => {
    const collector = new SaveParameterCollector();
    collector.AddField(field('int'), '1');
    expect(IsSaveParameterList([...collector.Parameters])).toBe(true);
    expect(IsSaveParameterList([])).toBe(false);
    expect(IsSaveParameterList([1, 2])).toBe(false);
    expect(IsSaveParameterList({ p0: 1 })).toBe(false);
    expect(IsSaveParameterList(null)).toBe(false);
  });
});
