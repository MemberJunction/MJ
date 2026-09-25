import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import type { UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import type { AwsCredentialsOption } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';

export interface AwsCredentialValues {
    AccessKeyId?: string;
    SecretAccessKey?: string;
    SessionToken?: string;
    RoleArn?: string;
    ExternalId?: string;
}

/** `region` is the transport's region: the STS client behind assume-role needs it when AWS_REGION is not set. */
export function ToAwsCredentials(values: AwsCredentialValues, region: string): AwsCredentialsOption {
    if (values.AccessKeyId && values.SecretAccessKey) {
        return {
            accessKeyId: values.AccessKeyId,
            secretAccessKey: values.SecretAccessKey,
            ...(values.SessionToken ? { sessionToken: values.SessionToken } : {}),
        };
    }
    if (values.RoleArn) {
        return fromTemporaryCredentials({
            params: { RoleArn: values.RoleArn, RoleSessionName: 'mj-work-queue', ...(values.ExternalId ? { ExternalId: values.ExternalId } : {}) },
            clientConfig: { region },
        });
    }
    throw new WorkQueueConfigurationError('AWS credential values must contain AccessKeyId and SecretAccessKey, or RoleArn');
}

/** Null credential = SDK default chain (ambient role). Otherwise decrypts the MJ credential and maps its values. */
export async function ResolveAwsCredentials(credentialID: string | null, region: string, contextUser: UserInfo): Promise<AwsCredentialsOption> {
    if (credentialID === null) {
        return undefined;
    }
    const engine = CredentialEngine.Instance;
    await engine.Config(false, contextUser);
    const credential = engine.getCredentialById(credentialID);
    if (!credential) {
        throw new WorkQueueConfigurationError(`Credential ${credentialID} was not found`);
    }
    const resolved = await engine.getCredential<Record<string, string>>(credential.Name, { credentialId: credentialID, contextUser, subsystem: 'WorkQueue' });
    return ToAwsCredentials(resolved.values, region);
}
