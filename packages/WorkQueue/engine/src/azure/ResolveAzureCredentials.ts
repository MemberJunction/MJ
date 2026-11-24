import { ClientSecretCredential } from '@azure/identity';
import type { UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import type { AzureCredentialsOption } from '@memberjunction/work-queue-azure';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';

export interface AzureCredentialValues {
    ConnectionString?: string;
    TenantId?: string;
    ClientId?: string;
    ClientSecret?: string;
}

/** Maps decrypted MJ: Credentials values into an Azure ConnectionString or ClientSecretCredential. */
export function ToAzureCredentials(values: AzureCredentialValues): AzureCredentialsOption {
    if (values.ConnectionString && values.ConnectionString.trim() !== '') {
        return { ConnectionString: values.ConnectionString };
    }
    if (values.TenantId && values.ClientId && values.ClientSecret) {
        return new ClientSecretCredential(values.TenantId, values.ClientId, values.ClientSecret);
    }
    throw new WorkQueueConfigurationError(
        'Azure credential values must contain ConnectionString, or TenantId, ClientId, and ClientSecret',
    );
}

/** Null credential = DefaultAzureCredential (Managed Identity / env / CLI). Otherwise decrypts the MJ credential. */
export async function ResolveAzureCredentials(
    credentialID: string | null,
    contextUser: UserInfo,
): Promise<AzureCredentialsOption | undefined> {
    if (credentialID === null) {
        return undefined;
    }
    const engine = CredentialEngine.Instance;
    await engine.Config(false, contextUser);
    const credential = engine.GetCredentialById(credentialID);
    if (!credential) {
        throw new WorkQueueConfigurationError(`Credential ${credentialID} was not found`);
    }
    const resolved = await engine.GetCredential<Record<string, string>>(credential.Name, {
        credentialId: credentialID,
        contextUser,
        subsystem: 'WorkQueue',
    });
    return ToAzureCredentials(resolved.values);
}
