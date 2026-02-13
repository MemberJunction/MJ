import { Command, Flags } from '@oclif/core';

export default class V50FixMetadataNames extends Command {
    static description = `[v5.0 Migration] Scan metadata JSON files for entity names that need "MJ: " prefix updates.

Targets the metadata/ directory used by "mj sync". Detects entity name references in
@lookup: directives (both the entity name and lookup value), .mj-sync.json and
.mj-folder.json config files (entity/entityName fields), relatedEntities object keys,
and fields.Name values in Entities-managing folders. Runs in dry-run mode by default;
use --fix to apply.

The rename map is built dynamically from entity_subclasses.ts by parsing all
@RegisterClass(BaseEntity, 'MJ: XYZ') decorators (~272 entries).`;

    static examples = [
        {
            description: 'Dry-run scan of the metadata directory',
            command: '<%= config.bin %> <%= command.id %> --path metadata/',
        },
        {
            description: 'Apply fixes to metadata files',
            command: '<%= config.bin %> <%= command.id %> --path metadata/ --fix',
        },
        {
            description: 'Scan a specific subdirectory',
            command: '<%= config.bin %> <%= command.id %> --path metadata/resource-types',
        },
        {
            description: 'Scan and fix a single metadata file',
            command: '<%= config.bin %> <%= command.id %> --path metadata/entities/.audit-related-entities.json --fix',
        },
    ];

    static flags = {
        path: Flags.string({
            char: 'p',
            description: 'File or directory to scan. Accepts a single .json file or a directory (scanned recursively, including dotfiles like .mj-sync.json). Defaults to the current working directory.',
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
        const { scanMetadataNames } = await import('@memberjunction/codegen-lib');
        type ScanResult = Awaited<ReturnType<typeof scanMetadataNames>>;

        const { flags } = await this.parse(V50FixMetadataNames);

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
