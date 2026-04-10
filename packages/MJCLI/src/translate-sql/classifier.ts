import { DatabasePlatform } from '@memberjunction/core';

/**
 * Classification result for a SQL fragment.
 */
export type SQLClassification = 'standard' | 'rule-based' | 'llm-needed';

/**
 * Patterns that indicate SQL Server-specific syntax.
 */
const SQL_SERVER_PATTERNS: RegExp[] = [
    /\[[\w\s]+\]/,                         // [bracket] identifiers
    /\bTOP\s+\d+/i,                        // TOP N
    /\bGETUTCDATE\s*\(\)/i,               // GETUTCDATE()
    /\bGETDATE\s*\(\)/i,                  // GETDATE()
    /\bISNULL\s*\(/i,                     // ISNULL()
    /\bIIF\s*\(/i,                        // IIF()
    /\bSCOPE_IDENTITY\s*\(\)/i,          // SCOPE_IDENTITY()
    /\bNEWID\s*\(\)/i,                   // NEWID()
    /\bNEWSEQUENTIALID\s*\(\)/i,        // NEWSEQUENTIALID()
    /\bDATEADD\s*\(/i,                   // DATEADD()
    /\bDATEDIFF\s*\(/i,                  // DATEDIFF()
    /\bCONVERT\s*\(/i,                   // CONVERT()
    /\bCAST\s*\([^)]+\bAS\s+NVARCHAR/i, // CAST(... AS NVARCHAR...)
    /\bCAST\s*\([^)]+\bAS\s+BIT\b/i,    // CAST(... AS BIT)
    /\bBIT\b/i,                           // BIT type
    /\bUNIQUEIDENTIFIER\b/i,            // UNIQUEIDENTIFIER type
    /\bNVARCHAR\b/i,                     // NVARCHAR type
    /\bDATETIMEOFFSET\b/i,              // DATETIMEOFFSET type
    /=\s*1\b/,                           // = 1 (boolean comparison)
    /=\s*0\b/,                           // = 0 (boolean comparison)
    /\bEXEC\s+/i,                        // EXEC stored_proc
    /\+\s*'/,                            // String concatenation with +
];

/**
 * Patterns that can be translated with simple rules (identifier quoting + boolean literals).
 */
const SIMPLE_RULE_PATTERNS: RegExp[] = [
    /\[[\w]+\]/,           // Simple bracket identifiers (no spaces)
    /=\s*1\b/,            // Boolean = 1
    /=\s*0\b/,            // Boolean = 0
];

/**
 * Patterns indicating the SQL is standard and cross-platform.
 */
const STANDARD_SQL_KEYWORDS: RegExp[] = [
    /^[\w\s.,=<>!()'+\-*/%;]+$/,  // Only basic characters
];

/**
 * Classifies a SQL fragment to determine the translation approach needed.
 *
 * @param sql - The SQL fragment to classify
 * @param sourceDialect - The dialect the SQL is written in
 * @returns The classification determining the translation strategy
 */
export function ClassifySQL(sql: string, sourceDialect: DatabasePlatform): SQLClassification {
    if (!sql || sql.trim().length === 0) return 'standard';

    const trimmed = sql.trim();

    // Check for dialect-specific patterns
    const dialectPatterns = sourceDialect === 'sqlserver' ? SQL_SERVER_PATTERNS : [];
    const hasDialectSpecific = dialectPatterns.some(p => p.test(trimmed));

    if (!hasDialectSpecific) {
        return 'standard';
    }

    // Check if it's only simple transformations (bracket quoting + boolean literals)
    if (isOnlySimpleTransformations(trimmed, sourceDialect)) {
        return 'rule-based';
    }

    return 'llm-needed';
}

/**
 * Checks whether a SQL fragment only needs simple, rule-based transformations.
 * Simple transformations are: bracket→double-quote identifier conversion and 1/0→true/false booleans.
 */
function isOnlySimpleTransformations(sql: string, sourceDialect: DatabasePlatform): boolean {
    if (sourceDialect !== 'sqlserver') return false;

    // Remove bracket identifiers and boolean comparisons, then check if anything dialect-specific remains
    let simplified = sql
        .replace(/\[[\w]+\]/g, '__ID__')        // Remove simple bracket identifiers
        .replace(/=\s*1\b/g, '= __BOOL__')     // Remove boolean = 1
        .replace(/=\s*0\b/g, '= __BOOL__');    // Remove boolean = 0

    // Now check if any complex dialect markers remain
    const complexPatterns = SQL_SERVER_PATTERNS.filter(p =>
        !SIMPLE_RULE_PATTERNS.some(sp => sp.source === p.source)
    );

    return !complexPatterns.some(p => p.test(simplified));
}

/**
 * Batch classification result.
 */
export interface ClassificationResult {
    sql: string;
    classification: SQLClassification;
    /** Specific dialect markers found in the SQL */
    markers: string[];
}

/**
 * Classifies multiple SQL fragments and returns detailed results.
 */
export function ClassifySQLBatch(
    fragments: string[],
    sourceDialect: DatabasePlatform
): ClassificationResult[] {
    return fragments.map(sql => {
        const classification = ClassifySQL(sql, sourceDialect);
        const markers = findDialectMarkers(sql, sourceDialect);
        return { sql, classification, markers };
    });
}

/**
 * Finds specific dialect markers in a SQL fragment for reporting.
 */
function findDialectMarkers(sql: string, sourceDialect: DatabasePlatform): string[] {
    if (sourceDialect !== 'sqlserver') return [];
    const markers: string[] = [];
    const tests: Array<[RegExp, string]> = [
        [/\[[\w\s]+\]/, 'bracket-identifiers'],
        [/\bTOP\s+\d+/i, 'TOP-N'],
        [/\bGETUTCDATE\s*\(\)/i, 'GETUTCDATE'],
        [/\bGETDATE\s*\(\)/i, 'GETDATE'],
        [/\bISNULL\s*\(/i, 'ISNULL'],
        [/\bIIF\s*\(/i, 'IIF'],
        [/=\s*[10]\b/, 'boolean-literal'],
        [/\+\s*'/i, 'string-concat-plus'],
        [/\bCONVERT\s*\(/i, 'CONVERT'],
        [/\bDATEADD\s*\(/i, 'DATEADD'],
        [/\bDATEDIFF\s*\(/i, 'DATEDIFF'],
        [/\bSCOPE_IDENTITY\s*\(\)/i, 'SCOPE_IDENTITY'],
    ];
    for (const [regex, label] of tests) {
        if (regex.test(sql)) markers.push(label);
    }
    return markers;
}
