import * as fs from 'node:fs';
import { Args, Command, Flags } from '@oclif/core';
import { LoadAndVerifyDiagnosticBundle, ExportBundleTraces } from '../../utils/diag-utils.js';

export default class DiagExport extends Command {
    static description = 'Export .mjdiag traces to Chrome Trace Event (Perfetto) or OpenTelemetry OTLP JSON';

    static args = {
        file: Args.string({
            description: 'Path to the .mjdiag bundle archive',
            required: true,
        }),
    };

    static flags = {
        output: Flags.string({
            char: 'o',
            description: 'Output JSON file path',
            required: true,
        }),
        perfetto: Flags.boolean({
            description: 'Export in Chrome Trace Event format for ui.perfetto.dev',
            default: false,
        }),
        otlp: Flags.boolean({
            description: 'Export in OpenTelemetry OTLP JSON format',
            default: false,
        }),
        'private-key': Flags.string({
            description: 'Base64 PKCS#8 X25519 private key if inspecting an encrypted MJDB envelope',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(DiagExport);
        const format: 'perfetto' | 'otlp' = flags.otlp ? 'otlp' : 'perfetto';
        const loaded = await LoadAndVerifyDiagnosticBundle(args.file, flags['private-key']);
        const exportedJson = ExportBundleTraces(loaded.Data, format);
        fs.writeFileSync(flags.output, exportedJson, 'utf8');
        this.log(`Exported ${format.toUpperCase()} trace to ${flags.output}`);
    }
}
