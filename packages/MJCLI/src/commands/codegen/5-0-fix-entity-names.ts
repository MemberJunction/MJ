import { Command, Flags } from '@oclif/core';

export default class V50FixEntityNames extends Command {
    static description = `[v5.0 Migration] Scan TypeScript files for hardcoded entity names that need "MJ: " prefix updates.

Uses the TypeScript compiler AST to find entity name references in method calls
(GetEntityObject, OpenEntityRecord, navigateToEntity, etc.), property assignments
(EntityName: 'OldName'), comparison expressions (.Name === 'OldName'), and
@RegisterClass decorators. Runs in dry-run mode by default; use --fix to apply.

The rename map is built dynamically from entity_subclasses.ts by parsing all
@RegisterClass(BaseEntity, 'MJ: XYZ') decorators (~272 entries).`;

    static examples = [
        {
            description: 'Dry-run scan of the packages directory',
            command: '<%= config.bin %> <%= command.id %> --path packages/',
        },
        {
            description: 'Scan a single file',
            command: '<%= config.bin %> <%= command.id %> --path packages/Angular/Explorer/dashboards/src/Actions/components/actions-overview.component.ts',
        },
        {
            description: 'Apply fixes across the codebase',
            command: '<%= config.bin %> <%= command.id %> --path packages/ --fix',
        },
        {
            description: 'Quiet mode (summary only)',
            command: '<%= config.bin %> <%= command.id %> --path packages/ -q',
        },
    ];

    static flags = {
        path: Flags.string({
            char: 'p',
            description: 'File or directory to scan. Accepts a single .ts file or a directory (scanned recursively). Defaults to the current working directory.',
        }),
        fix: Flags.boolean({
            description: 'Apply fixes in place. Without this flag, the command runs in dry-run mode and only reports findings.',
            default: false,
        }),
        'entity-subclasses': Flags.string({
            description: 'Explicit path to entity_subclasses.ts for building the rename map. If omitted, the tool searches common locations relative to the target path.',
        }),
        quiet: Flags.boolean({
            char: 'q',
            description: 'Suppress detailed per-file output; only show the final summary counts.',
            default: false,
        }),
        verbose: Flags.boolean({
            char: 'v',
            description: 'Show detailed progress including each file being scanned.',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { scanEntityNames } = await import('@memberjunction/codegen-lib');
        type ScanResult = Awaited<ReturnType<typeof scanEntityNames>>;

        const { flags } = await this.parse(V50FixEntityNames);

        const result: ScanResult = await scanEntityNames({
            TargetPath: flags.path || process.cwd(),
            Fix: flags.fix,
            EntitySubclassesPath: flags['entity-subclasses'],
            Verbose: flags.verbose,
        });

        if (!result.Success) {
            this.error(`Scan failed:\n${result.Errors.map((e: string) => `  - ${e}`).join('\n')}`);
        }

        if (!flags.quiet) {
            this.log(`\nScanned ${result.FilesScanned} files, found ${result.Findings.length} entity name(s) needing update`);
            this.log(`Rename map: ${result.RenameMapSize} entity name mappings loaded`);

            if (result.Findings.length > 0) {
                // Group by file for readable output
                const byFile = new Map<string, typeof result.Findings>();
                for (const f of result.Findings) {
                    if (!byFile.has(f.FilePath)) byFile.set(f.FilePath, []);
                    byFile.get(f.FilePath)!.push(f);
                }

                for (const [file, findings] of byFile) {
                    this.log(`\n  ${file}:`);
                    for (const f of findings) {
                        this.log(`    Line ${f.Line}: '${f.OldName}' -> '${f.NewName}' [${f.PatternKind}]`);
                    }
                }
            }

            if (flags.fix) {
                this.log(`\nFixed ${result.FixedFiles.length} file(s)`);
            } else if (result.Findings.length > 0) {
                this.log(`\nRun with --fix to apply these changes`);
            }
        }
    }
}
