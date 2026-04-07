/**
 * analyze-integrations command — Run DBAutoDoc on integration schemas to discover
 * missing PKs, FKs, entity descriptions, and field descriptions.
 *
 * Seeds known constraints from integration metadata as ground truth (immutable),
 * then runs discovery only on gaps. Results are written back to metadata JSON
 * and additionalSchemaInfo.json for CodeGen.
 */

import { Command, Flags } from '@oclif/core';
import ora from 'ora';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { AnalysisOrchestrator } from '../core/AnalysisOrchestrator.js';
import { IntegrationGroundTruthSeeder } from '../integrations/IntegrationGroundTruthSeeder.js';
import { IntegrationResultWriter } from '../integrations/IntegrationResultWriter.js';
import type { IntegrationSeedResult } from '../integrations/IntegrationGroundTruthSeeder.js';
import { join } from 'path';

export default class AnalyzeIntegrations extends Command {
    static description = 'Analyze integration schemas to discover missing PKs, FKs, and descriptions. Seeds known constraints as immutable ground truth, discovers only gaps.';

    static examples = [
        '$ db-auto-doc analyze-integrations --config ./config.json',
        '$ db-auto-doc analyze-integrations --config ./config.json --platform hubspot',
        '$ db-auto-doc analyze-integrations --config ./config.json --platform hubspot --dry-run',
        '$ db-auto-doc analyze-integrations --metadata-dir ./metadata/integrations --config ./config.json',
    ];

