import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { IntegrationProgressEmitter, type IntegrationProgressEvent } from '@memberjunction/integration-progress-artifacts';
import type { ArchiveSeedDiscoveredTable, ArchiveSeedWork } from '@memberjunction/schema-engine';

// The real resolver's type-graphql decorators need emitted decorator metadata, which vitest's
// transform does not produce; the job never reaches it with fake deps.
vi.mock('../../resolvers/IntegrationDiscoveryResolver.js', () => ({
  IntegrationDiscoveryResolver: class {},
}));

import type {
  ArchiveSeedActions,
  ArchiveSeedApply,
  ArchiveSeedApplyWorkStatus,
  ArchiveSeedCompanyIntegrationValues,
  ArchiveSeedDataSourceValues,
  ArchiveSeedDeps,
  ArchiveSeedDiscovery,
  ArchiveSeedEntityMap,
  ArchiveSeedRecords,
  ArchiveSeedStore,
  ArchiveSeedStoredJob,
} from '../archiveSeed/ArchiveSeedDeps';
import type { ArchiveSeedStartInput } from '../archiveSeed/ArchiveSeedState';
import { ArchiveSeedJob } from '../archiveSeed/ArchiveSeedJob';

const USER = { ID: 'u-1' } as UserInfo;
const PROVIDER = {} as IMetadataProvider;
const RESTORE = 'Restore SQL Server Backup To Staging';
const DROP = 'Drop SQL Server Staging Database';
const INPUT: ArchiveSeedStartInput = {
  CompanyID: 'co-1',
  ConnectionName: 'Legacy ERP',
  BackupUrls: 'https://acct.blob.core.windows.net/b/erp.bak',
  SasToken: 'sv=secret',
  StagingDatabaseName: 'MJ_Staging_ERP',
};
const TABLES: ArchiveSeedDiscoveredTable[] = [
  { Name: 'dbo.Orders', ColumnCount: 3, HasPrimaryKey: true },
  { Name: 'dbo.Customers', ColumnCount: 5, HasPrimaryKey: true, WatermarkField: 'ModifiedAt' },
];

class FakeRecords implements ArchiveSeedRecords {
  public IntegrationID: string | undefined = 'int-sql';
  public ExistingCount = 0;
  public DataSources = new Map<string, ArchiveSeedDataSourceValues>();
  public DeletedDataSources: string[] = [];
  public CompanyIntegrations = new Map<string, ArchiveSeedCompanyIntegrationValues>();
  private nextID = 0;

  public async FindSqlServerIntegrationID(): Promise<string | undefined> {
    return this.IntegrationID;
  }
  public async CountCompanyIntegrations(): Promise<number> {
    return this.ExistingCount;
  }
  public async FindDataSourceTypeID(): Promise<string> {
    return 'type-sql';
  }
  public async CreateDataSource(values: ArchiveSeedDataSourceValues): Promise<string> {
    const id = `ds-${++this.nextID}`;
    this.DataSources.set(id, { ...values });
    return id;
  }
  public async SetDataSourceDefaultDatabase(id: string, defaultDatabase: string): Promise<void> {
    const ds = this.DataSources.get(id);
    if (!ds) throw new Error(`no data source ${id}`);
    ds.DefaultDatabase = defaultDatabase;
  }
  public async DeleteDataSource(id: string): Promise<void> {
    this.DeletedDataSources.push(id);
    this.DataSources.delete(id);
  }
  public async CreateCompanyIntegration(values: ArchiveSeedCompanyIntegrationValues): Promise<string> {
    const id = `ci-${++this.nextID}`;
    this.CompanyIntegrations.set(id, { ...values });
    return id;
  }
  public async SetCompanyIntegrationConfiguration(id: string, configuration: string): Promise<void> {
    const ci = this.CompanyIntegrations.get(id);
    if (!ci) throw new Error(`no company integration ${id}`);
    ci.Configuration = configuration;
  }
  public async EntityMapsFor(): Promise<ArchiveSeedEntityMap[]> {
    return [];
  }
  public async MarkEntitiesBulkLoadable(): Promise<void> {}
  public ResolveUser(): UserInfo | undefined {
    return USER;
  }
  public Configuration(ciID: string): { externalDataSourceID: string; seededFromBackup: Record<string, string> } {
    return JSON.parse(this.CompanyIntegrations.get(ciID)?.Configuration ?? '{}');
  }
}

class FakeStore implements ArchiveSeedStore {
  public Jobs = new Map<string, ArchiveSeedStoredJob>();
  public Failed: { JobID: string; Message: string }[] = [];
  public Updates: ArchiveSeedWork[] = [];

