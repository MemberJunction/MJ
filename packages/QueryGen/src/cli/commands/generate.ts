/**
 * Generate command - Main query generation workflow
 *
 * Orchestrates the full query generation pipeline:
 * 1. Load entity groups
 * 2. Generate business questions
 * 3. Generate SQL queries
 * 4. Test and fix queries
 * 5. Refine queries
 * 6. Export results
 */

import ora from 'ora';
import chalk from 'chalk';
import { Metadata, DatabaseProviderBase, EntityInfo, LogStatus } from '@memberjunction/core';
import { loadConfig } from '../config';
import { getSystemUser } from '../../utils/user-helpers';
import { EntityGrouper } from '../../core/EntityGrouper';
import { QuestionGenerator } from '../../core/QuestionGenerator';
import { QueryWriter } from '../../core/QueryWriter';
import { QueryTester } from '../../core/QueryTester';
import { QueryRefiner } from '../../core/QueryRefiner';
import { MetadataExporter } from '../../core/MetadataExporter';
import { QueryDatabaseWriter } from '../../core/QueryDatabaseWriter';
import { EmbeddingService } from '../../vectors/EmbeddingService';
import { SimilaritySearch } from '../../vectors/SimilaritySearch';
import { formatEntityMetadataForPrompt } from '../../utils/entity-helpers';
import { extractErrorMessage } from '../../utils/error-handlers';
import { buildQueryCategory, extractUniqueCategories } from '../../utils/category-builder';
import { ValidatedQuery, GoldenQuery, EntityGroup, QueryCategoryInfo } from '../../data/schema';
import goldenQueriesData from '../../data/golden-queries.json';

/**
 * Execute the generate command
 *
 * Full orchestration of query generation workflow with progress reporting.
 * Uses ora for spinners and chalk for colored output.
 */
