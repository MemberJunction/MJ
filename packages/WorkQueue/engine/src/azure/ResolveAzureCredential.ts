import type { UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import { CreateAzureCredential, type AzureCredentialOption, type AzureServicePrincipalValues } from '@memberjunction/work-queue-azure';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';

/** Null credential = DefaultAzureCredential (managed identity, environment, CLI). Otherwise decrypts the MJ credential and maps its values. */
export async function ResolveAzureCredential(credentialID: string | null, contextUser: UserInfo): Promise<AzureCredentialOption> {
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
    const values: AzureServicePrincipalValues = resolved.values;
    if (!values.TenantID || !values.ClientID || !values.ClientSecret) {
        throw new WorkQueueConfigurationError('Azure credential values must contain TenantID, ClientID and ClientSecret');
    }
    return CreateAzureCredential(values);
}
