import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientSecretCredential } from '@azure/identity';
import type { UserInfo } from '@memberjunction/core';

const credentialEngine = vi.hoisted(() => ({
    Config: vi.fn(async () => undefined),
    GetCredentialById: vi.fn(),
    GetCredential: vi.fn(),
}));

vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: credentialEngine } }));

import { ResolveAzureCredentials, ToAzureCredentials } from '../azure/ResolveAzureCredentials';

const USER = { ID: 'user-1' } as UserInfo;
const CREDENTIAL_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
    credentialEngine.Config.mockClear();
    credentialEngine.GetCredentialById.mockReset();
    credentialEngine.GetCredential.mockReset();
});

describe('ToAzureCredentials', () => {
    it('maps ConnectionString or Service Principal values and rejects incomplete credentials', () => {
        expect(ToAzureCredentials({ ConnectionString: 'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=k;SharedAccessKey=v' }))
            .toEqual({ ConnectionString: 'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=k;SharedAccessKey=v' });

        const sp = ToAzureCredentials({ TenantId: 't-1', ClientId: 'c-1', ClientSecret: 's-1' });
        expect(sp).toBeInstanceOf(ClientSecretCredential);

        expect(() => ToAzureCredentials({ TenantId: 't-1' })).toThrow('ConnectionString, or TenantId, ClientId, and ClientSecret');
    });
});

describe('ResolveAzureCredentials', () => {
    it('uses DefaultAzureCredential (undefined) when CredentialID is null', async () => {
        expect(await ResolveAzureCredentials(null, USER)).toBeUndefined();
        expect(credentialEngine.Config).not.toHaveBeenCalled();
    });

    it('loads and decrypts the configured credential under the WorkQueue subsystem', async () => {
        credentialEngine.GetCredentialById.mockReturnValue({ ID: CREDENTIAL_ID, Name: 'Azure Service Bus' });
        credentialEngine.GetCredential.mockResolvedValue({ values: { ConnectionString: 'Endpoint=sb://test/' } });
        expect(await ResolveAzureCredentials(CREDENTIAL_ID, USER)).toEqual({ ConnectionString: 'Endpoint=sb://test/' });
        expect(credentialEngine.Config).toHaveBeenCalledWith(false, USER);
        expect(credentialEngine.GetCredential).toHaveBeenCalledWith('Azure Service Bus', {
            credentialId: CREDENTIAL_ID,
            contextUser: USER,
            subsystem: 'WorkQueue',
        });
    });

    it('fails clearly when the credential does not exist', async () => {
        credentialEngine.GetCredentialById.mockReturnValue(undefined);
        await expect(ResolveAzureCredentials(CREDENTIAL_ID, USER)).rejects.toThrow(`Credential ${CREDENTIAL_ID} was not found`);
    });
});
