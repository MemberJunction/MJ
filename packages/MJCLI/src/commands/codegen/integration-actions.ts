import { Command, Flags } from '@oclif/core';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as fs from 'fs';
import {
    ActionGenerationRunner,
    BaseIntegrationConnector,
} from '@memberjunction/integration-engine';

/**
 * `mj codegen integration-actions` — generate mj-sync action JSON files for a
 * user-authored integration connector.
 *
 * The user supplies a compiled JS module path. We dynamically import it, find
 * a class extending `BaseIntegrationConnector`, instantiate it, and feed it to
 * `ActionGenerationRunner`. Output is written to `<output-dir>/actions/integrations-auto-generated/`
 * and `<output-dir>/action-categories/`.
 *
 * Mirrors the file layout produced by MJ's internal `generate-integration-actions.ts`
 * script — both call the same runner under the hood.
 */
export default class CodeGenIntegrationActions extends Command {
    static description = `Generate mj-sync action JSON files for an integration connector.

Imports a compiled JavaScript module containing a class that extends
BaseIntegrationConnector (from @memberjunction/integration-engine), then
generates Action and Action-Category metadata files in mj-sync format ready
for \`mj sync push\`.

The connector's GetIntegrationObjects() and GetActionGeneratorConfig() methods
drive what actions get generated. Existing JSON files in the output directory
are merged with the freshly generated records — primaryKey and sync blocks
populated by a prior \`mj sync pull\` are preserved.

If your connector is written in TypeScript, build it first. This command
requires a compiled .js (ESM or CommonJS) module path.`;

    static examples = [
        '<%= config.bin %> <%= command.id %> --connector ./dist/MyCrmConnector.js',
        '<%= config.bin %> <%= command.id %> --connector ./dist/MyCrmConnector.js --export MyCrmConnector',
        '<%= config.bin %> <%= command.id %> --connector ./dist/MyCrmConnector.js --output-dir ./metadata',
        '<%= config.bin %> <%= command.id %> --connector ./dist/MyCrmConnector.js --json',
    ];

    static flags = {
        connector: Flags.string({
            description: 'Path to the compiled connector module (.js). Must export a class extending BaseIntegrationConnector.',
            required: true,
        }),
        export: Flags.string({
            description: 'Named export to use from the module. Defaults to the first export that extends BaseIntegrationConnector.',
        }),
        'output-dir': Flags.string({
            description: 'Base metadata directory. Actions land in <output-dir>/actions/integrations-auto-generated/.',
            default: './metadata',
        }),
        json: Flags.boolean({
            description: 'Output result as JSON.',
        }),
        verbose: Flags.boolean({
            char: 'v',
            description: 'Show per-connector progress messages.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CodeGenIntegrationActions);

        const result = await runIntegrationActionsCommand({
            ConnectorPath: flags.connector,
            ExportName: flags.export,
            OutputDir: flags['output-dir'],
            OnProgress: flags.verbose && !flags.json ? (msg) => this.log(msg) : undefined,
        });

        if (result.ok === false) {
            if (flags.json) {
                this.log(JSON.stringify(result, null, 2));
            } else {
                this.log(`✗ ${result.error}`);
            }
            this.exit(1);
        } else if (flags.json) {
            this.log(JSON.stringify(result, null, 2));
        } else {
            const r = result.result;
            this.log(`Generated ${r.TotalActions} action(s) across ${r.Connectors.length} connector(s):`);
            for (const c of r.Connectors) {
                if (c.Skipped) {
                    this.log(`  - ${c.IntegrationName}: skipped (${c.Reason ?? 'unknown'})`);
                } else {
                    this.log(`  - ${c.IntegrationName}: ${c.ActionCount} action(s) → ${c.FileName}`);
                }
            }
            if (r.TotalCategories > 0) {
                this.log(`Wrote ${r.TotalCategories} category record(s) → .integration-categories.json`);
            }
            this.log(`\nActions: ${r.ActionsDir}`);
            this.log(`Categories: ${r.CategoriesDir}`);
        }
    }
}

/** Input to the runner shim — extracted from the oclif Command for testability. */
export interface RunIntegrationActionsOptions {
    ConnectorPath: string;
    ExportName?: string;
    OutputDir?: string;
    OnProgress?: (message: string) => void;
}

/** Discriminated-union return so tests can assert on either branch without exceptions. */
export type RunIntegrationActionsResult =
    | { ok: true; result: Awaited<ReturnType<ActionGenerationRunner['Run']>> }
    | { ok: false; error: string };

/**
 * Core logic for the command — separated from the oclif wrapper so unit tests
 * can exercise it without spawning subprocesses.
 */
export async function runIntegrationActionsCommand(
    options: RunIntegrationActionsOptions
): Promise<RunIntegrationActionsResult> {
    const absPath = path.resolve(options.ConnectorPath);
    if (!fs.existsSync(absPath)) {
        return { ok: false, error: `Connector module not found: ${absPath}` };
    }

    let module: Record<string, unknown>;
    try {
        module = await import(pathToFileURL(absPath).toString()) as Record<string, unknown>;
    } catch (err) {
        return { ok: false, error: `Failed to import connector module: ${(err as Error).message}` };
    }

    const ConnectorClass = findConnectorClass(module, options.ExportName);
    if (!ConnectorClass) {
        const exportList = Object.keys(module).filter(k => k !== 'default').join(', ') || '(no named exports)';
        return {
            ok: false,
            error: options.ExportName
                ? `Export "${options.ExportName}" not found or does not extend BaseIntegrationConnector. Available exports: ${exportList}`
                : `No class extending BaseIntegrationConnector found in module. Available exports: ${exportList}. Try --export <name> if your class doesn't auto-resolve.`,
        };
    }

    let connector: BaseIntegrationConnector;
    try {
        connector = new ConnectorClass();
    } catch (err) {
        return {
            ok: false,
            error: `Failed to instantiate connector class: ${(err as Error).message}. Connector classes must have a zero-argument constructor for this command.`,
        };
    }

    const runner = new ActionGenerationRunner();
    const runResult = await runner.Run({
        Connectors: [{ Connector: connector }],
        OutputDir: options.OutputDir,
        OnProgress: options.OnProgress,
    });

    return { ok: true, result: runResult };
}

/**
 * Resolves a connector class from a module's exports. If `exportName` is
 * given, looks up that exact key. Otherwise scans all exports for the first
 * one whose prototype chain includes `BaseIntegrationConnector`.
 *
 * Exported for testing.
 */
export function findConnectorClass(
    module: Record<string, unknown>,
    exportName?: string
): (new () => BaseIntegrationConnector) | null {
    if (exportName) {
        const candidate = module[exportName];
        return isConnectorConstructor(candidate) ? candidate : null;
    }

    for (const [key, value] of Object.entries(module)) {
        if (key === 'default' && isConnectorConstructor(value)) return value;
        if (isConnectorConstructor(value)) return value;
    }
    return null;
}

function isConnectorConstructor(value: unknown): value is new () => BaseIntegrationConnector {
    if (typeof value !== 'function') return false;
    let proto: unknown = (value as { prototype?: unknown }).prototype;
    while (proto && proto !== Object.prototype) {
        if ((proto as { constructor?: { name?: string } }).constructor?.name === 'BaseIntegrationConnector') {
            return true;
        }
        proto = Object.getPrototypeOf(proto);
    }
    return false;
}
