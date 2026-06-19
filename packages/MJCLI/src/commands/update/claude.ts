import { Command, Flags } from '@oclif/core';
import { installPack } from '../../lib/claude-pack/PackInstaller.js';
import { formatJson, formatPretty } from '../../lib/claude-pack/PackOutputFormatter.js';
import { mapFlagsToInstallOptions } from '../install/claude.js';

/**
 * `mj update:claude` — refresh the Claude Code pack in the current directory.
 *
 * Same flag set as `install:claude` plus:
 *   --check               compare versions without writing
 *   --refresh-commands    resync .claude/commands/* from the pack
 *   --refresh-skills      resync .claude/skills/**
 *   --allow-major         allow remote pack's major to differ from local MJ's
 *
 * See plans/claude-install-pack.md §6.5, §7.4, §7.5.
 */
export default class UpdateClaude extends Command {
    static description = 'Update the Claude Code pack in the current directory.';

    static examples = [
        '<%= config.bin %> update:claude',
        '<%= config.bin %> update:claude --check',
        '<%= config.bin %> update:claude --refresh-commands',
        '<%= config.bin %> update:claude --allow-major',
        '<%= config.bin %> update:claude --json',
    ];

    static flags = {
        dir: Flags.string({ description: 'Target directory', default: '.' }),
        major: Flags.string({
            description: 'Force a specific MJ major (default: detected from package.json)',
        }),
        ref: Flags.string({
            description: 'Git ref to fetch from (branch or tag). Default: main.',
        }),
        from: Flags.string({
            description: 'Use a local pack source instead of fetching from GitHub',
        }),
        offline: Flags.boolean({
            description: 'Forbid network; requires --from <path>',
        }),
        'dry-run': Flags.boolean({
            description: 'Print what would be written; change nothing',
        }),
        yes: Flags.boolean({
            char: 'y',
            description: "Don't prompt (reserved for future interactive paths; currently no-op)",
        }),
        force: Flags.boolean({
            description: 'Overwrite user-customized commands/skills (saves .bak files)',
        }),
        'skip-commands': Flags.boolean({ description: 'Skip seeding .claude/commands/' }),
        'skip-skills': Flags.boolean({ description: 'Skip seeding .claude/skills/' }),
        'skip-settings': Flags.boolean({ description: 'Skip merging .claude/settings.json' }),
        check: Flags.boolean({
            description: 'Compare local pack version to remote without writing anything',
        }),
        'refresh-commands': Flags.boolean({
            description: 'Force-resync .claude/commands/* from the pack (saves .bak files)',
        }),
        'refresh-skills': Flags.boolean({
            description: 'Force-resync .claude/skills/** from the pack (saves .bak files)',
        }),
        'allow-major': Flags.boolean({
            description: "Allow the remote pack's major to differ from local MJ's major",
        }),
        json: Flags.boolean({ description: 'Output as JSON (matches plan §7.5 schema)' }),
        verbose: Flags.boolean({ char: 'v', description: 'Show progress messages' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(UpdateClaude);
        const baseOpts = mapFlagsToInstallOptions(flags, (msg) => {
            if (flags.verbose && !flags.json) this.log(msg);
        });
        const result = await installPack({
            ...baseOpts,
            CheckOnly: flags.check === true,
            RefreshCommands: flags['refresh-commands'] === true,
            RefreshSkills: flags['refresh-skills'] === true,
            AllowMajor: flags['allow-major'] === true,
        });

        if (flags.json) {
            this.log(formatJson(result));
        } else {
            this.log(formatPretty(result));
        }

        if (!result.ok) this.exit(1);
    }
}
