import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW } from '@memberjunction/work-queue-base/testing';
import { DriverCacheKey, ResolveDriverFactory } from '../engine/driverResolution';
import { DatabaseTransportDriverFactory } from '../transports/database/DatabaseTransportDriverFactory';

describe('DriverCacheKey', () => {
    it('changes when anything that shapes the driver changes', () => {
        const base = DriverCacheKey(TRANSPORT_ROW);
        expect(DriverCacheKey({ ...TRANSPORT_ROW })).toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, Configuration: '{"Region":"x"}' })).not.toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, CredentialID: 'C1' })).not.toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, Status: 'Disabled' })).not.toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, Name: 'Renamed' })).toBe(base);
    });
});

describe('ResolveDriverFactory', () => {
    it('resolves the registered Database factory', () => {
        expect(ResolveDriverFactory('Database')).toBeInstanceOf(DatabaseTransportDriverFactory);
    });

    it('names the registered keys when a driver class is unknown', () => {
        expect(() => ResolveDriverFactory('Nope')).toThrow(WorkQueueConfigurationError);
        expect(() => ResolveDriverFactory('Nope')).toThrow("Registered: 'Database'");
    });
});
