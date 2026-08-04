/**
 * Unit tests for the pure schedule-reconciliation core of MJRecordProcessEntityServer:
 * decideScheduleAction (when to own vs. disable the Scheduled Job) and buildScheduledJobFields
 * (the field values written for an active recurrence).
 */

import { describe, it, expect } from 'vitest';
import { decideScheduleAction, buildScheduledJobFields } from '../custom/MJRecordProcessEntityServer.server';

describe('decideScheduleAction', () => {
    it("upserts when Active + ScheduleEnabled + a CronExpression", () => {
        expect(decideScheduleAction({ status: 'Active', scheduleEnabled: true, cronExpression: '0 0 * * *' })).toBe('upsert');
    });

    it('disables when ScheduleEnabled is false', () => {
        expect(decideScheduleAction({ status: 'Active', scheduleEnabled: false, cronExpression: '0 0 * * *' })).toBe('disable');
    });

    it('disables when there is no CronExpression', () => {
        expect(decideScheduleAction({ status: 'Active', scheduleEnabled: true, cronExpression: null })).toBe('disable');
        expect(decideScheduleAction({ status: 'Active', scheduleEnabled: true, cronExpression: '' })).toBe('disable');
    });

    it('disables when the process is not Active (Draft/Disabled)', () => {
        expect(decideScheduleAction({ status: 'Draft', scheduleEnabled: true, cronExpression: '0 0 * * *' })).toBe('disable');
        expect(decideScheduleAction({ status: 'Disabled', scheduleEnabled: true, cronExpression: '0 0 * * *' })).toBe('disable');
    });
});

describe('buildScheduledJobFields', () => {
    const base = {
        jobTypeID: 'JT-1',
        recordProcessName: 'Summarize Customers',
        cronExpression: '0 7 * * 1',
        timezone: 'America/New_York',
        recordProcessID: 'RP-9',
    };

    it('maps every Scheduled Job field, prefixing the name and embedding the RecordProcessID', () => {
        const f = buildScheduledJobFields(base);
        expect(f).toEqual({
            JobTypeID: 'JT-1',
            Name: 'Record Process: Summarize Customers',
            CronExpression: '0 7 * * 1',
            Timezone: 'America/New_York',
            Configuration: JSON.stringify({ RecordProcessID: 'RP-9' }),
            Status: 'Active',
        });
    });

    it('defaults Timezone to UTC when the process has none', () => {
        expect(buildScheduledJobFields({ ...base, timezone: null }).Timezone).toBe('UTC');
    });

    it('produces Configuration the driver can parse back to the RecordProcessID', () => {
        const f = buildScheduledJobFields(base);
        expect(JSON.parse(f.Configuration)).toEqual({ RecordProcessID: 'RP-9' });
    });
});
