import { Command, Flags } from '@oclif/core';
import { Skyway } from '@memberjunction/skyway-core';
import type { MigrateResult } from '@memberjunction/skyway-core';
import ora from 'ora-classic';
import { getValidatedConfig, getSkywayConfig } from '../../config';

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
    const targetSchema = flags.schema || config.coreSchema;

    const skywayConfig = await getSkywayConfig(config, flags.tag, flags.schema, flags.dir);
    const skyway = new Skyway(skywayConfig);

    if (flags.verbose) {
      this.log(`Database Connection: ${config.dbHost}:${config.dbPort}, ${config.dbDatabase}, User: ${config.codeGenLogin}`);
      this.log(`Migrating ${targetSchema} schema using migrations from:\n\t- ${skywayConfig.Migrations.Locations.join('\n\t- ')}\n`);
      this.log(`Skyway config: baselineVersion: ${config.baselineVersion ?? '(auto-detect)'}, baselineOnMigrate: ${config.baselineOnMigrate}\n`);

      skyway.OnProgress({
        OnLog: (msg) => this.log(`  ${msg}`),
        OnMigrationStart: (m) => this.log(`  Applying: ${m.Version ?? '(repeatable)'} — ${m.Description}`),
        OnMigrationEnd: (r) => this.log(`  ${r.Success ? 'OK' : 'FAIL'}: ${r.Migration.Description} (${r.ExecutionTimeMS}ms)`),
      });
    }

    if (flags.tag) {
      this.log(`Migrating to ${flags.tag}`);
    }

    const spinner = ora('Running migrations...');
    spinner.start();

    let result: MigrateResult;
    try {
      result = await skyway.Migrate();
    } catch (err: unknown) {
      spinner.fail();
      const message = err instanceof Error ? err.message : String(err);
      this.error(`Migration error: ${message}`);
    } finally {
      await skyway.Close();
    }

    if (result.Success) {
      spinner.succeed();
      this.log(`Migrations complete in ${(result.TotalExecutionTimeMS / 1000).toFixed(1)}s — ${result.MigrationsApplied} applied`);
      if (result.CurrentVersion && flags.verbose) {
        this.log(`\tCurrent version: ${result.CurrentVersion}`);
      }
      if (flags.verbose && result.Details.length > 0) {
        for (const detail of result.Details) {
          this.log(`\t${detail.Migration.Version ?? '(R)'} ${detail.Migration.Description} — ${detail.ExecutionTimeMS}ms`);
        }
      }
    } else {
      spinner.fail();
      this.logToStderr(`\nMigration failed: ${result.ErrorMessage ?? 'unknown error'}\n`);

      // Show details for failed migrations
      const failed = result.Details.filter(d => !d.Success);
      for (const detail of failed) {
        this.logToStderr(`  Failed: ${detail.Migration.Version ?? '(R)'} ${detail.Migration.Description}`);
        if (detail.Error) {
          this.logToStderr(`    ${detail.Error.message}`);
        }
      }

      this.error('Migrations failed');
    }
  }
}
