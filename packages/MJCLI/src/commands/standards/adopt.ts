import { Command, Flags } from '@oclif/core';
import { Adopt, HasConfig, LoadConfig, STANDARD_CHECKS } from '@memberjunction/standards';

/**
 * `mj standards adopt` — get a repository enforcing MJ standards in one command.
 *
 * The gap between publishing standards and having them followed is almost entirely setup friction:
 * a config file, a CI job, an npm script, and the per-package declarations. This writes all four.
 *
 * **Idempotent and additive.** Re-running never lowers a severity a repo has raised, never
 * overwrites a CI file a team has edited, and never bumps `StandardsVersion` unless `--upgrade`
 * says so. Upgrading `@memberjunction/standards` therefore cannot change what a repo enforces.
 */
export default class StandardsAdopt extends Command {
  static description = 'Adopt MemberJunction standards in this repository (config + CI + npm script + layer declarations)';

  static examples = [
    { command: '<%= config.bin %> <%= command.id %>', description: 'Adopt every standard available at this CLI version' },
    {
      command: '<%= config.bin %> <%= command.id %> --ci github --declare-compliant',
      description: 'Full setup: config, GitHub workflow, npm script, and declare already-compliant packages',
    },
    { command: '<%= config.bin %> <%= command.id %> --dry-run', description: 'Show what would change' },
    {
      command: '<%= config.bin %> <%= command.id %> --upgrade',
      description: 'Review standards added since this repo adopted, and bump its recorded version',
    },
  ];

  static flags = {
    cwd: Flags.string({ description: 'Repository root. Defaults to the current directory.' }),
    check: Flags.string({ description: 'Only adopt these check ids.', multiple: true }),
    ci: Flags.string({
      description: 'Write a CI workflow for this provider.',
      options: ['github', 'none'],
      default: 'none',
    }),
    'npm-script': Flags.boolean({ description: 'Add an "mj:standards" script to the root package.json.', default: true, allowNo: true }),
    'declare-compliant': Flags.boolean({
      description:
        'Declare mjUILayer on packages that already comply. Without this a fresh adoption enforces nothing — every package is undeclared, so every package is skipped.',
      default: false,
    }),
    upgrade: Flags.boolean({
      description: 'Enable standards newer than this repo’s recorded StandardsVersion, and bump it.',
      default: false,
    }),
    'dry-run': Flags.boolean({ description: 'Report what would change; write nothing.', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(StandardsAdopt);
    const repoRoot = flags.cwd ?? process.cwd();
    const version = this.config.version;

    const before = HasConfig(repoRoot) ? LoadConfig(repoRoot) : null;
    if (before && !flags.upgrade) {
      const newer = STANDARD_CHECKS.filter((c) => !(c.Id in before.Checks));
      if (newer.length > 0) {
        this.log(
          `This repo adopted standards at ${before.StandardsVersion}. ${newer.length} standard(s) are not adopted.\n` +
            `Re-run with --upgrade to review and enable them.\n`,
        );
      }
    }

    const result = Adopt({
      RepoRoot: repoRoot,
      Version: version,
      OnlyChecks: flags.check,
      Upgrade: flags.upgrade,
      DryRun: flags['dry-run'],
      Ci: flags.ci === 'github' ? 'github' : 'none',
      AddNpmScript: flags['npm-script'],
      DeclareCompliant: flags['declare-compliant'],
    });

    const icon = { created: '+', updated: '~', skipped: '·' } as const;
    for (const action of result.Actions) {
      this.log(`${icon[action.Kind]} ${action.What}${action.Detail ? ` — ${action.Detail}` : ''}`);
    }

    this.log('');
    if (flags['dry-run']) {
      this.log('Dry run — nothing was written.');
      return;
    }
    this.log(`Adopted at StandardsVersion ${result.Config.StandardsVersion}. Run \`mj standards check\` to see where you stand.`);
    if (!flags['declare-compliant']) {
      this.log('Tip: --declare-compliant declares the packages that already pass, so the first run means something.');
    }
  }
}
