import { describe, it, expect, vi } from 'vitest';

// Shared rules
import { EmptyStringToNullRule } from '../strategies/builtin/transforms/shared/EmptyStringToNull.js';
import { TrimWhitespaceRule } from '../strategies/builtin/transforms/shared/TrimWhitespace.js';

// SQL Server rules
import { NormalizeUUIDUppercaseRule } from '../strategies/builtin/transforms/sqlserver/NormalizeUUIDUppercase.js';

// PostgreSQL rules
import { NormalizeUUIDLowercaseRule } from '../strategies/builtin/transforms/postgresql/NormalizeUUIDLowercase.js';
import { ValidateJsonbRule } from '../strategies/builtin/transforms/postgresql/ValidateJsonb.js';
import { CoerceBooleanStringsRule } from '../strategies/builtin/transforms/postgresql/CoerceBooleanStrings.js';
import { CoerceTimestamptzRule } from '../strategies/builtin/transforms/postgresql/CoerceTimestamptz.js';

// Pipeline
import { DefaultTransformPipeline } from '../strategies/builtin/transforms/DefaultTransformPipeline.js';

/**
 * Comprehensive tests for the transform strategy rules and pipeline.
 * Each rule is tested individually for correctness, edge cases, and metadata
 * (ConnectorName, TargetPlatform). The DefaultTransformPipeline is tested
 * for correct rule filtering, ordering, and end-to-end record transformation.
 */

// ============================================================================
// Shared Rules
// ============================================================================

describe('EmptyStringToNullRule', () => {
    const rule = new EmptyStringToNullRule();

    describe('metadata', () => {
        it('should have Name "EmptyStringToNull"', () => {
            expect(rule.Name).toBe('EmptyStringToNull');
        });

        it('should have ConnectorName "*" (universal)', () => {
            expect(rule.ConnectorName).toBe('*');
        });

        it('should have TargetPlatform "*" (all platforms)', () => {
            expect(rule.TargetPlatform).toBe('*');
        });
    });

    describe('Apply', () => {
        it('should convert empty string to null', () => {
            expect(rule.Apply('Name', '', 'nvarchar')).toBeNull();
        });

        it('should leave non-empty strings unchanged', () => {
            expect(rule.Apply('Name', 'Alice', 'nvarchar')).toBe('Alice');
        });

        it('should leave whitespace-only strings unchanged (not empty)', () => {
            expect(rule.Apply('Name', '   ', 'nvarchar')).toBe('   ');
        });

        it('should leave null unchanged', () => {
            expect(rule.Apply('Name', null, 'nvarchar')).toBeNull();
        });

        it('should leave undefined unchanged', () => {
            expect(rule.Apply('Name', undefined, 'nvarchar')).toBeUndefined();
        });

        it('should leave numbers unchanged', () => {
            expect(rule.Apply('Count', 42, 'int')).toBe(42);
        });

        it('should leave 0 unchanged (not empty)', () => {
            expect(rule.Apply('Count', 0, 'int')).toBe(0);
        });

        it('should leave false unchanged', () => {
            expect(rule.Apply('Active', false, 'bit')).toBe(false);
        });

        it('should leave objects unchanged', () => {
            const obj = { key: 'value' };
            expect(rule.Apply('Data', obj, 'nvarchar')).toBe(obj);
        });

        it('should leave arrays unchanged', () => {
            const arr = [1, 2, 3];
            expect(rule.Apply('Items', arr, 'nvarchar')).toBe(arr);
        });
    });
});

