import { describe, it, expect } from 'vitest';
import { CREDENTIAL_SECRET_FIELD_PRIORITY, ExtractCredentialSecret } from '../CredentialSecret';

describe('ExtractCredentialSecret', () => {
    it('uses the only field of a single-field credential, whatever it is called', () => {
        expect(ExtractCredentialSecret({ apiKey: 'sk-1' })).toEqual({ Success: true, Secret: 'sk-1' });
        expect(ExtractCredentialSecret({ somethingCustom: 'v' })).toEqual({ Success: true, Secret: 'v' });
    });

    it.each([
        ['apiKey', { apiKey: 'K', endpoint: 'https://x' }],
        ['ApiKey (GrowthZone spelling)', { Tenant: 't', ApiKey: 'K', BaseURL: 'u' }],
        ['api_key', { api_key: 'K', region: 'r' }],
        ['token', { token: 'K', host: 'h' }],
        ['accessToken (MCP OAuth)', { accessToken: 'K', refreshToken: 'R' }],
        ['authToken (Twilio)', { accountSid: 'AC', authToken: 'K' }],
        ['secret', { id: 'i', secret: 'K' }],
        ['value', { name: 'n', value: 'K' }],
    ])('prefers the well-known field: %s', (_label, values) => {
        expect(ExtractCredentialSecret(values)).toEqual({ Success: true, Secret: 'K' });
    });

    it('matches field names case-insensitively', () => {
        expect(ExtractCredentialSecret({ APIKEY: 'K', other: 'o' })).toEqual({ Success: true, Secret: 'K' });
    });

    it('honours the priority order when several well-known fields exist', () => {
        expect(ExtractCredentialSecret({ secret: 'S', apiKey: 'K' })).toEqual({ Success: true, Secret: 'K' });
        expect(ExtractCredentialSecret({ value: 'V', token: 'T' })).toEqual({ Success: true, Secret: 'T' });
    });

    it('FAILS on an ambiguous multi-field credential rather than guessing', () => {
        // aws-iam: the classic case — injecting any one of these as "the" key would be wrong.
        const result = ExtractCredentialSecret({ accessKeyId: 'AKIA', secretAccessKey: 'shh', region: 'us-east-1' });
        expect(result.Success).toBe(false);
        expect(result.Secret).toBeUndefined();
        expect(result.Reason).toContain('ambiguous');
    });

    it('names the fields in a failure reason but never their values', () => {
        const result = ExtractCredentialSecret({ username: 'alice', password: 'hunter2-the-secret' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('username');
        expect(result.Reason).toContain('password');
        expect(result.Reason).not.toContain('hunter2-the-secret');
        expect(result.Reason).not.toContain('alice');
    });

    it.each([[{}], [null], [undefined]])('fails on empty input %j', (values) => {
        expect(ExtractCredentialSecret(values).Success).toBe(false);
    });

    it('fails when the chosen field is empty or not a string', () => {
        expect(ExtractCredentialSecret({ apiKey: '' }).Success).toBe(false);
        expect(ExtractCredentialSecret({ apiKey: 123 as unknown as string }).Success).toBe(false);
        expect(ExtractCredentialSecret({ apiKey: '', region: 'r' }).Success).toBe(false);
    });

    it('never returns the serialized blob', () => {
        const values = { apiKey: 'K', endpoint: 'https://internal.example.com' };
        const result = ExtractCredentialSecret(values);
        expect(result.Secret).toBe('K');
        expect(result.Secret).not.toContain('endpoint');
        expect(result.Secret).not.toContain('{');
    });

    it('keeps every shipped credential-type secret field on the priority list', () => {
        // Guards the rationale in CredentialSecret.ts against silent drift.
        for (const name of ['apiKey', 'token', 'accessToken', 'authToken']) {
            expect(CREDENTIAL_SECRET_FIELD_PRIORITY).toContain(name);
        }
    });
});