export async function generateCommand(options: Record<string, unknown>): Promise<void> {
  const spinner = ora('Initializing query generation...').start();

  try {
    // 1. Load configuration
    spinner.text = 'Loading configuration...';
    const config = loadConfig(options);

    // Show model/vendor overrides if configured
    if (config.modelOverride || config.vendorOverride) {
      const overrideMsg = [];
      if (config.modelOverride) overrideMsg.push(`Model: ${config.modelOverride}`);
      if (config.vendorOverride) overrideMsg.push(`Vendor: ${config.vendorOverride}`);
      spinner.info(chalk.cyan(`Using overrides - ${overrideMsg.join(', ')}`));
    }

    if (config.verbose) {
      spinner.info(chalk.dim('Configuration loaded'));
      console.log(chalk.dim(JSON.stringify(config, null, 2)));
    }

    // 2. Get system user from UserCache (populated by provider initialization)
    const contextUser = getSystemUser();

    // 3. Verify database connection and metadata
    spinner.text = 'Loading metadata...';
    // Assume provider and AIEngine are already configured by the calling application (MJCLI)
    if (!Metadata.Provider) {
      throw new Error('Metadata provider not configured. Please ensure database connection is set up before running CLI.');
    }
    spinner.succeed('Metadata loaded');

    // 4. Filter and build entity groups
    spinner.start('Filtering entities...');
    const md = new Metadata();

    // DIAGNOSTIC: Log entity filtering context
    if (config.verbose) {
      LogStatus(`\n=== Entity Filtering Diagnostics ===`);
      LogStatus(`Total entities in metadata: ${md.Entities.length}`);
      LogStatus(`Excluded schemas: ${config.excludeSchemas.join(', ')}`);

      // Show schema distribution BEFORE filtering
      const schemasBefore = new Map<string, number>();
      md.Entities.forEach(e => {
        const schema = e.SchemaName || 'null';
        schemasBefore.set(schema, (schemasBefore.get(schema) || 0) + 1);
      });
      LogStatus(`Schema distribution (before filtering):`);
      Array.from(schemasBefore.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([schema, count]) => {
          const excluded = config.excludeSchemas.includes(schema) ? ' [EXCLUDED]' : '';
          LogStatus(`  ${schema}: ${count} entities${excluded}`);
        });
    }

    // Apply entity filtering (includeEntities takes precedence over excludeEntities)
    let filteredEntities = md.Entities.filter(
      e => !config.excludeSchemas.includes(e.SchemaName || '')
    );

    if (config.verbose) {
      LogStatus(`\nAfter schema filtering: ${filteredEntities.length} entities remaining`);
      if (filteredEntities.length > 0) {
        LogStatus(`Sample entity names: ${filteredEntities.slice(0, 5).map(e => e.Name).join(', ')}`);
        const schemasAfter = new Set(filteredEntities.map(e => e.SchemaName || 'null'));
        LogStatus(`Remaining schemas: ${Array.from(schemasAfter).join(', ')}`);
      }
    }

    if (config.includeEntities.length > 0) {
      // Allowlist: only include specified entities
      filteredEntities = filteredEntities.filter(e => config.includeEntities.includes(e.Name));
      spinner.info(chalk.dim(`Including only ${config.includeEntities.length} specified entities`));
    } else if (config.excludeEntities.length > 0) {
      // Denylist: exclude specified entities
      filteredEntities = filteredEntities.filter(e => !config.excludeEntities.includes(e.Name));
      spinner.info(chalk.dim(`Excluded ${config.excludeEntities.length} entities`));
    }

    if (config.verbose) {
      LogStatus(`Final filtered entities: ${filteredEntities.length}`);
      LogStatus('====================================\n');
    }

    // 4. Group entities by schema and generate entity groups
    spinner.text = 'Analyzing entity relationships...';

    // Count entities per schema for informational logging
    const schemaCount = new Set(filteredEntities.map(e => e.SchemaName)).size;
    if (config.verbose && schemaCount > 1) {
      spinner.info(chalk.dim(`Processing ${schemaCount} schemas separately`));
    }

    const grouper = new EntityGrouper(config);
    const entityGroups = await grouper.generateEntityGroups(filteredEntities, contextUser);
    spinner.succeed(chalk.green(`Found ${entityGroups.length} entity groups across ${schemaCount} ${schemaCount === 1 ? 'schema' : 'schemas'}`));


    // 5. Initialize vector similarity search
    spinner.start('Embedding golden queries...');
    const embeddingService = new EmbeddingService(config.embeddingModel);
    const goldenQueries = await loadGoldenQueries(config);
    const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);
    spinner.succeed(chalk.green(`Embedded ${goldenQueries.length} golden queries`));

    // 5b. Build category structure for all entity groups upfront
    spinner.start('Building category structure...');
    const categoryMap = new Map<string, QueryCategoryInfo>();
    for (const group of entityGroups) {
      const category = buildQueryCategory(config, group);
      // Use primary entity name as key for lookup during query generation
      categoryMap.set(group.primaryEntity.Name, category);
    }
    const uniqueCategories = extractUniqueCategories(Array.from(categoryMap.values()));
    spinner.succeed(chalk.green(`Created ${uniqueCategories.length} ${uniqueCategories.length === 1 ? 'category' : 'categories'}`));

    // 6. Generate queries for each entity group
    const totalGroups = entityGroups.length;
    let processedGroups = 0;
    const allValidatedQueries: ValidatedQuery[] = [];

    for (const group of entityGroups) {
      processedGroups++;
      const groupPrefix = chalk.cyan(`[${processedGroups}/${totalGroups}]`);
      spinner.start(`${groupPrefix} Processing ${chalk.bold(group.primaryEntity.Name)}...`);

      let queriesCreatedForGroup = 0;

      try {
        // 6a. Generate business questions for this entity group
        const questionGenerator = new QuestionGenerator(contextUser, config);
        const questions = await questionGenerator.generateQuestions(group);

        if (config.verbose) {
          spinner.info(`${groupPrefix} Generated ${questions.length} questions`);
        }

        // 6b. For each question, generate and validate query
        for (const question of questions) {
          spinner.text = `${groupPrefix} Generating query: ${chalk.italic(question.userQuestion)}`;

          // Embed question for similarity search
          const questionEmbedding = await embeddingService.embedQuery({
            userQuestion: question.userQuestion,
            description: question.description,
            technicalDescription: question.technicalDescription,
          });

          // Find similar golden queries
          const similaritySearch = new SimilaritySearch();
          const fewShotResults = await similaritySearch.findSimilarQueries(
            questionEmbedding,
            embeddedGolden,
            config.topSimilarQueries
          );
          const fewShotExamples = fewShotResults.map(s => s.query);

          // Generate SQL query
          const queryWriter = new QueryWriter(contextUser, config);
          const generatedQuery = await queryWriter.generateQuery(
            question,
            group.entities.map((e: EntityInfo) => formatEntityMetadataForPrompt(e, group.entities)),
            fewShotExamples
          );

          // Test and fix query
          // Access the database provider through Metadata.Provider
          const dataProvider = Metadata.Provider as DatabaseProviderBase;
          const entityMetadata = group.entities.map((e: EntityInfo) => formatEntityMetadataForPrompt(e, group.entities));
          const queryTester = new QueryTester(
            dataProvider,
            entityMetadata,
            question,
            contextUser,
            config
          );
          const testResult = await queryTester.testQuery(
            generatedQuery,
            config.maxFixingIterations
          );

          if (!testResult.success) {
            spinner.warn(
              chalk.yellow(`${groupPrefix} Query failed after ${config.maxFixingIterations} attempts: ${question.userQuestion}`)
            );
            continue;
          }

          // Refine query
          const queryRefiner = new QueryRefiner(queryTester, contextUser, config);
          const refinedResult = await queryRefiner.refineQuery(
            generatedQuery,
            question,
            entityMetadata,
            config.maxRefinementIterations
          );

          // Get pre-built category from map
          const category = categoryMap.get(group.primaryEntity.Name);
          if (!category) {
            throw new Error(`Category not found for entity group: ${group.primaryEntity.Name}`);
          }

          allValidatedQueries.push({
            businessQuestion: question,
            query: refinedResult.query,
            testResult: refinedResult.testResult,
            evaluation: refinedResult.evaluation,
            entityGroup: group,
            category,
          });

          queriesCreatedForGroup++;

          if (config.verbose) {
            spinner.info(`${groupPrefix} ${chalk.green('✓')} ${question.userQuestion}`);
          }
        }

        // Format entity list with primary entity in bold
        const entityDisplay = group.entities
          .map(e => e.Name === group.primaryEntity.Name ? chalk.bold(e.Name) : e.Name)
          .join(', ');

        spinner.succeed(
          `${groupPrefix} ${entityDisplay} complete (${chalk.green(queriesCreatedForGroup + ' queries')})`
        );

      } catch (error: unknown) {
        // Format entity list with primary entity in bold
        const entityDisplay = group.entities
          .map(e => e.Name === group.primaryEntity.Name ? chalk.bold(e.Name) : e.Name)
          .join(', ');

        spinner.warn(
          chalk.yellow(
            `${groupPrefix} Error processing ${entityDisplay}: ${extractErrorMessage(error, 'Query Generation')}`
          )
        );
      }
    }

    // 7. Export results
    spinner.start(`Exporting ${allValidatedQueries.length} queries...`);

    if (config.outputMode === 'metadata' || config.outputMode === 'both') {
      const exporter = new MetadataExporter();
      const exportResult = await exporter.exportQueries(
        allValidatedQueries,
        uniqueCategories,
        config
      );
      spinner.succeed(chalk.green(`Exported to ${exportResult.outputPath}`));
    }

    if (config.outputMode === 'database' || config.outputMode === 'both') {
      const dbWriter = new QueryDatabaseWriter();
      await dbWriter.writeQueriesToDatabase(allValidatedQueries, contextUser);
      spinner.succeed(chalk.green(`Wrote ${allValidatedQueries.length} queries to database`));
    }

    // 8. Summary
    console.log('\n' + chalk.green.bold('✓ Query generation complete!\n'));
    console.log(chalk.bold('Summary:'));
    console.log(`  Entity Groups Processed: ${chalk.cyan(processedGroups.toString())}`);
    console.log(`  Queries Generated: ${chalk.green(allValidatedQueries.length.toString())}`);
    console.log(`  Output Location: ${chalk.dim(config.outputDirectory)}`);

    process.exit(0);

  } catch (error: unknown) {
    spinner.fail(chalk.red('Query generation failed'));
    console.error(chalk.red(extractErrorMessage(error, 'Query Generation')));
    process.exit(1);
  }
}

/**
 * Load golden queries from compile-time imported JSON data
 *
 * Golden queries are example queries used for few-shot learning.
 * They are imported at compile time from data/golden-queries.json.
 *
 * This approach is more efficient than runtime file I/O and provides
 * type safety through TypeScript's resolveJsonModule feature.
 *
 * @param config - QueryGen configuration with verbose flag
 * @returns Array of golden queries
 */
async function loadGoldenQueries(config: { verbose: boolean }): Promise<GoldenQuery[]> {
  try {
    // Cast imported JSON data to GoldenQuery array
    const goldenQueries = goldenQueriesData as GoldenQuery[];

    // Validate that it's an array
    if (!Array.isArray(goldenQueries)) {
      if (config.verbose) {
        LogStatus('[Warning] Golden queries data is not an array');
      }
      return [];
    }

    if (config.verbose) {
      LogStatus(`[Info] Loaded ${goldenQueries.length} golden queries for few-shot learning`);
    }
    return goldenQueries;
  } catch (error: unknown) {
    if (config.verbose) {
      LogStatus(`[Warning] Failed to load golden queries: ${extractErrorMessage(error, 'loadGoldenQueries')}`);
    }
    return [];
  }
}
