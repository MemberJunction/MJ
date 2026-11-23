import { RegisterClass } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import { GcpTransportDriver, ParseGcpTransportConfig } from '@memberjunction/work-queue-gcp';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';
import { ResolveGcpCredentials } from './ResolveGcpCredentials';

/** Resolves MJ: Work Queue Transports rows with DriverClass 'GCP' to a Google Cloud Pub/Sub driver. */
@RegisterClass(BaseTransportDriverFactory, 'GCP')
export class GcpTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        const config = ParseGcpTransportConfig(transport.Configuration);
        const credentials = await ResolveGcpCredentials(transport.CredentialID, deps.ContextUser);
        return GcpTransportDriver.Create(config, credentials);
    }
}
