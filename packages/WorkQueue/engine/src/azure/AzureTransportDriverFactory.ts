import { RegisterClass } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { AzureTransportDriver, ParseAzureTransportConfig } from '@memberjunction/work-queue-azure';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';
import { ResolveAzureCredential } from './ResolveAzureCredential';

/** Resolves MJ: Work Queue Transports rows with DriverClass 'Azure' to a Service Bus driver. Registered by importing `./azure`. */
@RegisterClass(BaseTransportDriverFactory, 'Azure')
export class AzureTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        const config = ParseAzureTransportConfig(transport.Configuration);
        const credential = await ResolveAzureCredential(transport.CredentialID, deps.ContextUser);
        return AzureTransportDriver.Create(config, credential);
    }
}
