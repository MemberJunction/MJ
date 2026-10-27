import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BootstrapWizardComponent } from '../Integration/components/bootstrap-wizard/bootstrap-wizard.component';
import { ConnectionsComponent } from '../Integration/components/connections/connections.component';
import {
  IntegrationDataService,
  IntegrationSummary
} from '../Integration/services/integration-data.service';
import {
  MJCompanyIntegrationEntity,
  MJIntegrationSourceTypeEntity
} from '@memberjunction/core-entities';

describe('Bootstrap Wizard Review Fixes', () => {
  describe('Task 7: Exact SQL Server Source Type Matching in ConnectionsComponent', () => {
    const comp = Object.create(ConnectionsComponent.prototype) as ConnectionsComponent;

    function makeSummary(opts: {
      sourceTypeName?: string;
      driverClassName?: string;
      integrationName?: string;
    }): IntegrationSummary {
      return {
        Integration: {
          ID: 'ci-1',
          Name: opts.integrationName ?? 'Test Integration',
          Integration: opts.integrationName ?? 'Test Integration',
          DriverClassName: opts.driverClassName ?? null,
        } as unknown as MJCompanyIntegrationEntity,
        SourceType: opts.sourceTypeName
          ? ({ ID: 'st-1', Name: opts.sourceTypeName } as unknown as MJIntegrationSourceTypeEntity)
          : null,
        LatestRun: null,
        RecentRuns: [],
        StatusColor: 'gray',
        RelativeTime: 'Never',
        TotalRecordsSyncedToday: 0,
        TotalErrors: 0,
        DurationMs: null,
        Icon: null,
      };
    }

    it('returns true for Microsoft SQL Server source type', () => {
      const summary = makeSummary({ sourceTypeName: 'Microsoft SQL Server' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(true);
    });

    it('returns true for SQL Server (External)', () => {
      const summary = makeSummary({ sourceTypeName: 'SQL Server (External)' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(true);
    });

    it('returns true for SQLServerExternalDriver driver class', () => {
      const summary = makeSummary({ driverClassName: 'SQLServerExternalDriver' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(true);
    });

    it('returns true for MSSQL in integration name', () => {
      const summary = makeSummary({ integrationName: 'MSSQL Production Database' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(true);
    });

    it('returns false for PostgreSQL (External) even though it contains "SQL"', () => {
      const summary = makeSummary({ sourceTypeName: 'PostgreSQL (External)' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(false);
    });

    it('returns false for MySQL (External) even though it contains "SQL"', () => {
      const summary = makeSummary({ sourceTypeName: 'MySQL (External)' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(false);
    });

    it('returns false for Snowflake (External)', () => {
      const summary = makeSummary({ sourceTypeName: 'Snowflake (External)' });
      expect(comp.IsSqlServerIntegration(summary)).toBe(false);
    });

    it('returns false for null or undefined summary', () => {
      expect(comp.IsSqlServerIntegration(null)).toBe(false);
      expect(comp.IsSqlServerIntegration(undefined)).toBe(false);
    });
  });

  describe('Task 2 & 8: Angular Architecture & Naming in BootstrapWizardComponent', () => {
    function createWizard(): BootstrapWizardComponent {
      const wizard = Object.create(BootstrapWizardComponent.prototype) as BootstrapWizardComponent;
      wizard.IsOpen = true;
      wizard.CurrentStep = 1;
      wizard.SourceType = 'azure';
      wizard.BackupUrls = '';
      wizard.AuthMode = 'sas';
      wizard.SasToken = '';
      wizard.SelectedCredentialID = '';
      wizard.StagingDatabaseName = 'MJ_Staging_Test';
      wizard.DropStagingDbOnComplete = true;
      wizard.TruncateTargetBeforeLoad = false;
      wizard.ExecutionStatus = 'idle';
      wizard.DirectoryPresets = [
        { Label: 'Linux MSSQL Default', Path: '/var/opt/mssql/backup' },
        { Label: 'Windows MSSQL Default', Path: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup' },
        { Label: 'Windows C:\\SQLBackups', Path: 'C:\\SQLBackups' },
        { Label: 'Root /backups', Path: '/backups' }
      ];
      wizard.Closed = { emit: vi.fn() } as unknown as typeof wizard.Closed;
      (wizard as unknown as Record<string, unknown>)['cdr'] = { detectChanges: vi.fn() };
      return wizard;
    }

    it('extends BaseAngularComponent', () => {
      expect(BootstrapWizardComponent.prototype instanceof BaseAngularComponent).toBe(true);
    });

    it('has PascalCase properties on DirectoryPreset', () => {
      const wizard = createWizard();
      expect(wizard.DirectoryPresets[0].Label).toBe('Linux MSSQL Default');
      expect(wizard.DirectoryPresets[0].Path).toBe('/var/opt/mssql/backup');
    });

    it('does not mutate @Input() IsOpen on Close()', () => {
      const wizard = createWizard();
      wizard.IsOpen = true;
      wizard.Close();
      // IsOpen input should NOT have been mutated to false
      expect(wizard.IsOpen).toBe(true);
      expect(wizard.Closed.emit).toHaveBeenCalled();
    });

    it('RefreshLocalFiles resets verification state', () => {
      const wizard = createWizard();
      wizard.VerifiedBackupHeader = { Success: true, Message: 'Verified' };
      wizard.VerifyBackupError = 'Previous error';
      wizard.RefreshLocalFiles();
      expect(wizard.VerifiedBackupHeader).toBeNull();
      expect(wizard.VerifyBackupError).toBeNull();
    });

    it('ApplyDirectoryPreset appends path and refreshes state', () => {
      const wizard = createWizard();
      wizard.ApplyDirectoryPreset('/var/opt/mssql/backup');
      expect(wizard.BackupUrls).toBe('/var/opt/mssql/backup');
    });

    it('validates Step 1 correctly for local vs azure sources', () => {
      const wizard = createWizard();

      // Azure requires URLs, DB name, and Auth
      wizard.SourceType = 'azure';
      wizard.BackupUrls = '';
      expect(wizard.IsStep1Valid).toBe(false);

      wizard.BackupUrls = 'https://blob.core.windows.net/backups/db.bak';
      wizard.SasToken = 'sp=rl&sig=xyz';
      expect(wizard.IsStep1Valid).toBe(true);

      // Local requires URLs and DB name only (host auth is handled by SQL Server instance)
      wizard.SourceType = 'local';
      wizard.BackupUrls = '';
      expect(wizard.IsStep1Valid).toBe(false);

      wizard.BackupUrls = '/var/opt/mssql/backup/db.bak';
      expect(wizard.IsStep1Valid).toBe(true);
    });

    it('Task 9: defaults TruncateTargetBeforeLoad to false', () => {
      const wizard = createWizard();
      expect(wizard.TruncateTargetBeforeLoad).toBe(false);
    });
  });

  describe('Task 5: Output Params Fix in IntegrationDataService', () => {
    it('reads output params from result.Result array', async () => {
      const svc = new IntegrationDataService();
      vi.spyOn(svc as unknown as { lookupActionID: (name: string) => Promise<string> }, 'lookupActionID')
        .mockResolvedValue('action-123');

      // Mock action client result with outputs in Result array
      const mockRunAction = vi.fn().mockResolvedValue({
        Success: true,
        Message: 'Done',
        Result: [
          { Name: 'BackupStartDate', Value: '2026-10-26T00:00:00Z', Type: 'Output' },
          { Name: 'TotalRowsTransferred', Value: 1250000, Type: 'Output' },
          { Name: 'DurationSeconds', Value: 42, Type: 'Output' },
          { Name: 'StagingDatabaseDropped', Value: 'true', Type: 'Output' },
          { Name: 'TablesProcessed', Value: 5, Type: 'Output' },
        ],
        Params: [
          { Name: 'CompanyIntegrationID', Value: 'ci-1', Type: 'Input' },
          { Name: 'BackupUrls', Value: 'https://blob/backup.bak', Type: 'Input' },
        ]
      });

      (svc as unknown as { Provider: unknown }).Provider = {};
      const origGraphQLActionClient = await import('@memberjunction/graphql-dataprovider');
      vi.spyOn(origGraphQLActionClient, 'GraphQLActionClient').mockImplementation(class {
        RunAction = mockRunAction;
      } as unknown as typeof origGraphQLActionClient.GraphQLActionClient);

      const res = await svc.RunBootstrapFromBackup('ci-1', {
        BackupUrls: 'https://blob/backup.bak',
        TruncateTargetBeforeLoad: true,
      });

      expect(res.Success).toBe(true);
      expect(res.BackupStartDate).toBe('2026-10-26T00:00:00Z');
      expect(res.TotalRowsTransferred).toBe(1250000);
      expect(res.DurationSeconds).toBe(42);
      expect(res.StagingDatabaseDropped).toBe(true);
      expect(res.TablesProcessed).toBe(5);

      // Verify TruncateTargetBeforeLoad was passed to action params
      expect(mockRunAction).toHaveBeenCalledWith(
        'action-123',
        expect.arrayContaining([
          expect.objectContaining({ Name: 'TruncateTargetBeforeLoad', Value: 'true' })
        ])
      );
    });

    it('reads output params from result.Result object / ResultData', async () => {
      const svc = new IntegrationDataService();
      vi.spyOn(svc as unknown as { lookupActionID: (name: string) => Promise<string> }, 'lookupActionID')
        .mockResolvedValue('action-123');

      const mockRunAction = vi.fn().mockResolvedValue({
        Success: true,
        Message: 'Done',
        Result: {
          BackupStartDate: '2026-10-26T05:00:00Z',
          TotalRowsTransferred: 999999,
          DurationSeconds: 15,
          StagingDatabaseDropped: '1',
          TablesProcessed: 8,
        },
        Params: []
      });

      (svc as unknown as { Provider: unknown }).Provider = {};
      const origGraphQLActionClient = await import('@memberjunction/graphql-dataprovider');
      vi.spyOn(origGraphQLActionClient, 'GraphQLActionClient').mockImplementation(class {
        RunAction = mockRunAction;
      } as unknown as typeof origGraphQLActionClient.GraphQLActionClient);

      const res = await svc.RunBootstrapFromBackup('ci-1', {
        BackupUrls: 'https://blob/backup.bak',
      });

      expect(res.Success).toBe(true);
      expect(res.BackupStartDate).toBe('2026-10-26T05:00:00Z');
      expect(res.TotalRowsTransferred).toBe(999999);
      expect(res.DurationSeconds).toBe(15);
      expect(res.StagingDatabaseDropped).toBe(true);
      expect(res.TablesProcessed).toBe(8);
    });
  });

  describe('Task 3: InspectSQLServerBackup in IntegrationDataService', () => {
    it('invokes "Inspect SQL Server Backup" action and returns parsed header info', async () => {
      const svc = new IntegrationDataService();
      vi.spyOn(svc as unknown as { lookupActionID: (name: string) => Promise<string> }, 'lookupActionID')
        .mockResolvedValue('inspect-action-id');

      const mockRunAction = vi.fn().mockResolvedValue({
        Success: true,
        Message: 'Backup inspected successfully',
        Result: [
          { Name: 'DatabaseName', Value: 'AdventureWorks2022', Type: 'Output' },
          { Name: 'BackupStartDateUTC', Value: '2026-10-26T02:00:00Z', Type: 'Output' },
          { Name: 'SizeFormatted', Value: '24.8 GB', Type: 'Output' },
          { Name: 'Stripes', Value: 2, Type: 'Output' },
        ],
        Params: []
      });

      (svc as unknown as { Provider: unknown }).Provider = {};
      const origGraphQLActionClient = await import('@memberjunction/graphql-dataprovider');
      vi.spyOn(origGraphQLActionClient, 'GraphQLActionClient').mockImplementation(class {
        RunAction = mockRunAction;
      } as unknown as typeof origGraphQLActionClient.GraphQLActionClient);

      const res = await svc.InspectSQLServerBackup('ci-1', {
        BackupUrls: '/var/opt/mssql/backup/aw1.bak, /var/opt/mssql/backup/aw2.bak'
      });

      expect(res.Success).toBe(true);
      expect(res.DatabaseName).toBe('AdventureWorks2022');
      expect(res.BackupStartDateUTC).toBe('2026-10-26T02:00:00Z');
      expect(res.SizeFormatted).toBe('24.8 GB');
      expect(res.Stripes).toBe(2);
    });
  });

  describe('Task 4: ListAzureBackupBlobs in IntegrationDataService', () => {
    it('invokes "List Azure Backup Blobs" action and returns parsed blob list', async () => {
      const svc = new IntegrationDataService();
      vi.spyOn(svc as unknown as { lookupActionID: (name: string) => Promise<string> }, 'lookupActionID')
        .mockResolvedValue('list-blobs-action-id');

      const mockRunAction = vi.fn().mockResolvedValue({
        Success: true,
        Message: 'Listed 2 blobs',
        Result: {
          Blobs: [
            { Name: 'backup1.bak', SizeBytes: 1073741824, SizeFormatted: '1.00 GB', LastModified: '2026-10-26T00:00:00Z' },
            { Name: 'readme.txt', SizeBytes: 2048, SizeFormatted: '2.00 KB', LastModified: '2026-10-25T00:00:00Z' }
          ]
        },
        Params: []
      });

      (svc as unknown as { Provider: unknown }).Provider = {};
      const origGraphQLActionClient = await import('@memberjunction/graphql-dataprovider');
      vi.spyOn(origGraphQLActionClient, 'GraphQLActionClient').mockImplementation(class {
        RunAction = mockRunAction;
      } as unknown as typeof origGraphQLActionClient.GraphQLActionClient);

      const res = await svc.ListAzureBackupBlobs('ci-1', {
        ContainerUrl: 'https://myaccount.blob.core.windows.net/backups',
        SasToken: 'sp=rl&sig=xyz'
      });

      expect(res.Success).toBe(true);
      expect(res.Blobs.length).toBe(2);
      expect(res.Blobs[0].Name).toBe('backup1.bak');
      expect(res.Blobs[0].IsBak).toBe(true);
      expect(res.Blobs[1].Name).toBe('readme.txt');
      expect(res.Blobs[1].IsBak).toBe(false);
    });
  });
});
