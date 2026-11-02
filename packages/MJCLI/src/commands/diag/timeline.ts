import { Args, Command, Flags } from '@oclif/core';
import { LoadAndVerifyDiagnosticBundle, BuildBundleTimeline } from '../../utils/diag-utils.js';

export default class DiagTimeline extends Command {
    static description = 'Print a merged chronological timeline of client spans, server spans, and SQL queries';

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
        'private-key': Flags.string({
            description: 'Base64 PKCS#8 X25519 private key if inspecting an encrypted MJDB envelope',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(DiagTimeline);
        const loaded = await LoadAndVerifyDiagnosticBundle(args.file, flags['private-key']);
        const rows = BuildBundleTimeline(loaded.data, flags.limit);

        for (const r of rows) {
            const iso = r.timestampUnixMs > 0 ? new Date(r.timestampUnixMs).toISOString() : 'n/a';
            this.log(`${iso} | ${r.source.padEnd(11)} | ${String(r.durationMs.toFixed(1)).padStart(8)}ms | ${r.label}`);
        }
    }
}
