import { Command, Flags } from '@oclif/core';
import { GenerateDiagnosticKeyPair } from '@memberjunction/diagnostics';

export default class DiagKeygen extends Command {
    static description =
        'Generate an X25519 collector keypair (and optional Ed25519 signing keypair) for a Diagnostic Bundles Intake server';

    static flags = {
        'key-id': Flags.string({
            description: 'Key identifier (kid) embedded in MJDB envelope headers',
            default: `mjc-intake-${new Date().getUTCFullYear()}-01`,
        }),
        signing: Flags.boolean({
            description: 'Also generate an Ed25519 keypair for signing public key manifests or sender envelopes',
            default: false,
        }),
        json: Flags.boolean({
            description: 'Emit JSON output',
            default: false,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(DiagKeygen);
        const collectorKey = await GenerateDiagnosticKeyPair('X25519', flags['key-id']);
        const signingKey = flags.signing ? await GenerateDiagnosticKeyPair('Ed25519', `${flags['key-id']}-sign`) : undefined;

        if (flags.json) {
            this.log(JSON.stringify({ collectorKey, signingKey }, null, 2));
            return;
        }

        this.log(`Collector X25519 Key ID:         ${collectorKey.keyId}`);
        this.log(`Collector Public Key (SPKI b64): ${collectorKey.publicKeyBase64}`);
        this.log(`Collector Private Key (PKCS8):   ${collectorKey.privateKeyBase64}`);
        if (signingKey) {
            this.log(`Ed25519 Public Key (SPKI b64):   ${signingKey.publicKeyBase64}`);
            this.log(`Ed25519 Private Key (PKCS8):     ${signingKey.privateKeyBase64}`);
        }
    }
}
