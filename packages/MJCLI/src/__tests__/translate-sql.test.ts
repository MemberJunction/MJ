/**
 * Unit tests for the translate-sql module.
 * Tests: classifier, ruleTranslator, groundTruth, reportGenerator
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
// Classifier Tests
// ---------------------------------------------------------------------------

describe('ClassifySQL', () => {
    describe('standard SQL detection', () => {
        it('should classify empty string as standard', () => {
            expect(ClassifySQL('', 'sqlserver')).toBe('standard');
        });

        it('should classify whitespace-only as standard', () => {
            expect(ClassifySQL('   ', 'sqlserver')).toBe('standard');
        });

        it('should classify simple SELECT as standard', () => {
            expect(ClassifySQL("SELECT Name, Email FROM Users WHERE Status = 'Active'", 'sqlserver')).toBe('standard');
        });

        it('should classify standard JOIN as standard', () => {
            const sql = "SELECT u.Name, r.RoleName FROM Users u INNER JOIN Roles r ON u.RoleID = r.ID";
            expect(ClassifySQL(sql, 'sqlserver')).toBe('standard');
        });
    });

    describe('rule-based classification', () => {
        it('should classify bracket identifiers as rule-based', () => {
            expect(ClassifySQL("[Name] = 'Test'", 'sqlserver')).toBe('rule-based');
        });

        it('should classify boolean = 1 with brackets as rule-based', () => {
            expect(ClassifySQL("[IsActive] = 1", 'sqlserver')).toBe('rule-based');
        });

        it('should classify boolean = 0 as rule-based', () => {
            expect(ClassifySQL("[IsAdmin] = 0 AND [Name] = 'Test'", 'sqlserver')).toBe('rule-based');
        });

        it('should classify combined brackets + booleans as rule-based', () => {
            expect(ClassifySQL("[Status] = 1 AND [Type] = 0", 'sqlserver')).toBe('rule-based');
        });
    });

    describe('llm-needed classification', () => {
        it('should classify TOP N as llm-needed', () => {
            expect(ClassifySQL("SELECT TOP 10 [Name] FROM [Users]", 'sqlserver')).toBe('llm-needed');
        });

        it('should classify GETUTCDATE as llm-needed', () => {
            expect(ClassifySQL("[CreatedAt] > GETUTCDATE()", 'sqlserver')).toBe('llm-needed');
        });

        it('should classify ISNULL as llm-needed', () => {
            expect(ClassifySQL("ISNULL([Name], 'Unknown')", 'sqlserver')).toBe('llm-needed');
        });

        it('should classify IIF as llm-needed', () => {
            expect(ClassifySQL("IIF([Status] = 1, 'Active', 'Inactive')", 'sqlserver')).toBe('llm-needed');
        });

        it('should classify DATEADD as llm-needed', () => {
            expect(ClassifySQL("DATEADD(day, -7, GETUTCDATE())", 'sqlserver')).toBe('llm-needed');
        });

        it('should classify CONVERT as llm-needed', () => {
            expect(ClassifySQL("CONVERT(NVARCHAR(50), [Price])", 'sqlserver')).toBe('llm-needed');
        });

        it('should classify string concat with + as llm-needed', () => {
            expect(ClassifySQL("[FirstName] + ' ' + [LastName]", 'sqlserver')).toBe('llm-needed');
        });
    });
});

describe('ClassifySQLBatch', () => {
    it('should classify multiple fragments', () => {
        const fragments = [
            "SELECT Name FROM Users",
            "[IsActive] = 1",
            "SELECT TOP 10 * FROM Users",
        ];
        const results = ClassifySQLBatch(fragments, 'sqlserver');

        expect(results).toHaveLength(3);
        expect(results[0].classification).toBe('standard');
        expect(results[1].classification).toBe('rule-based');
        expect(results[2].classification).toBe('llm-needed');
    });

    it('should include dialect markers', () => {
        const results = ClassifySQLBatch(
            ["SELECT TOP 10 [Name] FROM [Users] WHERE [IsActive] = 1"],
            'sqlserver'
        );
        expect(results[0].markers).toContain('bracket-identifiers');
        expect(results[0].markers).toContain('TOP-N');
        expect(results[0].markers).toContain('boolean-literal');
    });

    it('should return original SQL in each result', () => {
        const sql = "SELECT * FROM Users";
        const results = ClassifySQLBatch([sql], 'sqlserver');
        expect(results[0].sql).toBe(sql);
    });

    it('should handle empty array', () => {
        const results = ClassifySQLBatch([], 'sqlserver');
        expect(results).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Rule Translator Tests
// ---------------------------------------------------------------------------

describe('RuleBasedTranslate', () => {
    describe('SQL Server → PostgreSQL', () => {
        it('should convert bracket identifiers to double-quote', () => {
            const result = RuleBasedTranslate("[Name] = 'Test'", 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe('"Name" = \'Test\'');
            expect(result.appliedRules).toContain('bracket-to-doublequote');
            expect(result.success).toBe(true);
        });

        it('should convert = 1 to = true', () => {
            const result = RuleBasedTranslate("[IsActive] = 1", 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe('"IsActive" = true');
            expect(result.appliedRules).toContain('bit-1-to-true');
        });

        it('should convert = 0 to = false', () => {
            const result = RuleBasedTranslate("[IsAdmin] = 0", 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe('"IsAdmin" = false');
            expect(result.appliedRules).toContain('bit-0-to-false');
        });

        it('should apply multiple rules', () => {
            const result = RuleBasedTranslate("[IsActive] = 1 AND [Deleted] = 0", 'sqlserver', 'postgresql');
            expect(result.translatedSQL).toBe('"IsActive" = true AND "Deleted" = false');
            expect(result.appliedRules).toContain('bracket-to-doublequote');
            expect(result.appliedRules).toContain('bit-1-to-true');
            expect(result.appliedRules).toContain('bit-0-to-false');
        });
    });

    describe('PostgreSQL → SQL Server', () => {
        it('should convert double-quote identifiers to brackets', () => {
            const result = RuleBasedTranslate('"Name" = \'Test\'', 'postgresql', 'sqlserver');
            expect(result.translatedSQL).toBe("[Name] = 'Test'");
            expect(result.appliedRules).toContain('doublequote-to-bracket');
        });

        it('should convert = true to = 1', () => {
            const result = RuleBasedTranslate('"IsActive" = true', 'postgresql', 'sqlserver');
            expect(result.translatedSQL).toBe('[IsActive] = 1');
            expect(result.appliedRules).toContain('true-to-bit-1');
        });

        it('should convert = false to = 0', () => {
            const result = RuleBasedTranslate('"IsAdmin" = false', 'postgresql', 'sqlserver');
            expect(result.translatedSQL).toBe('[IsAdmin] = 0');
            expect(result.appliedRules).toContain('false-to-bit-0');
        });
    });

    describe('same platform', () => {
        it('should return unchanged SQL when from === to', () => {
            const sql = "[Name] = 'Test'";
            const result = RuleBasedTranslate(sql, 'sqlserver', 'sqlserver');
            expect(result.translatedSQL).toBe(sql);
            expect(result.appliedRules).toHaveLength(0);
            expect(result.success).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// Ground Truth Tests
// ---------------------------------------------------------------------------

describe('GROUND_TRUTH_EXAMPLES', () => {
    it('should have at least 10 examples', () => {
        expect(GROUND_TRUTH_EXAMPLES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have all examples with sqlserver source', () => {
        for (const ex of GROUND_TRUTH_EXAMPLES) {
            expect(ex.source.platform).toBe('sqlserver');
            expect(ex.target.platform).toBe('postgresql');
        }
    });

    it('should have non-empty SQL in all examples', () => {
        for (const ex of GROUND_TRUTH_EXAMPLES) {
            expect(ex.source.sql.length).toBeGreaterThan(0);
            expect(ex.target.sql.length).toBeGreaterThan(0);
        }
    });

    it('should have a category for each example', () => {
        for (const ex of GROUND_TRUTH_EXAMPLES) {
            expect(ex.category.length).toBeGreaterThan(0);
        }
    });
});

describe('BuildGroundTruthPromptSection', () => {
    it('should produce a non-empty prompt section for sqlserver → postgresql', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql');
        expect(result.length).toBeGreaterThan(0);
        expect(result).toContain('## Translation Examples');
    });

    it('should include example numbering', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql');
        expect(result).toContain('Example 1');
    });

    it('should include source and target labels', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql');
        expect(result).toContain('Source (sqlserver)');
        expect(result).toContain('Target (postgresql)');
    });

    it('should respect maxExamples limit', () => {
        const result = BuildGroundTruthPromptSection('sqlserver', 'postgresql', 2);
        const exampleCount = (result.match(/Example \d+/g) || []).length;
        expect(exampleCount).toBe(2);
    });

    it('should return empty string for unsupported direction', () => {
        const result = BuildGroundTruthPromptSection('postgresql', 'sqlserver');
        expect(result).toBe('');
    });
});

// ---------------------------------------------------------------------------
// Report Generator Tests
// ---------------------------------------------------------------------------

describe('GenerateTranslationReport', () => {
    const sampleItems: TranslationReportItem[] = [
        {
            source: 'Query: Simple',
            originalSQL: 'SELECT * FROM Users',
            classification: 'standard',
            translatedSQL: null,
            method: 'skipped',
            markers: [],
        },
        {
            source: 'Query: Filtered',
            originalSQL: "[IsActive] = 1",
            classification: 'rule-based',
            translatedSQL: '"IsActive" = true',
            method: 'rule-based',
            markers: ['bracket-identifiers', 'boolean-literal'],
            note: 'Rules: bracket-to-doublequote, bit-1-to-true',
        },
        {
            source: 'Query: Complex',
            originalSQL: "SELECT TOP 10 [Name] FROM [Users]",
            classification: 'llm-needed',
            translatedSQL: null,
            method: 'flagged',
            markers: ['bracket-identifiers', 'TOP-N'],
            note: 'Requires LLM translation',
        },
    ];

    it('should include header with dialects', () => {
        const report = GenerateTranslationReport(sampleItems, 'sqlserver', 'postgresql');
        expect(report).toContain('# SQL Translation Report');
        expect(report).toContain('sqlserver');
        expect(report).toContain('postgresql');
    });

    it('should include summary table with counts', () => {
        const report = GenerateTranslationReport(sampleItems, 'sqlserver', 'postgresql');
        expect(report).toContain('Total fragments | 3');
        expect(report).toContain('Standard SQL (no translation needed) | 1');
        expect(report).toContain('Rule-based translations | 1');
        expect(report).toContain('Flagged for review | 1');
    });

    it('should include translations section for rule-based items', () => {
        const report = GenerateTranslationReport(sampleItems, 'sqlserver', 'postgresql');
        expect(report).toContain('## Translations');
        expect(report).toContain('### Query: Filtered');
        expect(report).toContain('"IsActive" = true');
    });

    it('should include flagged section', () => {
        const report = GenerateTranslationReport(sampleItems, 'sqlserver', 'postgresql');
        expect(report).toContain('## Flagged for Human Review');
        expect(report).toContain('### Query: Complex');
    });

    it('should include standard SQL section', () => {
        const report = GenerateTranslationReport(sampleItems, 'sqlserver', 'postgresql');
        expect(report).toContain('## Standard SQL (No Translation Needed)');
        expect(report).toContain('1 fragments are standard SQL');
    });

    it('should handle empty items array', () => {
        const report = GenerateTranslationReport([], 'sqlserver', 'postgresql');
        expect(report).toContain('Total fragments | 0');
    });

    it('should include notes when present', () => {
        const report = GenerateTranslationReport(sampleItems, 'sqlserver', 'postgresql');
        expect(report).toContain('Rules: bracket-to-doublequote, bit-1-to-true');
    });
});
