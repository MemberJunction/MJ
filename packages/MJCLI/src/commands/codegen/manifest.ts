import { Command, Flags } from '@oclif/core';
import { generateClassRegistrationsManifest } from '@memberjunction/codegen-lib';

export default class CodeGenManifest extends Command {
    static description = 'Generate a class registrations manifest to prevent tree-shaking of @RegisterClass decorated classes';

    static examples = [
        `<%= config.bin %> <%= command.id %> --output ./src/generated/class-registrations-manifest.ts`,
        `<%= config.bin %> <%= command.id %> --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts`,
        `<%= config.bin %> <%= command.id %> --filter BaseEngine --filter BaseAction`,
        `<%= config.bin %> <%= command.id %> --verbose`,
    ];

    static flags = {
        output: Flags.string({
            char: 'o',
            description: 'Output manifest file path',
            default: './src/generated/class-registrations-manifest.ts',
        }),
        appDir: Flags.string({
            char: 'a',
            description: 'App directory containing package.json (defaults to current directory)',
        }),
        filter: Flags.string({
            char: 'f',
            description: 'Only include classes with this base class (can be repeated)',
            multiple: true,
        }),
        quiet: Flags.boolean({
            char: 'q',
            description: 'Suppress all output',
            default: false,
        }),
        verbose: Flags.boolean({
            char: 'v',
            description: 'Show detailed progress including skipped classes and per-package info',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CodeGenManifest);

        const result = await generateClassRegistrationsManifest({
            outputPath: flags.output,
            appDir: flags.appDir || process.cwd(),
            verbose: flags.verbose,
            filterBaseClasses: flags.filter && flags.filter.length > 0 ? flags.filter : undefined,
        });

        if (!result.success) {
            this.error(`Manifest generation failed:\n${result.errors.map(e => `  - ${e}`).join('\n')}`);
        }

        if (!flags.quiet) {
            if (result.ManifestChanged) {
                this.log(`[class-manifest] Updated: ${result.classes.length} classes from ${result.packages.length} packages (${result.totalDepsWalked} deps walked)`);
            } else {
                this.log(`[class-manifest] No changes detected (${result.classes.length} classes, ${result.packages.length} packages)`);
            }
        }
    }
}
