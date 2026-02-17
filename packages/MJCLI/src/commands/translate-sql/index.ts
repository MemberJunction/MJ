import { Command, Flags } from '@oclif/core';
import { DatabasePlatform } from '@memberjunction/core';
import {
    ClassifySQLBatch,
    RuleBasedTranslate,
    GenerateTranslationReport,
    BuildGroundTruthPromptSection,
    TranslationReportItem,
} from '../../translate-sql/index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI command for translating SQL between database dialects.
 * Scans metadata (Queries, UserViews, RLS filters) or explicit SQL fragments,
 * classifies them, applies rule-based or LLM translation, and generates a report.
 *
 * Usage:
 *   mj translate-sql --from sqlserver --to postgresql --scope queries
 *   mj translate-sql --from sqlserver --to postgresql --scope all --dry-run
 *   mj translate-sql --from sqlserver --to postgresql --sql "SELECT TOP 10 [Name] FROM [Users]"
 */
export default class TranslateSQL extends Command {
    static description = 'Translate SQL fragments between database dialects (SQL Server ↔ PostgreSQL)';

    static examples = [
        '<%= config.bin %> translate-sql --from sqlserver --to postgresql --dry-run',
        '<%= config.bin %> translate-sql --from sqlserver --to postgresql --scope queries',
        '<%= config.bin %> translate-sql --from sqlserver --to postgresql --sql "SELECT TOP 10 [Name] FROM [Users]"',
        '<%= config.bin %> translate-sql --from sqlserver --to postgresql --scope all --output ./reports',
    ];

