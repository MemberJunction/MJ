import { Command, Flags } from '@oclif/core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getOptionalConfig } from '../../config.js';

/** A client dynamic-package entry as read from mj.config `dynamicPackages.client`. */
export interface OpenAppClientEntry {
    PackageName: string;
    Enabled?: boolean;
}

const OPEN_APP_BOOTSTRAP_BEGIN = '// ===== BEGIN Open App client bootstrap (managed by `mj app` / `mj codegen manifest`) =====';
const OPEN_APP_BOOTSTRAP_END = '// ===== END Open App client bootstrap =====';

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure transform: given the current manifest file content and the set of Open App
 * client packages, returns the content with the managed bootstrap block refreshed.
 *
 * - Strips any prior managed block first, so the result is idempotent (re-running with
 *   the same entries is a no-op; changed entries fully replace the block).
 * - Enabled entries become `import '<pkg>';`; disabled entries become a comment so a
 *   re-enable restores the import without losing the record.
 * - Zero entries => the block is removed entirely (no stale imports left behind).
 *
 * Exported for unit testing of the idempotency / disabled / cleared cases.
 */
export function applyOpenAppClientBootstrapBlock(content: string, clientEntries: OpenAppClientEntry[]): string {
    const blockPattern = new RegExp(
        `\\n*${escapeRegex(OPEN_APP_BOOTSTRAP_BEGIN)}[\\s\\S]*?${escapeRegex(OPEN_APP_BOOTSTRAP_END)}\\n*`,
        'g'
    );
    let result = content.replace(blockPattern, '\n').replace(/\n+$/, '\n');

    if (clientEntries.length > 0) {
        const lines = clientEntries.map(e =>
            e.Enabled === false
                ? `// '${e.PackageName}' disabled by \`mj app disable\``
                : `import '${e.PackageName}';`
        );
        result = `${result.replace(/\n+$/, '')}\n\n${OPEN_APP_BOOTSTRAP_BEGIN}\n${lines.join('\n')}\n${OPEN_APP_BOOTSTRAP_END}\n`;
    }
    return result;
}

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
        {
            command: '<%= config.bin %> <%= command.id %> --scan-dist',
            description: 'Include dist/ scanning for npm-published packages without src/',
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
        'scan-dist': Flags.boolean({
            description: 'Scan compiled JavaScript files in dist/ directories for packages without src/. ' +
                'Use this when your dependency tree includes npm-published packages that contain @RegisterClass decorators. ' +
                'Without this flag, only TypeScript source in src/ is scanned.',
            default: false,
        }),
        'lazy-config': Flags.string({
            description: 'Output path for a generated lazy-loading feature config file. ' +
                'Maps @RegisterClass keys from excluded packages to dynamic import() loaders based on package.json subpath exports. ' +
                'Only packages with subpath exports in their package.json are included. Requires --exclude-packages.',
        }),
        strict: Flags.boolean({
            description: 'Treat coverage audit gaps as fatal errors. A gap is a @RegisterClass class in an excluded package ' +
                'that is not reachable from any lazy chunk subpath export. Use in CI to catch tree-shaking issues before merge.',
            default: false,
        }),
        'open-app-client-bootstrap': Flags.boolean({
            description: 'After generating the manifest, append a managed block of side-effect imports — one per ' +
                'Open App client package recorded in mj.config `dynamicPackages.client` — so installed apps\' client ' +
                'classes register when the client bundle loads. Used by MJExplorer\'s prebuild; requires --output.',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { generateClassRegistrationsManifest } = await import('@memberjunction/codegen-lib');

        const { flags } = await this.parse(CodeGenManifest);

        const excludePackages = flags['exclude-packages'];
        const syncDependencies = !flags['no-sync-deps'];
        const scanDist = flags['scan-dist'];
        const lazyConfig = flags['lazy-config'];
        const result = await generateClassRegistrationsManifest({
            outputPath: flags.output,
            appDir: flags.appDir || process.cwd(),
            verbose: flags.verbose,
            filterBaseClasses: flags.filter && flags.filter.length > 0 ? flags.filter : undefined,
            excludePackages: excludePackages && excludePackages.length > 0 ? excludePackages : undefined,
            syncDependencies,
            scanDist,
            lazyConfigPath: lazyConfig,
            strict: flags.strict,
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

            if (lazyConfig) {
                if (result.LazyConfigChanged) {
                    this.log(`[class-manifest] Lazy config updated: ${lazyConfig}`);
                } else {
                    this.log(`[class-manifest] Lazy config unchanged`);
                }
            }
        }

        if (flags['open-app-client-bootstrap']) {
            if (!flags.output) {
                this.error('--open-app-client-bootstrap requires --output (the manifest file to append the client bootstrap block to).');
            }
            this.appendOpenAppClientBootstrap(flags.output, flags.quiet);
        }
    }

    /**
     * Appends (or refreshes) a managed block of side-effect imports to the generated
     * manifest — one `import '<pkg>';` per enabled Open App client package recorded in
     * mj.config `dynamicPackages.client` (disabled packages are emitted as comments).
     *
     * This is what keeps the Open App client-load mechanism inside distributed npm
     * packages (this CLI + the manifest MJExplorer already imports) instead of a
     * hand-written MJExplorer file — so MJExplorer stays paper-thin. The block is
     * delimited and rebuilt on every run, so it stays in sync as apps are installed,
     * removed, enabled, or disabled (each of which edits `dynamicPackages.client`).
     */
    private appendOpenAppClientBootstrap(outputPath: string, quiet: boolean): void {
        const filePath = resolve(process.cwd(), outputPath);
        if (!existsSync(filePath)) {
            return; // manifest generation produced no file (e.g. --no-sync-deps fallback); nothing to append to
        }

        const clientEntries = (getOptionalConfig()?.dynamicPackages?.client ?? []) as OpenAppClientEntry[];
        const content = applyOpenAppClientBootstrapBlock(readFileSync(filePath, 'utf-8'), clientEntries);

        writeFileSync(filePath, content, 'utf-8');
        if (!quiet) {
            this.log(`[class-manifest] Open App client bootstrap: ${clientEntries.length} client ${clientEntries.length === 1 ? 'package' : 'packages'} wired`);
        }
    }
}
