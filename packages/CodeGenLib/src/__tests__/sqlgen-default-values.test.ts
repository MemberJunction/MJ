import { describe, it, expect, vi } from 'vitest';

/**
 * #4000 — SQL Server column defaults in the generated create procedure.
 *
 * An expression default used to be string-quoted (`ISNULL(@P, 'N'CTR-'+format(...)')`), which does
 * not parse, so spCreate was dropped and never recreated. Un-quoting is not enough: T-SQL rejects
 * `NEXT VALUE FOR` inside ISNULL/CASE, and `NEWSEQUENTIALID()` is legal only in a DEFAULT constraint.
 * These tests pin the classification, the pre-INSERT assignment, and that ordinary defaults keep
 * their existing inline output.
 */
vi.mock('mssql', () => ({}));
vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(), logStatus: vi.fn(), LogWarning: vi.fn(),
    get logWarning() { return this.LogWarning; }, StartSpinner: vi.fn(),
    get startSpinner() { return this.StartSpinner; }, SucceedSpinner: vi.fn(),
    get succeedSpinner() { return this.SucceedSpinner; },
}));

import { EntityInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ClassifySQLServerDefaultValue, StripWrappingParentheses } from '../Database/providers/sqlserver/sqlServerDefaultValues';

type FieldInit = Record<string, unknown>;
const field = (name: string, type: string, extra: FieldInit = {}): FieldInit => ({
    ID: `f-${name}`, Name: name, CodeName: name, Type: type, Length: type === 'int' ? 4 : 100,
    IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '', ...extra,
});
const idField = field('ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowUpdateAPI: false, Length: 16, DefaultValue: 'newsequentialid()' });

function contractEntity(fields: FieldInit[]): EntityInfo {
    return new EntityInfo({
        ID: 'entity-contract', Name: 'Contracts', SchemaName: 'app', BaseTable: 'Contract', BaseTableCodeName: 'Contract', BaseView: 'vwContracts',
        IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, CascadeDeletes: false, DeleteType: 'Hard',
        spCreate: '', spUpdate: '', spDelete: '', EntityFields: [idField, ...fields], EntityPermissions: [],
    });
}

const SEQUENCE_DEFAULT = "(N'CTR-'+format(NEXT VALUE FOR [app].[seq_ContractNumber],N'D6'))";

describe('ClassifySQLServerDefaultValue', () => {
    it('treats a NEXT VALUE FOR default as an expression and emits it unquoted', () => {
        const c = ClassifySQLServerDefaultValue(SEQUENCE_DEFAULT, true);
        expect(c.Kind).toBe('Expression');
        expect(c.SQL).toBe("N'CTR-'+format(NEXT VALUE FOR [app].[seq_ContractNumber],N'D6')");
    });

    it('recognizes the same expression after ExtractActualDefaultValue stripped it', () => {
        // EntityFieldInfo.DefaultValue holds the value with its outer parentheses removed.
        const c = ClassifySQLServerDefaultValue("N'CTR-'+format(NEXT VALUE FOR [app].[seq_ContractNumber],N'D6')", true);
        expect(c.Kind).toBe('Expression');
    });

    it('treats a string concatenation without a sequence as an expression (unpaired quotes)', () => {
        expect(ClassifySQLServerDefaultValue("N'A-'+CONVERT(nvarchar(10),getdate(),112)", true).Kind).not.toBe('Literal');
        expect(ClassifySQLServerDefaultValue("N'A-'+N'B'", true)).toEqual({ Kind: 'Expression', SQL: "N'A-'+N'B'" });
    });

    it('treats a call to a T-SQL built-in on a string column as an expression', () => {
        expect(ClassifySQLServerDefaultValue('format(1,N)', true).Kind).toBe('Expression');
        expect(ClassifySQLServerDefaultValue('current_user', true).Kind).toBe('Expression');
    });

    it('keeps literal string content quoted, including content that only looks like a call', () => {
        expect(ClassifySQLServerDefaultValue('Pending', true)).toEqual({ Kind: 'Literal', SQL: "'Pending'" });
        expect(ClassifySQLServerDefaultValue('Draft (1)', true)).toEqual({ Kind: 'Literal', SQL: "'Draft (1)'" });
        expect(ClassifySQLServerDefaultValue("It''s", true)).toEqual({ Kind: 'Literal', SQL: "'It''s'" });
    });

    it('keeps a raw N-prefixed literal verbatim instead of wrapping it in a second pair of quotes', () => {
        expect(ClassifySQLServerDefaultValue("(N'Active')", true)).toEqual({ Kind: 'Literal', SQL: "N'Active'" });
    });

    it('keeps numeric and NULL literals as before', () => {
        expect(ClassifySQLServerDefaultValue('((0))', false)).toEqual({ Kind: 'Literal', SQL: '0' });
        expect(ClassifySQLServerDefaultValue('-1.5', false)).toEqual({ Kind: 'Literal', SQL: '-1.5' });
        expect(ClassifySQLServerDefaultValue('0', true)).toEqual({ Kind: 'Literal', SQL: "'0'" });
        expect(ClassifySQLServerDefaultValue('(NULL)', true)).toEqual({ Kind: 'Literal', SQL: 'NULL' });
        expect(ClassifySQLServerDefaultValue('', true)).toEqual({ Kind: 'Literal', SQL: 'NULL' });
    });

    it('keeps the long-standing inline functions inline and verbatim', () => {
        expect(ClassifySQLServerDefaultValue('getutcdate()', true)).toEqual({ Kind: 'InlineFunction', SQL: 'getutcdate()' });
        expect(ClassifySQLServerDefaultValue('(newid())', true)).toEqual({ Kind: 'InlineFunction', SQL: 'newid()' });
        expect(ClassifySQLServerDefaultValue('dateadd(day,(30),getdate())', true).Kind).toBe('InlineFunction');
        expect(ClassifySQLServerDefaultValue('sysutcdatetime()', true)).toEqual({ Kind: 'InlineFunction', SQL: 'sysutcdatetime()' });
    });

    it('turns NEWSEQUENTIALID() into NEWID(), which is legal outside a DEFAULT constraint', () => {
        expect(ClassifySQLServerDefaultValue('(newsequentialid())', true)).toEqual({ Kind: 'InlineFunction', SQL: 'NEWID()' });
    });

    it('treats any non-literal on a non-quoted type as an expression', () => {
        expect(ClassifySQLServerDefaultValue('NEXT VALUE FOR [app].[seq_No]', false).Kind).toBe('Expression');
        expect(ClassifySQLServerDefaultValue('CONVERT(int,(5))', false).Kind).toBe('Expression');
    });
});

describe('StripWrappingParentheses', () => {
    it('strips every layer that wraps the whole value', () => {
        expect(StripWrappingParentheses('((0))')).toBe('0');
        expect(StripWrappingParentheses("(N'a)')")).toBe("N'a)'");
    });

    it('leaves parentheses that do not wrap the whole value', () => {
        expect(StripWrappingParentheses('(a)+(b)')).toBe('(a)+(b)');
    });
});

describe('SQLServerCodeGenProvider — expression defaults in spCreate', () => {
    const provider = new SQLServerCodeGenProvider();

    it('assigns a NEXT VALUE FOR default before the INSERT and reads the parameter in VALUES', () => {
        const entity = contractEntity([field('ContractNumber', 'nvarchar', { DefaultValue: SEQUENCE_DEFAULT })]);
        const sql = provider.generateCRUDCreate(entity);

        expect(sql).toContain("IF @ContractNumber IS NULL SET @ContractNumber = N'CTR-'+format(NEXT VALUE FOR [app].[seq_ContractNumber],N'D6');");
        expect(sql).not.toMatch(/ISNULL\(@ContractNumber/);
        expect(sql).not.toContain("'N'CTR-");
        // The assignment precedes the INSERT.
        expect(sql.indexOf('SET @ContractNumber =')).toBeLessThan(sql.indexOf('INSERT INTO'));
    });

    it('honors the _Clear companion for a nullable expression-default column', () => {
        const entity = contractEntity([field('Ref', 'nvarchar', { AllowsNull: true, DefaultValue: SEQUENCE_DEFAULT })]);
        const sql = provider.generateCRUDCreate(entity);

        expect(sql).toContain('IF @Ref IS NULL AND ISNULL(@Ref_Clear, 0) = 0 SET @Ref =');
        expect(sql).toContain('CASE WHEN @Ref_Clear = 1 THEN NULL ELSE @Ref END');
    });

    it('treats the empty GUID as "not supplied" for a NOT NULL uniqueidentifier expression default', () => {
        const entity = contractEntity([field('AltID', 'uniqueidentifier', { Length: 16, DefaultValue: 'CONVERT(uniqueidentifier,NEXT VALUE FOR [app].[seq_Alt])' })]);
        const sql = provider.generateCRUDCreate(entity);

        expect(sql).toMatch(/IF \(@AltID IS NULL OR @AltID = '00000000-0000-0000-0000-000000000000'\) SET @AltID = CONVERT/);
    });

    it('emits NEWID() instead of NEWSEQUENTIALID() for a non-PK GUID column', () => {
        const entity = contractEntity([field('AltID', 'uniqueidentifier', { Length: 16, DefaultValue: '(newsequentialid())' })]);
        const sql = provider.generateCRUDCreate(entity);

        expect(sql.toLowerCase()).not.toContain('isnull(@altid, newsequentialid())');
        expect(sql).toContain('ISNULL(@AltID, NEWID())');
    });

    it('leaves a procedure with only literal and inline-function defaults unchanged in shape', () => {
        const entity = contractEntity([
            field('Status', 'nvarchar', { DefaultValue: 'Pending' }),
            field('Count', 'int', { DefaultValue: '0' }),
            field('StartedAt', 'datetime', { DefaultValue: 'getutcdate()' }),
        ]);
        const sql = provider.generateCRUDCreate(entity);

        expect(sql).toContain("ISNULL(@Status, 'Pending')");
        expect(sql).toContain('ISNULL(@Count, 0)');
        expect(sql).toContain('ISNULL(@StartedAt, getutcdate())');
        expect(sql).not.toMatch(/\bIF @\w+ IS NULL/);
        expect(sql).toMatch(/SET NOCOUNT ON;\n    DECLARE @InsertedRow/);
    });
});
