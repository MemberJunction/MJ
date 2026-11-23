import type { UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { GcpCredentialsOption } from '@memberjunction/work-queue-gcp';

export interface GcpCredentialValues {
    ClientEmail?: string;
    PrivateKey?: string;
    KeyFilename?: string;
    CredentialsJson?: string;
    ProjectId?: string;
}

/** Maps decrypted MJ: Credentials values into a @memberjunction/work-queue-gcp GcpCredentialsOption. */
export function ToGcpCredentials(values: GcpCredentialValues): GcpCredentialsOption {
    const projectId = values.ProjectId && values.ProjectId.trim() !== '' ? values.ProjectId.trim() : undefined;
    if (values.CredentialsJson && values.CredentialsJson.trim() !== '') {
        return { CredentialsJson: values.CredentialsJson, ...(projectId ? { ProjectId: projectId } : {}) };
    }
    if (values.ClientEmail && values.ClientEmail.trim() !== '' && values.PrivateKey && values.PrivateKey.trim() !== '') {
        return {
            ClientEmail: values.ClientEmail.trim(),
            PrivateKey: values.PrivateKey,
            ...(projectId ? { ProjectId: projectId } : {}),
        };
    }
    if (values.KeyFilename && values.KeyFilename.trim() !== '') {
        return { KeyFilename: values.KeyFilename.trim(), ...(projectId ? { ProjectId: projectId } : {}) };
    }
    throw new WorkQueueConfigurationError(
        'GCP credential values must contain CredentialsJson, ClientEmail and PrivateKey, or KeyFilename',
    );
}

/** Null credential = Application Default Credentials (Workload Identity / GCE metadata / gcloud ADC). Otherwise decrypts the MJ credential. */
export async function ResolveGcpCredentials(
    credentialID: string | null,
    contextUser: UserInfo,
): Promise<GcpCredentialsOption | undefined> {
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
    return ToGcpCredentials(resolved.values);
}
