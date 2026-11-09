import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { AwsTransportDriver, SdkSnsGateway, SdkSqsGateway } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { AWSTransportDriverFactory } from '../aws/AWSTransportDriverFactory';
import { RecordingExecutor, TestDeps } from './fakes';

function transport(configuration: string | null): TransportRow {
    return { ...TRANSPORT_ROW_FIXTURE, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: configuration };
}

describe('AWSTransportDriverFactory', () => {
    it('is registered under the AWS driver class once its module is imported', () => {
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'AWS');
        expect(resolved.Resolved).toBe(true);
        expect(resolved.Instance).toBeInstanceOf(AWSTransportDriverFactory);
    });

    it('creates an SDK-backed AWS driver from the transport configuration', async () => {
        const driver = await new AWSTransportDriverFactory().Create(transport('{"Region":"us-east-1","Endpoint":"http://localhost:4566"}'), TestDeps(new RecordingExecutor()));
        expect(driver).toBeInstanceOf(AwsTransportDriver);
        expect(driver.Name).toBe('AWS');
        if (!(driver instanceof AwsTransportDriver)) {
            throw new Error('expected an AwsTransportDriver');
        }
        expect(driver.Sns).toBeInstanceOf(SdkSnsGateway);
        expect(driver.Sqs).toBeInstanceOf(SdkSqsGateway);
    });

    it('rejects a transport without a region', async () => {
        await expect(new AWSTransportDriverFactory().Create(transport('{}'), TestDeps(new RecordingExecutor()))).rejects.toBeInstanceOf(WorkQueueConfigurationError);
    });
});
