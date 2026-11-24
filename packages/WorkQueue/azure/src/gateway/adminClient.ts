import { DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import { ServiceBusAdministrationClient } from '@azure/service-bus';
import type { AzureTransportConfig } from '../config';
import { IsConnectionStringCredential, type AzureCredentialsOption } from './serviceBusClient';

export function CreateServiceBusAdminClient(config: AzureTransportConfig, credentials?: AzureCredentialsOption): ServiceBusAdministrationClient {
    if (IsConnectionStringCredential(credentials)) {
        return new ServiceBusAdministrationClient(credentials.ConnectionString);
    }
    const namespace = config.Namespace ?? config.Endpoint ?? '';
    const tokenCredential: TokenCredential = credentials ?? new DefaultAzureCredential();
    return new ServiceBusAdministrationClient(namespace, tokenCredential);
}
