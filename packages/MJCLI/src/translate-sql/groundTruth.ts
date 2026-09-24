import { DatabasePlatform } from '@memberjunction/core';

/**
 * A single translation example pairing source and target SQL.
 */
export interface TranslationExample {
    Source: { platform: DatabasePlatform; sql: string };
    Target: { platform: DatabasePlatform; sql: string };
    Category: string;
}

/**
 * Ground truth translation examples for SQL Server ↔ PostgreSQL.
 * Used as few-shot examples in LLM translation prompts.
 */
export const GROUND_TRUTH_EXAMPLES: TranslationExample[] = [
    // Identifier quoting
    {
        Source: { platform: 'sqlserver', sql: "[Status] = 'Active' AND [Name] LIKE 'J%'" },
        Target: { platform: 'postgresql', sql: '"Status" = \'Active\' AND "Name" LIKE \'J%\'' },
        Category: 'identifier-quoting'
    },
    // Boolean literals
    {
        Source: { platform: 'sqlserver', sql: "[IsActive] = 1 AND [IsAdmin] = 0" },
        Target: { platform: 'postgresql', sql: '"IsActive" = true AND "IsAdmin" = false' },
        Category: 'boolean-literal'
    },
    // TOP → LIMIT
    {
        Source: { platform: 'sqlserver', sql: "SELECT TOP 10 [Name], [Email] FROM [__mj].[vwUsers] WHERE [IsActive] = 1 ORDER BY [Name]" },
        Target: { platform: 'postgresql', sql: 'SELECT "Name", "Email" FROM __mj."vwUsers" WHERE "IsActive" = true ORDER BY "Name" LIMIT 10' },
        Category: 'top-to-limit'
    },
    // GETUTCDATE → NOW()
    {
        Source: { platform: 'sqlserver', sql: "[CreatedAt] > GETUTCDATE() - 30" },
        Target: { platform: 'postgresql', sql: '"CreatedAt" > NOW() - INTERVAL \'30 days\'' },
        Category: 'date-function'
    },
    // ISNULL → COALESCE
    {
        Source: { platform: 'sqlserver', sql: "ISNULL([MiddleName], '') + ' ' + [LastName]" },
        Target: { platform: 'postgresql', sql: "COALESCE(\"MiddleName\", '') || ' ' || \"LastName\"" },
        Category: 'null-function'
    },
    // String concatenation (+ → ||)
    {
        Source: { platform: 'sqlserver', sql: "[FirstName] + ' ' + [LastName]" },
        Target: { platform: 'postgresql', sql: '"FirstName" || \' \' || "LastName"' },
        Category: 'string-concat'
    },
    // CONVERT → CAST
    {
        Source: { platform: 'sqlserver', sql: "CONVERT(NVARCHAR(50), [Price])" },
        Target: { platform: 'postgresql', sql: 'CAST("Price" AS VARCHAR(50))' },
        Category: 'type-conversion'
    },
    // IIF → CASE
    {
        Source: { platform: 'sqlserver', sql: "IIF([Status] = 1, 'Active', 'Inactive')" },
        Target: { platform: 'postgresql', sql: "CASE WHEN \"Status\" = true THEN 'Active' ELSE 'Inactive' END" },
        Category: 'conditional'
    },
    // DATEADD → interval arithmetic
    {
        Source: { platform: 'sqlserver', sql: "DATEADD(day, -7, GETUTCDATE())" },
        Target: { platform: 'postgresql', sql: "NOW() - INTERVAL '7 days'" },
        Category: 'date-arithmetic'
    },
    // DATEDIFF → EXTRACT/date_part
    {
        Source: { platform: 'sqlserver', sql: "DATEDIFF(day, [StartDate], [EndDate])" },
        Target: { platform: 'postgresql', sql: 'EXTRACT(DAY FROM ("EndDate" - "StartDate"))::integer' },
        Category: 'date-diff'
    },
    // Schema-qualified with brackets
    {
        Source: { platform: 'sqlserver', sql: "SELECT * FROM [__mj].[vwEntities] WHERE [SchemaName] = '__mj'" },
        Target: { platform: 'postgresql', sql: 'SELECT * FROM __mj."vwEntities" WHERE "SchemaName" = \'__mj\'' },
        Category: 'schema-qualified'
    },
    // Complex WHERE clause
    {
        Source: { platform: 'sqlserver', sql: "[EntityID] IN (SELECT [ID] FROM [__mj].[vwEntities] WHERE [IncludeInAPI] = 1)" },
        Target: { platform: 'postgresql', sql: '"EntityID" IN (SELECT "ID" FROM __mj."vwEntities" WHERE "IncludeInAPI" = true)' },
        Category: 'subquery'
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
        .filter(e => e.Source.platform === from && e.Target.platform === to)
        .slice(0, maxExamples);

    if (relevant.length === 0) return '';

    const lines = relevant.map((ex, i) =>
        `Example ${i + 1} (${ex.Category}):\n` +
        `  Source (${from}): ${ex.Source.sql}\n` +
        `  Target (${to}): ${ex.Target.sql}`
    );

    return `## Translation Examples\n\n${lines.join('\n\n')}`;
}
