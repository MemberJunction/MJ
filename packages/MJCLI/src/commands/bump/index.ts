import { Command, Flags } from '@oclif/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import fg from 'fast-glob';
import ora from 'ora-classic';
import { dirname } from 'node:path';

// https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const tagSchema = z
  .string()
  .optional()
  .transform((tag) => tag?.replace(/^v/, ''))
  .refine((tag) => !tag || semverRegex.test(tag));

/**
 * No-op used to suppress logging output
 * @returns No return value
 */
const suppressLogging = () => null;

export default class Bump extends Command {
  static description = 'Bumps MemberJunction dependency versions';

  static examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: "Bump all @memberjunction/* dependencies in the current directory's package.json to the CLI version",
    },
    {
      command: '<%= config.bin %> <%= command.id %> -rdv',
      description: 'Preview all recursive packages bumps without writing any changes.',
    },
    {
      command: '<%= config.bin %> <%= command.id %> -rqt v2.10.0 | xargs -n1 -I{} npm install --prefix {}',
      description:
        'Recursively bump all @memberjunction/* dependencies in all packages to version v2.10.0 and output only the paths containing the updated package.json files. Pipe the output to xargs to run npm install in each directory and update the package-lock.json files as well.',
    },
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
    recursive: Flags.boolean({ char: 'r', description: 'Bump version in current directory and all subdirectories' }),
    tag: Flags.string({ char: 't', description: 'Version tag to bump target for bump (e.g. v2.10.0), defaults to the CLI version' }),
    quiet: Flags.boolean({ char: 'q', description: 'Only output paths for updated packages' }),
    dry: Flags.boolean({ char: 'd', description: 'Dry run, do not write changes to package.json files' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Bump);
    const verboseLogger = flags.verbose && !flags.quiet ? this.log.bind(this) : suppressLogging;
    const normalLogger = flags.quiet ? suppressLogging : this.log.bind(this);
    const quietLogger = flags.quiet ? this.log.bind(this) : suppressLogging;

    // Get the target version from the tag flag or the CLI version
    const tagArgument = tagSchema.safeParse(flags.tag);
    if (flags.tag && tagArgument.success === false) {
      this.error(`Invalid tag argument: '${flags.tag}'; must be a valid semver version string (e.g. v2.10.0)`);
    }

    const targetVersion = flags.tag && tagArgument.success ? tagArgument.data : this.config.pjson.version;
    normalLogger(`Bumping all @memberjunction/* dependencies to version ${targetVersion}`);

    flags.recursive && normalLogger('Recursively updating all package.json files');

    // get list of package.json files to edit
    const packageJsonFiles = fg.sync(`${flags.recursive ? '**/' : ''}package.json`, { ignore: ['node_modules/**'] });
    if (packageJsonFiles.length === 0) {
      this.error('No package.json files found');
    }

    if (flags.dry) {
      normalLogger('Dry run, no changes will be made to package.json files');
    }

    const skipped = [];
    const mjRegx = /"@memberjunction\/([^"]+)":(\s*)("[^"]+")/g;
    const banner = 'Bumping packages... ';
    const spinner = ora(banner);
    spinner.start();
    normalLogger('');

    try {
      for (let i = 0; i < packageJsonFiles.length; i++) {
        const packageJson = `./${packageJsonFiles[i]}`;
        const packageJsonContents = readFileSync(packageJson).toString();
        if (!mjRegx.test(packageJsonContents)) {
          skipped.push(packageJson);
          continue;
        }

        verboseLogger(`\tBumping ${dirname(packageJson)}`);
        spinner.text = `${banner} ${i + 1 - skipped.length}/${packageJsonFiles.length - skipped.length}`;

        const bumpedPackageJson = packageJsonContents.replaceAll(mjRegx, `"@memberjunction/$1":$2"${targetVersion}"`);
        if (!flags.dry) {
          writeFileSync(packageJson, bumpedPackageJson);
        }

        // In quiet mode, we only output the paths of the updated package.json files so they can be piped to another command
        quietLogger(dirname(packageJson));
      }

      spinner.succeed(`Bumped ${packageJsonFiles.length - skipped.length}/${packageJsonFiles.length} packages`);
    } catch (error) {
      spinner.fail();
      this.error(error instanceof Error ? error : 'Command failed');
    }
  }
}
