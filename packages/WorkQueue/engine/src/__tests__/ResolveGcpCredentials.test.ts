import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const credentialEngine = vi.hoisted(() => ({
    Config: vi.fn(async () => undefined),
    GetCredentialById: vi.fn(),
    GetCredential: vi.fn(),
}));

vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: credentialEngine } }));

import { ResolveGcpCredentials, ToGcpCredentials } from '../gcp/ResolveGcpCredentials';

const USER = { ID: 'user-1' } as UserInfo;
const CREDENTIAL_ID = '22222222-3333-4444-8555-666666666666';

beforeEach(() => {
    credentialEngine.Config.mockClear();
    credentialEngine.GetCredentialById.mockReset();
    credentialEngine.GetCredential.mockReset();
});

describe('ToGcpCredentials', () => {
    it('maps CredentialsJson, ClientEmail+PrivateKey, or KeyFilename and rejects incomplete values', () => {
        expect(ToGcpCredentials({ CredentialsJson: '{"client_email":"a@b.iam","private_key":"k"}' }))
            .toEqual({ CredentialsJson: '{"client_email":"a@b.iam","private_key":"k"}' });

        expect(ToGcpCredentials({ ClientEmail: 'svc@proj.iam', PrivateKey: 'pem', ProjectId: 'p1' }))
            .toEqual({ ClientEmail: 'svc@proj.iam', PrivateKey: 'pem', ProjectId: 'p1' });

        expect(ToGcpCredentials({ KeyFilename: '/etc/gcp/key.json' }))
            .toEqual({ KeyFilename: '/etc/gcp/key.json' });

        expect(() => ToGcpCredentials({ ClientEmail: 'svc@proj.iam' })).toThrow('CredentialsJson, ClientEmail and PrivateKey, or KeyFilename');
    });
});

describe('ResolveGcpCredentials', () => {
    it('uses ADC (undefined) when CredentialID is null', async () => {
        expect(await ResolveGcpCredentials(null, USER)).toBeUndefined();
        expect(credentialEngine.Config).not.toHaveBeenCalled();
    });

    it('loads and decrypts the configured credential under the WorkQueue subsystem', async () => {
        credentialEngine.GetCredentialById.mockReturnValue({ ID: CREDENTIAL_ID, Name: 'GCP PubSub SA' });
        credentialEngine.GetCredential.mockResolvedValue({
            values: { ClientEmail: 'svc@proj.iam', PrivateKey: 'pem-key' },
        });
        expect(await ResolveGcpCredentials(CREDENTIAL_ID, USER)).toEqual({
            ClientEmail: 'svc@proj.iam',
            PrivateKey: 'pem-key',
        });
        expect(credentialEngine.Config).toHaveBeenCalledWith(false, USER);
        expect(credentialEngine.GetCredential).toHaveBeenCalledWith('GCP PubSub SA', {
            credentialId: CREDENTIAL_ID,
            contextUser: USER,
            subsystem: 'WorkQueue',
        });
    });

    it('fails clearly when the credential does not exist', async () => {
        credentialEngine.GetCredentialById.mockReturnValue(undefined);
        await expect(ResolveGcpCredentials(CREDENTIAL_ID, USER)).rejects.toThrow(`Credential ${CREDENTIAL_ID} was not found`);
    });
});
