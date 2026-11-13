import { Args, Command, Flags, Interfaces } from '@oclif/core';
import { InstallApp, InstallAppPackages, type AppOperationResult } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { BuildOrchestratorContext, BuildPackageStepContext } from '../../utils/open-app-context.js';

/**
 * CLI command: `mj app install <source>`.
 *
 * Installs an Open App from a GitHub repository URL, executing the full
 * install flow (manifest validation, dependency resolution, schema creation,
 * migration execution, npm package management, and config updates).
 * `--packages-only` and `--database-only` run the two halves of that flow separately.
 */
export default class AppInstall extends Command {
  // The last paragraph deliberately mirrors CONFIGURE_CREDENTIAL_REMEDY in
  // github-client.ts (module-private there, phrased as a clause rather than a sentence —
  // not shared as an import). Kept in sync by hand; update both when either wording changes.
  //
  // No hard newlines WITHIN a paragraph below: oclif re-wraps this to the reader's terminal
  // width, and a hard newline mid-paragraph survives that re-wrap as a stray short line.
  static description = `Install an MJ Open App from a GitHub repository.

To install in two steps (for example with Docker), run --packages-only first: it changes only package.json, the lockfile, mj.config.cjs and angular.json and needs no database, so it can run in a Docker build. Then run --database-only where the database is available (for example at container start): it creates the schema, runs the migrations, records the app and runs its post-install steps, and changes no files.

Private repositories need a GitHub credential. GitHub returns 404 (not 403) for a repo it will not show you, so without one an install fails as though the app or its version did not exist. Set GITHUB_TOKEN in the environment, or add the repo to openApps.github.tokens (or set openApps.github.token) in mj.config.cjs.`;

  static examples = [
    '<%= config.bin %> app install https://github.com/acme/mj-crm',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --version 1.2.0',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --verbose',
    '<%= config.bin %> app install https://github.com/MemberJunction/Integrations/CRM/HubSpot',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --non-interactive',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --version 1.2.0 --packages-only',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --version 1.2.0 --database-only --non-interactive',
    'GITHUB_TOKEN=$(gh auth token) <%= config.bin %> app install https://github.com/acme/private-app',
  ];

  static args = {
    source: Args.string({
      description:
        'GitHub repository URL of the Open App. For a multi-app repo, append the in-repo path to the app (e.g. https://github.com/MemberJunction/Integrations/CRM/HubSpot).',
      required: true,
    }),
  };

  static flags = {
    version: Flags.string({ description: 'Specific version to install (default: latest)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
    'non-interactive': Flags.boolean({
      description: 'Skip interactive setup prompts; post-install hooks use environment variables / defaults (for CI/headless installs)',
      default: false,
    }),
    'packages-only': Flags.boolean({
      description:
        'Run only the package step (package.json, lockfile, mj.config.cjs, angular.json) for the app and its dependencies. Opens no database connection; use in a Docker build.',
      default: false,
      exclusive: ['database-only'],
    }),
    'database-only': Flags.boolean({
      description:
        'Run only the database step (schema, migrations, app records, post-install steps) for the app and its dependencies. Changes no files; use at container start after a --packages-only build.',
      default: false,
      exclusive: ['packages-only'],
    }),
    'dangerously-ignore-dbl-underscore-schema-rule': Flags.boolean({
      hidden: true,
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppInstall);
    const spinner = ora();
    let failed = false;

    try {
      const result = await this.runInstall(args.source, flags);

      if (result.Success) {
        spinner.succeed(chalk.green(`Installed ${DescribeInstallStep(flags)}${result.AppName} v${result.Version}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Install failed: ${result.ErrorMessage}`));
        failed = true;
      }
    } catch (error) {
      spinner.fail('Install failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
    // Outside the try on purpose: oclif's exit() works by throwing, and the catch above would
    // swallow it — printing a second failure line and exiting 2 with "EEXIT: 1".
    if (failed) {
      this.exit(1);
    }
  }

  /** Runs the package step with a context that has no database, or InstallApp for the other modes. */
  private async runInstall(source: string, flags: AppInstallFlags): Promise<AppOperationResult> {
    const interactive = !flags['non-interactive'];
    const options = {
      Source: source,
      Version: flags.version,
      Verbose: flags.verbose,
      AllowDoubleUnderscoreSchema: flags['dangerously-ignore-dbl-underscore-schema-rule'],
    };
    if (flags['packages-only']) {
      return InstallAppPackages(options, BuildPackageStepContext(this, flags.verbose, interactive));
    }
    const context = await BuildOrchestratorContext(this, flags.verbose, interactive);
    return InstallApp({ ...options, DatabaseOnly: flags['database-only'] }, context);
  }
}

/** The parsed flags of {@link AppInstall}. */
type AppInstallFlags = Interfaces.InferredFlags<typeof AppInstall.flags>;

/** The prefix of the success message that names which step ran. */
function DescribeInstallStep(flags: AppInstallFlags): string {
  if (flags['packages-only']) {
    return 'the packages of ';
  }
  return flags['database-only'] ? 'the database step of ' : '';
}
