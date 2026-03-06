import { Command, Flags } from '@oclif/core';

export default class CodeGenManifest extends Command {
    static description = `Generate a class registration manifest to prevent tree-shaking.

MemberJunction uses @RegisterClass decorators with a dynamic class factory.
Modern bundlers (ESBuild, Vite) cannot detect dynamic instantiation and will
tree-shake these classes out of production builds. This command scans the
dependency tree for all @RegisterClass-decorated classes and emits a manifest
file with static imports that the bundler cannot eliminate.

Typically used as a prebuild/prestart script for MJAPI and MJExplorer. For
MJ distribution users, pre-built manifests ship inside @memberjunction/server-bootstrap
and @memberjunction/ng-bootstrap -- use --exclude-packages @memberjunction to
generate a supplemental manifest covering only your own application classes.`;

    static examples = [
        {
            command: '<%= config.bin %> <%= command.id %>',
            description: 'Generate manifest with default output path',
        },
        {
            command: '<%= config.bin %> <%= command.id %> --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts',
            description: 'Generate manifest for a specific application directory',
        },
        {
            command: '<%= config.bin %> <%= command.id %> --exclude-packages @memberjunction',
            description: 'Exclude MJ packages (use pre-built bootstrap manifests instead)',
        },
        {
            command: '<%= config.bin %> <%= command.id %> --exclude-packages @memberjunction --no-sync-deps',
            description: 'Exclude MJ packages and skip dependency reconciliation',
        },
        {
            command: '<%= config.bin %> <%= command.id %> --filter BaseEngine --filter BaseAction --verbose',
            description: 'Only include specific base classes with detailed progress',
        },
    ];

    static flags = {
        output: Flags.string({
            char: 'o',
            description: 'Output file path for the generated manifest. The file will contain named imports and a CLASS_REGISTRATIONS array.',
            default: './src/generated/class-registrations-manifest.ts',
        }),
        appDir: Flags.string({
            char: 'a',
            description: 'Root directory of the application whose package.json dependency tree will be scanned. Defaults to the current working directory.',
        }),
        filter: Flags.string({
            char: 'f',
            description: 'Only include classes extending this base class. Can be repeated (e.g., --filter BaseEngine --filter BaseAction).',
            multiple: true,
        }),
        'exclude-packages': Flags.string({
            char: 'e',
            description: 'Skip packages whose name starts with this prefix. Useful for excluding @memberjunction packages when using pre-built bootstrap manifests. Can be repeated.',
            multiple: true,
        }),
        'no-sync-deps': Flags.boolean({
            description: 'Skip automatic dependency reconciliation. By default, the manifest generator adds any manifest-imported packages that are missing from package.json dependencies. Use this flag when generating supplemental manifests with --exclude-packages, where excluded packages are already covered by a pre-built bootstrap manifest.',
            default: false,
        }),
        quiet: Flags.boolean({
            char: 'q',
            description: 'Suppress all output except errors.',
            default: false,
        }),
        verbose: Flags.boolean({
            char: 'v',
            description: 'Show detailed progress including per-package scanning info and skipped classes.',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { generateClassRegistrationsManifest } = await import('@memberjunction/codegen-lib');

        const { flags } = await this.parse(CodeGenManifest);

        const excludePackages = flags['exclude-packages'];
        const syncDependencies = !flags['no-sync-deps'];
        const result = await generateClassRegistrationsManifest({
            outputPath: flags.output,
            appDir: flags.appDir || process.cwd(),
            verbose: flags.verbose,
            filterBaseClasses: flags.filter && flags.filter.length > 0 ? flags.filter : undefined,
            excludePackages: excludePackages && excludePackages.length > 0 ? excludePackages : undefined,
            syncDependencies,
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

            const addedCount = Object.keys(result.AddedDependencies).length;
            if (addedCount > 0) {
                this.log(`[class-manifest] Added ${addedCount} missing ${addedCount === 1 ? 'dependency' : 'dependencies'} to package.json — run \`npm install\` at repo root`);
            }
        }
    }
}
