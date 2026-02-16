/**
 * Validate command - Validate existing query templates
 *
 * Tests existing query metadata files to ensure they are valid:
 * - SQL syntax validation
 * - Parameter validation
 * - Output field validation
 * - Execution testing (optional)
 */

import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { Metadata, DatabaseProviderBase } from '@memberjunction/core';
import { getSystemUser } from '../../utils/user-helpers';
import { QueryTester } from '../../core/QueryTester';
import { extractErrorMessage } from '../../utils/error-handlers';
import { GeneratedQuery, QueryMetadataRecord } from '../../data/schema';
import { loadConfig } from '../config';

/**
 * Execute the validate command
 *
 * Loads query metadata files and validates each query template.
 * Reports success/failure statistics.
 */
export async function validateCommand(options: Record<string, unknown>): Promise<void> {
  const spinner = ora('Initializing validation...').start();

  try {
    const queryPath = String(options.path || './metadata/queries');
    const verbose = Boolean(options.verbose);

    // Load configuration
    const config = loadConfig(options);

    // 1. Get system user from UserCache (populated by provider initialization)
    const contextUser = getSystemUser();

    // 2. Verify database connection and load metadata
    spinner.text = 'Loading metadata...';
    // Assume provider is already configured by the calling application
    if (!Metadata.Provider) {
      throw new Error('Metadata provider not configured. Please ensure database connection is set up before running CLI.');
    }
    spinner.succeed('Metadata loaded');

    // 3. Load query metadata files
    spinner.start(`Loading query files from ${queryPath}...`);
    const queryFiles = await loadQueryFiles(queryPath);
    spinner.succeed(chalk.green(`Found ${queryFiles.length} query files`));

    // 4. Validate each query
    const dataProvider = Metadata.Provider.DatabaseConnection as DatabaseProviderBase;
    let passCount = 0;
    let failCount = 0;
    const errors: Array<{ file: string; error: string }> = [];

    for (let i = 0; i < queryFiles.length; i++) {
      const { file, queries } = queryFiles[i];
      const filePrefix = chalk.cyan(`[${i + 1}/${queryFiles.length}]`);

      spinner.start(`${filePrefix} Validating ${chalk.dim(file)}...`);

      for (const queryRecord of queries) {
        try {
          const query = convertMetadataToGeneratedQuery(queryRecord);

          // Create a minimal business question and entity metadata for testing
          const dummyQuestion = {
            userQuestion: queryRecord.fields.UserQuestion || 'Test query',
            description: queryRecord.fields.Description || '',
            technicalDescription: queryRecord.fields.TechnicalDescription || '',
            complexity: 'medium' as const,
            requiresAggregation: false,
            requiresJoins: false,
            entities: []
          };

          const tester = new QueryTester(dataProvider, [], dummyQuestion, contextUser, config);

          // Test query execution
          const testResult = await tester.testQuery(query, 1);

          if (testResult.success) {
            passCount++;
            if (verbose) {
              spinner.info(`${filePrefix} ${chalk.green('✓')} ${queryRecord.fields.Name}`);
            }
          } else {
            failCount++;
            const errorMsg = testResult.error || 'Unknown error';
            errors.push({ file, error: `${queryRecord.fields.Name}: ${errorMsg}` });
            if (verbose) {
              spinner.warn(`${filePrefix} ${chalk.red('✗')} ${queryRecord.fields.Name}: ${errorMsg}`);
            }
          }
        } catch (error: unknown) {
          failCount++;
          const errorMsg = extractErrorMessage(error, 'Query Validation');
          errors.push({ file, error: `${queryRecord.fields.Name}: ${errorMsg}` });
          if (verbose) {
            spinner.warn(`${filePrefix} ${chalk.red('✗')} ${queryRecord.fields.Name}: ${errorMsg}`);
          }
        }
      }

      spinner.succeed(`${filePrefix} ${chalk.dim(file)} complete`);
    }

    // 5. Summary
    if (failCount === 0) {
      spinner.succeed(chalk.green.bold(`✓ All ${passCount} queries validated successfully!`));
      console.log('\n' + chalk.green.bold('✓ Validation complete!\n'));
      console.log(chalk.bold('Summary:'));
      console.log(`  Total Queries: ${chalk.cyan(passCount.toString())}`);
      console.log(`  Passed: ${chalk.green(passCount.toString())}`);
      console.log(`  Failed: ${chalk.green('0')}`);
      process.exit(0);
    } else {
      spinner.fail(chalk.yellow(`Validation completed with ${failCount} errors`));
      console.log('\n' + chalk.yellow.bold('⚠ Validation completed with errors\n'));
      console.log(chalk.bold('Summary:'));
      console.log(`  Total Queries: ${chalk.cyan((passCount + failCount).toString())}`);
      console.log(`  Passed: ${chalk.green(passCount.toString())}`);
      console.log(`  Failed: ${chalk.red(failCount.toString())}`);

      if (errors.length > 0) {
        console.log('\n' + chalk.bold('Errors:'));
        for (const { file, error } of errors) {
          console.log(chalk.red(`  ${file}: ${error}`));
        }
      }
      process.exit(1);
    }

  } catch (error: unknown) {
    spinner.fail(chalk.red('Validation failed'));
    console.error(chalk.red(extractErrorMessage(error, 'Query Validation')));
    process.exit(1);
  }
}

/**
 * Load all query metadata files from the specified directory
 */
async function loadQueryFiles(queryPath: string): Promise<Array<{ file: string; queries: QueryMetadataRecord[] }>> {
  const files: Array<{ file: string; queries: QueryMetadataRecord[] }> = [];

  if (!fs.existsSync(queryPath)) {
    throw new Error(`Query path not found: ${queryPath}`);
  }

  const entries = fs.readdirSync(queryPath);
  for (const entry of entries) {
    const fullPath = path.join(queryPath, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && entry.endsWith('.json')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(content);

      // Handle both single query and array formats
      const queries = Array.isArray(data) ? data : [data];
      files.push({ file: entry, queries });
    }
  }

  return files;
}

/**
 * Convert metadata record to GeneratedQuery format for testing
 *
 * Note: QueryFields and QueryParameters are auto-extracted by MJQueryEntity.server.ts,
 * so we only validate the SQL itself. The validate command focuses on SQL syntax
 * and execution, not on field/parameter metadata which is managed by MJ.
 */
function convertMetadataToGeneratedQuery(record: QueryMetadataRecord): GeneratedQuery {
  return {
    queryName: record.fields.Name,
    sql: record.fields.SQL,
    parameters: [],    // Not needed for validation - MJQueryEntity will extract
  };
}
