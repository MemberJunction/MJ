import { Args, Command, Flags } from '@oclif/core';
import { LoadAndVerifyDiagnosticBundle, FindSlowBundleOperations } from '../../utils/diag-utils.js';

export default class DiagSlow extends Command {
    static description = 'List slow client/server spans and SQL queries from a .mjdiag bundle';

    static args = {
        file: Args.string({
            description: 'Path to the .mjdiag bundle archive',
            required: true,
        }),
    };

    static flags = {
        threshold: Flags.integer({
            char: 't',
            description: 'Minimum duration in milliseconds',
            default: 500,
        }),
        'private-key': Flags.string({
            description: 'Base64 PKCS#8 X25519 private key if inspecting an encrypted MJDB envelope',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(DiagSlow);
        const loaded = await LoadAndVerifyDiagnosticBundle(args.file, flags['private-key']);
        const slowOps = FindSlowBundleOperations(loaded.data, flags.threshold);

        if (slowOps.length === 0) {
            this.log(`No operations found exceeding ${flags.threshold}ms.`);
            return;
        }

        for (const op of slowOps) {
            this.log(`${String(op.durationMs.toFixed(1)).padStart(8)}ms | ${op.source.padEnd(11)} | ${op.label}`);
        }
    }
}
