import { describe, it, expect, beforeEach } from 'vitest';
import { SQLServerDialect } from '../sqlServerDialect.js';
import { PostgreSQLDialect } from '../postgresqlDialect.js';
import { SQLDialect, IndexOptions, TriggerOptions } from '../sqlDialect.js';

describe('Cross-Dialect Comparison Tests', () => {
    let ss: SQLServerDialect;
    let pg: PostgreSQLDialect;

    beforeEach(() => {
        ss = new SQLServerDialect();
        pg = new PostgreSQLDialect();
    });

    // ─── Platform Identity ────────────────────────────────────────────

    describe('Platform Identity', () => {
        it('should report distinct platform keys for each dialect', () => {
            expect(ss.PlatformKey).toBe('sqlserver');
            expect(pg.PlatformKey).toBe('postgresql');
            expect(ss.PlatformKey).not.toBe(pg.PlatformKey);
        });
    });

    // ─── Identifier Quoting ──────────────────────────────────────────

    describe('Identifier Quoting', () => {
        it('should quote simple identifiers using brackets vs double-quotes', () => {
            const name = 'UserName';
            expect(ss.QuoteIdentifier(name)).toBe('[UserName]');
            expect(pg.QuoteIdentifier(name)).toBe('"UserName"');
        });

        it('should quote identifiers containing spaces using brackets vs double-quotes', () => {
            const name = 'First Name';
            expect(ss.QuoteIdentifier(name)).toBe('[First Name]');
            expect(pg.QuoteIdentifier(name)).toBe('"First Name"');
        });

        it('should quote reserved words as identifiers in each platform style', () => {
            const reservedWord = 'Order';
            expect(ss.QuoteIdentifier(reservedWord)).toBe('[Order]');
            expect(pg.QuoteIdentifier(reservedWord)).toBe('"Order"');
        });

        it('should quote identifiers containing special characters', () => {
            const name = 'column-with-dashes';
            expect(ss.QuoteIdentifier(name)).toBe('[column-with-dashes]');
            expect(pg.QuoteIdentifier(name)).toBe('"column-with-dashes"');
        });
    });

    // ─── Schema-Qualified Identifiers ────────────────────────────────

    describe('Schema-Qualified Identifiers', () => {
        it('should produce schema.object in platform-specific quoting', () => {
            expect(ss.QuoteSchema('dbo', 'Users')).toBe('[dbo].[Users]');
            expect(pg.QuoteSchema('public', 'Users')).toBe('public."Users"');
        });

        it('should handle MJ-style schema names (__mj)', () => {
            expect(ss.QuoteSchema('__mj', 'Entity')).toBe('[__mj].[Entity]');
            expect(pg.QuoteSchema('__mj', 'Entity')).toBe('__mj."Entity"');
        });
    });

    // ─── Boolean Literals ────────────────────────────────────────────

    describe('Boolean Literals', () => {
        it('should produce 1/0 for SQL Server and true/false for PostgreSQL', () => {
            expect(ss.BooleanLiteral(true)).toBe('1');
            expect(pg.BooleanLiteral(true)).toBe('true');
            expect(ss.BooleanLiteral(false)).toBe('0');
            expect(pg.BooleanLiteral(false)).toBe('false');
        });
    });

    // ─── Date/Time Function Mappings ────────────────────────────────

    describe('Date/Time Functions', () => {
        it('should map GETUTCDATE to NOW() AT TIME ZONE UTC for current UTC timestamp', () => {
            expect(ss.CurrentTimestampUTC()).toBe('GETUTCDATE()');
            expect(pg.CurrentTimestampUTC()).toBe("(NOW() AT TIME ZONE 'UTC')");
        });

        it('should produce platform-specific UUID generation expressions', () => {
            expect(ss.NewUUID()).toBe('NEWID()');
            expect(pg.NewUUID()).toBe('gen_random_uuid()');
        });

        it('should produce platform-specific UUID PK default expressions', () => {
            expect(ss.UUIDPKDefault()).toBe('NEWSEQUENTIALID()');
            expect(pg.UUIDPKDefault()).toBe('gen_random_uuid()');
        });
    });

    // ─── NULL Handling ───────────────────────────────────────────────

    describe('NULL Handling', () => {
        it('should provide COALESCE on both platforms via IsNull', () => {
            const ssResult = ss.IsNull('col', "'default'");
            const pgResult = pg.IsNull('col', "'default'");
            // Both should produce COALESCE since IsNull delegates to Coalesce
            expect(ssResult).toBe("COALESCE(col, 'default')");
            expect(pgResult).toBe("COALESCE(col, 'default')");
        });

        it('should produce identical COALESCE syntax on both platforms', () => {
            const expr = 'email';
            const fallback = "'no-email@example.com'";
            expect(ss.Coalesce(expr, fallback)).toBe(pg.Coalesce(expr, fallback));
        });
    });

    // ─── String Concatenation ────────────────────────────────────────

    describe('String Concatenation', () => {
        it('should use + for SQL Server and || for PostgreSQL', () => {
            expect(ss.ConcatOperator()).toBe('+');
            expect(pg.ConcatOperator()).toBe('||');
        });

        it('should produce valid concat expressions when operator is used in context', () => {
            const firstName = "'John'";
            const lastName = "'Doe'";
            const ssConcatExpr = `${firstName} ${ss.ConcatOperator()} ' ' ${ss.ConcatOperator()} ${lastName}`;
            const pgConcatExpr = `${firstName} ${pg.ConcatOperator()} ' ' ${pg.ConcatOperator()} ${lastName}`;
            expect(ssConcatExpr).toBe("'John' + ' ' + 'Doe'");
            expect(pgConcatExpr).toBe("'John' || ' ' || 'Doe'");
        });
    });

    // ─── Pagination: TOP N vs LIMIT N ────────────────────────────────

    describe('Pagination (TOP vs LIMIT)', () => {
        it('should use TOP prefix for SQL Server and LIMIT suffix for PostgreSQL', () => {
            const ssResult = ss.LimitClause(10);
            const pgResult = pg.LimitClause(10);
            // SQL Server: TOP 10 as prefix
            expect(ssResult.prefix).toBe('TOP 10');
            expect(ssResult.suffix).toBe('');
            // PostgreSQL: LIMIT 10 as suffix
            expect(pgResult.prefix).toBe('');
            expect(pgResult.suffix).toBe('LIMIT 10');
        });

        it('should use OFFSET/FETCH for SQL Server and LIMIT/OFFSET for PostgreSQL with offset', () => {
            const ssResult = ss.LimitClause(25, 50);
            const pgResult = pg.LimitClause(25, 50);
            // SQL Server: OFFSET/FETCH in suffix, no prefix
            expect(ssResult.prefix).toBe('');
            expect(ssResult.suffix).toBe('OFFSET 50 ROWS FETCH NEXT 25 ROWS ONLY');
            // PostgreSQL: LIMIT/OFFSET in suffix, no prefix
            expect(pgResult.prefix).toBe('');
            expect(pgResult.suffix).toBe('LIMIT 25 OFFSET 50');
        });

        it('should both produce empty prefix when offset is provided', () => {
            const ssResult = ss.LimitClause(5, 0);
            const pgResult = pg.LimitClause(5, 0);
            expect(ssResult.prefix).toBe('');
            expect(pgResult.prefix).toBe('');
        });
    });

    // ─── Parameter Syntax: @param vs $N ─────────────────────────────

    describe('Parameter Placeholders', () => {
        it('should use @p-prefixed 0-based for SQL Server and $-prefixed 1-based for PostgreSQL', () => {
            expect(ss.ParameterPlaceholder(0)).toBe('@p0');
            expect(pg.ParameterPlaceholder(0)).toBe('$1');
        });

        it('should produce correct sequences for multiple parameters', () => {
            const ssParams = [0, 1, 2, 3].map(i => ss.ParameterPlaceholder(i));
            const pgParams = [0, 1, 2, 3].map(i => pg.ParameterPlaceholder(i));
            expect(ssParams).toEqual(['@p0', '@p1', '@p2', '@p3']);
            expect(pgParams).toEqual(['$1', '$2', '$3', '$4']);
        });
    });

    // ─── Data Type Mappings ─────────────────────────────────────────

    describe('Data Type Mappings', () => {
        it('should map UNIQUEIDENTIFIER to UNIQUEIDENTIFIER vs UUID', () => {
            expect(ss.MapDataTypeToString('UNIQUEIDENTIFIER')).toBe('UNIQUEIDENTIFIER');
            expect(pg.MapDataTypeToString('UNIQUEIDENTIFIER')).toBe('UUID');
        });

        it('should map NVARCHAR(255) to NVARCHAR(255) vs VARCHAR(255)', () => {
            expect(ss.MapDataTypeToString('NVARCHAR', 255)).toBe('NVARCHAR(255)');
            expect(pg.MapDataTypeToString('NVARCHAR', 255)).toBe('VARCHAR(255)');
        });

        it('should map NVARCHAR(MAX) to NVARCHAR(MAX) vs TEXT', () => {
            expect(ss.MapDataTypeToString('NVARCHAR', -1)).toBe('NVARCHAR(MAX)');
            expect(pg.MapDataTypeToString('NVARCHAR', -1)).toBe('TEXT');
        });

        it('should map BIT to BIT vs BOOLEAN', () => {
            expect(ss.MapDataTypeToString('BIT')).toBe('BIT');
            expect(pg.MapDataTypeToString('BIT')).toBe('BOOLEAN');
        });

        it('should map INT to INT vs INTEGER', () => {
            expect(ss.MapDataTypeToString('INT')).toBe('INT');
            expect(pg.MapDataTypeToString('INT')).toBe('INTEGER');
        });

        it('should map TINYINT to TINYINT vs SMALLINT', () => {
            expect(ss.MapDataTypeToString('TINYINT')).toBe('TINYINT');
            expect(pg.MapDataTypeToString('TINYINT')).toBe('SMALLINT');
        });

        it('should map DATETIME2 to DATETIME2 vs TIMESTAMP', () => {
            expect(ss.MapDataTypeToString('DATETIME2')).toBe('DATETIME2');
            expect(pg.MapDataTypeToString('DATETIME2')).toBe('TIMESTAMP');
        });

        it('should map DATETIMEOFFSET to DATETIMEOFFSET vs TIMESTAMPTZ', () => {
            expect(ss.MapDataTypeToString('DATETIMEOFFSET')).toBe('DATETIMEOFFSET');
            expect(pg.MapDataTypeToString('DATETIMEOFFSET')).toBe('TIMESTAMPTZ');
        });

        it('should map MONEY to MONEY vs NUMERIC(19,4)', () => {
            expect(ss.MapDataTypeToString('MONEY')).toBe('MONEY');
            expect(pg.MapDataTypeToString('MONEY')).toBe('NUMERIC(19,4)');
        });

        it('should map IMAGE to IMAGE vs BYTEA', () => {
            expect(ss.MapDataTypeToString('IMAGE')).toBe('IMAGE');
            expect(pg.MapDataTypeToString('IMAGE')).toBe('BYTEA');
        });

        it('should map VARBINARY to VARBINARY vs BYTEA', () => {
            const ssResult = ss.MapDataType('VARBINARY', 100);
            const pgResult = pg.MapDataType('VARBINARY', 100);
            expect(ssResult.typeName).toBe('VARBINARY');
            expect(pgResult.typeName).toBe('BYTEA');
        });

        it('should map DECIMAL with precision and scale consistently', () => {
            expect(ss.MapDataTypeToString('DECIMAL', undefined, 18, 4)).toBe('DECIMAL(18,4)');
            expect(pg.MapDataTypeToString('DECIMAL', undefined, 18, 4)).toBe('NUMERIC(18,4)');
        });

        it('should map FLOAT to FLOAT vs DOUBLE PRECISION', () => {
            expect(ss.MapDataTypeToString('FLOAT')).toBe('FLOAT');
            expect(pg.MapDataTypeToString('FLOAT')).toBe('DOUBLE PRECISION');
        });

        it('should map SMALLDATETIME to SMALLDATETIME vs TIMESTAMP(0)', () => {
            expect(ss.MapDataTypeToString('SMALLDATETIME')).toBe('SMALLDATETIME');
            expect(pg.MapDataTypeToString('SMALLDATETIME')).toBe('TIMESTAMP(0)');
        });
    });

    // ─── CAST Expressions ───────────────────────────────────────────

    describe('CAST Expressions', () => {
        it('should cast to text using NVARCHAR(MAX) vs TEXT', () => {
            expect(ss.CastToText('myCol')).toBe('CAST(myCol AS NVARCHAR(MAX))');
            expect(pg.CastToText('myCol')).toBe('CAST(myCol AS TEXT)');
        });

        it('should cast to UUID using UNIQUEIDENTIFIER vs UUID', () => {
            expect(ss.CastToUUID("'550e8400-e29b-41d4-a716-446655440000'"))
                .toBe("CAST('550e8400-e29b-41d4-a716-446655440000' AS UNIQUEIDENTIFIER)");
            expect(pg.CastToUUID("'550e8400-e29b-41d4-a716-446655440000'"))
                .toBe("CAST('550e8400-e29b-41d4-a716-446655440000' AS UUID)");
        });
    });

    // ─── IIF / CASE Expression ──────────────────────────────────────

    describe('IIF / CASE Expression', () => {
        it('should produce IIF for SQL Server and CASE WHEN for PostgreSQL', () => {
            const condition = 'Status = 1';
            const trueVal = "'Active'";
            const falseVal = "'Inactive'";
            expect(ss.IIF(condition, trueVal, falseVal)).toBe("IIF(Status = 1, 'Active', 'Inactive')");
            expect(pg.IIF(condition, trueVal, falseVal)).toBe("CASE WHEN Status = 1 THEN 'Active' ELSE 'Inactive' END");
        });
    });

    // ─── INSERT Return Patterns ─────────────────────────────────────

    describe('INSERT Return Patterns', () => {
        it('should use OUTPUT INSERTED vs RETURNING for all-column return', () => {
            expect(ss.ReturnInsertedClause()).toBe('OUTPUT INSERTED.*');
            expect(pg.ReturnInsertedClause()).toBe('RETURNING *');
        });

        it('should use OUTPUT INSERTED.[col] vs RETURNING "col" for specific columns', () => {
            const cols = ['ID', 'CreatedAt'];
            expect(ss.ReturnInsertedClause(cols)).toBe('OUTPUT INSERTED.[ID], INSERTED.[CreatedAt]');
            expect(pg.ReturnInsertedClause(cols)).toBe('RETURNING "ID", "CreatedAt"');
        });
    });

    // ─── Auto-Increment / Identity ─────────────────────────────────

    describe('Auto-Increment PK', () => {
        it('should produce IDENTITY vs GENERATED ALWAYS AS IDENTITY', () => {
            expect(ss.AutoIncrementPKExpression()).toBe('IDENTITY(1,1)');
            expect(pg.AutoIncrementPKExpression()).toBe('GENERATED ALWAYS AS IDENTITY');
        });

        it('should produce SCOPE_IDENTITY vs lastval for last-inserted identity', () => {
            expect(ss.ScopeIdentityExpression()).toBe('SCOPE_IDENTITY()');
            expect(pg.ScopeIdentityExpression()).toBe('lastval()');
        });
    });

    // ─── Batch Separator ────────────────────────────────────────────

    describe('Batch Separator', () => {
        it('should use GO for SQL Server and empty string for PostgreSQL', () => {
            expect(ss.BatchSeparator()).toBe('GO');
            expect(pg.BatchSeparator()).toBe('');
        });
    });

    // ─── CTE / Recursive Queries ────────────────────────────────────

    describe('Recursive CTE Syntax', () => {
        it('should use WITH for SQL Server and WITH RECURSIVE for PostgreSQL', () => {
            expect(ss.RecursiveCTESyntax()).toBe('WITH');
            expect(pg.RecursiveCTESyntax()).toBe('WITH RECURSIVE');
        });
    });

    // ─── Row Count ──────────────────────────────────────────────────

    describe('Row Count Expression', () => {
        it('should use @@ROWCOUNT vs ROW_COUNT', () => {
            expect(ss.RowCountExpression()).toBe('@@ROWCOUNT');
            expect(pg.RowCountExpression()).toBe('ROW_COUNT');
        });
    });

    // ─── String Functions ───────────────────────────────────────────

    describe('String Split Functions', () => {
        it('should use STRING_SPLIT vs unnest(string_to_array(...))', () => {
            const value = "'a,b,c'";
            const delimiter = "','";
            expect(ss.StringSplitFunction(value, delimiter)).toBe("STRING_SPLIT('a,b,c', ',')");
            expect(pg.StringSplitFunction(value, delimiter)).toBe("unnest(string_to_array('a,b,c', ','))");
        });
    });

    // ─── JSON Extraction ────────────────────────────────────────────

    describe('JSON Extraction', () => {
        it('should use JSON_VALUE vs ->> operator', () => {
            expect(ss.JsonExtract('data', '$.name')).toBe("JSON_VALUE(data, '$.name')");
            expect(pg.JsonExtract('data', 'name')).toBe("data->>'name'");
        });
    });

    // ─── Procedure Call Syntax ──────────────────────────────────────

    describe('Procedure Call Syntax', () => {
        it('should use EXEC vs SELECT * FROM for procedure calls', () => {
            const ssCall = ss.ProcedureCallSyntax('__mj', 'spCreateUser', ['@p0', '@p1']);
            const pgCall = pg.ProcedureCallSyntax('__mj', 'fn_create_user', ['$1', '$2']);
            expect(ssCall).toBe('EXEC [__mj].[spCreateUser] @p0, @p1');
            expect(pgCall).toBe('SELECT * FROM __mj."fn_create_user"($1, $2)');
        });

        it('should handle procedures with no parameters', () => {
            const ssCall = ss.ProcedureCallSyntax('dbo', 'spReset', []);
            const pgCall = pg.ProcedureCallSyntax('public', 'fn_reset', []);
            expect(ssCall).toBe('EXEC [dbo].[spReset] ');
            expect(pgCall).toBe('SELECT * FROM public."fn_reset"()');
        });
    });

    // ─── Full-Text Search ───────────────────────────────────────────

    describe('Full-Text Search', () => {
        it('should use CONTAINS vs @@ plainto_tsquery for search predicates', () => {
            const ssSearch = ss.FullTextSearchPredicate('Description', "'hello world'");
            const pgSearch = pg.FullTextSearchPredicate('__mj_fts_vector', "'hello world'");
            expect(ssSearch).toContain('CONTAINS');
            expect(pgSearch).toContain('@@');
            expect(pgSearch).toContain('plainto_tsquery');
        });
    });

    // ─── Existence Check SQL ────────────────────────────────────────

    describe('Existence Checks', () => {
        it('should use OBJECT_ID vs pg_catalog for table existence', () => {
            const ssCheck = ss.ExistenceCheckSQL('TABLE', '__mj', 'Users');
            const pgCheck = pg.ExistenceCheckSQL('TABLE', '__mj', 'Users');
            expect(ssCheck).toContain('OBJECT_ID');
            expect(pgCheck).toContain('pg_catalog.pg_tables');
        });

        it('should handle view existence checks differently per platform', () => {
            const ssCheck = ss.ExistenceCheckSQL('VIEW', '__mj', 'vwUsers');
            const pgCheck = pg.ExistenceCheckSQL('VIEW', '__mj', 'vwUsers');
            expect(ssCheck).toContain("'V'");
            expect(pgCheck).toContain('pg_catalog.pg_views');
        });
    });

    // ─── CREATE OR REPLACE Support ──────────────────────────────────

    describe('CREATE OR REPLACE Support', () => {
        it('should differ for FUNCTION: SQL Server false, PostgreSQL true', () => {
            expect(ss.CreateOrReplaceSupported('FUNCTION')).toBe(false);
            expect(pg.CreateOrReplaceSupported('FUNCTION')).toBe(true);
        });

        it('should differ for VIEW: SQL Server false, PostgreSQL true', () => {
            expect(ss.CreateOrReplaceSupported('VIEW')).toBe(false);
            expect(pg.CreateOrReplaceSupported('VIEW')).toBe(true);
        });

        it('should agree for TABLE: both false', () => {
            expect(ss.CreateOrReplaceSupported('TABLE')).toBe(false);
            expect(pg.CreateOrReplaceSupported('TABLE')).toBe(false);
        });
    });

    // ─── Grant Permission ───────────────────────────────────────────

    describe('Grant Permission', () => {
        it('should use brackets vs double-quotes for role and object quoting', () => {
            const ssGrant = ss.GrantPermission('SELECT', 'TABLE', '__mj', 'Users', 'app_reader');
            const pgGrant = pg.GrantPermission('SELECT', 'TABLE', '__mj', 'Users', 'app_reader');
            expect(ssGrant).toBe('GRANT SELECT ON [__mj].[Users] TO [app_reader]');
            expect(pgGrant).toBe('GRANT SELECT ON __mj."Users" TO "app_reader"');
        });
    });

    // ─── Comment on Object ──────────────────────────────────────────

    describe('Comment on Object', () => {
        it('should use sp_addextendedproperty vs COMMENT ON', () => {
            const ssComment = ss.CommentOnObject('TABLE', '__mj', 'Users', 'All user accounts');
            const pgComment = pg.CommentOnObject('TABLE', '__mj', 'Users', 'All user accounts');
            expect(ssComment).toContain('sp_addextendedproperty');
            expect(pgComment).toBe('COMMENT ON TABLE __mj."Users" IS \'All user accounts\'');
        });

        it('should both handle single quotes in comments', () => {
            const ssComment = ss.CommentOnObject('TABLE', '__mj', 'Users', "User's records");
            const pgComment = pg.CommentOnObject('TABLE', '__mj', 'Users', "User's records");
            // Both should escape single quotes
            expect(ssComment).toContain("User''s records");
            expect(pgComment).toContain("User''s records");
        });
    });

    // ─── Trigger DDL ────────────────────────────────────────────────

    describe('Trigger DDL', () => {
        it('should produce single-statement trigger for SQL Server vs function+trigger pair for PostgreSQL', () => {
            const options: TriggerOptions = {
                schema: '__mj',
                tableName: 'Entity',
                triggerName: 'trg_update_entity',
                timing: 'AFTER',
                events: ['UPDATE'],
                body: 'UPDATE __mj.Entity SET UpdatedAt = GETUTCDATE()',
                functionName: 'fn_trg_update_entity',
            };
            const ssTrigger = ss.TriggerDDL(options);
            const pgTrigger = pg.TriggerDDL(options);

            // SQL Server: single CREATE TRIGGER block
            expect(ssTrigger).toContain('CREATE TRIGGER [__mj].[trg_update_entity]');
            expect(ssTrigger).toContain('SET NOCOUNT ON');
            expect(ssTrigger).not.toContain('FUNCTION');

            // PostgreSQL: function + trigger, two CREATE statements
            expect(pgTrigger).toContain('CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity"()');
            expect(pgTrigger).toContain('RETURNS TRIGGER');
            expect(pgTrigger).toContain('CREATE TRIGGER "trg_update_entity"');
            expect(pgTrigger).toContain('EXECUTE FUNCTION');
        });

        it('should join multiple events with comma for SQL Server and OR for PostgreSQL', () => {
            const options: TriggerOptions = {
                schema: '__mj',
                tableName: 'Entity',
                triggerName: 'trg_mod_entity',
                timing: 'AFTER',
                events: ['INSERT', 'UPDATE', 'DELETE'],
                body: 'RETURN NEW;',
                functionName: 'fn_trg_mod_entity',
            };
            const ssTrigger = ss.TriggerDDL(options);
            const pgTrigger = pg.TriggerDDL(options);

            expect(ssTrigger).toContain('AFTER INSERT, UPDATE, DELETE');
            expect(pgTrigger).toContain('AFTER INSERT OR UPDATE OR DELETE');
        });
    });

    // ─── Index DDL ──────────────────────────────────────────────────

    describe('Index DDL', () => {
        it('should use brackets vs double-quotes and IF NOT EXISTS only for PostgreSQL', () => {
            const options: IndexOptions = {
                schema: '__mj',
                tableName: 'Entity',
                indexName: 'idx_Entity_Name',
                columns: ['Name'],
            };
            const ssIndex = ss.IndexDDL(options);
            const pgIndex = pg.IndexDDL(options);

            expect(ssIndex).toBe('CREATE INDEX [idx_Entity_Name] ON [__mj].[Entity]([Name])');
            expect(pgIndex).toBe('CREATE INDEX IF NOT EXISTS "idx_Entity_Name" ON __mj."Entity"("Name")');
        });

        it('should support INCLUDE for SQL Server and WHERE for PostgreSQL', () => {
            const ssOptions: IndexOptions = {
                schema: '__mj',
                tableName: 'Entity',
                indexName: 'idx_Entity_Email',
                columns: ['Email'],
                unique: true,
                includeColumns: ['Name', 'Status'],
            };
            const pgOptions: IndexOptions = {
                schema: '__mj',
                tableName: 'Entity',
                indexName: 'idx_Entity_Active',
                columns: ['Status'],
                where: '"IsActive" = true',
            };

            const ssIndex = ss.IndexDDL(ssOptions);
            const pgIndex = pg.IndexDDL(pgOptions);

            expect(ssIndex).toContain('INCLUDE ([Name], [Status])');
            expect(pgIndex).toContain('WHERE "IsActive" = true');
        });
    });

    // ─── Schema Introspection ───────────────────────────────────────

    describe('Schema Introspection Queries', () => {
        it('should produce structurally complete query sets for both platforms', () => {
            const ssQueries = ss.SchemaIntrospectionQueries();
            const pgQueries = pg.SchemaIntrospectionQueries();

            // Both should provide all required query keys
            const keys: (keyof typeof ssQueries)[] = [
                'listTables', 'listColumns', 'listConstraints',
                'listForeignKeys', 'listIndexes', 'objectExists',
            ];
            for (const key of keys) {
                expect(ssQueries[key]).toBeDefined();
                expect(ssQueries[key].length).toBeGreaterThan(0);
                expect(pgQueries[key]).toBeDefined();
                expect(pgQueries[key].length).toBeGreaterThan(0);
            }
        });

        it('should use platform-specific system catalogs', () => {
            const ssQueries = ss.SchemaIntrospectionQueries();
            const pgQueries = pg.SchemaIntrospectionQueries();

            // SQL Server uses sys.* views
            expect(ssQueries.listTables).toContain('sys.tables');
            expect(ssQueries.listColumns).toContain('sys.columns');

            // PostgreSQL uses pg_catalog.* views and information_schema
            expect(pgQueries.listTables).toContain('pg_catalog.pg_tables');
            expect(pgQueries.listColumns).toContain('information_schema.columns');
        });

        it('should use @-prefixed params for SQL Server and $-prefixed params for PostgreSQL introspection', () => {
            const ssQueries = ss.SchemaIntrospectionQueries();
            const pgQueries = pg.SchemaIntrospectionQueries();

            expect(ssQueries.listTables).toContain('@schema');
            expect(pgQueries.listTables).toContain('$1');
        });
    });

    // ─── Aggregate / CASE Compatibility ─────────────────────────────

    describe('Aggregate / CASE Expression Compatibility', () => {
        it('should both produce valid COALESCE for aggregate default values', () => {
            // COALESCE is standard SQL and works on both platforms
            const ssExpr = ss.Coalesce('SUM(Amount)', '0');
            const pgExpr = pg.Coalesce('SUM(Amount)', '0');
            expect(ssExpr).toBe('COALESCE(SUM(Amount), 0)');
            expect(pgExpr).toBe('COALESCE(SUM(Amount), 0)');
        });

        it('should produce correct IIF/CASE for conditional aggregation', () => {
            // A common pattern: COUNT based on condition
            const ssExpr = ss.IIF('Status = 1', '1', 'NULL');
            const pgExpr = pg.IIF('Status = 1', '1', 'NULL');
            expect(ssExpr).toBe('IIF(Status = 1, 1, NULL)');
            expect(pgExpr).toBe('CASE WHEN Status = 1 THEN 1 ELSE NULL END');
        });
    });

    // ─── Multi-Line SQL Patterns ────────────────────────────────────

    describe('Multi-Line SQL Patterns', () => {
        it('should produce correct multi-statement pattern using batch separator', () => {
            // SQL Server needs GO between batches; PostgreSQL does not
            const ssBatch = `CREATE VIEW [__mj].[vwTest] AS SELECT 1;\n${ss.BatchSeparator()}\nSELECT 1;`;
            const pgBatch = `CREATE VIEW __mj."vwTest" AS SELECT 1;\n${pg.BatchSeparator()}\nSELECT 1;`;
            expect(ssBatch).toContain('GO');
            // PostgreSQL batch separator is empty, resulting in just a newline
            expect(pgBatch).not.toContain('GO');
        });
    });

    // ─── Full-Text Index DDL ────────────────────────────────────────

    describe('Full-Text Index DDL', () => {
        it('should produce FULLTEXT CATALOG for SQL Server and tsvector/GIN for PostgreSQL', () => {
            const ssFTS = ss.FullTextIndexDDL('[__mj].[User]', ['Name', 'Email']);
            const pgFTS = pg.FullTextIndexDDL('__mj."User"', ['Name', 'Email']);

            // SQL Server: FULLTEXT CATALOG + FULLTEXT INDEX
            expect(ssFTS).toContain('FULLTEXT CATALOG');
            expect(ssFTS).toContain('FULLTEXT INDEX');

            // PostgreSQL: tsvector column + GIN index + trigger function
            expect(pgFTS).toContain('TSVECTOR');
            expect(pgFTS).toContain('USING GIN');
            expect(pgFTS).toContain('plpgsql');
        });
    });
});