describe('TrimWhitespaceRule', () => {
    const rule = new TrimWhitespaceRule();

    describe('metadata', () => {
        it('should have Name "TrimWhitespace"', () => {
            expect(rule.Name).toBe('TrimWhitespace');
        });

        it('should have ConnectorName "*" (universal)', () => {
            expect(rule.ConnectorName).toBe('*');
        });

        it('should have TargetPlatform "*" (all platforms)', () => {
            expect(rule.TargetPlatform).toBe('*');
        });
    });

    describe('Apply', () => {
        it('should trim leading spaces', () => {
            expect(rule.Apply('Name', '   Alice', 'nvarchar')).toBe('Alice');
        });

        it('should trim trailing spaces', () => {
            expect(rule.Apply('Name', 'Alice   ', 'nvarchar')).toBe('Alice');
        });

        it('should trim leading and trailing spaces', () => {
            expect(rule.Apply('Name', '   Alice   ', 'nvarchar')).toBe('Alice');
        });

        it('should trim tabs', () => {
            expect(rule.Apply('Name', '\tAlice\t', 'nvarchar')).toBe('Alice');
        });

        it('should trim newlines', () => {
            expect(rule.Apply('Name', '\nAlice\n', 'nvarchar')).toBe('Alice');
        });

        it('should trim mixed whitespace characters', () => {
            expect(rule.Apply('Name', ' \t\n Alice \n\t ', 'nvarchar')).toBe('Alice');
        });

        it('should not trim internal whitespace', () => {
            expect(rule.Apply('Name', 'Alice  Smith', 'nvarchar')).toBe('Alice  Smith');
        });

        it('should return empty string when value is only whitespace', () => {
            expect(rule.Apply('Name', '   ', 'nvarchar')).toBe('');
        });

        it('should leave non-strings unchanged (number)', () => {
            expect(rule.Apply('Count', 42, 'int')).toBe(42);
        });

        it('should leave non-strings unchanged (boolean)', () => {
            expect(rule.Apply('Active', true, 'bit')).toBe(true);
        });

        it('should leave null unchanged', () => {
            expect(rule.Apply('Name', null, 'nvarchar')).toBeNull();
        });

        it('should leave undefined unchanged', () => {
            expect(rule.Apply('Name', undefined, 'nvarchar')).toBeUndefined();
        });

        it('should leave objects unchanged', () => {
            const obj = { key: 'value' };
            expect(rule.Apply('Data', obj, 'nvarchar')).toBe(obj);
        });

        it('should handle empty string (no-op)', () => {
            expect(rule.Apply('Name', '', 'nvarchar')).toBe('');
        });
    });
});

// ============================================================================
// SQL Server Rules
// ============================================================================

describe('NormalizeUUIDUppercaseRule', () => {
    const rule = new NormalizeUUIDUppercaseRule();

    describe('metadata', () => {
        it('should have Name "NormalizeUUIDUppercase"', () => {
            expect(rule.Name).toBe('NormalizeUUIDUppercase');
        });

        it('should have TargetPlatform "sqlserver"', () => {
            expect(rule.TargetPlatform).toBe('sqlserver');
        });

        it('should have ConnectorName "*"', () => {
            expect(rule.ConnectorName).toBe('*');
        });
    });

    describe('Apply', () => {
        const uuidLower = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        const uuidUpper = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
        const uuidMixed = 'a1B2c3D4-E5f6-7890-AbCd-eF1234567890';

        it('should uppercase a lowercase UUID for uniqueidentifier field type', () => {
            expect(rule.Apply('ID', uuidLower, 'uniqueidentifier')).toBe(uuidUpper);
        });

        it('should leave an already-uppercase UUID unchanged', () => {
            expect(rule.Apply('ID', uuidUpper, 'uniqueidentifier')).toBe(uuidUpper);
        });

        it('should uppercase a mixed-case UUID', () => {
            expect(rule.Apply('ID', uuidMixed, 'uniqueidentifier')).toBe(uuidUpper);
        });

        it('should match fieldType case-insensitively (UNIQUEIDENTIFIER)', () => {
            expect(rule.Apply('ID', uuidLower, 'UNIQUEIDENTIFIER')).toBe(uuidUpper);
        });

        it('should match fieldType when it contains "uniqueidentifier" as substring', () => {
            expect(rule.Apply('ID', uuidLower, 'uniqueidentifier(36)')).toBe(uuidUpper);
        });

        it('should leave non-UUID strings unchanged for uniqueidentifier fields', () => {
            expect(rule.Apply('ID', 'not-a-uuid', 'uniqueidentifier')).toBe('not-a-uuid');
        });

        it('should leave valid UUID unchanged for non-uniqueidentifier field types', () => {
            expect(rule.Apply('Code', uuidLower, 'nvarchar')).toBe(uuidLower);
        });

        it('should leave valid UUID unchanged for varchar field types', () => {
            expect(rule.Apply('Code', uuidLower, 'varchar(100)')).toBe(uuidLower);
        });

        it('should leave null unchanged', () => {
            expect(rule.Apply('ID', null, 'uniqueidentifier')).toBeNull();
        });

        it('should leave numbers unchanged', () => {
            expect(rule.Apply('ID', 123, 'uniqueidentifier')).toBe(123);
        });

        it('should leave empty string unchanged (not a valid UUID)', () => {
            expect(rule.Apply('ID', '', 'uniqueidentifier')).toBe('');
        });

        it('should not uppercase a UUID with wrong format (missing dashes)', () => {
            expect(rule.Apply('ID', 'a1b2c3d4e5f67890abcdef1234567890', 'uniqueidentifier'))
                .toBe('a1b2c3d4e5f67890abcdef1234567890');
        });
    });
});

