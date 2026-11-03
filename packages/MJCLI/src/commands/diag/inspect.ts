import { Args, Command, Flags } from '@oclif/core';
import {
    LoadAndVerifyDiagnosticBundle,
    DiagPrivateKeyFlags,
    ResolveDiagnosticPrivateKey,
} from '../../utils/diag-utils.js';

export default class DiagInspect extends Command {
    static description = 'Verify and inspect a MemberJunction .mjdiag diagnostic bundle';

    static args = {
        file: Args.string({
            description: 'Path to the .mjdiag bundle archive',
            required: true,
        }),
    };

    static flags = {
        ...DiagPrivateKeyFlags,
        json: Flags.boolean({
            description: 'Emit machine-readable JSON output',
            default: false,
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(DiagInspect);
        const loaded = await LoadAndVerifyDiagnosticBundle(args.file, ResolveDiagnosticPrivateKey(flags));
        const { Manifest: manifest, Data: data } = loaded;

        if (flags.json) {
            this.log(
                JSON.stringify(
                    {
                        wasEncrypted: loaded.WasEncrypted,
                        manifest,
                        findings: data.findings,
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        this.log(`Bundle ID:        ${manifest.bundleId}`);
        this.log(`Created At:       ${manifest.createdAt}`);
        this.log(`Reason / Scrub:   ${manifest.captureReason} / ${manifest.scrubberProfile}`);
        this.log(`MJ Version:       ${data.environment.mjVersion}`);
        this.log(`Encrypted:        ${loaded.WasEncrypted ? 'Yes (MJDB v1 verified)' : 'No'}`);
        this.log(
            `Counts:           clientWaterfall=${data.clientWaterfall.length}, serverSpans=${data.serverTraces.length}, sqlEvents=${data.serverSql.length}, findings=${data.findings.length}`,
        );
        this.log(
            `Redactions:       credentials=${manifest.redactionSummary.credentialsScrubbedCount}, sqlNormalized=${manifest.redactionSummary.sqlLiteralsNormalizedCount}, custom=${manifest.redactionSummary.customPatternsAppliedCount}`,
        );

        if (data.findings.length > 0) {
            this.log('\nFindings:');
            for (const f of data.findings) {
                this.log(`  - [${f.severity.toUpperCase()}] (${f.category}) ${f.title}: ${f.summary}`);
            }
        }
    }
}
