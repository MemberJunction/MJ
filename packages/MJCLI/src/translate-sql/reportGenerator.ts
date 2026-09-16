import { DatabasePlatform } from '@memberjunction/core';
import { SQLClassification } from './classifier.js';

/**
 * A single translation item for the report.
 */
export interface TranslationReportItem {
    /** Source identifier (e.g., "Query: User Activity Report") */
    Source: string;
    /** The original SQL fragment */
    OriginalSQL: string;
    /** How the SQL was classified */
    Classification: SQLClassification;
    /** The translated SQL (null if not translated) */
    TranslatedSQL: string | null;
    /** Translation method used */
    Method: 'rule-based' | 'llm' | 'skipped' | 'flagged';
    /** Dialect markers found */
    Markers: string[];
    /** Any error or note */
    note?: string;
}

/**
 * Generates a markdown report from translation results.
 */
export function GenerateTranslationReport(
    items: TranslationReportItem[],
    from: DatabasePlatform,
    to: DatabasePlatform
): string {
    const lines: string[] = [];

    lines.push(`# SQL Translation Report`);
    lines.push(`**Source dialect:** ${from}`);
    lines.push(`**Target dialect:** ${to}`);
    lines.push(`**Generated at:** ${new Date().toISOString()}`);
    lines.push('');

    // Summary
    const summary = buildSummary(items);
    lines.push(`## Summary`);
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total fragments | ${summary.total} |`);
    lines.push(`| Standard SQL (no translation needed) | ${summary.standard} |`);
    lines.push(`| Rule-based translations | ${summary.ruleBased} |`);
    lines.push(`| LLM translations | ${summary.llm} |`);
    lines.push(`| Flagged for review | ${summary.flagged} |`);
    lines.push('');

    // Details by classification
    if (summary.ruleBased > 0 || summary.llm > 0) {
        lines.push(`## Translations`);
        lines.push('');
        const translated = items.filter(i =>
            i.Method === 'rule-based' || i.Method === 'llm'
        );
        for (const item of translated) {
            lines.push(`### ${item.Source}`);
            lines.push(`**Method:** ${item.Method} | **Markers:** ${item.Markers.join(', ') || 'none'}`);
            lines.push('');
            lines.push('**Original:**');
            lines.push('```sql');
            lines.push(item.OriginalSQL);
            lines.push('```');
            lines.push('');
            lines.push('**Translated:**');
            lines.push('```sql');
            lines.push(item.TranslatedSQL || '-- Translation failed');
            lines.push('```');
            if (item.note) {
                lines.push(`> ${item.note}`);
            }
            lines.push('');
        }
    }

    // Flagged items
    const flagged = items.filter(i => i.Method === 'flagged');
    if (flagged.length > 0) {
        lines.push(`## Flagged for Human Review`);
        lines.push('');
        for (const item of flagged) {
            lines.push(`### ${item.Source}`);
            lines.push(`**Markers:** ${item.Markers.join(', ')}`);
            lines.push('```sql');
            lines.push(item.OriginalSQL);
            lines.push('```');
            if (item.note) {
                lines.push(`> ${item.note}`);
            }
            lines.push('');
        }
    }

    // Standard SQL items (collapsed)
    const standard = items.filter(i => i.Classification === 'standard');
    if (standard.length > 0) {
        lines.push(`## Standard SQL (No Translation Needed)`);
        lines.push('');
        lines.push(`${standard.length} fragments are standard SQL and work on both platforms.`);
        lines.push('');
    }

    return lines.join('\n');
}

interface ReportSummary {
    total: number;
    standard: number;
    ruleBased: number;
    llm: number;
    flagged: number;
}

function buildSummary(items: TranslationReportItem[]): ReportSummary {
    return {
        total: items.length,
        standard: items.filter(i => i.Classification === 'standard').length,
        ruleBased: items.filter(i => i.Method === 'rule-based').length,
        llm: items.filter(i => i.Method === 'llm').length,
        flagged: items.filter(i => i.Method === 'flagged').length,
    };
}
