import { Command, Flags } from '@oclif/core';
import { HasConfig, LoadConfig, STANDARD_CHECKS, IsNewerThan } from '@memberjunction/standards';

/** `mj standards list` — what standards exist, and what this repository does with each. */
export default class StandardsList extends Command {
  static description = 'List every MemberJunction standard and this repository’s stance on it';

  static flags = {
    cwd: Flags.string({ description: 'Repository root. Defaults to the current directory.' }),
    verbose: Flags.boolean({ char: 'v', description: 'Include the full description of each standard.', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(StandardsList);
    const repoRoot = flags.cwd ?? process.cwd();
    const config = HasConfig(repoRoot) ? LoadConfig(repoRoot) : null;

    if (config) this.log(`This repo adopted standards at ${config.StandardsVersion}.\n`);
    else this.log('This repo has no .mj-standards.json. Run `mj standards adopt` to create one.\n');

    for (const check of STANDARD_CHECKS) {
      const entry = config?.Checks[check.Id];
      const stance = !config
        ? 'not adopted'
        : entry
          ? entry.Severity
          : IsNewerThan(check.Since, config.StandardsVersion)
            ? `available (added in ${check.Since}, after this repo adopted)`
            : 'available, not adopted';
      this.log(`${check.Id}  [${stance}]  since ${check.Since}`);
      this.log(`    ${check.Title}`);
      if (flags.verbose) {
        this.log(`    ${check.Description}`);
        this.log(`    docs: ${check.DocsUrl}`);
      }
      this.log('');
    }
  }
}
