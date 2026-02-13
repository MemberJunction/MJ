import { Command, Flags } from '@oclif/core';

export default class FixMetadataNames extends Command {
    static description = 'Scan metadata JSON files for entity names that need "MJ: " prefix updates (@lookup references, folder configs, relatedEntities keys)';

    static examples = [
        `<%= config.bin %> <%= command.id %> --path metadata/`,
        `<%= config.bin %> <%= command.id %> --path metadata/ --fix`,
        `<%= config.bin %> <%= command.id %> --path metadata/resource-types`,
        `<%= config.bin %> <%= command.id %> --path metadata/entities/.audit-related-entities.json --fix`,
    ];

    static flags = {
        path: Flags.string({
            char: 'p',
            description: 'File or directory to scan (defaults to current directory)',
        }),
        fix: Flags.boolean({
            description: 'Apply fixes in place (default is dry-run / scan only)',
            default: false,
        }),
        'entity-subclasses': Flags.string({
            description: 'Path to entity_subclasses.ts for building rename map',
        }),
        quiet: Flags.boolean({
            char: 'q',
            description: 'Suppress detailed output, only show summary',
            default: false,
        }),
        verbose: Flags.boolean({
            char: 'v',
            description: 'Show detailed progress',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { scanMetadataNames } = await import('@memberjunction/codegen-lib');
        type ScanResult = Awaited<ReturnType<typeof scanMetadataNames>>;

        const { flags } = await this.parse(FixMetadataNames);

        const result: ScanResult = await scanMetadataNames({
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
