import { Command, Flags } from '@oclif/core';
import { Flyway } from 'node-flyway';
import ora from 'ora-classic';
import { getValidatedConfig, getFlywayConfig } from '../../config';

export default class Migrate extends Command {
  static description = 'Migrate MemberJunction database to latest version';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
    `<%= config.bin %> <%= command.id %> --schema __BCSaaS --dir ./migrations/v1
`,
    `<%= config.bin %> <%= command.id %> --schema __BCSaaS --tag v1.0.0
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
    tag: Flags.string({ char: 't', description: 'Version tag to use for running remote migrations' }),
    schema: Flags.string({ char: 's', description: 'Target schema (overrides coreSchema from config)' }),
    dir: Flags.string({ description: 'Migration source directory (overrides migrationsLocation from config)' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Migrate);

    const config = getValidatedConfig();

    const flywayConfig = await getFlywayConfig(config, flags.tag, flags.schema, flags.dir);
    const flyway = new Flyway(flywayConfig);

    if (flags.verbose) {
      this.log(`Connecting to ${flywayConfig.url}`);
      this.log(`Database Connection: ${config.dbHost}, ${config.dbDatabase}, User: ${flywayConfig.user}`);
      this.log(`Migrating ${config.coreSchema} schema using migrations from:\n\t- ${flywayConfig.migrationLocations.join('\n\t- ')}\n`);
      this.log(`Flyway config settings: baselineVersion: ${config.baselineVersion}, baselineMigrate: ${config.baselineOnMigrate}\n`);
      const targetSchema = flags.schema || config.coreSchema;
      this.log(`Migrating ${targetSchema} schema using migrations from:\n\t- ${flywayConfig.migrationLocations.join('\n\t- ')}\n`);
    }

    if (flags.tag) {
      this.log(`Migrating to ${flags.tag}`);
    }
    const spinner = ora('Running migrations...');
    spinner.start();

    const result = await flyway.migrate();

    const isParseError = result.error?.errorCode === 'UNABLE_TO_PARSE_RESPONSE';

    if (result.success) {
      spinner.succeed();
      this.log(`Migrations complete in ${result.additionalDetails.executionTime / 1000}s`);
      if (result.flywayResponse?.success && flags.verbose) {
        this.log(`\tUpdated to ${result.flywayResponse?.targetSchemaVersion}`);
      }
    } else if (isParseError) {
      // Parse error - could be SQL error or connection issue
      // Run Flyway CLI directly to get the actual error
      spinner.fail();
      this.logToStderr('\n❌ Migration failed - unable to parse Flyway response.');
      this.logToStderr(`Execution time: ${result.additionalDetails.executionTime / 1000}s\n`);

      this.logToStderr('🔍 Running diagnostic to identify the actual error...');
      const dbInfo = `${config.dbHost}:${config.dbPort}/${config.dbDatabase}`;
      this.logToStderr(`   Database: ${dbInfo}`);
      this.logToStderr(`   User: ${config.codeGenLogin}\n`);

      try {
        const { spawnSync } = require('child_process');
        const path = require('path');
        const os = require('os');

        // Construct Flyway executable path
        const flywayDir = result.additionalDetails.flywayCli.location;
        const flywayExeName = os.platform() === 'win32' ? 'flyway.cmd' : 'flyway';
        const flywayExePath = path.join(flywayDir, flywayExeName);

        // Use spawnSync to avoid shell interpretation of special characters in password
        const jdbcUrl = `jdbc:sqlserver://${config.dbHost}:${config.dbPort};databaseName=${config.dbDatabase};trustServerCertificate=${config.dbTrustServerCertificate}`;

        // Build common args
        const baseArgs = [
          `-url=${jdbcUrl}`,
          `-user=${config.codeGenLogin}`,
          `-password=${config.codeGenPassword}`,
          `-schemas=${config.coreSchema}`
        ];

        // Convert relative migration paths to absolute paths
        const absoluteMigrationPaths = flywayConfig.migrationLocations.map((loc: string) => {
          // Remove 'filesystem:' prefix if present
          const cleanLoc = loc.replace(/^filesystem:/, '');
          // Convert to absolute path if relative
          return path.isAbsolute(cleanLoc) ? loc : `filesystem:${path.resolve(cleanLoc)}`;
        });

