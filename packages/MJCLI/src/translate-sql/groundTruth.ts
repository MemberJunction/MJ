import { DatabasePlatform } from '@memberjunction/core';

/**
 * A single translation example pairing source and target SQL.
 */
export interface TranslationExample {
    source: { platform: DatabasePlatform; sql: string };
    target: { platform: DatabasePlatform; sql: string };
    category: string;
}

/**
 * Ground truth translation examples for SQL Server ↔ PostgreSQL.
 * Used as few-shot examples in LLM translation prompts.
 */
export const GROUND_TRUTH_EXAMPLES: TranslationExample[] = [
    // Identifier quoting
    {
        source: { platform: 'sqlserver', sql: "[Status] = 'Active' AND [Name] LIKE 'J%'" },
        target: { platform: 'postgresql', sql: '"Status" = \'Active\' AND "Name" LIKE \'J%\'' },
        category: 'identifier-quoting'
    },
    // Boolean literals
    {
        source: { platform: 'sqlserver', sql: "[IsActive] = 1 AND [IsAdmin] = 0" },
        target: { platform: 'postgresql', sql: '"IsActive" = true AND "IsAdmin" = false' },
        category: 'boolean-literal'
    },
    // TOP → LIMIT
    {
        source: { platform: 'sqlserver', sql: "SELECT TOP 10 [Name], [Email] FROM [__mj].[vwUsers] WHERE [IsActive] = 1 ORDER BY [Name]" },
        target: { platform: 'postgresql', sql: 'SELECT "Name", "Email" FROM __mj."vwUsers" WHERE "IsActive" = true ORDER BY "Name" LIMIT 10' },
        category: 'top-to-limit'
    },
    // GETUTCDATE → NOW()
    {
        source: { platform: 'sqlserver', sql: "[CreatedAt] > GETUTCDATE() - 30" },
        target: { platform: 'postgresql', sql: '"CreatedAt" > NOW() - INTERVAL \'30 days\'' },
        category: 'date-function'
    },
    // ISNULL → COALESCE
    {
        source: { platform: 'sqlserver', sql: "ISNULL([MiddleName], '') + ' ' + [LastName]" },
        target: { platform: 'postgresql', sql: "COALESCE(\"MiddleName\", '') || ' ' || \"LastName\"" },
        category: 'null-function'
    },
    // String concatenation (+ → ||)
    {
        source: { platform: 'sqlserver', sql: "[FirstName] + ' ' + [LastName]" },
        target: { platform: 'postgresql', sql: '"FirstName" || \' \' || "LastName"' },
        category: 'string-concat'
    },
    // CONVERT → CAST
    {
        source: { platform: 'sqlserver', sql: "CONVERT(NVARCHAR(50), [Price])" },
        target: { platform: 'postgresql', sql: 'CAST("Price" AS VARCHAR(50))' },
        category: 'type-conversion'
    },
    // IIF → CASE
    {
        source: { platform: 'sqlserver', sql: "IIF([Status] = 1, 'Active', 'Inactive')" },
        target: { platform: 'postgresql', sql: "CASE WHEN \"Status\" = true THEN 'Active' ELSE 'Inactive' END" },
        category: 'conditional'
    },
    // DATEADD → interval arithmetic
    {
        source: { platform: 'sqlserver', sql: "DATEADD(day, -7, GETUTCDATE())" },
        target: { platform: 'postgresql', sql: "NOW() - INTERVAL '7 days'" },
        category: 'date-arithmetic'
    },
    // DATEDIFF → EXTRACT/date_part
    {
        source: { platform: 'sqlserver', sql: "DATEDIFF(day, [StartDate], [EndDate])" },
        target: { platform: 'postgresql', sql: 'EXTRACT(DAY FROM ("EndDate" - "StartDate"))::integer' },
        category: 'date-diff'
    },
    // Schema-qualified with brackets
    {
        source: { platform: 'sqlserver', sql: "SELECT * FROM [__mj].[vwEntities] WHERE [SchemaName] = '__mj'" },
        target: { platform: 'postgresql', sql: 'SELECT * FROM __mj."vwEntities" WHERE "SchemaName" = \'__mj\'' },
        category: 'schema-qualified'
    },
    // Complex WHERE clause
    {
        source: { platform: 'sqlserver', sql: "[EntityID] IN (SELECT [ID] FROM [__mj].[vwEntities] WHERE [IncludeInAPI] = 1)" },
        target: { platform: 'postgresql', sql: '"EntityID" IN (SELECT "ID" FROM __mj."vwEntities" WHERE "IncludeInAPI" = true)' },
        category: 'subquery'
    },
];

/**
 * Builds LLM prompt sections from ground truth examples for a given dialect pair.
 */
export function BuildGroundTruthPromptSection(
    from: DatabasePlatform,
    to: DatabasePlatform,
    maxExamples: number = 8
): string {
    const relevant = GROUND_TRUTH_EXAMPLES
        .filter(e => e.source.platform === from && e.target.platform === to)
        .slice(0, maxExamples);

    if (relevant.length === 0) return '';

    const lines = relevant.map((ex, i) =>
        `Example ${i + 1} (${ex.category}):\n` +
        `  Source (${from}): ${ex.source.sql}\n` +
        `  Target (${to}): ${ex.target.sql}`
    );

    return `## Translation Examples\n\n${lines.join('\n\n')}`;
}
