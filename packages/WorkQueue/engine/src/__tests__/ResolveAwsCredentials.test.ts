import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const credentialEngine = vi.hoisted(() => ({
    Config: vi.fn(async () => undefined),
    getCredentialById: vi.fn(),
    getCredential: vi.fn(),
}));

const assumeRole = vi.hoisted(() => vi.fn(() => async () => ({ accessKeyId: 'ASIA', secretAccessKey: 's', sessionToken: 't' })));

vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: credentialEngine } }));
vi.mock('@aws-sdk/credential-providers', () => ({ fromTemporaryCredentials: assumeRole }));

import { ResolveAwsCredentials, ToAwsCredentials } from '../aws/ResolveAwsCredentials';

const USER = { ID: 'user-1' } as UserInfo;
const CREDENTIAL_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
    credentialEngine.Config.mockClear();
    credentialEngine.getCredentialById.mockReset();
    credentialEngine.getCredential.mockReset();
});

describe('ToAwsCredentials', () => {
    it('maps static keys, with an optional session token', () => {
        expect(ToAwsCredentials({ AccessKeyId: 'AKIA', SecretAccessKey: 'secret' }, 'us-east-1')).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
        expect(ToAwsCredentials({ AccessKeyId: 'ASIA', SecretAccessKey: 's', SessionToken: 't' }, 'us-east-1')).toEqual({ accessKeyId: 'ASIA', secretAccessKey: 's', sessionToken: 't' });
    });

    it('maps a role ARN to an assume-role provider and rejects incomplete values', () => {
        expect(typeof ToAwsCredentials({ RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue', ExternalId: 'x' }, 'eu-west-2')).toBe('function');
        expect(() => ToAwsCredentials({ AccessKeyId: 'AKIA' }, 'eu-west-2')).toThrow('AccessKeyId and SecretAccessKey, or RoleArn');
    });

    it('gives the assume-role provider the transport region (no AWS_REGION outside AWS)', () => {
        ToAwsCredentials({ RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue' }, 'eu-west-2');
        expect(assumeRole).toHaveBeenLastCalledWith({
            params: { RoleArn: 'arn:aws:iam::123456789012:role/mj-work-queue', RoleSessionName: 'mj-work-queue' },
            clientConfig: { region: 'eu-west-2' },
        });
    });
});

describe('ResolveAwsCredentials', () => {
    it('uses the ambient identity when no credential is configured', async () => {
        expect(await ResolveAwsCredentials(null, 'us-east-1', USER)).toBeUndefined();
        expect(credentialEngine.Config).not.toHaveBeenCalled();
    });

    it('loads and decrypts the configured credential under the WorkQueue subsystem', async () => {
        credentialEngine.getCredentialById.mockReturnValue({ ID: CREDENTIAL_ID, Name: 'AWS Work Queue' });
        credentialEngine.getCredential.mockResolvedValue({ values: { AccessKeyId: 'AKIA', SecretAccessKey: 'secret' } });
        expect(await ResolveAwsCredentials(CREDENTIAL_ID, 'us-east-1', USER)).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
        expect(credentialEngine.Config).toHaveBeenCalledWith(false, USER);
        expect(credentialEngine.getCredential).toHaveBeenCalledWith('AWS Work Queue', { credentialId: CREDENTIAL_ID, contextUser: USER, subsystem: 'WorkQueue' });
    });

    it('fails clearly when the credential does not exist', async () => {
        credentialEngine.getCredentialById.mockReturnValue(undefined);
        await expect(ResolveAwsCredentials(CREDENTIAL_ID, 'us-east-1', USER)).rejects.toThrow(`Credential ${CREDENTIAL_ID} was not found`);
    });
});