// ============================================================================
// PostgreSQL Rules
// ============================================================================

describe('NormalizeUUIDLowercaseRule', () => {
    const rule = new NormalizeUUIDLowercaseRule();

    describe('metadata', () => {
        it('should have Name "NormalizeUUIDLowercase"', () => {
            expect(rule.Name).toBe('NormalizeUUIDLowercase');
        });

        it('should have TargetPlatform "postgresql"', () => {
            expect(rule.TargetPlatform).toBe('postgresql');
        });

        it('should have ConnectorName "*"', () => {
            expect(rule.ConnectorName).toBe('*');
        });
    });

    describe('Apply', () => {
        const uuidUpper = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
        const uuidLower = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        const uuidMixed = 'A1b2C3d4-e5F6-7890-aBcD-Ef1234567890';

        it('should lowercase an uppercase UUID for uuid field type', () => {
            expect(rule.Apply('ID', uuidUpper, 'uuid')).toBe(uuidLower);
        });

        it('should leave an already-lowercase UUID unchanged', () => {
            expect(rule.Apply('ID', uuidLower, 'uuid')).toBe(uuidLower);
        });

        it('should lowercase a mixed-case UUID', () => {
            expect(rule.Apply('ID', uuidMixed, 'uuid')).toBe(uuidLower);
        });

        it('should match fieldType case-insensitively (UUID)', () => {
            expect(rule.Apply('ID', uuidUpper, 'UUID')).toBe(uuidLower);
        });

        it('should match fieldType when it contains "uuid" as substring', () => {
            expect(rule.Apply('ID', uuidUpper, 'uuid(36)')).toBe(uuidLower);
        });

        it('should leave non-UUID strings unchanged for uuid fields', () => {
            expect(rule.Apply('ID', 'not-a-uuid', 'uuid')).toBe('not-a-uuid');
        });

        it('should leave valid UUID unchanged for non-uuid field types', () => {
            expect(rule.Apply('Code', uuidUpper, 'varchar')).toBe(uuidUpper);
        });

        it('should leave null unchanged', () => {
            expect(rule.Apply('ID', null, 'uuid')).toBeNull();
        });

        it('should leave numbers unchanged', () => {
            expect(rule.Apply('ID', 123, 'uuid')).toBe(123);
        });

        it('should leave empty string unchanged (not a valid UUID)', () => {
            expect(rule.Apply('ID', '', 'uuid')).toBe('');
        });
    });
});

