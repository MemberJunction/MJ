import { DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import { ServiceBusClient, type ServiceBusClientOptions } from '@azure/service-bus';
import type { AzureTransportConfig } from '../config';

/** Connection string or Azure TokenCredential. Undefined uses DefaultAzureCredential (Managed Identity / env / CLI). */
export type AzureCredentialsOption = TokenCredential | { ConnectionString: string };

export function IsConnectionStringCredential(credentials?: AzureCredentialsOption): credentials is { ConnectionString: string } {
    return typeof credentials === 'object' && credentials !== null && 'ConnectionString' in credentials && typeof credentials.ConnectionString === 'string';
}

function buildClientOptions(config: AzureTransportConfig): ServiceBusClientOptions | undefined {
    if (!config.Endpoint && !config.UseEmulator) {
        return undefined;
    }
    return {
        ...(config.Endpoint ? { customEndpointAddress: config.Endpoint } : {}),
    };
}

export function CreateServiceBusClient(config: AzureTransportConfig, credentials?: AzureCredentialsOption): ServiceBusClient {
    const options = buildClientOptions(config);
    if (IsConnectionStringCredential(credentials)) {
        return new ServiceBusClient(credentials.ConnectionString, options);
    }
    const namespace = config.Namespace ?? config.Endpoint ?? '';
    const tokenCredential: TokenCredential = credentials ?? new DefaultAzureCredential();
    return new ServiceBusClient(namespace, tokenCredential, options);
}
