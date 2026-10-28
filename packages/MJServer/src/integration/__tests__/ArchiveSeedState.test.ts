import { describe, it, expect } from 'vitest';
import { ValidateIdentifier } from '@memberjunction/schema-engine';
import type { ArchiveSeedState, ArchiveSeedWork } from '@memberjunction/schema-engine';
import {
  ARCHIVE_SEED_APPLY_TIMEOUT_MS,
  ARCHIVE_SEED_CLEANUP_DECISION_TIMEOUT_MS,
  ArchiveSeedStartInput,
  BuildDropActionParams,
  BuildLoadActionParams,
  BuildRestoreActionParams,
  CanonicalizeTableSelection,
  DefaultStagingDatabaseName,
  NewArchiveSeedWork,
  RunManifestFor,
  Transition,
  ValidateArchiveSeedStartInput,
  ValidateTableSelection,
} from '../archiveSeed/ArchiveSeedState';

const NOW = new Date(2026, 9, 28, 14, 5);
const URL_INPUT: ArchiveSeedStartInput = {
  CompanyID: 'co-1',
  ConnectionName: 'My Conn-1',
  BackupUrls: 'https://acct.blob.core.windows.net/b/db.bak',
  StorageCredentialID: 'sc-1',
};

function ByName(params: { Name: string; Value?: unknown }[]): Record<string, unknown> {
  return Object.fromEntries(params.map(p => [p.Name, p.Value]));
}

function MakeWork(patch: Partial<ArchiveSeedWork> = {}): ArchiveSeedWork {
  return { ...NewArchiveSeedWork(URL_INPUT, 'u-1', 'i-1', NOW), ...patch };
}

