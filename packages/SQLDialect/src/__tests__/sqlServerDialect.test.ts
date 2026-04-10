import { describe, it, expect, beforeEach } from 'vitest';
import { SQLServerDialect } from '../sqlServerDialect.js';

describe('SQLServerDialect', () => {
    let dialect: SQLServerDialect;

    beforeEach(() => {
        dialect = new SQLServerDialect();
    });

    describe('PlatformKey', () => {
        it('should return sqlserver', () => {
            expect(dialect.PlatformKey).toBe('sqlserver');
        });
    });

    describe('QuoteIdentifier', () => {
        it('should wrap name in square brackets', () => {
            expect(dialect.QuoteIdentifier('Name')).toBe('[Name]');
        });

        it('should handle single-word identifiers', () => {
            expect(dialect.QuoteIdentifier('ID')).toBe('[ID]');
        });

        it('should handle identifiers with spaces', () => {
            expect(dialect.QuoteIdentifier('First Name')).toBe('[First Name]');
        });
    });

    describe('QuoteSchema', () => {
        it('should produce schema-qualified reference with brackets', () => {
            expect(dialect.QuoteSchema('__mj', 'vwUsers')).toBe('[__mj].[vwUsers]');
        });
    });

    describe('LimitClause', () => {
        it('should return TOP prefix when no offset', () => {
            const result = dialect.LimitClause(10);
            expect(result.prefix).toBe('TOP 10');
            expect(result.suffix).toBe('');
        });

        it('should return OFFSET/FETCH suffix when offset provided', () => {
            const result = dialect.LimitClause(10, 20);
            expect(result.prefix).toBe('');
            expect(result.suffix).toBe('OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
        });
    });

    describe('BooleanLiteral', () => {
        it('should return 1 for true', () => {
            expect(dialect.BooleanLiteral(true)).toBe('1');
        });

        it('should return 0 for false', () => {
            expect(dialect.BooleanLiteral(false)).toBe('0');
        });
    });

    describe('CurrentTimestampUTC', () => {
        it('should return GETUTCDATE()', () => {
            expect(dialect.CurrentTimestampUTC()).toBe('GETUTCDATE()');
        });
    });

    describe('NewUUID', () => {
        it('should return NEWID()', () => {
            expect(dialect.NewUUID()).toBe('NEWID()');
        });
    });

    describe('CastToText', () => {
        it('should cast to NVARCHAR(MAX)', () => {
            expect(dialect.CastToText('col1')).toBe('CAST(col1 AS NVARCHAR(MAX))');
        });
    });

    describe('CastToUUID', () => {
        it('should cast to UNIQUEIDENTIFIER', () => {
            expect(dialect.CastToUUID('col1')).toBe('CAST(col1 AS UNIQUEIDENTIFIER)');
        });
    });

    describe('ReturnInsertedClause', () => {
        it('should return OUTPUT INSERTED.* when no columns specified', () => {
            expect(dialect.ReturnInsertedClause()).toBe('OUTPUT INSERTED.*');
        });

        it('should return OUTPUT with specific columns', () => {
            expect(dialect.ReturnInsertedClause(['ID', 'Name'])).toBe('OUTPUT INSERTED.[ID], INSERTED.[Name]');
        });
    });

    describe('AutoIncrementPKExpression', () => {
        it('should return IDENTITY(1,1)', () => {
            expect(dialect.AutoIncrementPKExpression()).toBe('IDENTITY(1,1)');
        });
    });

    describe('UUIDPKDefault', () => {
        it('should return NEWSEQUENTIALID()', () => {
            expect(dialect.UUIDPKDefault()).toBe('NEWSEQUENTIALID()');
        });
    });

    describe('ScopeIdentityExpression', () => {
        it('should return SCOPE_IDENTITY()', () => {
            expect(dialect.ScopeIdentityExpression()).toBe('SCOPE_IDENTITY()');
        });
    });

    describe('RowCountExpression', () => {
        it('should return @@ROWCOUNT', () => {
            expect(dialect.RowCountExpression()).toBe('@@ROWCOUNT');
        });
    });

    describe('BatchSeparator', () => {
        it('should return GO', () => {
            expect(dialect.BatchSeparator()).toBe('GO');
        });
    });

    describe('ExistenceCheckSQL', () => {
        it('should check for table existence', () => {
            const sql = dialect.ExistenceCheckSQL('TABLE', '__mj', 'User');
            expect(sql).toContain('OBJECT_ID');
            expect(sql).toContain("'U'");
        });

        it('should check for view existence', () => {
            const sql = dialect.ExistenceCheckSQL('VIEW', '__mj', 'vwUsers');
            expect(sql).toContain("'V'");
        });

        it('should check for procedure existence', () => {
            const sql = dialect.ExistenceCheckSQL('PROCEDURE', '__mj', 'spCreateUser');
            expect(sql).toContain("'P'");
        });
    });

    describe('CreateOrReplaceSupported', () => {
        it('should return false for all object types', () => {
            expect(dialect.CreateOrReplaceSupported('TABLE')).toBe(false);
            expect(dialect.CreateOrReplaceSupported('VIEW')).toBe(false);
            expect(dialect.CreateOrReplaceSupported('FUNCTION')).toBe(false);
        });
    });

    describe('FullTextSearchPredicate', () => {
        it('should return CONTAINS predicate', () => {
            const result = dialect.FullTextSearchPredicate('Name', "'search term'");
            expect(result).toBe("CONTAINS([Name], 'search term')");
        });
    });

    describe('RecursiveCTESyntax', () => {
        it('should return WITH (not RECURSIVE)', () => {
            expect(dialect.RecursiveCTESyntax()).toBe('WITH');
        });
    });

    describe('ParameterPlaceholder', () => {
        it('should return @p-prefixed placeholders', () => {
            expect(dialect.ParameterPlaceholder(0)).toBe('@p0');
            expect(dialect.ParameterPlaceholder(1)).toBe('@p1');
            expect(dialect.ParameterPlaceholder(5)).toBe('@p5');
        });
    });

    describe('ConcatOperator', () => {
        it('should return +', () => {
            expect(dialect.ConcatOperator()).toBe('+');
        });
    });

    describe('StringSplitFunction', () => {
        it('should return STRING_SPLIT', () => {
            expect(dialect.StringSplitFunction("'a,b,c'", "','")).toBe("STRING_SPLIT('a,b,c', ',')");
        });
    });

    describe('JsonExtract', () => {
        it('should return JSON_VALUE', () => {
            expect(dialect.JsonExtract('data', '$.name')).toBe("JSON_VALUE(data, '$.name')");
        });
    });

    describe('ProcedureCallSyntax', () => {
        it('should return EXEC statement', () => {
            const sql = dialect.ProcedureCallSyntax('__mj', 'spCreateUser', ['@p0', '@p1']);
            expect(sql).toBe('EXEC [__mj].[spCreateUser] @p0, @p1');
        });
    });

    describe('TriggerDDL', () => {
        it('should generate SQL Server trigger syntax', () => {
            const ddl = dialect.TriggerDDL({
                schema: '__mj',
                tableName: 'User',
                triggerName: 'trgUpdateUser',
                timing: 'AFTER',
                events: ['UPDATE'],
                body: 'UPDATE [__mj].[User] SET __mj_UpdatedAt = GETUTCDATE() FROM [__mj].[User] AS t INNER JOIN inserted AS i ON t.[ID] = i.[ID]',
            });
            expect(ddl).toContain('CREATE TRIGGER [__mj].[trgUpdateUser]');
            expect(ddl).toContain('ON [__mj].[User]');
            expect(ddl).toContain('AFTER UPDATE');
            expect(ddl).toContain('SET NOCOUNT ON');
        });
    });

    describe('IndexDDL', () => {
        it('should generate basic index', () => {
            const ddl = dialect.IndexDDL({
                schema: '__mj',
                tableName: 'User',
                indexName: 'idx_User_Name',
                columns: ['Name'],
            });
            expect(ddl).toBe('CREATE INDEX [idx_User_Name] ON [__mj].[User]([Name])');
        });

        it('should generate unique index with include columns', () => {
            const ddl = dialect.IndexDDL({
                schema: '__mj',
                tableName: 'User',
                indexName: 'idx_User_Email',
                columns: ['Email'],
                unique: true,
                includeColumns: ['Name'],
            });
            expect(ddl).toContain('UNIQUE');
            expect(ddl).toContain('INCLUDE ([Name])');
        });
    });

    describe('GrantPermission', () => {
        it('should generate GRANT statement with brackets', () => {
            const sql = dialect.GrantPermission('SELECT', 'VIEW', '__mj', 'vwUsers', 'cdp_UI');
            expect(sql).toBe('GRANT SELECT ON [__mj].[vwUsers] TO [cdp_UI]');
        });
    });

    describe('CommentOnObject', () => {
        it('should generate sp_addextendedproperty call', () => {
            const sql = dialect.CommentOnObject('TABLE', '__mj', 'User', 'User accounts');
            expect(sql).toContain('sp_addextendedproperty');
            expect(sql).toContain('User accounts');
        });
    });

    describe('IIF', () => {
        it('should return IIF expression', () => {
            expect(dialect.IIF('x > 0', "'positive'", "'negative'")).toBe("IIF(x > 0, 'positive', 'negative')");
        });
    });

    describe('TypeMap', () => {
        it('should map UNIQUEIDENTIFIER to UNIQUEIDENTIFIER', () => {
            const result = dialect.TypeMap.MapTypeToString('UNIQUEIDENTIFIER');
            expect(result).toBe('UNIQUEIDENTIFIER');
        });

        it('should map NVARCHAR with length', () => {
            const result = dialect.TypeMap.MapTypeToString('NVARCHAR', 255);
            expect(result).toBe('NVARCHAR(255)');
        });

        it('should map NVARCHAR(MAX) for -1 length', () => {
            const result = dialect.TypeMap.MapTypeToString('NVARCHAR', -1);
            expect(result).toBe('NVARCHAR(MAX)');
        });

        it('should map BIT', () => {
            const result = dialect.TypeMap.MapTypeToString('BIT');
            expect(result).toBe('BIT');
        });

        it('should map DECIMAL with precision and scale', () => {
            const result = dialect.TypeMap.MapTypeToString('DECIMAL', undefined, 10, 2);
            expect(result).toBe('DECIMAL(10,2)');
        });
    });

    describe('SchemaIntrospectionQueries', () => {
        it('should return all query templates', () => {
            const queries = dialect.SchemaIntrospectionQueries();
            expect(queries.listTables).toContain('sys.tables');
            expect(queries.listColumns).toContain('sys.columns');
            expect(queries.listConstraints).toContain('INFORMATION_SCHEMA');
            expect(queries.listForeignKeys).toContain('sys.foreign_keys');
            expect(queries.listIndexes).toContain('sys.indexes');
            expect(queries.objectExists).toContain('OBJECT_ID');
        });
    });

    describe('Coalesce (inherited)', () => {
        it('should return COALESCE expression', () => {
            expect(dialect.Coalesce('col1', "'default'")).toBe("COALESCE(col1, 'default')");
        });
    });

    describe('IsNull (inherited)', () => {
        it('should use COALESCE under the hood', () => {
            expect(dialect.IsNull('col1', "'default'")).toBe("COALESCE(col1, 'default')");
        });
    });
});