describe('ValidateJsonbRule', () => {
    const rule = new ValidateJsonbRule();

    describe('metadata', () => {
        it('should have Name "ValidateJsonb"', () => {
            expect(rule.Name).toBe('ValidateJsonb');
        });

        it('should have TargetPlatform "postgresql"', () => {
            expect(rule.TargetPlatform).toBe('postgresql');
        });

        it('should have ConnectorName "*"', () => {
            expect(rule.ConnectorName).toBe('*');
        });
    });

    describe('Apply', () => {
        it('should return valid JSON strings unchanged', () => {
            const json = '{"name":"Alice","age":30}';
            expect(rule.Apply('Data', json, 'jsonb')).toBe(json);
        });

        it('should return valid JSON array strings unchanged', () => {
            const json = '[1,2,3]';
            expect(rule.Apply('Data', json, 'jsonb')).toBe(json);
        });

        it('should return valid JSON primitive strings unchanged', () => {
            expect(rule.Apply('Data', '"hello"', 'jsonb')).toBe('"hello"');
            expect(rule.Apply('Data', '42', 'jsonb')).toBe('42');
            expect(rule.Apply('Data', 'true', 'jsonb')).toBe('true');
            expect(rule.Apply('Data', 'null', 'jsonb')).toBe('null');
        });

        it('should return null for invalid JSON strings', () => {
            expect(rule.Apply('Data', '{invalid json}', 'jsonb')).toBeNull();
        });

        it('should return null for truncated JSON', () => {
            expect(rule.Apply('Data', '{"name":"Alice', 'jsonb')).toBeNull();
        });

        it('should return null for plain text', () => {
            expect(rule.Apply('Data', 'not json at all', 'jsonb')).toBeNull();
        });

        it('should stringify objects to JSON', () => {
            const obj = { name: 'Alice', age: 30 };
            const result = rule.Apply('Data', obj, 'jsonb');
            expect(result).toBe(JSON.stringify(obj));
        });

        it('should stringify arrays to JSON', () => {
            const arr = [1, 2, 3];
            const result = rule.Apply('Data', arr, 'jsonb');
            expect(result).toBe(JSON.stringify(arr));
        });

        it('should leave null unchanged for jsonb fields', () => {
            expect(rule.Apply('Data', null, 'jsonb')).toBeNull();
        });

        it('should leave numbers unchanged for jsonb fields', () => {
            expect(rule.Apply('Data', 42, 'jsonb')).toBe(42);
        });

        it('should leave booleans unchanged for jsonb fields', () => {
            expect(rule.Apply('Data', true, 'jsonb')).toBe(true);
        });

        it('should leave all values unchanged for non-jsonb fields', () => {
            const invalidJson = '{bad json}';
            expect(rule.Apply('Name', invalidJson, 'varchar')).toBe(invalidJson);
        });

        it('should leave strings unchanged for non-jsonb fields', () => {
            expect(rule.Apply('Name', 'Alice', 'text')).toBe('Alice');
        });

        it('should match fieldType case-insensitively (JSONB)', () => {
            expect(rule.Apply('Data', '{invalid}', 'JSONB')).toBeNull();
        });

        it('should match fieldType containing "jsonb" as substring', () => {
            const json = '{"ok":true}';
            expect(rule.Apply('Data', json, 'jsonb[]')).toBe(json);
        });
    });
});

