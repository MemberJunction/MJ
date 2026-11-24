import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { GcpTransportDriver, SdkPubSubAdminGateway, SdkPubSubGateway } from '@memberjunction/work-queue-gcp';
import { GcpTransportDriverFactory } from '../gcp/GcpTransportDriverFactory';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { RecordingExecutor, TestDeps } from './fakes';

function transport(configuration: string | null): TransportRow {
    return {
        ...TRANSPORT_ROW_FIXTURE,
        ID: 'A0000000-0000-0000-0000-000000000003',
        Name: 'GCP-test',
        DriverClass: 'GCP',
        Configuration: configuration,
    };
}

describe('GcpTransportDriverFactory', () => {
    it('is registered under the GCP driver class once its module is imported', () => {
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'GCP');
        expect(resolved.Resolved).toBe(true);
        expect(resolved.Instance).toBeInstanceOf(GcpTransportDriverFactory);
    });

    it('creates an SDK-backed GCP driver from the transport configuration', async () => {
        const driver = await new GcpTransportDriverFactory().Create(
            transport('{"ProjectId":"mj-wq-test","ApiEndpoint":"localhost:8085","UseEmulator":true}'),
            TestDeps(new RecordingExecutor()),
        );
        expect(driver).toBeInstanceOf(GcpTransportDriver);
        expect(driver.Name).toBe('GCP');
        if (!(driver instanceof GcpTransportDriver)) {
            throw new Error('expected a GcpTransportDriver');
        }
        expect(driver.Gateway).toBeInstanceOf(SdkPubSubGateway);
        expect(driver.Admin).toBeInstanceOf(SdkPubSubAdminGateway);
        await driver.Close();
    });

    it('rejects a transport without a ProjectId', async () => {
        await expect(new GcpTransportDriverFactory().Create(transport('{}'), TestDeps(new RecordingExecutor())))
            .rejects.toBeInstanceOf(WorkQueueConfigurationError);
    });
});
