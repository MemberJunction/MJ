import { Command, Flags } from '@oclif/core';
import { installPack, type InstallPackOptions } from '../../lib/claude-pack/PackInstaller.js';
import { formatJson, formatPretty } from '../../lib/claude-pack/PackOutputFormatter.js';

/**
 * `mj install:claude` — install or refresh the Claude Code pack in the
 * current directory.
 *
 * Pure flag-parsing + output-rendering wrapper around `installPack()`.
 * See plans/claude-install-pack.md §7.4 (flags) and §7.5 (--json shape).
 */
export default class InstallClaude extends Command {
    static description = 'Install or refresh the Claude Code pack in the current directory.';

    static examples = [
        '<%= config.bin %> install:claude',
        '<%= config.bin %> install:claude --dry-run',
        '<%= config.bin %> install:claude --from ./local-pack',
        '<%= config.bin %> install:claude --json',
    ];

    static flags = {
        dir: Flags.string({
            description: 'Target directory for the install',
            default: '.',
        }),
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
        'skip-commands': Flags.boolean({
            description: 'Skip seeding .claude/commands/',
        }),
        'skip-skills': Flags.boolean({
            description: 'Skip seeding .claude/skills/',
        }),
        'skip-settings': Flags.boolean({
            description: 'Skip merging .claude/settings.json',
        }),
        json: Flags.boolean({
            description: 'Output as JSON (matches plan §7.5 schema)',
        }),
        verbose: Flags.boolean({
            char: 'v',
            description: 'Show progress messages from the fetcher and merger',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(InstallClaude);
        const opts = mapFlagsToInstallOptions(flags, (msg) => {
            if (flags.verbose && !flags.json) this.log(msg);
        });
        const result = await installPack(opts);

        if (flags.json) {
            this.log(formatJson(result));
        } else {
            this.log(formatPretty(result));
        }

        if (!result.ok) this.exit(1);
    }
}

/**
 * Translate oclif flag bag → `installPack` options. Extracted so update:claude
 * can reuse the shared install-style options (it adds its own on top).
 */
export function mapFlagsToInstallOptions(
    flags: Record<string, unknown>,
    onProgress?: (msg: string) => void
): InstallPackOptions {
    return {
        TargetDir: asString(flags.dir, '.'),
        Major: asOptString(flags.major),
        Ref: asOptString(flags.ref),
        FromPath: asOptString(flags.from),
        Offline: asBool(flags.offline),
        DryRun: asBool(flags['dry-run']),
        Force: asBool(flags.force),
        SkipCommands: asBool(flags['skip-commands']),
        SkipSkills: asBool(flags['skip-skills']),
        SkipSettings: asBool(flags['skip-settings']),
        OnProgress: onProgress,
    };
}

function asString(v: unknown, fallback: string): string {
    return typeof v === 'string' && v.length > 0 ? v : fallback;
}
function asOptString(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function asBool(v: unknown): boolean {
    return v === true;
}
