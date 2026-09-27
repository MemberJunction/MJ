import { ClientSecretCredential, DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import { ServiceBusAdministrationClient, ServiceBusClient } from '@azure/service-bus';
import type { AzureTransportConfig } from '../config';

/** A token credential, or undefined for DefaultAzureCredential (managed identity, environment, CLI, …). */
export type AzureCredentialOption = TokenCredential | undefined;

/** Values an MJ credential holds for a service principal. */
export interface AzureServicePrincipalValues {
    TenantID?: string;
    ClientID?: string;
    ClientSecret?: string;
}

/** ClientSecretCredential from MJ credential values, or undefined (default chain) when none are set. */
export function CreateAzureCredential(values: AzureServicePrincipalValues): AzureCredentialOption {
    if (values.TenantID && values.ClientID && values.ClientSecret) {
        return new ClientSecretCredential(values.TenantID, values.ClientID, values.ClientSecret);
    }
    return undefined;
}

export function CreateServiceBusClient(config: AzureTransportConfig, credential?: AzureCredentialOption): ServiceBusClient {
    return new ServiceBusClient(config.FullyQualifiedNamespace, credential ?? new DefaultAzureCredential());
}

export function CreateServiceBusAdminClient(config: AzureTransportConfig, credential?: AzureCredentialOption): ServiceBusAdministrationClient {
    return new ServiceBusAdministrationClient(config.FullyQualifiedNamespace, credential ?? new DefaultAzureCredential());
}