describe('CoerceBooleanStringsRule', () => {
    const rule = new CoerceBooleanStringsRule();

    describe('metadata', () => {
        it('should have Name "CoerceBooleanStrings"', () => {
            expect(rule.Name).toBe('CoerceBooleanStrings');
        });

        it('should have TargetPlatform "postgresql"', () => {
            expect(rule.TargetPlatform).toBe('postgresql');
        });

        it('should have ConnectorName "*"', () => {
            expect(rule.ConnectorName).toBe('*');
        });
    });

    describe('Apply — truthy strings', () => {
        it('should convert "true" to true for boolean fields', () => {
            expect(rule.Apply('Active', 'true', 'boolean')).toBe(true);
        });

        it('should convert "TRUE" to true (case-insensitive)', () => {
            expect(rule.Apply('Active', 'TRUE', 'boolean')).toBe(true);
        });

        it('should convert "True" to true (case-insensitive)', () => {
            expect(rule.Apply('Active', 'True', 'boolean')).toBe(true);
        });

        it('should convert "1" to true for boolean fields', () => {
            expect(rule.Apply('Active', '1', 'boolean')).toBe(true);
        });

        it('should convert "yes" to true for boolean fields', () => {
            expect(rule.Apply('Active', 'yes', 'boolean')).toBe(true);
        });

        it('should convert "YES" to true (case-insensitive)', () => {
            expect(rule.Apply('Active', 'YES', 'boolean')).toBe(true);
        });
    });

    describe('Apply — falsy strings', () => {
        it('should convert "false" to false for boolean fields', () => {
            expect(rule.Apply('Active', 'false', 'boolean')).toBe(false);
        });

        it('should convert "FALSE" to false (case-insensitive)', () => {
            expect(rule.Apply('Active', 'FALSE', 'boolean')).toBe(false);
        });

        it('should convert "0" to false for boolean fields', () => {
            expect(rule.Apply('Active', '0', 'boolean')).toBe(false);
        });

        it('should convert "no" to false for boolean fields', () => {
            expect(rule.Apply('Active', 'no', 'boolean')).toBe(false);
        });

        it('should convert "NO" to false (case-insensitive)', () => {
            expect(rule.Apply('Active', 'NO', 'boolean')).toBe(false);
        });
    });

    describe('Apply — numeric values', () => {
        it('should convert number 0 to false', () => {
            expect(rule.Apply('Active', 0, 'boolean')).toBe(false);
        });

        it('should convert number 1 to true', () => {
            expect(rule.Apply('Active', 1, 'boolean')).toBe(true);
        });

        it('should convert number -1 to true (non-zero)', () => {
            expect(rule.Apply('Active', -1, 'boolean')).toBe(true);
        });

        it('should convert number 42 to true (non-zero)', () => {
            expect(rule.Apply('Active', 42, 'boolean')).toBe(true);
        });
    });

    describe('Apply — pass-through cases', () => {
        it('should leave unrecognized strings as-is for boolean fields', () => {
            expect(rule.Apply('Active', 'maybe', 'boolean')).toBe('maybe');
        });

        it('should leave boolean true unchanged', () => {
            expect(rule.Apply('Active', true, 'boolean')).toBe(true);
        });

        it('should leave boolean false unchanged', () => {
            expect(rule.Apply('Active', false, 'boolean')).toBe(false);
        });

        it('should leave null unchanged', () => {
            expect(rule.Apply('Active', null, 'boolean')).toBeNull();
        });

        it('should leave all values unchanged for non-boolean fields', () => {
            expect(rule.Apply('Name', 'true', 'varchar')).toBe('true');
        });

        it('should leave numbers unchanged for non-boolean fields', () => {
            expect(rule.Apply('Count', 0, 'integer')).toBe(0);
        });

        it('should match fieldType case-insensitively (BOOLEAN)', () => {
            expect(rule.Apply('Active', 'yes', 'BOOLEAN')).toBe(true);
        });

        it('should match fieldType containing "boolean" as substring', () => {
            expect(rule.Apply('Active', 'no', 'boolean[]')).toBe(false);
        });
    });
});