    static flags = {
        from: Flags.string({
            description: 'Source SQL dialect',
            required: true,
            options: ['sqlserver', 'postgresql'],
        }),
        to: Flags.string({
            description: 'Target SQL dialect',
            required: true,
            options: ['sqlserver', 'postgresql'],
        }),
        scope: Flags.string({
            description: 'What to scan for translation',
            options: ['queries', 'views', 'filters', 'all'],
            default: 'all',
        }),
        sql: Flags.string({
            description: 'Translate a single SQL fragment (inline mode)',
        }),
        'dry-run': Flags.boolean({
            description: 'Show what would be translated without making changes',
            default: false,
        }),
        review: Flags.boolean({
            description: 'Generate review report only (no writes to database)',
            default: false,
        }),
        output: Flags.string({
            char: 'o',
            description: 'Output directory for the translation report',
        }),
        force: Flags.boolean({
            description: 'Re-translate even if platform variants already exist',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(TranslateSQL);
        const from = flags.from as DatabasePlatform;
        const to = flags.to as DatabasePlatform;

        if (from === to) {
            this.error('Source and target dialects must be different');
        }

        // Inline single-SQL mode
        if (flags.sql) {
            await this.translateInline(flags.sql, from, to);
            return;
        }

        // Batch mode: scan metadata
        await this.translateBatch(from, to, flags);
    }

    /**
     * Translates a single SQL fragment provided via --sql flag.
     */
    private async translateInline(sql: string, from: DatabasePlatform, to: DatabasePlatform): Promise<void> {
        const [result] = ClassifySQLBatch([sql], from);

        this.log(`\nClassification: ${result.classification}`);
        if (result.markers.length > 0) {
            this.log(`Dialect markers: ${result.markers.join(', ')}`);
        }

        if (result.classification === 'standard') {
            this.log(`\nSQL is standard — no translation needed.`);
            this.log(sql);
            return;
        }

        if (result.classification === 'rule-based') {
            const translated = RuleBasedTranslate(sql, from, to);
            this.log(`\nRule-based translation (${translated.appliedRules.join(', ')}):`);
            this.log(translated.translatedSQL);
            return;
        }

        // LLM-needed
        this.log(`\nThis SQL requires LLM translation.`);
        this.log(`Markers: ${result.markers.join(', ')}`);
        this.log(`\nGround truth examples for LLM prompt:`);
        this.log(BuildGroundTruthPromptSection(from, to));
        this.log(`\nOriginal SQL:`);
        this.log(sql);
        this.log(`\nNote: LLM integration requires AI provider configuration.`);
        this.log(`Use the review report to see all fragments needing LLM translation.`);
    }

    /**
     * Scans metadata for SQL fragments and generates a translation report.
     */
    private async translateBatch(
        from: DatabasePlatform,
        to: DatabasePlatform,
        flags: Record<string, unknown>
    ): Promise<void> {
        this.log(`\nScanning for SQL fragments to translate (${from} → ${to})...`);
        this.log(`Scope: ${flags.scope}`);

        // For now, we work with metadata loaded via the MJ bootstrap.
        // The prerun hook loads the bootstrap for heavy commands.
        const items = await this.collectSQLFragments(from, flags.scope as string);

        if (items.length === 0) {
            this.log('\nNo SQL fragments found to translate.');
            return;
        }

        // Classify all fragments
        const classified = ClassifySQLBatch(
            items.map(i => i.sql),
            from
        );

        // Translate
        const reportItems: TranslationReportItem[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const classResult = classified[i];

            if (classResult.classification === 'standard') {
                reportItems.push({
                    source: item.label,
                    originalSQL: item.sql,
                    classification: 'standard',
                    translatedSQL: null,
                    method: 'skipped',
                    markers: classResult.markers,
                });
                continue;
            }

            if (classResult.classification === 'rule-based') {
                const translated = RuleBasedTranslate(item.sql, from, to);
                reportItems.push({
                    source: item.label,
                    originalSQL: item.sql,
                    classification: 'rule-based',
                    translatedSQL: translated.translatedSQL,
                    method: 'rule-based',
                    markers: classResult.markers,
                    note: `Rules: ${translated.appliedRules.join(', ')}`,
                });
                continue;
            }

            // LLM-needed — flag for review
            reportItems.push({
                source: item.label,
                originalSQL: item.sql,
                classification: 'llm-needed',
                translatedSQL: null,
                method: 'flagged',
                markers: classResult.markers,
                note: 'Requires LLM translation — configure AI provider and re-run.',
            });
        }

        // Print summary
        const standard = reportItems.filter(i => i.classification === 'standard').length;
        const ruleBased = reportItems.filter(i => i.method === 'rule-based').length;
        const flagged = reportItems.filter(i => i.method === 'flagged').length;

        this.log(`\nResults:`);
        this.log(`  Total fragments: ${reportItems.length}`);
        this.log(`  Standard SQL (no translation): ${standard}`);
        this.log(`  Rule-based translations: ${ruleBased}`);
        this.log(`  Flagged for LLM/review: ${flagged}`);

        // Generate report
        const report = GenerateTranslationReport(reportItems, from, to);

        if (flags.output) {
            const outputDir = flags.output as string;
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            const reportPath = path.join(outputDir, `translation-report-${from}-to-${to}.md`);
            fs.writeFileSync(reportPath, report, 'utf-8');
            this.log(`\nReport written to: ${reportPath}`);
        }

        if (flags['dry-run'] || flags.review) {
            this.log(`\nDry run / review mode — no changes written to database.`);
        }
    }

    /**
     * Collects SQL fragments from loaded metadata.
     */
    private async collectSQLFragments(
        from: DatabasePlatform,
        scope: string
    ): Promise<Array<{ label: string; sql: string }>> {
        const fragments: Array<{ label: string; sql: string }> = [];

        try {
            const { Metadata } = await import('@memberjunction/core');
            const md = new Metadata();

            // Queries
            if (scope === 'all' || scope === 'queries') {
                for (const query of md.Queries) {
                    if (query.SQL) {
                        fragments.push({ label: `Query: ${query.Name}`, sql: query.SQL });
                    }
                    if (query.CacheValidationSQL) {
                        fragments.push({
                            label: `Query CacheValidation: ${query.Name}`,
                            sql: query.CacheValidationSQL
                        });
                    }
                }
            }

            // Row Level Security Filters (accessed via Provider, not exposed on Metadata directly)
            if (scope === 'all' || scope === 'filters') {
                for (const filter of Metadata.Provider.RowLevelSecurityFilters) {
                    if (filter.FilterText) {
                        fragments.push({
                            label: `RLS Filter: ${filter.Name}`,
                            sql: filter.FilterText
                        });
                    }
                }
            }

            // UserViews - accessed through RunView since they're entity data
            // In a full implementation, we'd query the UserView entity
            // For now, we note that view SQL is mainly handled through ExtraFilter/OrderBy
            // which already support PlatformSQL

        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.warn(`Could not load metadata: ${message}`);
            this.warn('Run this command in a configured MemberJunction environment.');
        }

        return fragments;
    }
}
