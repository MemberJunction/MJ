import { describe, it, expect, beforeEach } from 'vitest';
import { PostgreSQLDialect } from '../postgresqlDialect.js';

describe('PostgreSQLDialect', () => {
    let dialect: PostgreSQLDialect;

    beforeEach(() => {
        dialect = new PostgreSQLDialect();
    });

    describe('PlatformKey', () => {
        it('should return postgresql', () => {
            expect(dialect.PlatformKey).toBe('postgresql');
        });
    });

    describe('QuoteIdentifier', () => {
        it('should wrap name in double quotes', () => {
            expect(dialect.QuoteIdentifier('Name')).toBe('"Name"');
        });

        it('should handle single-word identifiers', () => {
            expect(dialect.QuoteIdentifier('ID')).toBe('"ID"');
        });

        it('should handle identifiers with spaces', () => {
            expect(dialect.QuoteIdentifier('First Name')).toBe('"First Name"');
        });
    });

    describe('QuoteSchema', () => {
        it('should produce schema-qualified reference with double quotes on object', () => {
            expect(dialect.QuoteSchema('__mj', 'vw_users')).toBe('__mj."vw_users"');
        });
    });

    describe('LimitClause', () => {
        it('should return LIMIT suffix when no offset', () => {
            const result = dialect.LimitClause(10);
            expect(result.prefix).toBe('');
            expect(result.suffix).toBe('LIMIT 10');
        });

        it('should return LIMIT/OFFSET suffix when offset provided', () => {
            const result = dialect.LimitClause(10, 20);
            expect(result.prefix).toBe('');
            expect(result.suffix).toBe('LIMIT 10 OFFSET 20');
        });
    });

    describe('BooleanLiteral', () => {
        it('should return true for true', () => {
            expect(dialect.BooleanLiteral(true)).toBe('true');
        });

        it('should return false for false', () => {
            expect(dialect.BooleanLiteral(false)).toBe('false');
        });
    });

    describe('CurrentTimestampUTC', () => {
        it('should return NOW() AT TIME ZONE UTC', () => {
            expect(dialect.CurrentTimestampUTC()).toBe("(NOW() AT TIME ZONE 'UTC')");
        });
    });

    describe('NewUUID', () => {
        it('should return gen_random_uuid()', () => {
            expect(dialect.NewUUID()).toBe('gen_random_uuid()');
        });
    });

    describe('CastToText', () => {
        it('should cast to TEXT', () => {
            expect(dialect.CastToText('col1')).toBe('CAST(col1 AS TEXT)');
        });
    });

    describe('CastToUUID', () => {
        it('should cast to UUID', () => {
            expect(dialect.CastToUUID('col1')).toBe('CAST(col1 AS UUID)');
        });
    });

    describe('ReturnInsertedClause', () => {
        it('should return RETURNING * when no columns specified', () => {
            expect(dialect.ReturnInsertedClause()).toBe('RETURNING *');
        });

        it('should return RETURNING with specific columns', () => {
            expect(dialect.ReturnInsertedClause(['ID', 'Name'])).toBe('RETURNING "ID", "Name"');
        });
    });

    describe('AutoIncrementPKExpression', () => {
        it('should return GENERATED ALWAYS AS IDENTITY', () => {
            expect(dialect.AutoIncrementPKExpression()).toBe('GENERATED ALWAYS AS IDENTITY');
        });
    });

    describe('UUIDPKDefault', () => {
        it('should return gen_random_uuid()', () => {
            expect(dialect.UUIDPKDefault()).toBe('gen_random_uuid()');
        });
    });

    describe('ScopeIdentityExpression', () => {
        it('should return lastval()', () => {
            expect(dialect.ScopeIdentityExpression()).toBe('lastval()');
        });
    });

    describe('RowCountExpression', () => {
        it('should return ROW_COUNT', () => {
            expect(dialect.RowCountExpression()).toBe('ROW_COUNT');
        });
    });

    describe('BatchSeparator', () => {
        it('should return empty string', () => {
            expect(dialect.BatchSeparator()).toBe('');
        });
    });

    describe('ExistenceCheckSQL', () => {
        it('should check for table existence using pg_tables', () => {
            const sql = dialect.ExistenceCheckSQL('TABLE', '__mj', 'User');
            expect(sql).toContain('pg_catalog.pg_tables');
            expect(sql).toContain('__mj');
            expect(sql).toContain('User');
        });

        it('should check for view existence using pg_views', () => {
            const sql = dialect.ExistenceCheckSQL('VIEW', '__mj', 'vw_users');
            expect(sql).toContain('pg_catalog.pg_views');
        });

        it('should check for function existence using pg_proc', () => {
            const sql = dialect.ExistenceCheckSQL('FUNCTION', '__mj', 'fn_create_user');
            expect(sql).toContain('pg_catalog.pg_proc');
        });

        it('should check for procedure existence with prokind filter', () => {
            const sql = dialect.ExistenceCheckSQL('PROCEDURE', '__mj', 'my_proc');
            expect(sql).toContain("prokind = 'p'");
        });
    });

    describe('CreateOrReplaceSupported', () => {
        it('should return true for FUNCTION', () => {
            expect(dialect.CreateOrReplaceSupported('FUNCTION')).toBe(true);
        });

        it('should return true for VIEW', () => {
            expect(dialect.CreateOrReplaceSupported('VIEW')).toBe(true);
        });

        it('should return true for PROCEDURE', () => {
            expect(dialect.CreateOrReplaceSupported('PROCEDURE')).toBe(true);
        });

        it('should return false for TABLE', () => {
            expect(dialect.CreateOrReplaceSupported('TABLE')).toBe(false);
        });
    });

    describe('FullTextSearchPredicate', () => {
        it('should return @@ plainto_tsquery predicate', () => {
            const result = dialect.FullTextSearchPredicate('__mj_fts_vector', "'search term'");
            expect(result).toBe("__mj_fts_vector @@ plainto_tsquery('english', 'search term')");
        });
    });

    describe('RecursiveCTESyntax', () => {
        it('should return WITH RECURSIVE', () => {
            expect(dialect.RecursiveCTESyntax()).toBe('WITH RECURSIVE');
        });
    });

    describe('ParameterPlaceholder', () => {
        it('should return $-prefixed 1-based placeholders', () => {
            expect(dialect.ParameterPlaceholder(0)).toBe('$1');
            expect(dialect.ParameterPlaceholder(1)).toBe('$2');
            expect(dialect.ParameterPlaceholder(5)).toBe('$6');
        });
    });

    describe('ConcatOperator', () => {
        it('should return ||', () => {
            expect(dialect.ConcatOperator()).toBe('||');
        });
    });

    describe('StringSplitFunction', () => {
        it('should return unnest(string_to_array(...))', () => {
            const result = dialect.StringSplitFunction("'a,b,c'", "','");
            expect(result).toBe("unnest(string_to_array('a,b,c', ','))");
        });
    });

    describe('JsonExtract', () => {
        it('should return ->> operator', () => {
            expect(dialect.JsonExtract('data', 'name')).toBe("data->>'name'");
        });
    });

    describe('ProcedureCallSyntax', () => {
        it('should return SELECT * FROM function call', () => {
            const sql = dialect.ProcedureCallSyntax('__mj', 'fn_create_user', ['$1', '$2']);
            expect(sql).toBe('SELECT * FROM __mj."fn_create_user"($1, $2)');
        });
    });

    describe('TriggerDDL', () => {
        it('should generate PostgreSQL trigger + function pair', () => {
            const ddl = dialect.TriggerDDL({
                schema: '__mj',
                tableName: 'User',
                triggerName: 'trg_update_user',
                timing: 'BEFORE',
                events: ['UPDATE'],
                body: 'NEW.__mj_UpdatedAt := NOW() AT TIME ZONE \'UTC\';\n    RETURN NEW;',
                functionName: 'fn_trg_update_user',
            });
            expect(ddl).toContain('CREATE OR REPLACE FUNCTION __mj."fn_trg_update_user"()');
            expect(ddl).toContain('RETURNS TRIGGER');
            expect(ddl).toContain('LANGUAGE plpgsql');
            expect(ddl).toContain('CREATE TRIGGER "trg_update_user"');
            expect(ddl).toContain('BEFORE UPDATE');
            expect(ddl).toContain('FOR EACH ROW');
            expect(ddl).toContain('EXECUTE FUNCTION __mj."fn_trg_update_user"()');
        });

        it('should use events joined with OR', () => {
            const ddl = dialect.TriggerDDL({
                schema: '__mj',
                tableName: 'User',
                triggerName: 'trg_mod_user',
                timing: 'BEFORE',
                events: ['INSERT', 'UPDATE'],
                body: 'RETURN NEW;',
                functionName: 'fn_trg_mod_user',
            });
            expect(ddl).toContain('BEFORE INSERT OR UPDATE');
        });
    });

    describe('IndexDDL', () => {
        it('should generate basic index with double-quote identifiers', () => {
            const ddl = dialect.IndexDDL({
                schema: '__mj',
                tableName: 'User',
                indexName: 'idx_User_Name',
                columns: ['Name'],
            });
            expect(ddl).toBe('CREATE INDEX IF NOT EXISTS "idx_User_Name" ON __mj."User"("Name")');
        });

        it('should generate GIN index', () => {
            const ddl = dialect.IndexDDL({
                schema: '__mj',
                tableName: 'User',
                indexName: 'idx_fts_user',
                columns: ['__mj_fts_vector'],
                method: 'GIN',
            });
            expect(ddl).toContain('USING GIN');
        });

        it('should generate unique index', () => {
            const ddl = dialect.IndexDDL({
                schema: '__mj',
                tableName: 'User',
                indexName: 'idx_User_Email',
                columns: ['Email'],
                unique: true,
            });
            expect(ddl).toContain('UNIQUE');
        });

        it('should support partial index with WHERE clause', () => {
            const ddl = dialect.IndexDDL({
                schema: '__mj',
                tableName: 'User',
                indexName: 'idx_active',
                columns: ['Status'],
                where: '"IsActive" = true',
            });
            expect(ddl).toContain('WHERE "IsActive" = true');
        });
    });

    describe('GrantPermission', () => {
        it('should generate GRANT statement with double quotes', () => {
            const sql = dialect.GrantPermission('SELECT', 'VIEW', '__mj', 'vw_users', 'cdp_UI');
            expect(sql).toBe('GRANT SELECT ON __mj."vw_users" TO "cdp_UI"');
        });
    });

    describe('CommentOnObject', () => {
        it('should generate COMMENT ON statement', () => {
            const sql = dialect.CommentOnObject('TABLE', '__mj', 'User', 'User accounts');
            expect(sql).toBe("COMMENT ON TABLE __mj.\"User\" IS 'User accounts'");
        });

        it('should escape single quotes in comments', () => {
            const sql = dialect.CommentOnObject('TABLE', '__mj', 'User', "User's accounts");
            expect(sql).toContain("User''s accounts");
        });
    });

    describe('IIF', () => {
        it('should return CASE WHEN expression', () => {
            expect(dialect.IIF('x > 0', "'positive'", "'negative'")).toBe("CASE WHEN x > 0 THEN 'positive' ELSE 'negative' END");
        });
    });

    describe('TypeMap', () => {
        it('should map UNIQUEIDENTIFIER to UUID', () => {
            const result = dialect.TypeMap.MapTypeToString('UNIQUEIDENTIFIER');
            expect(result).toBe('UUID');
        });

        it('should map NVARCHAR(255) to VARCHAR(255)', () => {
            const result = dialect.TypeMap.MapTypeToString('NVARCHAR', 255);
            expect(result).toBe('VARCHAR(255)');
        });

        it('should map NVARCHAR(MAX) to TEXT', () => {
            const result = dialect.TypeMap.MapTypeToString('NVARCHAR', -1);
            expect(result).toBe('TEXT');
        });

        it('should map NVARCHAR without length to TEXT', () => {
            const result = dialect.TypeMap.MapTypeToString('NVARCHAR');
            expect(result).toBe('TEXT');
        });

        it('should map BIT to BOOLEAN', () => {
            const result = dialect.TypeMap.MapTypeToString('BIT');
            expect(result).toBe('BOOLEAN');
        });

        it('should map INT to INTEGER', () => {
            const result = dialect.TypeMap.MapTypeToString('INT');
            expect(result).toBe('INTEGER');
        });

        it('should map BIGINT to BIGINT', () => {
            const result = dialect.TypeMap.MapTypeToString('BIGINT');
            expect(result).toBe('BIGINT');
        });

        it('should map TINYINT to SMALLINT', () => {
            const result = dialect.TypeMap.MapTypeToString('TINYINT');
            expect(result).toBe('SMALLINT');
        });

        it('should map DATETIMEOFFSET to TIMESTAMPTZ', () => {
            const result = dialect.TypeMap.MapTypeToString('DATETIMEOFFSET');
            expect(result).toBe('TIMESTAMPTZ');
        });

        it('should map DATETIME2 to TIMESTAMP', () => {
            const result = dialect.TypeMap.MapTypeToString('DATETIME2');
            expect(result).toBe('TIMESTAMP');
        });

        it('should map FLOAT to DOUBLE PRECISION', () => {
            const result = dialect.TypeMap.MapTypeToString('FLOAT');
            expect(result).toBe('DOUBLE PRECISION');
        });

        it('should map FLOAT(24) to REAL', () => {
            const mapped = dialect.TypeMap.MapType('FLOAT', undefined, 24);
            expect(mapped.typeName).toBe('REAL');
        });

        it('should map DECIMAL with precision and scale', () => {
            const result = dialect.TypeMap.MapTypeToString('DECIMAL', undefined, 10, 2);
            expect(result).toBe('NUMERIC(10,2)');
        });

        it('should map VARBINARY to BYTEA', () => {
            const result = dialect.TypeMap.MapTypeToString('VARBINARY', -1);
            expect(result).toBe('BYTEA');
        });

        it('should map IMAGE to BYTEA', () => {
            const result = dialect.TypeMap.MapTypeToString('IMAGE');
            expect(result).toBe('BYTEA');
        });

        it('should map MONEY to NUMERIC(19,4)', () => {
            const result = dialect.TypeMap.MapTypeToString('MONEY');
            expect(result).toBe('NUMERIC(19,4)');
        });

        it('should map NTEXT to TEXT', () => {
            const result = dialect.TypeMap.MapTypeToString('NTEXT');
            expect(result).toBe('TEXT');
        });

        it('should map SMALLDATETIME to TIMESTAMP(0)', () => {
            const result = dialect.TypeMap.MapTypeToString('SMALLDATETIME');
            expect(result).toBe('TIMESTAMP(0)');
        });

        it('should pass through native PostgreSQL types', () => {
            expect(dialect.TypeMap.MapTypeToString('UUID')).toBe('UUID');
            expect(dialect.TypeMap.MapTypeToString('BOOLEAN')).toBe('BOOLEAN');
            expect(dialect.TypeMap.MapTypeToString('TIMESTAMPTZ')).toBe('TIMESTAMPTZ');
            expect(dialect.TypeMap.MapTypeToString('BYTEA')).toBe('BYTEA');
            expect(dialect.TypeMap.MapTypeToString('JSONB')).toBe('JSONB');
        });
    });

    describe('SchemaIntrospectionQueries', () => {
        it('should return all query templates using pg_catalog', () => {
            const queries = dialect.SchemaIntrospectionQueries();
            expect(queries.listTables).toContain('pg_catalog.pg_tables');
            expect(queries.listColumns).toContain('information_schema.columns');
            expect(queries.listConstraints).toContain('information_schema.table_constraints');
            expect(queries.listForeignKeys).toContain('FOREIGN KEY');
            expect(queries.listIndexes).toContain('pg_catalog.pg_index');
            expect(queries.objectExists).toContain('pg_catalog.pg_class');
        });

        it('should use $1/$2 parameter placeholders', () => {
            const queries = dialect.SchemaIntrospectionQueries();
            expect(queries.listTables).toContain('$1');
            expect(queries.listColumns).toContain('$1');
            expect(queries.listColumns).toContain('$2');
        });
    });

    describe('Coalesce (inherited)', () => {
        it('should return COALESCE expression', () => {
            expect(dialect.Coalesce('col1', "'default'")).toBe("COALESCE(col1, 'default')");
        });
    });

    describe('MapDataType convenience method', () => {
        it('should delegate to TypeMap.MapType', () => {
            const result = dialect.MapDataType('NVARCHAR', 100);
            expect(result.typeName).toBe('VARCHAR');
            expect(result.supportsLength).toBe(true);
        });
    });

    describe('MapDataTypeToString convenience method', () => {
        it('should delegate to TypeMap.MapTypeToString', () => {
            expect(dialect.MapDataTypeToString('NVARCHAR', 100)).toBe('VARCHAR(100)');
        });
    });

    describe('FullTextIndexDDL', () => {
        it('should generate tsvector column, GIN index, trigger function, and trigger', () => {
            const ddl = dialect.FullTextIndexDDL('__mj."User"', ['Name', 'Email']);
            expect(ddl).toContain('ADD COLUMN IF NOT EXISTS __mj_fts_vector TSVECTOR');
            expect(ddl).toContain('USING GIN(__mj_fts_vector)');
            expect(ddl).toContain('CREATE OR REPLACE FUNCTION');
            expect(ddl).toContain("to_tsvector('english'");
            expect(ddl).toContain('CREATE TRIGGER');
            expect(ddl).toContain('BEFORE INSERT OR UPDATE');
        });
    });
});
