/**
 * Export command - Export queries from database to metadata files
 *
 * Reads existing queries from the database and exports them to metadata format:
 * - Loads all queries from Queries table
 * - Includes related Query Fields and Query Params
 * - Exports to JSON files in MJ metadata format
 */

import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { Metadata, UserInfo, RunView } from '@memberjunction/core';
import { QueryEntity } from '@memberjunction/core-entities';
import { extractErrorMessage } from '../../utils/error-handlers';
import { QueryMetadataRecord } from '../../data/schema';

/**
 * Execute the export command
 *
 * Loads queries from database and exports them to metadata files.
 */
export async function exportCommand(options: Record<string, unknown>): Promise<void> {
  const spinner = ora('Initializing export...').start();

  try {
    const outputPath = String(options.output || './metadata/queries');
    const verbose = Boolean(options.verbose);

    // 1. Create context user
    const contextUser = createContextUser();

    // 2. Verify database connection and load metadata
    spinner.text = 'Loading metadata...';
    // Assume provider is already configured by the calling application
    if (!Metadata.Provider) {
      throw new Error('Metadata provider not configured. Please ensure database connection is set up before running CLI.');
    }
    spinner.succeed('Metadata loaded');

    // 3. Load queries from database
    spinner.start('Loading queries from database...');
    const queries = await loadQueriesFromDatabase(contextUser);
    spinner.succeed(chalk.green(`Found ${queries.length} queries`));

    // 4. Create output directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // 5. Export each query to metadata format
    let exportCount = 0;
    const errors: Array<{ query: string; error: string }> = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const queryPrefix = chalk.cyan(`[${i + 1}/${queries.length}]`);

      spinner.start(`${queryPrefix} Exporting ${chalk.bold(query.Name)}...`);

      try {
        const metadataRecord = await convertQueryToMetadata(query, contextUser);
        const filename = sanitizeFilename(query.Name) + '.json';
        const fullPath = path.join(outputPath, filename);

        fs.writeFileSync(fullPath, JSON.stringify(metadataRecord, null, 2), 'utf-8');
        exportCount++;

        if (verbose) {
          spinner.info(`${queryPrefix} ${chalk.green('✓')} Exported ${query.Name}`);
        }
      } catch (error: unknown) {
        const errorMsg = extractErrorMessage(error, 'Query Export');
        errors.push({ query: query.Name, error: errorMsg });
        if (verbose) {
          spinner.warn(`${queryPrefix} ${chalk.red('✗')} ${query.Name}: ${errorMsg}`);
        }
      }
    }

    // 6. Summary
    if (errors.length === 0) {
      spinner.succeed(chalk.green.bold(`✓ All ${exportCount} queries exported successfully!`));
      console.log('\n' + chalk.green.bold('✓ Export complete!\n'));
      console.log(chalk.bold('Summary:'));
      console.log(`  Total Queries: ${chalk.cyan(exportCount.toString())}`);
      console.log(`  Exported: ${chalk.green(exportCount.toString())}`);
      console.log(`  Output Location: ${chalk.dim(outputPath)}`);
      process.exit(0);
    } else {
      spinner.fail(chalk.yellow(`Export completed with ${errors.length} errors`));
      console.log('\n' + chalk.yellow.bold('⚠ Export completed with errors\n'));
      console.log(chalk.bold('Summary:'));
      console.log(`  Total Queries: ${chalk.cyan(queries.length.toString())}`);
      console.log(`  Exported: ${chalk.green(exportCount.toString())}`);
      console.log(`  Failed: ${chalk.red(errors.length.toString())}`);
      console.log(`  Output Location: ${chalk.dim(outputPath)}`);

      if (errors.length > 0) {
        console.log('\n' + chalk.bold('Errors:'));
        for (const { query, error } of errors) {
          console.log(chalk.red(`  ${query}: ${error}`));
        }
      }
      process.exit(1);
    }

  } catch (error: unknown) {
    spinner.fail(chalk.red('Export failed'));
    console.error(chalk.red(extractErrorMessage(error, 'Query Export')));
    process.exit(1);
  }
}

/**
 * Create a context user for CLI operations
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
 * Load all queries from the database
 */
async function loadQueriesFromDatabase(contextUser: UserInfo): Promise<QueryEntity[]> {
  const rv = new RunView();
  const result = await rv.RunView<QueryEntity>(
    {
      EntityName: 'Queries',
      ExtraFilter: '',
      OrderBy: 'Name',
      ResultType: 'entity_object',
    },
    contextUser
  );

  if (!result.Success) {
    throw new Error(`Failed to load queries: ${result.ErrorMessage}`);
  }

  return result.Results || [];
}

/**
 * Convert QueryEntity to metadata record format
 */
async function convertQueryToMetadata(
  query: QueryEntity,
  contextUser: UserInfo
): Promise<QueryMetadataRecord> {
  const rv = new RunView();

  // Load related Query Fields
  const fieldsResult = await rv.RunView(
    {
      EntityName: 'Query Fields',
      ExtraFilter: `QueryID='${query.ID}'`,
      OrderBy: 'Sequence',
    },
    contextUser
  );

  // Load related Query Params
  const paramsResult = await rv.RunView(
    {
      EntityName: 'Query Params',
      ExtraFilter: `QueryID='${query.ID}'`,
      OrderBy: 'Name',
    },
    contextUser
  );

  const fields = fieldsResult.Success ? fieldsResult.Results || [] : [];
  const params = paramsResult.Success ? paramsResult.Results || [] : [];

  return {
    fields: {
      Name: query.Name,
      CategoryID: query.CategoryID || 'unknown',
      UserQuestion: query.UserQuestion || '',
      Description: query.Description || '',
      TechnicalDescription: query.TechnicalDescription || '',
      SQL: query.SQL || '',
      OriginalSQL: query.OriginalSQL || query.SQL || '',
      UsesTemplate: false,
      Status: query.Status || 'Active',
    },
    relatedEntities: {
      'Query Fields': fields.map((field) => ({ fields: field })),
      'Query Params': params.map((param) => ({ fields: param })),
    },
  };
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
}
