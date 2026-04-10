import { DatabasePlatform } from '@memberjunction/core';

/**
 * Result of a rule-based SQL translation.
 */
export interface RuleTranslationResult {
    success: boolean;
    translatedSQL: string;
    appliedRules: string[];
}

/**
 * Translates SQL Server SQL to PostgreSQL using deterministic, rule-based transformations.
 * Only handles simple cases: bracket identifiers → double-quote identifiers,
 * boolean literal 1/0 → true/false.
 *
 * @param sql - The source SQL fragment
 * @param from - The source platform
 * @param to - The target platform
 * @returns The translation result with applied rules
 */
export function RuleBasedTranslate(
    sql: string,
    from: DatabasePlatform,
    to: DatabasePlatform
): RuleTranslationResult {
    if (from === to) {
        return { success: true, translatedSQL: sql, appliedRules: [] };
    }

    if (from === 'sqlserver' && to === 'postgresql') {
        return translateSqlServerToPostgres(sql);
    }

    if (from === 'postgresql' && to === 'sqlserver') {
        return translatePostgresToSqlServer(sql);
    }

    return { success: false, translatedSQL: sql, appliedRules: [] };
}

function translateSqlServerToPostgres(sql: string): RuleTranslationResult {
    let result = sql;
    const appliedRules: string[] = [];

    // Rule 1: Convert [bracket] identifiers to "double-quote" identifiers
    const bracketRegex = /\[(\w+)\]/g;
    if (bracketRegex.test(result)) {
        result = result.replace(/\[(\w+)\]/g, '"$1"');
        appliedRules.push('bracket-to-doublequote');
    }

    // Rule 2: Convert boolean = 1 to = true
    if (/=\s*1\b/.test(result)) {
        result = result.replace(/=\s*1\b/g, '= true');
        appliedRules.push('bit-1-to-true');
    }

    // Rule 3: Convert boolean = 0 to = false
    if (/=\s*0\b/.test(result)) {
        result = result.replace(/=\s*0\b/g, '= false');
        appliedRules.push('bit-0-to-false');
    }

    return {
        success: appliedRules.length > 0,
        translatedSQL: result,
        appliedRules
    };
}

function translatePostgresToSqlServer(sql: string): RuleTranslationResult {
    let result = sql;
    const appliedRules: string[] = [];

    // Rule 1: Convert "double-quote" identifiers to [bracket] identifiers
    // Only convert identifiers, not string literals
    const dqRegex = /"(\w+)"/g;
    if (dqRegex.test(result)) {
        result = result.replace(/"(\w+)"/g, '[$1]');
        appliedRules.push('doublequote-to-bracket');
    }

    // Rule 2: Convert = true to = 1
    if (/=\s*true\b/i.test(result)) {
        result = result.replace(/=\s*true\b/gi, '= 1');
        appliedRules.push('true-to-bit-1');
    }

    // Rule 3: Convert = false to = 0
    if (/=\s*false\b/i.test(result)) {
        result = result.replace(/=\s*false\b/gi, '= 0');
        appliedRules.push('false-to-bit-0');
    }

    return {
        success: appliedRules.length > 0,
        translatedSQL: result,
        appliedRules
    };
}
