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
import * as fs from 'fs';
import * as path from 'path';
import { Metadata, DatabaseProviderBase } from '@memberjunction/core';
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
import { ValidatedQuery, GoldenQuery } from '../../data/schema';

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

    // Apply entity filtering (includeEntities takes precedence over excludeEntities)
    let filteredEntities = md.Entities.filter(
      e => !config.excludeSchemas.includes(e.SchemaName || '')
    );

    if (config.includeEntities.length > 0) {
      // Allowlist: only include specified entities
      filteredEntities = filteredEntities.filter(e => config.includeEntities.includes(e.Name));
      spinner.info(chalk.dim(`Including only ${config.includeEntities.length} specified entities`));
    } else if (config.excludeEntities.length > 0) {
      // Denylist: exclude specified entities
      filteredEntities = filteredEntities.filter(e => !config.excludeEntities.includes(e.Name));
      spinner.info(chalk.dim(`Excluded ${config.excludeEntities.length} entities`));
    }

    spinner.text = 'Analyzing entity relationships...';
    const grouper = new EntityGrouper(config);
    const entityGroups = (await grouper.generateEntityGroups(filteredEntities, contextUser)).slice(0, 1); //TODO: remove limit
    spinner.succeed(chalk.green(`Found ${entityGroups.length} entity groups`));


    // 5. Initialize vector similarity search
    spinner.start('Embedding golden queries...');
    const embeddingService = new EmbeddingService(config.embeddingModel);
    const goldenQueries = await loadGoldenQueries();
    const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);
    spinner.succeed(chalk.green(`Embedded ${goldenQueries.length} golden queries`));

    // 6. Generate queries for each entity group
    const totalGroups = entityGroups.length;
    let processedGroups = 0;
    const allValidatedQueries: ValidatedQuery[] = [];

    for (const group of entityGroups) {
      processedGroups++;
      const groupPrefix = chalk.cyan(`[${processedGroups}/${totalGroups}]`);
      spinner.start(`${groupPrefix} Processing ${chalk.bold(group.primaryEntity.Name)}...`);

      try {
        // 6a. Generate business questions
        const questionGen = new QuestionGenerator(contextUser, config);
        const questions = await questionGen.generateQuestions(group);

        if (config.verbose) {
          spinner.info(`${groupPrefix} Generated ${questions.length} questions for ${group.primaryEntity.Name}`);
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

          allValidatedQueries.push({
            businessQuestion: question,
            query: refinedResult.query,
            testResult: refinedResult.testResult,
            evaluation: refinedResult.evaluation,
            entityGroup: group,
          });

          if (config.verbose) {
            spinner.info(`${groupPrefix} ${chalk.green('✓')} ${question.userQuestion}`);
          }
        }

        spinner.succeed(
          `${groupPrefix} ${chalk.bold(group.primaryEntity.Name)} complete (${chalk.green(questions.length + ' queries')})`
        );

      } catch (error: unknown) {
        spinner.warn(
          chalk.yellow(
            `${groupPrefix} Error processing ${group.primaryEntity.Name}: ${extractErrorMessage(error, 'Query Generation')}`
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
        config.outputDirectory
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
 * Load golden queries from JSON file
 *
 * Golden queries are example queries used for few-shot learning.
 * They are stored in the data/golden-queries.json file.
 *
 * @returns Array of golden queries, or empty array if file not found/invalid
 */
async function loadGoldenQueries(): Promise<GoldenQuery[]> {
  try {
    // Resolve path to golden-queries.json in the data directory
    // __dirname points to dist/cli/commands, so we go up to dist, then to data
    const goldenQueriesPath = path.join(__dirname, '../../data/golden-queries.json');

    // Check if file exists
    if (!fs.existsSync(goldenQueriesPath)) {
      console.warn(`[Warning] Golden queries file not found at: ${goldenQueriesPath}`);
      return [];
    }

    // Read and parse JSON file
    const fileContent = fs.readFileSync(goldenQueriesPath, 'utf-8');
    const goldenQueries = JSON.parse(fileContent) as GoldenQuery[];

    // Validate that it's an array
    if (!Array.isArray(goldenQueries)) {
      console.warn('[Warning] Golden queries file does not contain an array');
      return [];
    }

    console.log(`[Info] Loaded ${goldenQueries.length} golden queries for few-shot learning`);
    return goldenQueries;
  } catch (error: unknown) {
    console.warn(`[Warning] Failed to load golden queries: ${extractErrorMessage(error, 'loadGoldenQueries')}`);
    return [];
  }
}
