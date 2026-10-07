import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { DatabaseTransportDriverFactory } from '../transports/database/DatabaseTransportDriverFactory';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { RecordingExecutor, TestDeps } from './fakes';

describe('DatabaseTransportDriverFactory', () => {
    it('is registered under the Database driver class', () => {
        const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'Database');
        expect(resolution.Resolved).toBe(true);
        expect(resolution.Instance).toBeInstanceOf(DatabaseTransportDriverFactory);
    });

    it('builds a Database driver from the deps executor', async () => {
        const executor = new RecordingExecutor();
        const driver = await new DatabaseTransportDriverFactory().Create(TRANSPORT_ROW_FIXTURE, TestDeps(executor));
        expect(driver).toBeInstanceOf(DatabaseTransportDriver);
        expect(driver.Name).toBe('Database');
    });
});

describe('MJWorkLogger', () => {
    it('implements every WorkLogger method without throwing', () => {
        const logger = new MJWorkLogger('[Test]');
        expect(() => {
            logger.Info('info', { a: 1 });
            logger.Warn('warn');
            logger.Error('error', new Error('boom'));
        }).not.toThrow();
    });
});
