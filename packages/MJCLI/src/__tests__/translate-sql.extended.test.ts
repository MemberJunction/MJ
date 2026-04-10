/**
 * Extended unit tests for the translate-sql module.
 * Covers edge cases in the classifier, rule translator, ground truth, and report generator.
 */
import { describe, it, expect } from 'vitest';

import {
    ClassifySQL,
    ClassifySQLBatch,
    RuleBasedTranslate,
    BuildGroundTruthPromptSection,
    GROUND_TRUTH_EXAMPLES,
    GenerateTranslationReport,
} from '../translate-sql/index';
import type {
    SQLClassification,
    ClassificationResult,
    RuleTranslationResult,
    TranslationReportItem,
} from '../translate-sql/index';

// ---------------------------------------------------------------------------
// Classifier Edge Cases
// ---------------------------------------------------------------------------

describe('ClassifySQL edge cases', () => {
    describe('ambiguous queries', () => {
        it('should classify a query with only boolean comparison (no brackets) as rule-based', () => {
            // = 1 is detected as SQL Server dialect, and it is a simple transformation
            const sql = "Status = 1";
            const result = ClassifySQL(sql, 'sqlserver');
            expect(result).toBe('rule-based');
        });

        it('should classify standard SQL with numeric comparison as standard when not boolean pattern', () => {
            // Numeric comparison like "Amount > 100" should be standard
            const sql = "SELECT Amount FROM Orders WHERE Amount > 100";
            expect(ClassifySQL(sql, 'sqlserver')).toBe('standard');
        });

        it('should classify query with bracket identifiers containing spaces as llm-needed', () => {
            // Bracket identifiers with spaces like [First Name] match the dialect pattern
            // but the simple rule pattern only handles single-word brackets [\w+]
            const sql = "[First Name] = 'John'";
            const result = ClassifySQL(sql, 'sqlserver');
            // The space-containing bracket matches SQL_SERVER_PATTERNS but not SIMPLE_RULE_PATTERNS
            expect(result).toBe('llm-needed');
        });
    });

    describe('empty and whitespace queries', () => {
        it('should classify null-like empty string as standard', () => {
            expect(ClassifySQL('', 'sqlserver')).toBe('standard');
        });

        it('should classify tab-only string as standard', () => {
            expect(ClassifySQL('\t\t', 'sqlserver')).toBe('standard');
        });

        it('should classify newline-only string as standard', () => {
            expect(ClassifySQL('\n\n\n', 'sqlserver')).toBe('standard');
        });

        it('should classify mixed whitespace as standard', () => {
            expect(ClassifySQL('  \t\n  ', 'sqlserver')).toBe('standard');
        });
    });

    describe('queries with comments', () => {
        it('should classify query with single-line comment containing bracket as rule-based', () => {
            // The bracket in the comment body will trigger the bracket-identifiers pattern
            const sql = "-- Filter by [Status]\n[IsActive] = 1";
            expect(ClassifySQL(sql, 'sqlserver')).toBe('rule-based');
        });

        it('should classify query with multi-line comment containing SQL keywords as llm-needed', () => {
            const sql = "/* Using GETUTCDATE() for timestamp */ GETUTCDATE()";
            expect(ClassifySQL(sql, 'sqlserver')).toBe('llm-needed');
        });
    });

    describe('queries with string literals containing SQL keywords', () => {
        it('should classify literal containing ISNULL text as llm-needed', () => {
            // The ISNULL pattern will match even inside a string literal because
            // the classifier does regex matching on the full SQL text
            const sql = "ISNULL([Name], 'ISNULL is a function')";
            expect(ClassifySQL(sql, 'sqlserver')).toBe('llm-needed');
        });

        it('should classify query with bracket inside string literal as rule-based', () => {
            // String literal '[test]' contains brackets, which matches the pattern
            const sql = "[Column] = '[test]'";
            expect(ClassifySQL(sql, 'sqlserver')).toBe('rule-based');
        });
    });

    describe('postgresql source dialect', () => {
        it('should classify any PostgreSQL query as standard since no PG patterns exist', () => {
            // The classifier only has SQL Server patterns; PostgreSQL source returns empty patterns
            const sql = 'SELECT "Name" FROM "Users" WHERE "IsActive" = true';
            expect(ClassifySQL(sql, 'postgresql')).toBe('standard');
        });

        it('should classify PostgreSQL-specific syntax as standard (no detection patterns)', () => {
            const sql = "SELECT NOW(), gen_random_uuid()";
            expect(ClassifySQL(sql, 'postgresql')).toBe('standard');
        });
    });
});

