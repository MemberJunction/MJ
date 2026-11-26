import { describe, expect, it } from 'vitest';
import { HARNESS_REDACTED_SECRET_PLACEHOLDER, ScrubHarnessSecrets } from '../HarnessCredentialResolver.js';

describe('HarnessCredentialResolver', () => {
    it('scrubs injected environment secrets, DB passwords, and tokens from turn output before persistence', () => {
        const env: Record<string, string> = {
            PATH: '/usr/local/bin:/usr/bin',
            DB_HOST: 'localhost',
            DB_PASSWORD: 'TopSecretDatabasePassword!',
            GEMINI_API_KEY: 'AIzaSyTestSecretKeyValue1234567890',
        };
        const rawText = [
            'Connected to localhost using TopSecretDatabasePassword!',
            'Key=AIzaSyTestSecretKeyValue1234567890',
            'Connection: Server=localhost;Password=InlinePassword987;',
            'sqlcmd -S localhost -U sa -P CliPassword654',
            'Path is /usr/local/bin:/usr/bin',
        ].join('\n');

        const scrubbed = ScrubHarnessSecrets(rawText, env);
        expect(scrubbed).not.toContain('TopSecretDatabasePassword!');
        expect(scrubbed).not.toContain('AIzaSyTestSecretKeyValue1234567890');
        expect(scrubbed).not.toContain('InlinePassword987');
        expect(scrubbed).not.toContain('CliPassword654');
        expect(scrubbed).toContain(HARNESS_REDACTED_SECRET_PLACEHOLDER);
        // Non-secret env vars like PATH and DB_HOST remain intact
        expect(scrubbed).toContain('/usr/local/bin:/usr/bin');
        expect(scrubbed).toContain('localhost');
    });
});