    static flags = {
        config: Flags.string({
            char: 'c',
            description: 'Path to DBAutoDoc config file (DB connection + AI settings)',
            default: './config.json',
        }),
        platform: Flags.string({
            char: 'p',
            description: 'Specific platform to analyze (e.g., hubspot, mailchimp). Omit for all platforms.',
            required: false,
        }),
        'metadata-dir': Flags.string({
            char: 'm',
            description: 'Path to integration metadata directory',
            default: './metadata/integrations',
        }),
        'dry-run': Flags.boolean({
            description: 'Show gaps that would be filled without running discovery or writing results',
            default: false,
        }),
        'min-confidence': Flags.integer({
            description: 'Minimum confidence (0-100) for discovered PKs/FKs to be written back',
            default: 80,
        }),
        resume: Flags.string({
            char: 'r',
            description: 'Resume from existing DBAutoDoc state file',
            required: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(AnalyzeIntegrations);
        const spinner = ora();

        try {
            // Step 1: Seed ground truth from integration metadata
            spinner.start('Reading integration metadata');
            const seeder = new IntegrationGroundTruthSeeder(flags['metadata-dir']);
            const seedResults = seeder.SeedFromMetadata(flags.platform);

            if (seedResults.length === 0) {
                spinner.warn('No integration metadata found');
                if (flags.platform) {
                    this.log(chalk.yellow(`No metadata file found for platform: ${flags.platform}`));
                    this.log(`Expected: ${flags['metadata-dir']}/.${flags.platform}.json`);
                }
                return;
            }

            spinner.succeed(`Found ${seedResults.length} integration(s) to analyze`);

            // Step 2: Report gaps per platform
            for (const seed of seedResults) {
                this.LogGapSummary(seed);
            }

            if (flags['dry-run']) {
                this.log(chalk.blue('\nDry run complete. No changes made.'));
                return;
            }

            // Step 3: Load DBAutoDoc config for DB + AI access
            spinner.start('Loading DBAutoDoc configuration');
            const config = await ConfigLoader.load(flags.config);
            spinner.succeed('Configuration loaded');

            // Step 4: Run discovery for each platform
            for (const seed of seedResults) {
                const tablesWithGaps = seed.TableGaps.filter(t => t.HasAnyGap);
                if (tablesWithGaps.length === 0) {
                    this.log(chalk.green(`\n✓ ${seed.IntegrationName}: Fully documented, nothing to discover`));
                    continue;
                }

                this.log(chalk.blue(`\n▸ Analyzing ${seed.IntegrationName} (${tablesWithGaps.length} tables with gaps)...`));

                // Configure orchestrator scoped to this integration's schema
                const schemaFilter = seed.SchemaName;

                // Override config to target only this integration's schema
                const scopedConfig = {
                    ...config,
                    schemas: {
                        ...config.schemas,
                        include: [schemaFilter],
                    },
                    groundTruth: seed.GroundTruth,
                };

                const orchestrator = new AnalysisOrchestrator({
                    config: scopedConfig,
                    resumeFromState: flags.resume,
                    preSeededDiscoveries: {
                        primaryKeys: seed.ConfirmedPKs,
                        foreignKeys: seed.ConfirmedFKs,
                    },
                    onProgress: (message, _data) => {
                        spinner.text = `[${seed.IntegrationName}] ${message}`;
                    },
                });

                spinner.start(`[${seed.IntegrationName}] Running discovery`);
                const result = await orchestrator.execute();

                if (result.success) {
                    spinner.succeed(`[${seed.IntegrationName}] Discovery complete`);

                    // Step 5: Write results back
                    const metadataFilePath = join(
                        flags['metadata-dir'],
                        `.${seed.IntegrationName.toLowerCase().replace(/\s+/g, '-')}.json`
                    );

                    const writer = new IntegrationResultWriter(flags['metadata-dir']);
                    const writeResult = writer.WriteResults(result.state, seed, metadataFilePath);

                    this.log(`  PKs discovered: ${writeResult.PKsWritten}`);
                    this.log(`  FKs discovered: ${writeResult.FKsWritten}`);
                    this.log(`  Descriptions written: ${writeResult.DescriptionsWritten}`);
                    this.log(`  Schema info entries: ${writeResult.SchemaInfoEntriesWritten}`);
                    if (writeResult.FilesModified.length > 0) {
                        this.log(`  Files modified:`);
                        for (const f of writeResult.FilesModified) this.log(`    - ${f}`);
                    }
                } else {
                    spinner.fail(`[${seed.IntegrationName}] Discovery failed: ${result.message}`);
                }
            }

            this.log(chalk.green('\n✓ Integration analysis complete'));

        } catch (error) {
            spinner.fail('Analysis failed');
            this.error((error as Error).message);
        }
    }

    private LogGapSummary(seed: IntegrationSeedResult): void {
        const tablesWithGaps = seed.TableGaps.filter(t => t.HasAnyGap);
        const totalFields = seed.TableGaps.reduce((s, t) => s + t.FieldsWithDescriptions + t.FieldsMissingDescriptions, 0);
        const fieldsWithDescs = seed.TableGaps.reduce((s, t) => s + t.FieldsWithDescriptions, 0);

        this.log(chalk.bold(`\n${seed.IntegrationName} (${seed.SchemaName}):`));
        this.log(`  Tables: ${seed.AllTables.length} total, ${tablesWithGaps.length} with gaps`);
        this.log(`  PKs: ${seed.ConfirmedPKs.length} confirmed`);
        this.log(`  FKs: ${seed.ConfirmedFKs.length} confirmed`);
        this.log(`  Descriptions: ${fieldsWithDescs}/${totalFields} fields, ${seed.TableGaps.filter(t => t.HasEntityDescription).length}/${seed.AllTables.length} tables`);

        if (tablesWithGaps.length > 0) {
            this.log(chalk.yellow('  Gaps:'));
            for (const t of tablesWithGaps) {
                const gaps: string[] = [];
                if (!t.HasEntityDescription) gaps.push('no entity description');
                if (!t.HasPrimaryKey) gaps.push('no PK');
                if (t.FieldsMissingDescriptions > 0) gaps.push(`${t.FieldsMissingDescriptions} fields missing descriptions`);
                this.log(`    ${t.TableName}: ${gaps.join(', ')}`);
            }
        }
    }
}
