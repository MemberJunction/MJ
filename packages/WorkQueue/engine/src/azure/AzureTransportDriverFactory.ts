import { RegisterClass } from '@memberjunction/global';
import { AzureTransportDriver, ParseAzureTransportConfig } from '@memberjunction/work-queue-azure';
import type { TransportRow } from '@memberjunction/work-queue-base';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';
import { ResolveAzureCredentials } from './ResolveAzureCredentials';

/** Resolves MJ: Work Queue Transports rows with DriverClass 'Azure' to an Azure Service Bus driver. */
@RegisterClass(BaseTransportDriverFactory, 'Azure')
export class AzureTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        const config = ParseAzureTransportConfig(transport.Configuration);
        const credentials = await ResolveAzureCredentials(transport.CredentialID, deps.ContextUser);
        return AzureTransportDriver.Create(config, credentials);
    }
}