describe('CoerceTimestamptzRule', () => {
    const rule = new CoerceTimestamptzRule();

    describe('metadata', () => {
        it('should have Name "CoerceTimestamptz"', () => {
            expect(rule.Name).toBe('CoerceTimestamptz');
        });

        it('should have TargetPlatform "postgresql"', () => {
            expect(rule.TargetPlatform).toBe('postgresql');
        });

        it('should have ConnectorName "*"', () => {
            expect(rule.ConnectorName).toBe('*');
        });
    });

    describe('Apply — valid date strings', () => {
        it('should convert ISO 8601 date string to ISO format', () => {
            const result = rule.Apply('CreatedAt', '2024-06-15T10:30:00Z', 'timestamptz');
            expect(result).toBe('2024-06-15T10:30:00.000Z');
        });

        it('should convert date-only string to ISO format', () => {
            const result = rule.Apply('CreatedAt', '2024-01-15', 'timestamptz');
            expect(typeof result).toBe('string');
            expect((result as string).includes('2024-01-15')).toBe(true);
        });

        it('should convert date with timezone offset to ISO format', () => {
            const result = rule.Apply('CreatedAt', '2024-06-15T10:30:00+05:30', 'timestamptz');
            expect(typeof result).toBe('string');
            // Should be converted to UTC ISO string
            expect((result as string).endsWith('Z')).toBe(true);
        });

        it('should handle epoch-style date strings', () => {
            const result = rule.Apply('CreatedAt', 'January 1, 2024', 'timestamptz');
            expect(typeof result).toBe('string');
            expect((result as string).includes('2024')).toBe(true);
        });
    });

    describe('Apply — invalid date strings', () => {
        it('should return null for garbage strings', () => {
            expect(rule.Apply('CreatedAt', 'not-a-date', 'timestamptz')).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(rule.Apply('CreatedAt', '', 'timestamptz')).toBeNull();
        });

        it('should return null for random text', () => {
            expect(rule.Apply('CreatedAt', 'hello world', 'timestamptz')).toBeNull();
        });
    });

    describe('Apply — non-string values', () => {
        it('should leave numbers unchanged for timestamptz fields', () => {
            expect(rule.Apply('CreatedAt', 1718441400000, 'timestamptz')).toBe(1718441400000);
        });

        it('should leave null unchanged', () => {
            expect(rule.Apply('CreatedAt', null, 'timestamptz')).toBeNull();
        });

        it('should leave Date objects unchanged', () => {
            const date = new Date('2024-06-15T10:30:00Z');
            expect(rule.Apply('CreatedAt', date, 'timestamptz')).toBe(date);
        });

        it('should leave booleans unchanged', () => {
            expect(rule.Apply('CreatedAt', true, 'timestamptz')).toBe(true);
        });
    });

    describe('Apply — non-timestamptz fields', () => {
        it('should leave all values unchanged for non-timestamptz fields', () => {
            expect(rule.Apply('Name', '2024-06-15', 'varchar')).toBe('2024-06-15');
        });

        it('should leave invalid dates unchanged for non-timestamptz fields', () => {
            expect(rule.Apply('Name', 'not-a-date', 'text')).toBe('not-a-date');
        });

        it('should match fieldType case-insensitively (TIMESTAMPTZ)', () => {
            const result = rule.Apply('CreatedAt', '2024-06-15T10:30:00Z', 'TIMESTAMPTZ');
            expect(result).toBe('2024-06-15T10:30:00.000Z');
        });
    });
});

// ============================================================================
// DefaultTransformPipeline
// ============================================================================

