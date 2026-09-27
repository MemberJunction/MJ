import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { AzureTransportDriver, SdkServiceBusAdminGateway, SdkServiceBusGateway } from '@memberjunction/work-queue-azure';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { AzureTransportDriverFactory } from '../azure/AzureTransportDriverFactory';
import { RecordingExecutor, TestDeps } from './fakes';

function transport(configuration: string | null): TransportRow {
    return { ...TRANSPORT_ROW_FIXTURE, ID: 'A0000000-0000-0000-0000-000000000002', Name: 'Azure-test', DriverClass: 'Azure', Configuration: configuration };
}

describe('AzureTransportDriverFactory', () => {
    it('is registered under the Azure driver class once its module is imported', () => {
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'Azure');
        expect(resolved.Resolved).toBe(true);
        expect(resolved.Instance).toBeInstanceOf(AzureTransportDriverFactory);
    });

    it('creates an SDK-backed Azure driver from the transport configuration', async () => {
        const driver = await new AzureTransportDriverFactory().Create(transport('{"FullyQualifiedNamespace":"contoso.servicebus.windows.net"}'), TestDeps(new RecordingExecutor()));
        expect(driver).toBeInstanceOf(AzureTransportDriver);
        expect(driver.Name).toBe('Azure');
        if (!(driver instanceof AzureTransportDriver)) {
            throw new Error('expected an AzureTransportDriver');
        }
        expect(driver.Bus).toBeInstanceOf(SdkServiceBusGateway);
        expect(driver.Admin).toBeInstanceOf(SdkServiceBusAdminGateway);
    });

    it('rejects a transport without a namespace', async () => {
        await expect(new AzureTransportDriverFactory().Create(transport('{}'), TestDeps(new RecordingExecutor()))).rejects.toBeInstanceOf(WorkQueueConfigurationError);
    });
});
