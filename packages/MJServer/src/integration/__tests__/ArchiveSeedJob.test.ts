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
const LOAD = 'Load SQL Server Integration From Staging';
const MINUTE = 60_000;
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
  /** Each EntityMapsFor call returns the next entry; the last one repeats. */
  public MapsSequence: ArchiveSeedEntityMap[][] = [[]];
  public EntityMapsCalls = 0;
  public OnEntityMapsFor: (() => void) | undefined;
  public BulkLoadable: string[][] = [];
  public Log: string[] | undefined;

  public async EntityMapsFor(): Promise<ArchiveSeedEntityMap[]> {
    this.OnEntityMapsFor?.();
    const maps = this.MapsSequence[Math.min(this.EntityMapsCalls, this.MapsSequence.length - 1)];
    this.EntityMapsCalls++;
    return maps;
  }
  public async MarkEntitiesBulkLoadable(entityIDs: string[]): Promise<void> {
    this.BulkLoadable.push(entityIDs);
    this.Log?.push('MarkEntitiesBulkLoadable');
  }
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
  public Completed: string[] = [];
  public Updates: ArchiveSeedWork[] = [];
  public ApplyStatus: ArchiveSeedApplyWorkStatus | undefined;

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
  public async Complete(jobID: string): Promise<void> {
    this.Completed.push(jobID);
    const job = this.Jobs.get(jobID);
    if (job) job.Status = 'Completed';
  }
  public async Fail(jobID: string, message: string): Promise<void> {
    this.Failed.push({ JobID: jobID, Message: message });
    const job = this.Jobs.get(jobID);
    if (job) job.Status = 'Failed';
  }
  public async ApplyWorkStatus(): Promise<ArchiveSeedApplyWorkStatus | undefined> {
    return this.ApplyStatus;
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
  public LoadSucceeds = true;
  public Log: string[] | undefined;

  constructor(private readonly root: string) {}

  public async Run(actionName: string, params: ActionParam[]): Promise<ActionResult> {
    this.Calls.push({ Name: actionName, Params: params });
    this.Log?.push(actionName);
    const stage = actionName === RESTORE ? 'Restore' : actionName === LOAD ? 'Load' : 'Cleanup';
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
    if (actionName === LOAD && !this.LoadSucceeds) {
      result.Success = false;
      result.ResultCode = 'LOAD_FAILED';
      result.Message = 'bulk copy failed';
      return result;
    }
    result.Success = true;
    if (actionName === LOAD) {
      result.Params = [Output('TablesProcessed', '2'), Output('TotalRowsTransferred', '1234'), Output('DurationSeconds', '42'), Output('StagingDatabaseDropped', 'false')];
      return result;
    }
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
  /** When set, ApplyTables does not return until this settles (an apply still running). */
  public Gate?: Promise<void>;
  public async ApplyTables(companyIntegrationID: string, tableNames: string[]): Promise<{ Success: boolean; Message: string }> {
    this.Calls.push({ CompanyIntegrationID: companyIntegrationID, TableNames: tableNames });
    if (this.Gate) await this.Gate;
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
  let clock: Date;

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
      Now: () => clock,
    };
    clock = new Date(2026, 9, 28, 14, 5);
    job = new ArchiveSeedJob(deps, { pollIntervalMs: 1 });
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
    await job.WaitForIdle();

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
    await job.WaitForIdle();

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

  it('SelectTables returns before ApplyTables completes, so the caller gets its response before the restart', async () => {
    const { JobID } = await StartToSelection();
    let release: () => void = () => undefined;
    apply.Gate = new Promise<void>(resolve => { release = resolve; });
    await job.SelectTables(JobID, ['dbo.Orders'], USER, PROVIDER);

    let applySettled = false;
    const idle = job.WaitForIdle().then(() => { applySettled = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(apply.Calls).toHaveLength(1);
    expect(applySettled).toBe(false);
    expect((await job.GetState(JobID, USER, PROVIDER))?.State).toBe('Building');

    release();
    await idle;
    expect(store.Failed).toEqual([]);
  });

  // ---------------------------------------------------------------- resume, load, finish

  const MAPS: ArchiveSeedEntityMap[] = [
    { ID: 'em-1', EntityID: 'ent-orders', ExternalObjectName: 'DBO.ORDERS' },
    { ID: 'em-2', EntityID: 'ent-customers', ExternalObjectName: 'dbo.Customers' },
  ];

  /** A job in Building: restored, discovered, selected, and handed to the (fake) apply. */
  async function ToBuilding(): Promise<{ JobID: string; RunID: string; CompanyIntegrationID: string }> {
    const started = await StartToSelection();
    await job.SelectTables(started.JobID, ['dbo.Orders', 'dbo.Customers'], USER, PROVIDER);
    await job.WaitForIdle();
    return started;
  }

  /** A job parked at AwaitingCleanupDecision after a successful phase B. */
  async function ToCleanupDecision(): Promise<{ JobID: string; RunID: string; CompanyIntegrationID: string }> {
    const started = await ToBuilding();
    records.MapsSequence = [MAPS];
    await job.Resume(started.JobID, USER, PROVIDER);
    await job.WaitForIdle();
    return started;
  }

  function SetState(jobID: string, patch: Partial<ArchiveSeedWork>): void {
    const stored = store.Jobs.get(jobID);
    if (!stored) throw new Error(`no job ${jobID}`);
    stored.Work = { ...stored.Work, ...patch };
  }

  function CurrentRun(jobID: string): string {
    const runID = store.Jobs.get(jobID)?.Work.CurrentRunID;
    if (!runID) throw new Error('no run');
    return runID;
  }

  it('Resume in Building waits for the entity maps, marks the entities bulk-loadable, loads, and parks at AwaitingCleanupDecision with a summary', async () => {
    const { JobID, RunID, CompanyIntegrationID } = await ToBuilding();
    records.MapsSequence = [[], [], MAPS];
    const log: string[] = [];
    records.Log = log;
    actions.Log = log;

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('AwaitingCleanupDecision');
    expect(records.EntityMapsCalls).toBe(3);
    expect(records.BulkLoadable).toEqual([['ent-orders', 'ent-customers']]);
    expect(log).toEqual(['MarkEntitiesBulkLoadable', LOAD]);
    expect(state?.Summary).toEqual({ TablesProcessed: 2, TotalRowsTransferred: 1234, DurationSeconds: 42, StagingDatabaseDropped: false });
    expect(store.Updates.map(u => u.State).slice(-4)).toEqual(['Mapping', 'Loading', 'Seeding', 'AwaitingCleanupDecision']);

    const runB = CurrentRun(JobID);
    expect(runB).not.toBe(RunID);
    const loadParams = Object.fromEntries((actions.Calls.find(c => c.Name === LOAD)?.Params ?? []).map(p => [p.Name, p.Value]));
    expect(loadParams).toMatchObject({ CompanyIntegrationID, ProgressRunID: runB, StagingDatabaseName: 'MJ_Staging_ERP', DropStagingDbOnComplete: 'false' });

    const events = Events(runB);
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events[0].eventType).toBe('run.start');
    const summary = events.find(e => e.eventType === 'stage.complete' && e.stage === 'Summary');
    expect(summary?.data).toEqual(state?.Summary);
    expect(events.some(e => e.eventType === 'run.complete' || e.eventType === 'run.fail')).toBe(false);
    expect(store.Failed).toEqual([]);
  });

  it('opening run B persists its ID with RunClosed false and a phase B manifest; Finish closes it', async () => {
    const { JobID, RunID } = await ToBuilding();
    records.MapsSequence = [MAPS];
    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const mapping = store.Updates.find(u => u.State === 'Mapping');
    expect(mapping?.CurrentRunID).toBeDefined();
    expect(mapping?.CurrentRunID).not.toBe(RunID);
    expect(mapping?.RunClosed).toBe(false);
    const manifest = JSON.parse(readFileSync(join(root, CurrentRun(JobID), 'manifest.json'), 'utf-8'));
    expect(manifest.context).toMatchObject({ kind: 'ArchiveSeed', jobID: JobID, phase: 'B' });

    await job.Finish(JobID, false, USER, PROVIDER);
    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.RunClosed).toBe(true);
    expect(Events(CurrentRun(JobID)).at(-1)?.eventType).toBe('run.complete');
  });

  it('Resume in Mapping re-enters the wait on the existing run B without starting it again', async () => {
    const { JobID, CompanyIntegrationID } = await ToBuilding();
    const runB = 'archive-seed-run-b';
    const opened = new IntegrationProgressEmitter(
      { runID: runB, runKind: 'Other', companyIntegrationID: CompanyIntegrationID, startedAt: clock.toISOString(), context: { kind: 'ArchiveSeed', jobID: JobID, phase: 'B' } },
      { rootDir: root, maxRunDirs: 0 },
    );
    opened.RunStart('run B');
    await opened.Flush();
    SetState(JobID, { State: 'Mapping', CurrentRunID: runB, RunClosed: false });
    records.MapsSequence = [[], MAPS];

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    expect(CurrentRun(JobID)).toBe(runB);
    expect((await job.GetState(JobID, USER, PROVIDER))?.State).toBe('AwaitingCleanupDecision');
    const events = Events(runB);
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(e => e.eventType === 'run.start')).toHaveLength(1);
  });

  it('Resume is safe to call repeatedly while phase B is in flight', async () => {
    const { JobID } = await ToBuilding();
    records.MapsSequence = [[], [], MAPS];

    await job.Resume(JobID, USER, PROVIDER);
    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    expect(actions.Names().filter(n => n === LOAD)).toHaveLength(1);
    expect((await job.GetState(JobID, USER, PROVIDER))?.State).toBe('AwaitingCleanupDecision');
  });

  it('Resume in Building fails when the apply work row is Failed', async () => {
    const { JobID } = await ToBuilding();
    store.ApplyStatus = { Status: 'Failed', ErrorMessage: 'CodeGen exploded' };

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toBe('CodeGen exploded');
    expect(actions.Names()).not.toContain(LOAD);
    expect(actions.Names().at(-1)).toBe(DROP);
    expect(records.DeletedDataSources).toEqual([state?.ArchiveDataSourceID]);
    expect(store.Failed).toHaveLength(1);
    const events = Events(CurrentRun(JobID));
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(e => e.eventType === 'run.fail')).toHaveLength(1);
    expect(events.at(-1)?.eventType).toBe('run.fail');
  });

  it('Resume in Building fails after the apply timeout', async () => {
    const { JobID } = await ToBuilding();
    records.OnEntityMapsFor = () => {
      clock = new Date(clock.getTime() + 31 * MINUTE);
    };

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toBe('Timed out waiting for entity maps');
    expect(records.EntityMapsCalls).toBe(1);
    expect(records.BulkLoadable).toEqual([]);
    expect(actions.Names()).not.toContain(LOAD);
  });

  it('a load failure fails the job, which drops staging on run B and terminates it once', async () => {
    const { JobID } = await ToBuilding();
    records.MapsSequence = [MAPS];
    actions.LoadSucceeds = false;

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toContain('bulk copy failed');
    expect(actions.Names().slice(-2)).toEqual([LOAD, DROP]);
    const events = Events(CurrentRun(JobID));
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(e => e.eventType === 'stage.error' && e.stage === 'Load')).toHaveLength(1);
    expect(events.filter(e => e.eventType === 'run.fail')).toHaveLength(1);
    expect(events.at(-1)?.eventType).toBe('run.fail');
  });

  it('Resume in Restoring fails the job as interrupted and cleans up', async () => {
    const { JobID, RunID } = await StartToSelection();
    const archiveID = store.Jobs.get(JobID)?.Work.ArchiveDataSourceID;
    SetState(JobID, { State: 'Restoring' });
    const callsBefore = actions.Calls.length;

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Failed');
    expect(state?.Error).toBe('interrupted during Restoring');
    expect(actions.Names().slice(callsBefore)).toEqual([DROP]);
    expect(records.DeletedDataSources).toEqual([archiveID]);
    expect(store.Failed).toEqual([{ JobID, Message: 'interrupted during Restoring' }]);
    const events = Events(RunID);
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(e => e.eventType === 'stage.error' && e.stage === 'Restore')).toHaveLength(1);
    expect(events.at(-1)?.eventType).toBe('run.fail');
  });

  it('Resume never throws for a missing or terminal job and is a no-op while awaiting a recent decision', async () => {
    await expect(job.Resume('job-missing', USER, PROVIDER)).resolves.toBeUndefined();
    const { JobID } = await ToCleanupDecision();
    const updates = store.Updates.length;
    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();
    expect(store.Updates.length).toBe(updates);
    await job.Finish(JobID, false, USER, PROVIDER);
    const done = store.Updates.length;
    await expect(job.Resume(JobID, USER, PROVIDER)).resolves.toBeUndefined();
    await job.WaitForIdle();
    expect(store.Updates.length).toBe(done);
    expect((await job.GetState(JobID, USER, PROVIDER))?.State).toBe('Done');
  });

  it('Resume closes a still-Pending row whose job is already Done or Failed', async () => {
    const done = await ToCleanupDecision();
    SetState(done.JobID, { State: 'Done' });
    await job.Resume(done.JobID, USER, PROVIDER);
    expect(store.Completed).toEqual([done.JobID]);
    expect(store.Failed).toEqual([]);

    const failed = await StartToSelection();
    SetState(failed.JobID, { State: 'Failed', Error: 'boom' });
    await job.Resume(failed.JobID, USER, PROVIDER);
    expect(store.Failed).toEqual([{ JobID: failed.JobID, Message: 'boom' }]);
    expect(store.Completed).toEqual([done.JobID]);
  });

  it('Finish with dropStaging drops staging, deletes the archive source, repoints the configuration, completes run B and the store', async () => {
    const { JobID, CompanyIntegrationID } = await ToCleanupDecision();
    const before = await job.GetState(JobID, USER, PROVIDER);
    expect(records.Configuration(CompanyIntegrationID).externalDataSourceID).toBe(before?.ArchiveDataSourceID);

    await job.Finish(JobID, true, USER, PROVIDER);

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Done');
    expect(state?.Summary?.StagingDatabaseDropped).toBe(true);
    expect(actions.Names().at(-1)).toBe(DROP);
    const dropParams = Object.fromEntries((actions.Calls.at(-1)?.Params ?? []).map(p => [p.Name, p.Value]));
    expect(dropParams).toMatchObject({ StagingDatabaseName: 'MJ_Staging_ERP', ProgressRunID: CurrentRun(JobID) });
    expect(records.DeletedDataSources).toEqual([before?.ArchiveDataSourceID]);
    expect(records.Configuration(CompanyIntegrationID).externalDataSourceID).toBe(before?.DeferredDataSourceID);
    expect(store.Updates.map(u => u.State).slice(-2)).toEqual(['CleaningUp', 'Done']);
    expect(store.Completed).toEqual([JobID]);
    expect(store.Failed).toEqual([]);
    const events = Events(CurrentRun(JobID));
    expect(events.map(e => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.at(-1)?.eventType).toBe('run.complete');
  });

  it('Finish without dropStaging keeps staging and reports StagingDatabaseDropped false', async () => {
    const { JobID } = await ToCleanupDecision();
    const callsBefore = actions.Calls.length;

    await job.Finish(JobID, false, USER, PROVIDER);

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Done');
    expect(state?.Summary?.StagingDatabaseDropped).toBe(false);
    expect(actions.Calls.length).toBe(callsBefore);
    expect(store.Completed).toEqual([JobID]);
    expect(Events(CurrentRun(JobID)).at(-1)?.eventType).toBe('run.complete');
  });

  it('Finish refuses a job that is not awaiting the cleanup decision', async () => {
    const { JobID } = await StartToSelection();
    await expect(job.Finish(JobID, true, USER, PROVIDER)).rejects.toThrow(/AwaitingCleanupDecision/);
    await expect(job.Finish('job-missing', true, USER, PROVIDER)).rejects.toThrow(/not found/);
  });

  it('Resume in AwaitingCleanupDecision after 24 h finishes keeping the archive', async () => {
    const { JobID } = await ToCleanupDecision();
    const callsBefore = actions.Calls.length;
    clock = new Date(clock.getTime() + 24 * 60 * MINUTE + 1);

    await job.Resume(JobID, USER, PROVIDER);
    await job.WaitForIdle();

    const state = await job.GetState(JobID, USER, PROVIDER);
    expect(state?.State).toBe('Done');
    expect(state?.Summary?.StagingDatabaseDropped).toBe(false);
    expect(actions.Calls.length).toBe(callsBefore);
    expect(store.Completed).toEqual([JobID]);
  });
});