describe('ArchiveSeedState', () => {
  it('exposes timeouts', () => {
    expect(ARCHIVE_SEED_APPLY_TIMEOUT_MS).toBe(30 * 60_000);
    expect(ARCHIVE_SEED_CLEANUP_DECISION_TIMEOUT_MS).toBe(24 * 60 * 60_000);
  });

  describe('ValidateArchiveSeedStartInput', () => {
    it('accepts a complete request', () => {
      expect(ValidateArchiveSeedStartInput(URL_INPUT)).toBeUndefined();
    });
    it('requires CompanyID, ConnectionName, BackupUrls', () => {
      expect(ValidateArchiveSeedStartInput({ ...URL_INPUT, CompanyID: ' ' })).toContain('CompanyID');
      expect(ValidateArchiveSeedStartInput({ ...URL_INPUT, ConnectionName: '' })).toContain('ConnectionName');
      expect(ValidateArchiveSeedStartInput({ ...URL_INPUT, BackupUrls: '' })).toContain('BackupUrls');
    });
    it('requires a credential for http(s) URLs', () => {
      const bad = { ...URL_INPUT, StorageCredentialID: undefined };
      expect(ValidateArchiveSeedStartInput(bad)).toContain('SasToken');
      expect(ValidateArchiveSeedStartInput({ ...bad, SasToken: 'sig' })).toBeUndefined();
      expect(ValidateArchiveSeedStartInput({ ...bad, BackupUrls: '/var/db.bak' })).toBeUndefined();
    });
  });

  describe('DefaultStagingDatabaseName', () => {
    it('has the documented shape and is a valid identifier', () => {
      const name = DefaultStagingDatabaseName('My Conn-1 extra long name', NOW);
      expect(name).toBe('MJ_Staging_MyConn1extra_202610281405');
      expect(() => ValidateIdentifier(name)).not.toThrow();
    });
  });

  describe('NewArchiveSeedWork', () => {
    it('starts in Created without a SAS token', () => {
      const work = NewArchiveSeedWork({ ...URL_INPUT, SasToken: 'secret' }, 'u-1', 'i-1', NOW);
      expect(work.State).toBe('Created');
      expect(work.StateChangedAt).toBe(NOW.toISOString());
      expect(work.UserID).toBe('u-1');
      expect(work.IntegrationID).toBe('i-1');
      expect(work.BatchSize).toBeGreaterThan(0);
      expect(JSON.stringify(work)).not.toContain('secret');
      expect(work.StagingDatabaseName).toMatch(/^MJ_Staging_/);
    });
    it('honors supplied staging name and batch size', () => {
      const work = NewArchiveSeedWork({ ...URL_INPUT, StagingDatabaseName: 'Stg', BatchSize: 5 }, 'u', 'i', NOW);
      expect(work.StagingDatabaseName).toBe('Stg');
      expect(work.BatchSize).toBe(5);
    });
  });

  describe('Transition', () => {
    const chain: ArchiveSeedState[] = ['Created', 'Restoring', 'Discovering', 'AwaitingSelection', 'Building',
      'Mapping', 'Loading', 'Seeding', 'AwaitingCleanupDecision', 'CleaningUp', 'Done'];
    it('allows every successor and stamps StateChangedAt', () => {
      const later = new Date(NOW.getTime() + 1000);
      for (let i = 0; i < chain.length - 1; i++) {
        const out = Transition(MakeWork({ State: chain[i] }), chain[i + 1], later);
        expect(out.State).toBe(chain[i + 1]);
        expect(out.StateChangedAt).toBe(later.toISOString());
      }
    });
    it('is pure and applies a patch', () => {
      const work = MakeWork();
      const out = Transition(work, 'Restoring', NOW, { CurrentRunID: 'r1' });
      expect(work.State).toBe('Created');
      expect(out.CurrentRunID).toBe('r1');
    });
    it('rejects skipping states', () => {
      expect(() => Transition(MakeWork({ State: 'Building' }), 'Loading', NOW))
        .toThrow('Invalid archive seed transition Building → Loading');
    });
    it('allows Failed from any non-terminal state only', () => {
      expect(Transition(MakeWork({ State: 'Restoring' }), 'Failed', NOW, { Error: 'x' }).State).toBe('Failed');
      expect(() => Transition(MakeWork({ State: 'Done' }), 'Failed', NOW)).toThrow();
      expect(() => Transition(MakeWork({ State: 'Failed' }), 'Failed', NOW)).toThrow();
    });
  });

  describe('ValidateTableSelection', () => {
    const work = MakeWork({ Tables: [{ Name: 'A', ColumnCount: 1, HasPrimaryKey: true }] });
    it('rejects empty and unknown', () => {
      expect(ValidateTableSelection(work, [])).toBe('Select at least one table');
      expect(ValidateTableSelection(work, ['A', 'Z'])).toContain('Z');
    });
    it('accepts known tables', () => {
      expect(ValidateTableSelection(work, ['A'])).toBeUndefined();
    });
    it('matches case-insensitively and canonicalizes to the discovered spelling', () => {
      const w = MakeWork({ Tables: [
        { Name: 'Customers', ColumnCount: 1, HasPrimaryKey: true },
        { Name: 'Orders', ColumnCount: 1, HasPrimaryKey: true },
      ] });
      expect(ValidateTableSelection(w, ['customers', 'ORDERS'])).toBeUndefined();
      expect(CanonicalizeTableSelection(w, ['customers', 'ORDERS'])).toEqual(['Customers', 'Orders']);
    });
    it('rejects a name repeated in two casings', () => {
      const w = MakeWork({ Tables: [{ Name: 'Customers', ColumnCount: 1, HasPrimaryKey: true }] });
      expect(ValidateTableSelection(w, ['Customers', 'customers'])).toBe("Duplicate table 'customers'");
    });
  });

  describe('action param builders', () => {
    const work = MakeWork({
      BackupStartDate: '2026-01-01T00:00:00.000Z', ContainerUrl: 'https://acct/c',
      TargetDataFileDirectory: '/d',
    });
    it('builds restore params, SasToken only when given', () => {
      const without = ByName(BuildRestoreActionParams(work, 'ci-1', 'run-1'));
      expect(without).toEqual({
        CompanyIntegrationID: 'ci-1', BackupUrls: work.BackupUrls, StagingDatabaseName: work.StagingDatabaseName,
        StorageCredentialID: 'sc-1', TargetDataFileDirectory: '/d', ProgressRunID: 'run-1',
      });
      expect(ByName(BuildRestoreActionParams(work, 'ci-1', 'run-1', 'sig')).SasToken).toBe('sig');
    });
    it('builds load params', () => {
      expect(ByName(BuildLoadActionParams(work, 'ci-1', 'run-2'))).toEqual({
        CompanyIntegrationID: 'ci-1', StagingDatabaseName: work.StagingDatabaseName,
        BackupStartDate: '2026-01-01T00:00:00.000Z', BatchSize: String(work.BatchSize),
        TruncateTargetBeforeLoad: 'false', DropStagingDbOnComplete: 'false',
        ContainerUrl: 'https://acct/c', ProgressRunID: 'run-2',
      });
      const bare = ByName(BuildLoadActionParams(MakeWork({ BackupStartDate: 'd' }), 'ci', 'r'));
      expect('ContainerUrl' in bare).toBe(false);
    });
    it('builds drop params', () => {
      expect(ByName(BuildDropActionParams(work, 'ci-1', 'run-3'))).toEqual({
        StagingDatabaseName: work.StagingDatabaseName, ContainerUrl: 'https://acct/c',
        CompanyIntegrationID: 'ci-1', ProgressRunID: 'run-3',
      });
    });
    it('makes every value a string Input param', () => {
      for (const p of BuildLoadActionParams(work, 'ci', 'r')) {
        expect(p.Type).toBe('Input');
        expect(typeof p.Value).toBe('string');
      }
    });
  });

  describe('RunManifestFor', () => {
    it('carries the run context', () => {
      const m = RunManifestFor(MakeWork(), 'job-1', 'ci-1', 'B', 'run-9', NOW);
      expect(m).toMatchObject({
        runID: 'run-9', runKind: 'Other', companyIntegrationID: 'ci-1', triggerType: 'Manual',
        startedAt: NOW.toISOString(), context: { kind: 'ArchiveSeed', jobID: 'job-1', phase: 'B' },
      });
    });
  });
});
