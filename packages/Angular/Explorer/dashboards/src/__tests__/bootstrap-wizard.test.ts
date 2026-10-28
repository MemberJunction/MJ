import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BootstrapWizardComponent } from '../Integration/components/bootstrap-wizard/bootstrap-wizard.component';
import {
  BackupSourcePickerComponent,
  BackupSourceValue,
  DefaultBackupSourceValue
} from '../Integration/components/backup-source-picker/backup-source-picker.component';
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
  describe('SQL Server detection in ConnectionsComponent is driven by the data source dialect, not names', () => {
    const comp = Object.create(ConnectionsComponent.prototype) as ConnectionsComponent;

    function makeSummary(opts: {
      dialect?: IntegrationSummary['DataSourceDialect'];
      sourceTypeName?: string;
      integrationName?: string;
    }): IntegrationSummary {
      return {
        Integration: {
          ID: 'ci-1',
          Name: opts.integrationName ?? 'Test Integration',
          Integration: opts.integrationName ?? 'Test Integration',
          DriverClassName: null,
        } as unknown as MJCompanyIntegrationEntity,
        SourceType: opts.sourceTypeName
          ? ({ ID: 'st-1', Name: opts.sourceTypeName } as unknown as MJIntegrationSourceTypeEntity)
          : null,
        DataSourceDialect: opts.dialect ?? null,
        DataSourceStatus: null,
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

    it('returns true for a T-SQL data source whatever the connection is called', () => {
      expect(comp.IsSqlServerIntegration(makeSummary({ dialect: 'tsql', integrationName: 'Warehouse Sync' }))).toBe(true);
      expect(comp.IsSqlServerIntegration(makeSummary({ dialect: 'tsql', sourceTypeName: 'Relational Database' }))).toBe(true);
    });

    it('returns false for every other dialect even when the name mentions SQL Server', () => {
      expect(comp.IsSqlServerIntegration(makeSummary({ dialect: 'pgsql', integrationName: 'SQL Server to Postgres' }))).toBe(false);
      expect(comp.IsSqlServerIntegration(makeSummary({ dialect: 'mysql', sourceTypeName: 'MySQL (External)' }))).toBe(false);
      expect(comp.IsSqlServerIntegration(makeSummary({ dialect: 'ansi', integrationName: 'Snowflake' }))).toBe(false);
      expect(comp.IsSqlServerIntegration(makeSummary({ dialect: 'mongo-ast' }))).toBe(false);
    });

    it('returns false for a connection with no external data source, whatever its name', () => {
      expect(comp.IsSqlServerIntegration(makeSummary({ integrationName: 'Microsoft SQL Server' }))).toBe(false);
      expect(comp.IsSqlServerIntegration(makeSummary({ sourceTypeName: 'SQL Server (External)' }))).toBe(false);
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
      wizard.Source = DefaultBackupSourceValue();
      wizard.StagingDatabaseName = 'MJ_Staging_Test';
      wizard.DropStagingDbOnComplete = true;
      wizard.TruncateTargetBeforeLoad = false;
      wizard.ExecutionStatus = 'idle';
      wizard.Closed = { emit: vi.fn() } as unknown as typeof wizard.Closed;
      (wizard as unknown as Record<string, unknown>)['cdr'] = { detectChanges: vi.fn() };
      return wizard;
    }

    /** The backup source picker owns the source half of step 1 (presets, verification, Azure browsing). */
    function createPicker(): BackupSourcePickerComponent {
      const picker = Object.create(BackupSourcePickerComponent.prototype) as BackupSourcePickerComponent;
      (picker as unknown as Record<string, unknown>)['_value'] = DefaultBackupSourceValue();
      picker.DirectoryPresets = [
        { Label: 'Linux MSSQL Default', Path: '/var/opt/mssql/backup' },
        { Label: 'Windows MSSQL Default', Path: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup' },
        { Label: 'Windows C:\\SQLBackups', Path: 'C:\\SQLBackups' },
        { Label: 'Root /backups', Path: '/backups' }
      ];
      picker.SelectedAzureBlobs = new Set<string>();
      picker.ValueChange = { emit: vi.fn() } as unknown as typeof picker.ValueChange;
      (picker as unknown as Record<string, unknown>)['cdr'] = { detectChanges: vi.fn() };
      return picker;
    }

    it('extends BaseAngularComponent', () => {
      expect(BootstrapWizardComponent.prototype instanceof BaseAngularComponent).toBe(true);
    });

    it('has PascalCase properties on DirectoryPreset', () => {
      const picker = createPicker();
      expect(picker.DirectoryPresets[0].Label).toBe('Linux MSSQL Default');
      expect(picker.DirectoryPresets[0].Path).toBe('/var/opt/mssql/backup');
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
      const picker = createPicker();
      picker.VerifiedBackupHeader = { Success: true, Message: 'Verified' };
      picker.VerifyBackupError = 'Previous error';
      picker.RefreshLocalFiles();
      expect(picker.VerifiedBackupHeader).toBeNull();
      expect(picker.VerifyBackupError).toBeNull();
    });

    it('ApplyDirectoryPreset starts a path entry for the user to complete, never a bare directory entry', () => {
      const picker = createPicker();
      picker.ApplyDirectoryPreset('/var/opt/mssql/backup');
      expect(picker.Value.BackupUrls).toBe('/var/opt/mssql/backup/');
      expect(picker.ValueChange.emit).toHaveBeenLastCalledWith(picker.Value);

      picker.Value = { ...picker.Value, BackupUrls: '/var/opt/mssql/backup/db_1.bak' };
      picker.ApplyDirectoryPreset('C:\\SQLBackups');
      expect(picker.Value.BackupUrls).toBe('/var/opt/mssql/backup/db_1.bak, C:\\SQLBackups\\');
    });

    it('validates Step 1 correctly for local vs azure sources', () => {
      const wizard = createWizard();
      const withSource = (patch: Partial<BackupSourceValue>): void => { wizard.Source = { ...wizard.Source, ...patch }; };

      // Azure requires URLs, DB name, and Auth
      withSource({ SourceType: 'azure', BackupUrls: '' });
      expect(wizard.IsStep1Valid).toBe(false);

      withSource({ BackupUrls: 'https://blob.core.windows.net/backups/db.bak' });
      expect(wizard.IsStep1Valid).toBe(false); // no SAS token yet
      withSource({ SasToken: 'sp=rl&sig=xyz' });
      expect(wizard.IsStep1Valid).toBe(true);

      // Credential mode needs a selected credential instead of a SAS token
      withSource({ AuthMode: 'credential' });
      expect(wizard.IsStep1Valid).toBe(false);
      withSource({ StorageCredentialID: 'cred-1' });
      expect(wizard.IsStep1Valid).toBe(true);

      // The staging database name is still required
      wizard.StagingDatabaseName = '  ';
      expect(wizard.IsStep1Valid).toBe(false);
      wizard.StagingDatabaseName = 'MJ_Staging_Test';

      // Local requires URLs and DB name only (host auth is handled by SQL Server instance)
      withSource({ SourceType: 'local', BackupUrls: '', SasToken: '', StorageCredentialID: '' });
      expect(wizard.IsStep1Valid).toBe(false);

      withSource({ BackupUrls: '/var/opt/mssql/backup/db.bak' });
      expect(wizard.IsStep1Valid).toBe(true);
    });

    it('the picker clears the backup paths and selected blobs when the source type changes', () => {
      const picker = createPicker();
      picker.Value = { ...picker.Value, BackupUrls: 'https://acct/backups/a.bak' };
      picker.SelectedAzureBlobs.add('a.bak');
      picker.SetSourceType('local');
      expect(picker.Value.SourceType).toBe('local');
      expect(picker.Value.BackupUrls).toBe('');
      expect(picker.SelectedAzureBlobs.size).toBe(0);
      expect(picker.ValueChange.emit).toHaveBeenCalledWith(picker.Value);
    });

    it('Task 9: defaults TruncateTargetBeforeLoad to false', () => {
      const wizard = createWizard();
      expect(wizard.TruncateTargetBeforeLoad).toBe(false);
    });
  });

  describe('Detached bootstrap run in IntegrationDataService', () => {
    async function serviceWithIntegrationClient(client: Record<string, unknown>): Promise<IntegrationDataService> {
      const svc = new IntegrationDataService();
      (svc as unknown as { Provider: unknown }).Provider = {};
      const mod = await import('@memberjunction/graphql-dataprovider');
      vi.spyOn(mod, 'GraphQLIntegrationClient').mockImplementation(class {
        constructor() { Object.assign(this, client); }
      } as unknown as typeof mod.GraphQLIntegrationClient);
      return svc;
    }

    it('StartBootstrapFromBackup sends the inputs to IntegrationStartBootstrap and returns the run ID', async () => {
      const startBootstrap = vi.fn().mockResolvedValue({ Success: true, Message: 'started', RunID: 'bootstrap-1', InProgress: true });
      const svc = await serviceWithIntegrationClient({ StartBootstrap: startBootstrap });

      const res = await svc.StartBootstrapFromBackup('ci-1', {
        BackupUrls: 'https://blob/backup.bak',
        SasToken: 'sv=1&sig=x',
        StagingDatabaseName: 'MJ_Staging',
        DropStagingDbOnComplete: true,
        TruncateTargetBeforeLoad: false,
        BatchSize: 500000,
      });

      expect(startBootstrap).toHaveBeenCalledWith({
        CompanyIntegrationID: 'ci-1',
        BackupUrls: 'https://blob/backup.bak',
        SasToken: 'sv=1&sig=x',
        StorageCredentialID: undefined,
        StagingDatabaseName: 'MJ_Staging',
        DropStagingDbOnComplete: true,
        TruncateTargetBeforeLoad: false,
        BatchSize: 500000,
      });
      expect(res).toEqual({ Success: true, Message: 'started', RunID: 'bootstrap-1' });
    });

    it('TailBootstrapRun returns the new events, the latest sequence and whether the run is still in flight', async () => {
      const tail = vi.fn().mockResolvedValue({
        Success: true, Message: '2 event(s)', LatestSeq: 7, IsInFlight: true,
        Events: [{ Ts: 't', Seq: 6, EventType: 'stage.start', Stage: 'Restore', Message: 'Restoring' }, { Ts: 't', Seq: 7, EventType: 'heartbeat', Stage: 'Restore' }],
      });
      const svc = await serviceWithIntegrationClient({ TailRunEvents: tail });

      const res = await svc.TailBootstrapRun('bootstrap-1', 5);

      expect(tail).toHaveBeenCalledWith('bootstrap-1', 5);
      expect(res.Events).toHaveLength(2);
      expect(res.LatestSeq).toBe(7);
      expect(res.IsInFlight).toBe(true);
    });

    it('GetBootstrapRun returns the run summary and its errors', async () => {
      const getRun = vi.fn().mockResolvedValue({
        Success: true, Message: 'OK', Errors: ['[Restore] Cannot open backup device'],
        Run: { RunID: 'bootstrap-1', RunKind: 'Other', StartedAt: 't', IsInFlight: false, EventCount: 9, Success: false, ExitReason: 'failed' },
      });
      const svc = await serviceWithIntegrationClient({ GetRun: getRun });

      const res = await svc.GetBootstrapRun('bootstrap-1');

      expect(res.Run?.ExitReason).toBe('failed');
      expect(res.Errors).toEqual(['[Restore] Cannot open backup device']);
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
          { Name: 'BackupStartDate', Value: '2026-10-26T02:00:00.000Z', Type: 'Output' },
          { Name: 'BackupSizeBytes', Value: 26628587520, Type: 'Output' },
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
      expect(res.BackupStartDate).toBe('2026-10-26T02:00:00.000Z');
      expect(res.SizeBytes).toBe(26628587520);
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
            { Name: 'backup1.bak', SizeBytes: 1073741824, LastModified: '2026-10-26T00:00:00Z' },
            { Name: 'readme.txt', SizeBytes: 2048, LastModified: '2026-10-25T00:00:00Z' }
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
      expect(res.Blobs[0].SizeFormatted).toBe('1 GB');
      expect(res.Blobs[1].Name).toBe('readme.txt');
      expect(res.Blobs[1].IsBak).toBe(false);
    });
  });
});
