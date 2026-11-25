import { Args, Command, Flags } from '@oclif/core';
import { InstallApp, NormalizeAppSource } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { BuildOrchestratorContext } from '../../utils/open-app-context.js';
import { ParseDependenciesFromHead } from '../../utils/dependencies-from-head.js';

/**
 * CLI command: `mj app install <source>`.
 *
 * Installs an Open App from a GitHub repository URL or a folder in this repository, executing
 * the full install flow (manifest validation, dependency resolution, schema creation,
 * migration execution, npm package management, and config updates).
 */
export default class AppInstall extends Command {
  // The second paragraph deliberately mirrors CONFIGURE_CREDENTIAL_REMEDY in
  // github-client.ts (module-private there, phrased as a clause rather than a sentence —
  // not shared as an import). Kept in sync by hand; update both when either wording changes.
  //
  // No hard newlines WITHIN a paragraph below: oclif re-wraps this to the reader's terminal
  // width, and a hard newline mid-paragraph survives that re-wrap as a stray short line.
  static description = `Install an MJ Open App from a GitHub repository or a folder in this repository.

A folder path (for example ./openapps/analytics) installs the app from that folder. The folder must be inside the repository root, its version is the version in its mj-app.json, and its npm packages must be projects in this pnpm or yarn workspace (they are added as workspace:*).

Private repositories need a GitHub credential. GitHub returns 404 (not 403) for a repo it will not show you, so without one an install fails as though the app or its version did not exist. Set GITHUB_TOKEN in the environment, or add the repo to openApps.github.tokens (or set openApps.github.token) in mj.config.cjs.`;

  static examples = [
    '<%= config.bin %> app install https://github.com/acme/mj-crm',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --version 1.2.0',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --verbose',
    '<%= config.bin %> app install https://github.com/MemberJunction/Integrations/CRM/HubSpot',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --non-interactive',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --dependencies-from-head mj-common',
    'GITHUB_TOKEN=$(gh auth token) <%= config.bin %> app install https://github.com/acme/private-app',
    '<%= config.bin %> app install ./openapps/analytics',
  ];

  static args = {
    source: Args.string({
      description:
        'GitHub repository URL of the Open App, or a folder in this repository that has an mj-app.json (e.g. ./openapps/analytics). For a multi-app repo, append the in-repo path to the app (e.g. https://github.com/MemberJunction/Integrations/CRM/HubSpot).',
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
    'dependencies-from-head': Flags.string({
      description:
        "For development: read the dependencies of this installed app from its repository's default branch, instead of those recorded for its installed version. Repeat for more apps, or give 'all'",
      helpValue: '<app|all>',
      multiple: true,
      multipleNonGreedy: true,
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
      const context = await BuildOrchestratorContext(this, flags.verbose, !flags['non-interactive']);
      // A folder path becomes a `file:` locator relative to the repository root; a URL is unchanged.
      const source = NormalizeAppSource(args.source, context.RepoRoot);
      if ('ErrorMessage' in source) {
        spinner.fail(chalk.red(`Install failed: ${source.ErrorMessage}`));
        failed = true;
      } else {
        const result = await InstallApp(
          {
            Source: source.Source,
            Version: flags.version,
            Verbose: flags.verbose,
            AllowDoubleUnderscoreSchema: flags['dangerously-ignore-dbl-underscore-schema-rule'],
            DependenciesFromHead: ParseDependenciesFromHead(flags['dependencies-from-head']),
          },
          context
        );

        if (result.Success) {
          spinner.succeed(chalk.green(`Installed ${result.AppName} v${result.Version}`));
          if (result.Summary) {
            this.log(`\n${result.Summary}`);
          }
        } else {
          spinner.fail(chalk.red(`Install failed: ${result.ErrorMessage}`));
          failed = true;
        }
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
}
