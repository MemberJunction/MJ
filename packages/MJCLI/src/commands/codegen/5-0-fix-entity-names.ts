import { Command, Flags } from '@oclif/core';

export default class V50FixEntityNames extends Command {
    static description = `[v5.0 Migration] Scan TypeScript files for entity names AND class names that need updating.

Three strategies are applied:
  1. Class name renames (regex) — ActionEntity -> MJActionEntity, ActionSchema -> MJActionSchema,
     ActionEntityExtended -> MJActionEntityExtended (extended subclasses),
     ActionEntityServerEntity -> MJActionEntityServer (server subclass suffix standardization),
     ActionFormComponentExtended -> MJActionFormComponentExtended (Angular form components).
     Explicit subclass mappings (57 entries from subclass-rename-map.json) take priority over
     auto-generated suffix rules, enabling suffix changes (e.g., _Server -> Server, ServerEntity -> Server).
  2. Multi-word entity name renames (regex) — 'AI Models' -> 'MJ: AI Models'
  3. Single-word entity name renames (AST) — 'Actions' -> 'MJ: Actions' in GetEntityObject, OpenEntityRecord,
     navigateToEntity, EntityName: assignments, .Name === comparisons, @RegisterClass decorators.

The rename map (272 entity entries + 57 subclass entries) is built from entity_subclasses.ts @RegisterClass
decorators plus embedded rename maps. Runs in dry-run mode by default; use --fix to apply.`;

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
            this.log(`\nScanned ${result.FilesScanned} files, found ${result.Findings.length} reference(s) needing update`);
            this.log(`Rename map: ${result.RenameMapSize} entity name mappings loaded`);

            if (result.Findings.length > 0) {
                // Strategy breakdown
                const classNameCount = result.Findings.filter((f: { PatternKind: string }) => f.PatternKind === 'ClassName').length;
                const multiWordCount = result.Findings.filter((f: { PatternKind: string }) => f.PatternKind === 'MultiWordEntityName').length;
                const astCount = result.Findings.length - classNameCount - multiWordCount;

                this.log(`\n  Strategy breakdown:`);
                if (classNameCount > 0) this.log(`    Class name renames:          ${classNameCount}`);
                if (multiWordCount > 0) this.log(`    Multi-word entity names:     ${multiWordCount}`);
                if (astCount > 0)       this.log(`    Single-word entity names:    ${astCount}`);

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
