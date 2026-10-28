import { describe, it, expect } from 'vitest';
import {
  AppendDirectoryPreset,
  BuildBackupUrlList,
  DeriveContainerUrl,
  FirstBackupUrl,
  FormatBytes,
  IsSeededAwaitingSource,
  ProgressLinesFromEvents,
  ReadSeedTablesFromEvents,
  ReadSeededJobID,
  StepForSeedState,
  SummarizeArchiveSeed,
  ReadExternalDataSourceID,
  SummarizeBootstrapRun,
  TrimTrailingChars,
} from '../Integration/services/backup-source.helpers';

describe('backup-source helpers', () => {
  describe('ProgressLinesFromEvents', () => {
    it('keeps run and stage events with their stage and message, and drops heartbeats', () => {
      const lines = ProgressLinesFromEvents([
        { Seq: 1, Ts: 't1', EventType: 'run.start', Message: 'SQL Server backup bootstrap started' },
        { Seq: 2, Ts: 't2', EventType: 'stage.start', Stage: 'Restore', Message: 'Restoring into [MJ_Staging]' },
        { Seq: 3, Ts: 't3', EventType: 'heartbeat', Stage: 'Restore', Message: '40%' },
        { Seq: 4, Ts: 't4', EventType: 'stage.error', Stage: 'Load Customer', Message: 'disk full' },
        { Seq: 5, Ts: 't5', EventType: 'warning', Level: 'warn', Stage: 'Load Orders', Message: 'slow' },
      ]);
      expect(lines).toEqual([
        { Seq: 1, Ts: 't1', Stage: 'Run', Message: 'SQL Server backup bootstrap started', Level: 'info' },
        { Seq: 2, Ts: 't2', Stage: 'Restore', Message: 'Restoring into [MJ_Staging]', Level: 'info' },
        { Seq: 4, Ts: 't4', Stage: 'Load Customer', Message: 'disk full', Level: 'error' },
        { Seq: 5, Ts: 't5', Stage: 'Load Orders', Message: 'slow', Level: 'warn' },
      ]);
    });
  });

  describe('SummarizeBootstrapRun', () => {
    const run = { RunID: 'bootstrap-1', IsInFlight: false, Success: true, ExitReason: 'completed', LatestMessage: 'done', DurationMs: 7200000 };

    it('reads the outputs from the terminal Summary stage event of a completed run', () => {
      const summary = SummarizeBootstrapRun(run, [
        { Seq: 1, Ts: 't', EventType: 'stage.complete', Stage: 'Load Customer', DataJSON: '{"ignored":true}' },
        { Seq: 2, Ts: 't', EventType: 'stage.complete', Stage: 'Summary', Message: 'Successfully bootstrapped 2 table(s)', DataJSON: JSON.stringify({ BackupStartDate: '2026-10-26T01:00:00.000Z', StagingDatabaseName: 'MJ_Staging', TablesProcessed: 2, TotalRowsTransferred: 1500, DurationSeconds: 7201, StagingDatabaseDropped: 1 }) },
        { Seq: 3, Ts: 't', EventType: 'run.complete', Message: 'done' },
      ]);
      expect(summary).toEqual({
        Success: true,
        Message: 'Successfully bootstrapped 2 table(s)',
        RunID: 'bootstrap-1',
        BackupStartDate: '2026-10-26T01:00:00.000Z',
        StagingDatabaseName: 'MJ_Staging',
        TablesProcessed: 2,
        TotalRowsTransferred: 1500,
        DurationSeconds: 7201,
        StagingDatabaseDropped: true,
      });
    });

    it('falls back to the run duration when no Summary event was recorded', () => {
      expect(SummarizeBootstrapRun(run, []).DurationSeconds).toBe(7200);
    });

    it('reports a failed run with its last error', () => {
      const failed = { ...run, Success: false, ExitReason: 'failed', LatestMessage: 'Bootstrap failed' };
      const summary = SummarizeBootstrapRun(failed, [], ['[Restore] Cannot open backup device']);
      expect(summary.Success).toBe(false);
      expect(summary.Message).toBe('[Restore] Cannot open backup device');
      expect(summary.RunID).toBe('bootstrap-1');
    });
  });

  describe('ReadExternalDataSourceID', () => {
    it('reads the externalDataSourceID key from the configuration JSON', () => {
      expect(ReadExternalDataSourceID('{"externalDataSourceID":" DS-1 "}')).toBe('DS-1');
      expect(ReadExternalDataSourceID('{"externalDataSourceID":"ds-1","other":1}')).toBe('ds-1');
    });

    it('returns undefined for missing, blank, non-JSON or key-less configuration', () => {
      expect(ReadExternalDataSourceID(null)).toBeUndefined();
      expect(ReadExternalDataSourceID('')).toBeUndefined();
      expect(ReadExternalDataSourceID('not json')).toBeUndefined();
      expect(ReadExternalDataSourceID('{"schedule":"daily"}')).toBeUndefined();
      expect(ReadExternalDataSourceID('{"externalDataSourceID":""}')).toBeUndefined();
      expect(ReadExternalDataSourceID('[1,2]')).toBeUndefined();
    });
  });

  describe('TrimTrailingChars', () => {
    it('strips only the trailing run of the given characters', () => {
      expect(TrimTrailingChars('https://x/c///', '/')).toBe('https://x/c');
      expect(TrimTrailingChars('C:\\a\\b\\', '\\/')).toBe('C:\\a\\b');
      expect(TrimTrailingChars('a, b, ', ', ')).toBe('a, b');
      expect(TrimTrailingChars('', '/')).toBe('');
      expect(TrimTrailingChars('///', '/')).toBe('');
    });
  });

  describe('AppendDirectoryPreset', () => {
    it('starts an entry ending in the directory separator for the user to complete', () => {
      expect(AppendDirectoryPreset('', '/var/opt/mssql/backup')).toBe('/var/opt/mssql/backup/');
      expect(AppendDirectoryPreset('   ', 'C:\\SQLBackups')).toBe('C:\\SQLBackups\\');
      expect(AppendDirectoryPreset('', 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup\\')).toBe('C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup\\');
    });

    it('appends a new entry after existing paths instead of replacing them', () => {
      expect(AppendDirectoryPreset('/backups/db_1.bak', '/backups')).toBe('/backups/db_1.bak, /backups/');
      expect(AppendDirectoryPreset('/backups/db_1.bak, ', '/var/opt/mssql/backup')).toBe('/backups/db_1.bak, /var/opt/mssql/backup/');
    });
  });

  describe('FormatBytes', () => {
    it('formats whole units without trailing zeros and fractions to two decimals', () => {
      expect(FormatBytes(0)).toBe('0 B');
      expect(FormatBytes(512)).toBe('512 B');
      expect(FormatBytes(2048)).toBe('2 KB');
      expect(FormatBytes(1536)).toBe('1.5 KB');
      expect(FormatBytes(1073741824)).toBe('1 GB');
      expect(FormatBytes(26628587520)).toBe('24.8 GB');
    });

    it('treats negative and non-finite input as zero', () => {
      expect(FormatBytes(-5)).toBe('0 B');
      expect(FormatBytes(Number.NaN)).toBe('0 B');
    });
  });

  describe('DeriveContainerUrl', () => {
    it('returns origin plus the container segment of a blob URL', () => {
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net/backups/db.bak')).toBe('https://acct.blob.core.windows.net/backups');
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net/backups/2026/db_1.bak ')).toBe('https://acct.blob.core.windows.net/backups');
    });

    it('returns undefined for a local path, a bare host, or garbage', () => {
      expect(DeriveContainerUrl('/var/opt/mssql/backup/db.bak')).toBeUndefined();
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net')).toBeUndefined();
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net/')).toBeUndefined();
      expect(DeriveContainerUrl('http://[bad')).toBeUndefined();
    });
  });

  describe('FirstBackupUrl', () => {
    it('returns the first trimmed entry of a comma-separated list', () => {
      expect(FirstBackupUrl(' https://a/b/1.bak , https://a/b/2.bak')).toBe('https://a/b/1.bak');
      expect(FirstBackupUrl('')).toBe('');
    });
  });

  describe('BuildBackupUrlList', () => {
    it('prefixes each blob name with the container URL, trimming trailing slashes', () => {
      expect(BuildBackupUrlList('https://acct.blob.core.windows.net/backups/', ['a.bak', 'sub/b.bak']))
        .toBe('https://acct.blob.core.windows.net/backups/a.bak, https://acct.blob.core.windows.net/backups/sub/b.bak');
    });

    it('passes names through when no container is known and yields an empty string for no names', () => {
      expect(BuildBackupUrlList('', ['a.bak'])).toBe('a.bak');
      expect(BuildBackupUrlList('https://x/c', [])).toBe('');
    });
  });
});

describe('archive seed helpers', () => {
  describe('StepForSeedState', () => {
    it.each([
      ['Created', false, 2], ['Restoring', false, 2], ['Discovering', false, 2],
      ['AwaitingSelection', true, 3],
      ['Building', true, 4], ['Mapping', true, 4], ['Loading', true, 4], ['Seeding', true, 4],
      ['AwaitingCleanupDecision', true, 5], ['Done', true, 6],
      ['Failed', true, 4], ['Failed', false, 2],
    ])('maps %s (hasTables=%s) to step %i', (state, hasTables, step) => {
      expect(StepForSeedState(state, hasTables)).toBe(step);
    });
  });

  describe('ReadSeedTablesFromEvents', () => {
    const tables = [{ Name: 'dbo.A', ColumnCount: 2, HasPrimaryKey: true }];
    it('reads the Tables stage event tables', () => {
      const events = [
        { Seq: 1, Ts: 't', EventType: 'stage.complete', Stage: 'Restore' },
        { Seq: 2, Ts: 't', EventType: 'stage.complete', Stage: 'Tables', DataJSON: JSON.stringify({ tables }) },
      ];
      expect(ReadSeedTablesFromEvents(events)).toEqual(tables);
    });
    it('is undefined without a Tables event or on bad JSON', () => {
      expect(ReadSeedTablesFromEvents([])).toBeUndefined();
      expect(ReadSeedTablesFromEvents([{ Seq: 1, Ts: 't', EventType: 'stage.complete', Stage: 'Tables', DataJSON: 'nope' }])).toBeUndefined();
    });
  });

  describe('ReadSeededJobID / IsSeededAwaitingSource', () => {
    const config = JSON.stringify({ seededFromBackup: { jobID: 'job-1' } });
    it('reads the job id', () => {
      expect(ReadSeededJobID(config)).toBe('job-1');
      expect(ReadSeededJobID('{}')).toBeUndefined();
      expect(ReadSeededJobID('bad')).toBeUndefined();
      expect(ReadSeededJobID(null)).toBeUndefined();
    });
    it('is awaiting only when seeded and Disabled', () => {
      expect(IsSeededAwaitingSource(config, 'Disabled')).toBe(true);
      expect(IsSeededAwaitingSource(config, 'Active')).toBe(false);
      expect(IsSeededAwaitingSource('{}', 'Disabled')).toBe(false);
      expect(IsSeededAwaitingSource(undefined, 'Disabled')).toBe(false);
    });
  });

  describe('SummarizeArchiveSeed', () => {
    it('summarizes a successful seed', () => {
      const res = SummarizeArchiveSeed({ TablesProcessed: 3, TotalRowsTransferred: 90, DurationSeconds: 12, StagingDatabaseDropped: true }, undefined);
      expect(res).toMatchObject({ Success: true, TablesProcessed: 3, TotalRowsTransferred: 90, DurationSeconds: 12, StagingDatabaseDropped: true });
    });
    it('reports the error on failure', () => {
      expect(SummarizeArchiveSeed(undefined, 'boom')).toEqual({ Success: false, Message: 'boom' });
    });
  });
});