  public async Create(work: ArchiveSeedWork, companyIntegrationID: string): Promise<string> {
    const id = `job-${this.Jobs.size + 1}`;
    this.Jobs.set(id, { ID: id, Work: work, Status: 'Pending', CompanyIntegrationID: companyIntegrationID });
    return id;
  }
  public async Read(jobID: string): Promise<ArchiveSeedStoredJob | undefined> {
    return this.Jobs.get(jobID);
  }
  public async Update(jobID: string, work: ArchiveSeedWork): Promise<void> {
    const job = this.Jobs.get(jobID);
    if (!job) throw new Error(`no job ${jobID}`);
    job.Work = work;
    this.Updates.push(work);
  }
  public async Complete(): Promise<void> {}
  public async Fail(jobID: string, message: string): Promise<void> {
    this.Failed.push({ JobID: jobID, Message: message });
  }
  public async ApplyWorkStatus(): Promise<ArchiveSeedApplyWorkStatus | undefined> {
    return undefined;
  }
}

/**
 * Behaves like the real phase actions on the progress run: when given a `ProgressRunID` it resumes
 * that run through a real emitter, reports a stage start and (on failure) a stage error, flushes,
 * and never terminates the run.
 */
class FakeActions implements ArchiveSeedActions {
  public Calls: { Name: string; Params: ActionParam[] }[] = [];
  public RestoreSucceeds = true;
  public DropSucceeds = true;

  constructor(private readonly root: string) {}

  public async Run(actionName: string, params: ActionParam[]): Promise<ActionResult> {
    this.Calls.push({ Name: actionName, Params: params });
    const stage = actionName === RESTORE ? 'Restore' : 'Cleanup';
    const emitter = this.resumeRun(params);
    emitter?.StageStart(stage, `${actionName} started`);
    const result = this.resultFor(actionName);
    if (!result.Success) {
      emitter?.StageError(stage, result.Message ?? '', { code: result.ResultCode });
    }
    await emitter?.Flush();
    return result;
  }

  private resumeRun(params: ActionParam[]): IntegrationProgressEmitter | undefined {
    const runID = params.find(p => p.Name === 'ProgressRunID')?.Value;
    if (typeof runID !== 'string') {
      return undefined;
    }
    const manifest = { runID, runKind: 'Other' as const, startedAt: new Date().toISOString(), context: { kind: 'FakeAction' } };
    return new IntegrationProgressEmitter(manifest, { rootDir: this.root, maxRunDirs: 0 });
  }

  private resultFor(actionName: string): ActionResult {
    const result = new ActionResult();
    if (actionName === RESTORE && !this.RestoreSucceeds) {
      result.Success = false;
      result.ResultCode = 'RESTORE_FAILED';
      result.Message = 'RESTORE DATABASE terminated abnormally';
      return result;
    }
    if (actionName === DROP && !this.DropSucceeds) {
      result.Success = false;
      result.ResultCode = 'DROP_FAILED';
      result.Message = 'DROP DATABASE failed';
      return result;
    }
    result.Success = true;
    result.Params = actionName === RESTORE
      ? [
          Output('BackupStartDate', '2026-10-01T03:00:00.000Z'),
          Output('BackupDatabaseName', 'ERP_Prod'),
          Output('StagingDatabaseName', 'MJ_Staging_ERP'),
          Output('ContainerUrl', 'https://acct.blob.core.windows.net/b'),
        ]
      : [];
    return result;
  }
  public Names(): string[] {
    return this.Calls.map(c => c.Name);
  }
}

function Output(name: string, value: string): ActionParam {
  const p = new ActionParam();
  p.Name = name;
  p.Type = 'Output';
  p.Value = value;
  return p;
}

class FakeDiscovery implements ArchiveSeedDiscovery {
  public Error: Error | undefined;
  public async IntrospectArchive(): Promise<ArchiveSeedDiscoveredTable[]> {
    if (this.Error) throw this.Error;
    return TABLES;
  }
}

class FakeApply implements ArchiveSeedApply {
  public Calls: { CompanyIntegrationID: string; TableNames: string[] }[] = [];
  public Result = { Success: true, Message: 'applied' };
  public async ApplyTables(companyIntegrationID: string, tableNames: string[]): Promise<{ Success: boolean; Message: string }> {
    this.Calls.push({ CompanyIntegrationID: companyIntegrationID, TableNames: tableNames });
    return this.Result;
  }
}

