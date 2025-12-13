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
import { Metadata, UserInfo, DatabaseProviderBase } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { loadConfig } from '../config';
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

    // 2. Create context user (system user for CLI operations)
    const contextUser = createContextUser();

    // 3. Verify database connection and load metadata
    spinner.text = 'Loading metadata...';
    // Assume provider is already configured by the calling application
    if (!Metadata.Provider) {
      throw new Error('Metadata provider not configured. Please ensure database connection is set up before running CLI.');
    }
    await AIEngine.Instance.Config(false, contextUser);
    spinner.succeed('Metadata loaded');

    // 4. Build entity groups
    spinner.start('Analyzing entity relationships...');
    const md = new Metadata();
    const allEntities = md.Entities.filter(
      e => !config.excludeSchemas.includes(e.SchemaName || '')
    );
    const grouper = new EntityGrouper();
    const entityGroups = await grouper.generateEntityGroups(
      allEntities,
      config.minEntitiesPerGroup,
      config.maxEntitiesPerGroup
    );
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
        const questionGen = new QuestionGenerator(contextUser);
        const questions = await questionGen.generateQuestions(group);

        if (config.verbose) {
          spinner.info(`${groupPrefix} Generated ${questions.length} questions for ${group.primaryEntity.Name}`);
        }

        // 6b. For each question, generate and validate query
        for (const question of questions) {
          spinner.text = `${groupPrefix} Generating query: ${chalk.italic(question.userQuestion)}`;

          // Embed question for similarity search
          const questionEmbedding = await embeddingService.embedQuery({
            name: '',
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
          const queryWriter = new QueryWriter(contextUser);
          const generatedQuery = await queryWriter.generateQuery(
            question,
            group.entities.map(e => formatEntityMetadataForPrompt(e, group.entities)),
            fewShotExamples
          );

          // Test and fix query
          const dataProvider = Metadata.Provider.DatabaseConnection as DatabaseProviderBase;
          const entityMetadata = group.entities.map(e => formatEntityMetadataForPrompt(e, group.entities));
          const queryTester = new QueryTester(
            dataProvider,
            entityMetadata,
            question,
            contextUser
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
          const queryRefiner = new QueryRefiner(queryTester, contextUser);
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
 * Create a context user for CLI operations
 * Uses system user credentials
 */
function createContextUser(): UserInfo {
  const user = new UserInfo();
  user.Email = 'system@memberjunction.com';
  user.Name = 'System';
  user.FirstName = 'System';
  user.LastName = 'User';
  return user;
}

/**
 * Load golden queries from database or metadata files
 * Returns empty array if no golden queries available
 *
 * TODO: Implement actual golden query loading from:
 * - Database: Query metadata with golden=true flag
 * - Files: JSON files in golden-queries directory
 */
async function loadGoldenQueries(): Promise<GoldenQuery[]> {
  // Placeholder - return empty array for now
  // In production, this would load from database or metadata files
  return [];
}
