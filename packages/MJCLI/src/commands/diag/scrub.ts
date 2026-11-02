import * as fs from 'node:fs';
import { Args, Command, Flags } from '@oclif/core';
import { type DiagnosticScrubberProfile } from '@memberjunction/diagnostics';
import { LoadAndVerifyDiagnosticBundle, RescrubDiagnosticBundle } from '../../utils/diag-utils.js';

export default class DiagScrub extends Command {
    static description = 'Re-scrub an existing .mjdiag bundle archive at Standard or FullRaw profile';

    static args = {
        file: Args.string({
            description: 'Path to the source .mjdiag bundle archive',
            required: true,
        }),
    };

    static flags = {
        output: Flags.string({
            char: 'o',
            description: 'Output path for the scrubbed .mjdiag archive',
            required: true,
        }),
        profile: Flags.string({
            description: 'Scrubber profile to apply (Standard or FullRaw)',
            options: ['Standard', 'FullRaw'],
            default: 'Standard',
        }),
        'private-key': Flags.string({
            description: 'Base64 PKCS#8 X25519 private key if the input file is an encrypted MJDB envelope',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(DiagScrub);
        const loaded = await LoadAndVerifyDiagnosticBundle(args.file, flags['private-key']);
        const profile: DiagnosticScrubberProfile = flags.profile === 'FullRaw' ? 'FullRaw' : 'Standard';
        const rescrubbedBytes = await RescrubDiagnosticBundle(loaded.Manifest, loaded.Data, profile);
        fs.writeFileSync(flags.output, rescrubbedBytes);
        this.log(`Wrote scrubbed .mjdiag archive (${rescrubbedBytes.byteLength} bytes, profile=${profile}) to ${flags.output}`);
    }
}