describe('ArchiveSeedJob', () => {
  let root: string;
  let records: FakeRecords;
  let store: FakeStore;
  let actions: FakeActions;
  let apply: FakeApply;
  let discovery: FakeDiscovery;
  let job: ArchiveSeedJob;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'archive-seed-job-'));
    records = new FakeRecords();
    store = new FakeStore();
    actions = new FakeActions(root);
    apply = new FakeApply();
    discovery = new FakeDiscovery();
    const deps: ArchiveSeedDeps = {
      Records: records,
      Discovery: discovery,
      Apply: apply,
      Actions: actions,
      Store: store,
      CreateEmitter: manifest => new IntegrationProgressEmitter(manifest, { rootDir: root, maxRunDirs: 0 }),
      Now: () => new Date(2026, 9, 28, 14, 5),
    };
    job = new ArchiveSeedJob(deps);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function Events(runID: string): IntegrationProgressEvent[] {
    return readFileSync(join(root, runID, 'progress.jsonl'), 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l) as IntegrationProgressEvent);
  }

  async function StartToSelection(): Promise<{ JobID: string; RunID: string; CompanyIntegrationID: string }> {
    const started = await job.Start(INPUT, USER, PROVIDER);
    await job.WaitForIdle();
    return started;
  }

  it('Start creates the deferred source, the company integration and the job row, then restores and discovers', async () => {
    const { JobID, RunID, CompanyIntegrationID } = await StartToSelection();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('AwaitingSelection');
    expect(state?.JobID).toBe(JobID);
    expect(state?.CompanyIntegrationID).toBe(CompanyIntegrationID);
    expect(state?.Tables).toHaveLength(2);
    expect(state?.BackupStartDate).toBe('2026-10-01T03:00:00.000Z');
    expect(state?.BackupDatabaseName).toBe('ERP_Prod');
    expect(state?.ContainerUrl).toBe('https://acct.blob.core.windows.net/b');
    expect(state?.CurrentRunID).toBe(RunID);
    expect(JSON.stringify(state)).not.toContain('sv=secret');

    const deferred = records.DataSources.get(state?.DeferredDataSourceID ?? '');
    expect(deferred).toEqual({ Name: 'Legacy ERP (source)', TypeID: 'type-sql', DefaultDatabase: 'ERP_Prod', ConnectionConfig: null, Status: 'Disabled' });
    const archive = records.DataSources.get(state?.ArchiveDataSourceID ?? '');
    expect(archive).toEqual({
      Name: 'Legacy ERP (archive staging)',
      TypeID: 'type-sql',
      DefaultDatabase: 'MJ_Staging_ERP',
      ConnectionConfig: '{"authMode":"host"}',
      Status: 'Active',
    });

    const ci = records.CompanyIntegrations.get(CompanyIntegrationID);
    expect(ci).toMatchObject({ CompanyID: 'co-1', IntegrationID: 'int-sql', Name: 'Legacy ERP' });
    expect(records.Configuration(CompanyIntegrationID)).toEqual({
      externalDataSourceID: state?.ArchiveDataSourceID,
      seededFromBackup: {
        jobID: JobID,
        backupStartDate: '2026-10-01T03:00:00.000Z',
        backupDatabaseName: 'ERP_Prod',
        stagingDatabaseName: 'MJ_Staging_ERP',
      },
    });

    const restore = actions.Calls[0];
    expect(restore.Name).toBe(RESTORE);
    const restoreParams = Object.fromEntries(restore.Params.map(p => [p.Name, p.Value]));
    expect(restoreParams).toMatchObject({ CompanyIntegrationID, SasToken: 'sv=secret', ProgressRunID: RunID, StagingDatabaseName: 'MJ_Staging_ERP' });

    const events = Events(RunID);
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events[0].eventType).toBe('run.start');
    expect(events.some(e => e.eventType === 'stage.start' && e.stage === 'Restore')).toBe(true);
    expect(events.some(e => e.eventType === 'stage.complete' && e.stage === 'Discover' && e.counts?.processed === 2)).toBe(true);
    const tablesEvent = events.find(e => e.eventType === 'stage.complete' && e.stage === 'Tables');
    expect(tablesEvent?.data).toEqual({ tables: TABLES });
    expect(store.Failed).toEqual([]);
  });

  it('Start refuses when a SQL Server company integration already exists', async () => {
    records.ExistingCount = 1;
    await expect(job.Start(INPUT, USER, PROVIDER)).rejects.toThrow(
      'An archive seed is limited to the first SQL Server connection in this workspace; one already exists',
    );
    expect(records.DataSources.size).toBe(0);
    expect(records.CompanyIntegrations.size).toBe(0);
    expect(store.Jobs.size).toBe(0);
  });

  it('Start refuses when the connector is not installed', async () => {
    records.IntegrationID = undefined;
    await expect(job.Start(INPUT, USER, PROVIDER)).rejects.toThrow('SQL Server connector is not installed');
    expect(records.DataSources.size).toBe(0);
    expect(store.Jobs.size).toBe(0);
  });

  it('Start refuses an invalid input before touching anything', async () => {
    await expect(job.Start({ ...INPUT, ConnectionName: ' ' }, USER, PROVIDER)).rejects.toThrow("'ConnectionName' is required.");
    expect(store.Jobs.size).toBe(0);
  });

  it('Start fails the job and creates nothing else when the restore action fails', async () => {
    actions.RestoreSucceeds = false;
    const { JobID, RunID } = await StartToSelection();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toContain('RESTORE DATABASE terminated abnormally');
    expect(state?.ArchiveDataSourceID).toBeUndefined();
    expect([...records.DataSources.values()].map(d => d.Name)).toEqual(['Legacy ERP (source)']);
    expect(actions.Names()).toEqual([RESTORE]);
    expect(store.Failed).toHaveLength(1);
    expect(store.Failed[0].JobID).toBe(JobID);
    expect(store.Failed[0].Message).toContain('RESTORE DATABASE terminated abnormally');

    const events = Events(RunID);
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(e => e.eventType === 'stage.error' && e.stage === 'Restore')).toHaveLength(1);
    expect(events.filter(e => e.eventType === 'run.fail')).toHaveLength(1);
    expect(events[events.length - 1].eventType).toBe('run.fail');
  });

  it('a discovery failure drops staging on the open run and the job alone terminates it, once', async () => {
    actions.DropSucceeds = false;
    discovery.Error = new Error('introspection timed out');
    const { JobID, RunID } = await StartToSelection();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toBe('introspection timed out');
    expect(store.Failed[0].Message).toContain('DROP DATABASE failed');
    expect(actions.Names()).toEqual([RESTORE, DROP]);
    expect(records.DeletedDataSources).toEqual([state?.ArchiveDataSourceID]);

    const events = Events(RunID);
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(e => e.eventType === 'stage.error').map(e => e.stage)).toEqual(['Discover', 'Cleanup']);
    expect(events.filter(e => e.eventType === 'run.fail')).toHaveLength(1);
    expect(events[events.length - 1].eventType).toBe('run.fail');
  });

  it('SelectTables refuses an empty or unknown selection and keeps AwaitingSelection', async () => {
    const { JobID } = await StartToSelection();

    await expect(job.SelectTables(JobID, [], USER, PROVIDER)).rejects.toThrow('Select at least one table');
    await expect(job.SelectTables(JobID, ['dbo.Nope'], USER, PROVIDER)).rejects.toThrow("Unknown table 'dbo.Nope'");

    expect((await job.GetState(JobID, USER, PROVIDER))?.State).toBe('AwaitingSelection');
    expect(apply.Calls).toEqual([]);
  });

  it('SelectTables refuses a job that is not awaiting selection', async () => {
    actions.RestoreSucceeds = false;
    const { JobID } = await StartToSelection();
    await expect(job.SelectTables(JobID, ['dbo.Orders'], USER, PROVIDER)).rejects.toThrow(/AwaitingSelection/);
    await expect(job.SelectTables('job-missing', ['dbo.Orders'], USER, PROVIDER)).rejects.toThrow(/not found/);
  });

  it('SelectTables completes run A with a Handoff stage and calls ApplyTables with the selected names', async () => {
    const { JobID, RunID, CompanyIntegrationID } = await StartToSelection();

    await job.SelectTables(JobID, ['DBO.ORDERS'], USER, PROVIDER);

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Building');
    expect(state?.SelectedTables).toEqual(['dbo.Orders']);
    expect(apply.Calls).toEqual([{ CompanyIntegrationID, TableNames: ['dbo.Orders'] }]);

    const events = Events(RunID);
    expect(events.some(e => e.eventType === 'stage.complete' && e.stage === 'Handoff')).toBe(true);
    const last = events[events.length - 1];
    expect(last.eventType).toBe('run.complete');
    expect(last.message).toBe('Tables created; the API will restart to load the new entities');
    expect(store.Failed).toEqual([]);
  });

  it('SelectTables fails the job when ApplyTables returns Success false', async () => {
    const { JobID, RunID } = await StartToSelection();
    apply.Result = { Success: false, Message: 'CodeGen failed' };

    await job.SelectTables(JobID, ['dbo.Orders'], USER, PROVIDER);

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toContain('CodeGen failed');
    expect(records.DeletedDataSources).toEqual([state?.ArchiveDataSourceID]);
    expect(records.Configuration(state?.CompanyIntegrationID ?? '').externalDataSourceID).toBe(state?.DeferredDataSourceID);
    expect(actions.Names()).toEqual([RESTORE, DROP]);
    const dropParams = Object.fromEntries(actions.Calls[1].Params.map(p => [p.Name, p.Value]));
    expect(dropParams).toMatchObject({ StagingDatabaseName: 'MJ_Staging_ERP' });
    expect(store.Failed).toHaveLength(1);
    expect(dropParams.ProgressRunID).toBeUndefined();
    // Run A was already completed at handoff; the failure is recorded on the job, not appended after run.complete.
    expect(Events(RunID).at(-1)?.eventType).toBe('run.complete');
    expect(state?.RunClosed).toBe(true);
  });
});