describe('DefaultTransformPipeline', () => {
    describe('constructor and Rules property', () => {
        it('should store provided rules', () => {
            const rule1 = new EmptyStringToNullRule();
            const rule2 = new TrimWhitespaceRule();
            const pipeline = new DefaultTransformPipeline([rule1, rule2]);
            expect(pipeline.Rules).toHaveLength(2);
            expect(pipeline.Rules[0]).toBe(rule1);
            expect(pipeline.Rules[1]).toBe(rule2);
        });

        it('should handle empty rules array', () => {
            const pipeline = new DefaultTransformPipeline([]);
            expect(pipeline.Rules).toHaveLength(0);
        });
    });

    describe('Execute — empty pipeline', () => {
        it('should return record unchanged when no rules exist', () => {
            const pipeline = new DefaultTransformPipeline([]);
            const record = { Name: 'Alice', Age: 30 };
            const fieldTypes = new Map<string, string>([
                ['Name', 'varchar'],
                ['Age', 'int'],
            ]);
            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');
            expect(result).toEqual({ Name: 'Alice', Age: 30 });
        });
    });

    describe('Execute — shared rules apply to all platforms', () => {
        const pipeline = new DefaultTransformPipeline([
            new EmptyStringToNullRule(),
            new TrimWhitespaceRule(),
        ]);

        const fieldTypes = new Map<string, string>([
            ['Name', 'nvarchar'],
            ['Email', 'nvarchar'],
        ]);

        it('should apply shared rules for sqlserver platform', () => {
            const record = { Name: '', Email: '  alice@test.com  ' };
            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');
            expect(result.Name).toBeNull(); // EmptyStringToNull
            expect(result.Email).toBe('alice@test.com'); // TrimWhitespace
        });

        it('should apply shared rules for postgresql platform', () => {
            const record = { Name: '', Email: '  bob@test.com  ' };
            const result = pipeline.Execute(record, fieldTypes, 'postgresql');
            expect(result.Name).toBeNull();
            expect(result.Email).toBe('bob@test.com');
        });
    });

    describe('Execute — platform-specific rule filtering', () => {
        const allRules = [
            new EmptyStringToNullRule(),       // '*'
            new TrimWhitespaceRule(),           // '*'
            new NormalizeUUIDUppercaseRule(),    // 'sqlserver'
            new NormalizeUUIDLowercaseRule(),    // 'postgresql'
            new CoerceBooleanStringsRule(),      // 'postgresql'
            new ValidateJsonbRule(),             // 'postgresql'
            new CoerceTimestamptzRule(),         // 'postgresql'
        ];
        const pipeline = new DefaultTransformPipeline(allRules);

        it('should run shared + sqlserver rules, skip postgresql rules for sqlserver', () => {
            const uuidLower = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
            const record = {
                ID: uuidLower,
                Active: 'true',
                Data: '{invalid}',
            };
            const fieldTypes = new Map<string, string>([
                ['ID', 'uniqueidentifier'],
                ['Active', 'boolean'],
                ['Data', 'jsonb'],
            ]);

            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');

            // UUID should be uppercased (sqlserver rule applied)
            expect(result.ID).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
            // Boolean coercion should NOT happen (postgresql rule skipped)
            expect(result.Active).toBe('true');
            // JSONB validation should NOT happen (postgresql rule skipped)
            expect(result.Data).toBe('{invalid}');
        });

        it('should run shared + postgresql rules, skip sqlserver rules for postgresql', () => {
            const uuidUpper = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
            const record = {
                ID: uuidUpper,
                Active: 'yes',
                Data: '{"valid":true}',
                CreatedAt: '2024-06-15T10:30:00Z',
            };
            const fieldTypes = new Map<string, string>([
                ['ID', 'uuid'],
                ['Active', 'boolean'],
                ['Data', 'jsonb'],
                ['CreatedAt', 'timestamptz'],
            ]);

            const result = pipeline.Execute(record, fieldTypes, 'postgresql');

            // UUID should be lowercased (postgresql rule applied, not sqlserver uppercase)
            expect(result.ID).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
            // Boolean coercion should happen (postgresql rule applied)
            expect(result.Active).toBe(true);
            // JSONB should pass validation
            expect(result.Data).toBe('{"valid":true}');
            // Timestamp should be ISO 8601
            expect(result.CreatedAt).toBe('2024-06-15T10:30:00.000Z');
        });
    });

    describe('Execute — rules apply in order', () => {
        it('should apply TrimWhitespace before EmptyStringToNull so trimmed-to-empty becomes null', () => {
            // Order: TrimWhitespace first, then EmptyStringToNull
            const pipeline = new DefaultTransformPipeline([
                new TrimWhitespaceRule(),
                new EmptyStringToNullRule(),
            ]);
            const record = { Name: '   ' };
            const fieldTypes = new Map<string, string>([['Name', 'nvarchar']]);

            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');
            // TrimWhitespace turns '   ' into '', then EmptyStringToNull turns '' into null
            expect(result.Name).toBeNull();
        });

        it('should demonstrate order dependency: EmptyStringToNull first, then TrimWhitespace', () => {
            // Order: EmptyStringToNull first, then TrimWhitespace
            const pipeline = new DefaultTransformPipeline([
                new EmptyStringToNullRule(),
                new TrimWhitespaceRule(),
            ]);
            const record = { Name: '   ' };
            const fieldTypes = new Map<string, string>([['Name', 'nvarchar']]);

            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');
            // EmptyStringToNull skips '   ' (not empty), then TrimWhitespace turns it into ''
            expect(result.Name).toBe('');
        });
    });

    describe('Execute — fieldTypes fallback', () => {
        it('should use empty string as fieldType when field is not in fieldTypes map', () => {
            const pipeline = new DefaultTransformPipeline([
                new NormalizeUUIDUppercaseRule(),
            ]);
            const uuidLower = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
            const record = { ID: uuidLower };
            // No fieldType entry for 'ID' — should fall back to ''
            const fieldTypes = new Map<string, string>();

            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');
            // Without 'uniqueidentifier' fieldType, UUID rule should NOT uppercase
            expect(result.ID).toBe(uuidLower);
        });
    });

    describe('Execute — returns a new record object', () => {
        it('should not mutate the original record', () => {
            const pipeline = new DefaultTransformPipeline([new EmptyStringToNullRule()]);
            const original = { Name: '', Age: 30 };
            const fieldTypes = new Map<string, string>([
                ['Name', 'nvarchar'],
                ['Age', 'int'],
            ]);

            const result = pipeline.Execute(original, fieldTypes, 'sqlserver');

            // Result should have null for Name
            expect(result.Name).toBeNull();
            // Original should be untouched
            expect(original.Name).toBe('');
            // They should be different objects
            expect(result).not.toBe(original);
        });
    });

    describe('Execute — full integration: all rules for postgresql', () => {
        it('should transform a realistic record through the full pipeline', () => {
            const pipeline = new DefaultTransformPipeline([
                new TrimWhitespaceRule(),
                new EmptyStringToNullRule(),
                new NormalizeUUIDUppercaseRule(),  // should be skipped for postgresql
                new NormalizeUUIDLowercaseRule(),
                new ValidateJsonbRule(),
                new CoerceBooleanStringsRule(),
                new CoerceTimestamptzRule(),
            ]);

            const record = {
                ID: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
                Name: '  Alice  ',
                Email: '',
                Active: 'yes',
                Metadata: '{"role":"admin"}',
                BadData: '{not valid json}',
                CreatedAt: '2024-06-15T10:30:00Z',
                NullField: null,
            };

            const fieldTypes = new Map<string, string>([
                ['ID', 'uuid'],
                ['Name', 'text'],
                ['Email', 'text'],
                ['Active', 'boolean'],
                ['Metadata', 'jsonb'],
                ['BadData', 'jsonb'],
                ['CreatedAt', 'timestamptz'],
                ['NullField', 'text'],
            ]);

            const result = pipeline.Execute(record, fieldTypes, 'postgresql');

            expect(result.ID).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
            expect(result.Name).toBe('Alice');
            expect(result.Email).toBeNull(); // trimmed (no-op) then empty-to-null
            expect(result.Active).toBe(true);
            expect(result.Metadata).toBe('{"role":"admin"}');
            expect(result.BadData).toBeNull(); // invalid JSON
            expect(result.CreatedAt).toBe('2024-06-15T10:30:00.000Z');
            expect(result.NullField).toBeNull();
        });
    });

    describe('Execute — full integration: all rules for sqlserver', () => {
        it('should transform a realistic record through the full pipeline', () => {
            const pipeline = new DefaultTransformPipeline([
                new TrimWhitespaceRule(),
                new EmptyStringToNullRule(),
                new NormalizeUUIDUppercaseRule(),
                new NormalizeUUIDLowercaseRule(),  // should be skipped for sqlserver
                new ValidateJsonbRule(),            // should be skipped for sqlserver
                new CoerceBooleanStringsRule(),     // should be skipped for sqlserver
                new CoerceTimestamptzRule(),        // should be skipped for sqlserver
            ]);

            const record = {
                ID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                Name: '  Bob  ',
                Email: '',
                Active: 'true',
                CreatedAt: 'not-a-date',
            };

            const fieldTypes = new Map<string, string>([
                ['ID', 'uniqueidentifier'],
                ['Name', 'nvarchar'],
                ['Email', 'nvarchar'],
                ['Active', 'bit'],
                ['CreatedAt', 'datetimeoffset'],
            ]);

            const result = pipeline.Execute(record, fieldTypes, 'sqlserver');

            expect(result.ID).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
            expect(result.Name).toBe('Bob');
            expect(result.Email).toBeNull();
            // Boolean coercion NOT applied (postgresql only) — stays as string
            expect(result.Active).toBe('true');
            // Timestamptz coercion NOT applied (postgresql only) — stays as string
            expect(result.CreatedAt).toBe('not-a-date');
        });
    });
});