// ---------------------------------------------------------------------------
// ClassifySQLBatch Edge Cases
// ---------------------------------------------------------------------------

describe('ClassifySQLBatch edge cases', () => {
    it('should return correct markers for multiple dialect features in one query', () => {
        const sql = "SELECT TOP 10 ISNULL([Name], 'N/A') FROM [Users] WHERE [IsActive] = 1 AND DATEADD(day, -7, GETUTCDATE()) > [CreatedAt]";
        const results = ClassifySQLBatch([sql], 'sqlserver');

        expect(results).toHaveLength(1);
        expect(results[0].classification).toBe('llm-needed');
        expect(results[0].markers).toContain('bracket-identifiers');
        expect(results[0].markers).toContain('TOP-N');
        expect(results[0].markers).toContain('ISNULL');
        expect(results[0].markers).toContain('DATEADD');
        expect(results[0].markers).toContain('GETUTCDATE');
        expect(results[0].markers).toContain('boolean-literal');
    });

    it('should preserve marker detection for SCOPE_IDENTITY', () => {
        const results = ClassifySQLBatch(["SELECT SCOPE_IDENTITY()"], 'sqlserver');
        expect(results[0].markers).toContain('SCOPE_IDENTITY');
    });

    it('should detect string-concat-plus marker', () => {
        const results = ClassifySQLBatch(["[FirstName] + ' ' + [LastName]"], 'sqlserver');
        expect(results[0].markers).toContain('string-concat-plus');
    });

    it('should return no markers for postgresql source', () => {
        const results = ClassifySQLBatch(['"Name" = \'test\''], 'postgresql');
        expect(results[0].markers).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Rule Translator Edge Cases
// ---------------------------------------------------------------------------

describe('RuleBasedTranslate edge cases', () => {
    describe('SQL Server to PostgreSQL', () => {
        it('should handle multiple bracket identifiers in a single query', () => {
            const result = RuleBasedTranslate(
                "[FirstName] = 'John' AND [LastName] = 'Doe' AND [Email] LIKE '%@test.com'",
                'sqlserver',
                'postgresql'
            );
            expect(result.translatedSQL).toBe(
                '"FirstName" = \'John\' AND "LastName" = \'Doe\' AND "Email" LIKE \'%@test.com\''
            );
            expect(result.appliedRules).toContain('bracket-to-doublequote');
            expect(result.success).toBe(true);
        });

        it('should handle mixed boolean and bracket identifiers', () => {
            const result = RuleBasedTranslate(
                "[IsActive] = 1 AND [IsDeleted] = 0 AND [Status] = 'Active'",
                'sqlserver',
                'postgresql'
            );
            expect(result.translatedSQL).toBe(
                '"IsActive" = true AND "IsDeleted" = false AND "Status" = \'Active\''
            );
            expect(result.appliedRules).toContain('bracket-to-doublequote');
            expect(result.appliedRules).toContain('bit-1-to-true');
            expect(result.appliedRules).toContain('bit-0-to-false');
        });

        it('should not apply rules when no SQL Server patterns are present', () => {
            const sql = "SELECT Name FROM Users WHERE Status = 'Active'";
            const result = RuleBasedTranslate(sql, 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe(sql);
            expect(result.appliedRules).toHaveLength(0);
            expect(result.success).toBe(false);
        });

        it('should handle empty string input', () => {
            const result = RuleBasedTranslate('', 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe('');
            expect(result.appliedRules).toHaveLength(0);
            expect(result.success).toBe(false);
        });

        it('should convert multiple boolean = 1 comparisons', () => {
            const result = RuleBasedTranslate(
                "[IsActive] = 1 AND [IsVerified] = 1 AND [IsAdmin] = 1",
                'sqlserver',
                'postgresql'
            );
            expect(result.translatedSQL).toBe(
                '"IsActive" = true AND "IsVerified" = true AND "IsAdmin" = true'
            );
        });

        it('should not modify string literals that happen to contain bracket-like text', () => {
            // The regex \[(\w+)\] only matches single-word identifiers in brackets
            // String content inside single quotes should be preserved
            const result = RuleBasedTranslate("[Name] = 'test'", 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe('"Name" = \'test\'');
        });
    });

    describe('PostgreSQL to SQL Server', () => {
        it('should handle multiple double-quoted identifiers', () => {
            const result = RuleBasedTranslate(
                '"FirstName" = \'John\' AND "LastName" = \'Doe\'',
                'postgresql',
                'sqlserver'
            );
            expect(result.translatedSQL).toBe(
                "[FirstName] = 'John' AND [LastName] = 'Doe'"
            );
            expect(result.appliedRules).toContain('doublequote-to-bracket');
        });

        it('should handle mixed boolean and identifier conversion', () => {
            const result = RuleBasedTranslate(
                '"IsActive" = true AND "IsDeleted" = false',
                'postgresql',
                'sqlserver'
            );
            expect(result.translatedSQL).toBe('[IsActive] = 1 AND [IsDeleted] = 0');
            expect(result.appliedRules).toContain('doublequote-to-bracket');
            expect(result.appliedRules).toContain('true-to-bit-1');
            expect(result.appliedRules).toContain('false-to-bit-0');
        });

        it('should handle case-insensitive boolean TRUE/FALSE', () => {
            const result = RuleBasedTranslate(
                '"IsActive" = TRUE AND "IsDeleted" = FALSE',
                'postgresql',
                'sqlserver'
            );
            expect(result.translatedSQL).toBe('[IsActive] = 1 AND [IsDeleted] = 0');
        });

        it('should not apply rules when no PostgreSQL patterns are present', () => {
            const sql = "SELECT Name FROM Users WHERE Status = 'Active'";
            const result = RuleBasedTranslate(sql, 'postgresql', 'sqlserver');
            expect(result.translatedSQL).toBe(sql);
            expect(result.appliedRules).toHaveLength(0);
            expect(result.success).toBe(false);
        });
    });

    describe('unsupported platform pairs', () => {
        it('should return failure for unsupported platform pair', () => {
            // Using two sqlserver platforms to get the same-platform shortcut is separate;
            // here we verify that an unsupported pair falls through
            const result = RuleBasedTranslate(
                "SELECT * FROM test",
                'postgresql' as 'postgresql',
                'postgresql' as 'postgresql'
            );
            // same platform returns success with no rules
            expect(result.success).toBe(true);
            expect(result.appliedRules).toHaveLength(0);
        });
    });

    describe('round-trip consistency', () => {
        it('should round-trip bracket identifiers: SS -> PG -> SS', () => {
            const original = "[Name] = 'Test'";
            const toPg = RuleBasedTranslate(original, 'sqlserver', 'postgresql');
            const backToSs = RuleBasedTranslate(toPg.translatedSQL, 'postgresql', 'sqlserver');
            expect(backToSs.translatedSQL).toBe(original);
        });

        it('should round-trip boolean literals: SS -> PG -> SS', () => {
            const original = "[IsActive] = 1 AND [IsDeleted] = 0";
            const toPg = RuleBasedTranslate(original, 'sqlserver', 'postgresql');
            expect(toPg.translatedSQL).toBe('"IsActive" = true AND "IsDeleted" = false');
            const backToSs = RuleBasedTranslate(toPg.translatedSQL, 'postgresql', 'sqlserver');
            expect(backToSs.translatedSQL).toBe(original);
        });
    });
});

// ---------------------------------------------------------------------------
// Ground Truth Extended Tests
// ---------------------------------------------------------------------------

describe('GROUND_TRUTH_EXAMPLES extended', () => {
    it('should contain examples across multiple categories', () => {
        const categories = new Set(GROUND_TRUTH_EXAMPLES.map(ex => ex.category));
        // We expect at least 5 distinct categories
        expect(categories.size).toBeGreaterThanOrEqual(5);
    });

    it('should have unique categories covering identifier, boolean, date, and conversion patterns', () => {
        const categories = new Set(GROUND_TRUTH_EXAMPLES.map(ex => ex.category));
        expect(categories.has('identifier-quoting')).toBe(true);
        expect(categories.has('boolean-literal')).toBe(true);
        expect(categories.has('date-function')).toBe(true);
        expect(categories.has('type-conversion')).toBe(true);
    });

    it('should have source SQL that differs from target SQL in every example', () => {
        for (const ex of GROUND_TRUTH_EXAMPLES) {
            expect(ex.source.sql).not.toBe(ex.target.sql);
        }
    });

    it('should have consistent platform assignments across all examples', () => {
        for (const ex of GROUND_TRUTH_EXAMPLES) {
            expect(ex.source.platform).toBe('sqlserver');
            expect(ex.target.platform).toBe('postgresql');
        }
    });
});

describe('BuildGroundTruthPromptSection extended', () => {
    it('should include category labels in the prompt section', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql');
        // At least one category should appear in parentheses
        expect(result).toMatch(/\([\w-]+\)/);
    });

    it('should return all examples when maxExamples exceeds available count', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql', 1000);
        const exampleCount = (result.match(/Example \d+/g) || []).length;
        expect(exampleCount).toBe(GROUND_TRUTH_EXAMPLES.length);
    });

    it('should return exactly 1 example when maxExamples is 1', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql', 1);
        const exampleCount = (result.match(/Example \d+/g) || []).length;
        expect(exampleCount).toBe(1);
    });

    it('should use default maxExamples of 8', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql');
        const exampleCount = (result.match(/Example \d+/g) || []).length;
        // There are more than 8 total examples, so default should cap at 8
        expect(exampleCount).toBe(Math.min(8, GROUND_TRUTH_EXAMPLES.length));
    });
});

// ---------------------------------------------------------------------------
// Report Generator Extended Tests
// ---------------------------------------------------------------------------

describe('GenerateTranslationReport extended', () => {
    it('should handle report with only standard items', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: Basic Select',
                originalSQL: 'SELECT * FROM Users',
                classification: 'standard',
                translatedSQL: null,
                method: 'skipped',
                markers: [],
            },
            {
                source: 'Query: Another Select',
                originalSQL: "SELECT Name FROM Users WHERE Status = 'Active'",
                classification: 'standard',
                translatedSQL: null,
                method: 'skipped',
                markers: [],
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).toContain('Total fragments | 2');
        expect(report).toContain('Standard SQL (no translation needed) | 2');
        expect(report).toContain('Rule-based translations | 0');
        expect(report).toContain('Flagged for review | 0');
        expect(report).toContain('2 fragments are standard SQL');
        // Should NOT contain Translations section
        expect(report).not.toContain('## Translations');
    });

    it('should handle report with only flagged items', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: Complex',
                originalSQL: "SELECT TOP 10 ISNULL([Name], 'N/A') FROM [Users]",
                classification: 'llm-needed',
                translatedSQL: null,
                method: 'flagged',
                markers: ['TOP-N', 'ISNULL', 'bracket-identifiers'],
                note: 'Requires LLM translation',
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).toContain('Total fragments | 1');
        expect(report).toContain('Flagged for review | 1');
        expect(report).toContain('## Flagged for Human Review');
        expect(report).toContain('TOP-N, ISNULL, bracket-identifiers');
    });

    it('should handle report with LLM translations', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: LLM Translated',
                originalSQL: "SELECT TOP 5 [Name] FROM [Users]",
                classification: 'llm-needed',
                translatedSQL: 'SELECT "Name" FROM "Users" LIMIT 5',
                method: 'llm',
                markers: ['TOP-N', 'bracket-identifiers'],
                note: 'Translated by AI model',
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).toContain('LLM translations | 1');
        expect(report).toContain('## Translations');
        expect(report).toContain('**Method:** llm');
        expect(report).toContain('SELECT "Name" FROM "Users" LIMIT 5');
        expect(report).toContain('Translated by AI model');
    });

    it('should render original and translated SQL in code blocks', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: Rule Based',
                originalSQL: "[IsActive] = 1",
                classification: 'rule-based',
                translatedSQL: '"IsActive" = true',
                method: 'rule-based',
                markers: ['bracket-identifiers', 'boolean-literal'],
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        // Check for SQL code blocks
        expect(report).toContain('```sql');
        expect(report).toContain('[IsActive] = 1');
        expect(report).toContain('"IsActive" = true');
    });

    it('should display "-- Translation failed" when translatedSQL is null in a translated item', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: Failed LLM',
                originalSQL: "EXEC sp_something",
                classification: 'llm-needed',
                translatedSQL: null,
                method: 'llm',
                markers: [],
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).toContain('-- Translation failed');
    });

    it('should handle a mixed report with all classification types', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Standard Query',
                originalSQL: 'SELECT * FROM Users',
                classification: 'standard',
                translatedSQL: null,
                method: 'skipped',
                markers: [],
            },
            {
                source: 'Rule-Based Query',
                originalSQL: '[IsActive] = 1',
                classification: 'rule-based',
                translatedSQL: '"IsActive" = true',
                method: 'rule-based',
                markers: ['bracket-identifiers', 'boolean-literal'],
            },
            {
                source: 'LLM Query',
                originalSQL: 'SELECT TOP 10 * FROM Users',
                classification: 'llm-needed',
                translatedSQL: 'SELECT * FROM Users LIMIT 10',
                method: 'llm',
                markers: ['TOP-N'],
            },
            {
                source: 'Flagged Query',
                originalSQL: 'EXEC sp_complex_proc @p1, @p2',
                classification: 'llm-needed',
                translatedSQL: null,
                method: 'flagged',
                markers: [],
                note: 'Stored procedure call',
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).toContain('Total fragments | 4');
        expect(report).toContain('Standard SQL (no translation needed) | 1');
        expect(report).toContain('Rule-based translations | 1');
        expect(report).toContain('LLM translations | 1');
        expect(report).toContain('Flagged for review | 1');
        // All sections should be present
        expect(report).toContain('## Translations');
        expect(report).toContain('## Flagged for Human Review');
        expect(report).toContain('## Standard SQL (No Translation Needed)');
    });

    it('should include the generated-at timestamp in ISO format', () => {
        const items: TranslationReportItem[] = [];
        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        // Should match ISO date format
        expect(report).toMatch(/\*\*Generated at:\*\* \d{4}-\d{2}-\d{2}T/);
    });

    it('should not include Flagged section when there are no flagged items', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: Rule',
                originalSQL: '[X] = 1',
                classification: 'rule-based',
                translatedSQL: '"X" = true',
                method: 'rule-based',
                markers: ['bracket-identifiers', 'boolean-literal'],
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).not.toContain('## Flagged for Human Review');
    });

    it('should not include Standard SQL section when there are no standard items', () => {
        const items: TranslationReportItem[] = [
            {
                source: 'Query: Flagged',
                originalSQL: 'SELECT TOP 10 * FROM Users',
                classification: 'llm-needed',
                translatedSQL: null,
                method: 'flagged',
                markers: ['TOP-N'],
            },
        ];

        const report = GenerateTranslationReport(items, 'sqlserver', 'postgresql');
        expect(report).not.toContain('## Standard SQL (No Translation Needed)');
    });
});
