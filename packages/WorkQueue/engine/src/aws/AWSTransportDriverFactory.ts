import { RegisterClass } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { AwsTransportDriver, ParseAwsTransportConfig } from '@memberjunction/work-queue-aws';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';
import { ResolveAwsCredentials } from './ResolveAwsCredentials';

/** Resolves MJ: Work Queue Transports rows with DriverClass 'AWS' to an SNS/SQS driver. Registered by importing `./aws`. */
@RegisterClass(BaseTransportDriverFactory, 'AWS')
export class AWSTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        const config = ParseAwsTransportConfig(transport.Configuration);
        const credentials = await ResolveAwsCredentials(transport.CredentialID, config.Region, deps.ContextUser);
        return AwsTransportDriver.Create(config, credentials);
    }
}
