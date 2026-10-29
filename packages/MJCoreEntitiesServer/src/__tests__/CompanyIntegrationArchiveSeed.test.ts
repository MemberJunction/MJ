/**
 * Deleting a connection that an archive seed created. The seed's job row in `MJ: RSU Pending Works`
 * carries a foreign key to the connection, so a plain delete fails on the constraint and the
 * Integrations dashboard could never remove a failed seed. The server subclass removes the job rows
 * first (refusing while the seed still runs) and the seed's data source after; these tests pin the
 * pure decisions and that the override exists.
 */
import { describe, expect, it } from 'vitest';
import { IsArchiveSeedInProgress, ReadArchiveSeedConfiguration } from '../custom/CompanyIntegrationArchiveSeed';
import { MJCompanyIntegrationEntityServer } from '../custom/MJCompanyIntegrationEntityServer.server';

function payload(state: string | undefined, workType = 'archive-seed'): string {
    return JSON.stringify({ WorkType: workType, CompanyIntegrationID: 'ci-1', ArchiveSeed: state ? { State: state } : undefined });
}

describe('ReadArchiveSeedConfiguration', () => {
    it('reads the job and data source of a seeded connection', () => {
        const configuration = JSON.stringify({ externalDataSourceID: 'eds-1', seededFromBackup: { jobID: 'job-1', backupDatabaseName: 'MJ_TRG' } });
        expect(ReadArchiveSeedConfiguration(configuration)).toEqual({ JobID: 'job-1', ExternalDataSourceID: 'eds-1' });
    });

    it('reports no data source when none is recorded', () => {
        expect(ReadArchiveSeedConfiguration(JSON.stringify({ seededFromBackup: { jobID: 'job-1' } }))).toEqual({ JobID: 'job-1', ExternalDataSourceID: null });
        expect(ReadArchiveSeedConfiguration(JSON.stringify({ externalDataSourceID: '', seededFromBackup: { jobID: 'job-1' } }))?.ExternalDataSourceID).toBeNull();
    });

    it.each([
        ['null', null],
        ['empty', ''],
        ['not JSON', '{nope'],
        ['an array', '[1]'],
        ['a live connection', JSON.stringify({ externalDataSourceID: 'eds-9' })],
        ['an empty job id', JSON.stringify({ seededFromBackup: { jobID: ' ' } })],
        ['a non-string job id', JSON.stringify({ seededFromBackup: { jobID: 7 } })],
    ])('is undefined for %s', (_label, configuration) => {
        expect(ReadArchiveSeedConfiguration(configuration)).toBeUndefined();
    });
});

describe('IsArchiveSeedInProgress', () => {
    it.each(['Created', 'Restoring', 'AwaitingSelection', 'Building', 'Mapping', 'Loading', 'AwaitingCleanupDecision'])(
        'is true for a Pending archive-seed row in %s',
        state => {
            expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload(state) })).toBe(true);
        },
    );

    it.each(['Done', 'Failed'])('is false for a Pending row whose seed is %s', state => {
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload(state) })).toBe(false);
    });

    it.each(['Completed', 'Failed', 'Completed      '])('is false for a row whose store status is %s', status => {
        expect(IsArchiveSeedInProgress({ Status: status, PayloadJSON: payload('Restoring') })).toBe(false);
    });

    it('is false for other pending work of the connection', () => {
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload('Restoring', 'apply-objects') })).toBe(false);
    });

    it('treats an unreadable or state-less Pending payload as running', () => {
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: '{broken' })).toBe(true);
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: null })).toBe(true);
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload(undefined) })).toBe(true);
    });
});

describe('MJCompanyIntegrationEntityServer.Delete', () => {
    it('overrides Delete so a seeded connection removes its job rows and data source', () => {
        const own = Object.getOwnPropertyDescriptor(MJCompanyIntegrationEntityServer.prototype, 'Delete');
        expect(own).toBeDefined();
        expect(typeof own?.value).toBe('function');
    });
});