        // First try validate to catch checksum mismatches
        const validateArgs = [
          ...baseArgs,
          `-locations=${absoluteMigrationPaths.join(',')}`,
          'validate'
        ];

        const validateResult = spawnSync(flywayExePath, validateArgs, { encoding: 'utf8' });
        const validateOutput = validateResult.stderr || validateResult.stdout || '';

        // Check if validation failed
        if (validateResult.status !== 0 || validateOutput.toLowerCase().includes('validate failed')) {
          this.analyzeFlywayError(validateOutput, config);
        } else {
          // Validation passed, try migrate to see the actual SQL error
          const migrateArgs = [
            ...baseArgs,
            `-baselineVersion=${config.baselineVersion}`,
            `-baselineOnMigrate=${config.baselineOnMigrate}`,
            `-locations=${absoluteMigrationPaths.join(',')}`,
            'migrate'
          ];

          const migrateResult = spawnSync(flywayExePath, migrateArgs, { encoding: 'utf8', shell: true });
          const migrateOutput = migrateResult.stderr || migrateResult.stdout || '';

          // Check if output contains error messages even if exit code is 0
          const hasErrorsInOutput = migrateOutput.toLowerCase().includes('error') ||
                                     migrateOutput.toLowerCase().includes('incorrect syntax') ||
                                     migrateOutput.toLowerCase().includes('must be the only statement');

          if (migrateResult.status === 0 && !hasErrorsInOutput) {
            this.logToStderr('✓ Migration executed successfully (Flyway CLI reports success)');
            this.logToStderr('   The issue was with node-flyway response parsing only\n');
          } else if (migrateResult.status === 0 && hasErrorsInOutput) {
            // Exit code was 0 but output contains errors - SQL script likely has error handling
            this.logToStderr('⚠️  Migration completed but errors were detected in output:\n');
            this.analyzeFlywayError(migrateOutput, config);
          } else {
            // Migration failed with non-zero exit code
            this.analyzeFlywayError(migrateOutput, config);
          }
        }
      } catch (err: any) {
        this.logToStderr(`❌ Error running diagnostic: ${err.message || err}\n`);
      }

      this.error('Migration failed - see diagnostic information above');
    } else {
      spinner.fail();
      if (result.error) {
        this.logToStderr(result.error.message);
        if (flags.verbose) {
          this.logToStderr(`ERROR CODE: ${result.error.errorCode}`);
          this.logToStderr(result.error.stackTrace);
        }
      }
      this.error('Migrations failed');
    }
  }

  private analyzeFlywayError(errorOutput: string, config: any): void {
    const errorLines = errorOutput.split('\n');
    const fullError = errorOutput.toLowerCase();

    // Find error details
    const errorCodeLine = errorLines.find(line => line.includes('Error Code')) || '';
    const messageLine = errorLines.find(line => line.includes('Message')) || '';
    const errorLine = errorLines.find(line =>
      line.includes('ERROR:') && !line.includes('Skipping filesystem location')
    ) || '';

    // Determine error type
    const isValidationError = fullError.includes('validate failed') ||
                              fullError.includes('checksum mismatch') ||
                              fullError.includes('migrations have failed validation');

    const isSqlError = fullError.includes('incorrect syntax') ||
                      fullError.includes('must be the only statement in the batch') ||
                      fullError.includes('invalid object name') ||
                      fullError.includes('permission denied') ||
                      (fullError.includes('error') && fullError.includes('line'));

    const isConnectionError = fullError.includes('login failed') ||
                             fullError.includes('unable to obtain connection') ||
                             fullError.includes('connection') && !fullError.includes('clientconnectionid');

    // Display error header
    if (isValidationError) {
      this.logToStderr('❌ Validation Failed - Checksum Mismatch Detected\n');
    } else if (isSqlError) {
      this.logToStderr('❌ SQL Migration Error Detected\n');
    } else if (isConnectionError) {
      this.logToStderr('❌ Database Connection Failed\n');
    } else {
      this.logToStderr('❌ Migration Failed\n');
    }

    // Display error details
    if (isValidationError) {
      // For validation errors, show the COMPLETE raw Flyway output
      // This includes all checksum details which are critical for debugging
      this.logToStderr('\n📋 Full Flyway Validation Output:');
      this.logToStderr('=' .repeat(100));
      this.logToStderr(errorOutput);
      this.logToStderr('=' .repeat(100));
      this.logToStderr('');
    } else if (errorCodeLine && messageLine) {
      this.logToStderr(`   ${errorCodeLine.trim()}`);
      this.logToStderr(`   ${messageLine.trim()}\n`);
    } else if (errorLine) {
      const cleanError = errorLine.replace(/^ERROR:\s*/, '').trim();
      this.logToStderr(`   Error: ${cleanError}\n`);
    } else if (errorOutput) {
      if (false) { // Disabled - keeping structure for non-validation errors
        // Show lines containing error-related keywords
        const errorKeywords = ['error', 'incorrect', 'syntax', 'invalid', 'failed', 'must be', 'cannot', 'line'];
        const relevantLines = errorOutput.split('\n')
          .filter(line => {
            const lower = line.toLowerCase();
            return line.trim() &&
                   !lower.includes('flyway community') &&
                   !lower.includes('skipping filesystem location') &&
                   errorKeywords.some(keyword => lower.includes(keyword));
          })
          .slice(0, 15);

        if (relevantLines.length > 0) {
          this.logToStderr('   Error details from Flyway output:');
          relevantLines.forEach(line => this.logToStderr(`   ${line.trim()}`));
          this.logToStderr('');
        } else {
          // If no error keywords found, show last 20 lines of output
          const allLines = errorOutput.split('\n').filter(l => l.trim());
          const lastLines = allLines.slice(-20);
          this.logToStderr('   Last 20 lines of Flyway output:');
          lastLines.forEach(line => this.logToStderr(`   ${line.trim()}`));
          this.logToStderr('');
        }
      }
    }

    // Provide guidance
    if (isValidationError) {
      this.logToStderr('💡 Migration checksum validation failed:');
      this.logToStderr('   - A migration file has been modified after it was applied to the database');
      this.logToStderr('   - Check the migration file(s) listed above for unexpected changes');
      this.logToStderr('   - To repair: Use `flyway repair` if you intentionally modified the file');
      this.logToStderr('   - Or revert the file to match the checksum in the database');
    } else if (isSqlError) {
      this.logToStderr('💡 This is a SQL script error:');
      this.logToStderr('   - Check the migration SQL file for syntax errors');
      this.logToStderr('   - Look for missing GO statements before CREATE TRIGGER/PROCEDURE/FUNCTION');
      this.logToStderr('   - Verify all object names and references are correct');
      this.logToStderr('   - Check database permissions for the migration user');
    } else if (fullError.includes('login failed') || fullError.includes('password')) {
      this.logToStderr('💡 This is a credential issue:');
      this.logToStderr('   - Check CODEGEN_DB_USERNAME and CODEGEN_DB_PASSWORD in .env file');
      this.logToStderr('   - Verify the user has permission to access the database');
      this.logToStderr('   - Check for shell environment variables overriding .env settings');
    } else if (fullError.includes('database') && fullError.includes('does not exist')) {
      this.logToStderr('💡 The database does not exist:');
      this.logToStderr(`   - Create the database: CREATE DATABASE ${config.dbDatabase}`);
      this.logToStderr('   - Or verify DB_DATABASE is set correctly in .env file');
    } else if (fullError.includes('connection') || fullError.includes('timeout') || fullError.includes('refused')) {
      this.logToStderr('💡 Cannot connect to SQL Server:');
      this.logToStderr('   - Verify SQL Server is running');
      this.logToStderr(`   - Check host and port: ${config.dbHost}:${config.dbPort}`);
      this.logToStderr('   - Check firewall settings');
    } else {
      this.logToStderr('💡 Check the error details above to diagnose the issue');
    }
  }
}
