import { Args, Command, Flags } from '@oclif/core';
import {
    LoadAndVerifyDiagnosticBundle,
    BuildBundleTimeline,
    DiagPrivateKeyFlags,
    ResolveDiagnosticPrivateKey,
} from '../../utils/diag-utils.js';

export default class DiagTimeline extends Command {
    static description = 'Print a merged chronological timeline of client spans, server spans, SQL queries and breadcrumbs';

    static args = {
        file: Args.string({
            description: 'Path to the .mjdiag bundle archive',
            required: true,
        }),
    };

    static flags = {
        limit: Flags.integer({
            char: 'n',
            description: 'Maximum number of timeline rows to display',
            default: 50,
        }),
        ...DiagPrivateKeyFlags,
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(DiagTimeline);
        const loaded = await LoadAndVerifyDiagnosticBundle(args.file, ResolveDiagnosticPrivateKey(flags));
        const rows = BuildBundleTimeline(loaded.Data, flags.limit);

        for (const r of rows) {
            const iso = r.TimestampUnixMs > 0 ? new Date(r.TimestampUnixMs).toISOString() : 'n/a';
            this.log(`${iso} | ${r.Source.padEnd(11)} | ${String(r.DurationMs.toFixed(1)).padStart(8)}ms | ${r.Label}`);
        }
    }
}
