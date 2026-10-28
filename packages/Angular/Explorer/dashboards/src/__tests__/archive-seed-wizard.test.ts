import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IntegrationArchiveSeedState } from '@memberjunction/graphql-dataprovider';
import { ArchiveSeedWizardComponent } from '../Integration/components/archive-seed-wizard/archive-seed-wizard.component';
import { DefaultBackupSourceValue } from '../Integration/components/backup-source-picker/backup-source-picker.component';
import type { IntegrationDataService } from '../Integration/services/integration-data.service';

type ServiceStub = {
  StartArchiveSeed: ReturnType<typeof vi.fn>;
  SelectArchiveSeedTables: ReturnType<typeof vi.fn>;
  FinishArchiveSeed: ReturnType<typeof vi.fn>;
  GetArchiveSeedState: ReturnType<typeof vi.fn>;
  TailBootstrapRun: ReturnType<typeof vi.fn>;
};

const TABLES = [
  { Name: 'dbo.Customers', ColumnCount: 12, HasPrimaryKey: true, WatermarkField: 'ModifiedAt' },
  { Name: 'dbo.Orders', ColumnCount: 8, HasPrimaryKey: true },
  { Name: 'dbo.AuditLog', ColumnCount: 4, HasPrimaryKey: false },
];

function emptyTail(seq = 0) {
  return { Success: true, Message: '', Events: [], LatestSeq: seq, IsInFlight: true };
}

function seedState(state: string, extra: Partial<IntegrationArchiveSeedState> = {}): { Success: boolean; State: IntegrationArchiveSeedState } {
  return { Success: true, State: { JobID: 'job-1', CompanyIntegrationID: 'ci-1', State: state, CurrentRunID: 'run-a', ...extra } };
}

function createWizard(): { wizard: ArchiveSeedWizardComponent; service: ServiceStub } {
  const wizard = Object.create(ArchiveSeedWizardComponent.prototype) as ArchiveSeedWizardComponent;
  const service: ServiceStub = {
    StartArchiveSeed: vi.fn(),
    SelectArchiveSeedTables: vi.fn(),
    FinishArchiveSeed: vi.fn(),
    GetArchiveSeedState: vi.fn(),
    TailBootstrapRun: vi.fn().mockResolvedValue(emptyTail()),
  };
  const internals = wizard as unknown as Record<string, unknown>;
  internals['cdr'] = { detectChanges: vi.fn() };
  internals['integrationService'] = service as unknown as IntegrationDataService;
  internals['lastSeq'] = 0;
  internals['pollTimer'] = null;
  internals['reconnectStartedAt'] = null;
  internals['generation'] = 0;
  internals['eventTables'] = undefined;
  internals['seedSummary'] = undefined;
  internals['isOpen'] = false;
  internals['resumeJobID'] = null;
  wizard.CurrentStep = 1;
  wizard.Source = { ...DefaultBackupSourceValue(), BackupUrls: 'https://acct.blob.core.windows.net/backups/db.bak', SasToken: 'sp=rl&sig=x' };
  wizard.ConnectionName = 'Legacy CRM';
  wizard.SelectedCompanyID = 'company-1';
  wizard.StagingDatabaseName = 'MJ_ArchiveSeed_1';
  wizard.BatchSize = 500000;
  wizard.JobID = null;
  wizard.RunID = null;
  wizard.CurrentState = null;
  wizard.ProgressLog = [];
  wizard.Tables = [];
  wizard.Selected = new Set<string>();
  wizard.Summary = null;
  wizard.ExecutionError = null;
  wizard.SelectionError = null;
  wizard.IsReconnecting = false;
  wizard.IsSubmitting = false;
  wizard.Closed = { emit: vi.fn() } as unknown as typeof wizard.Closed;
  wizard.Completed = { emit: vi.fn() } as unknown as typeof wizard.Completed;
  return { wizard, service };
}

/** A promise the test resolves by hand, to hold a service call in flight. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

function pollTimerOf(wizard: ArchiveSeedWizardComponent): unknown {
  return (wizard as unknown as Record<string, unknown>)['pollTimer'];
}

/** Runs one polling round the way the timer would. */
async function pollOnce(wizard: ArchiveSeedWizardComponent, jobID = 'job-1'): Promise<void> {
  await (wizard as unknown as { pollJob(id: string): Promise<void> }).pollJob(jobID);
}

describe('ArchiveSeedWizardComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('StartRestore sends the archive input and moves to step 2 with the run id', async () => {
    vi.useFakeTimers();
    const { wizard, service } = createWizard();
    service.StartArchiveSeed.mockResolvedValue({ Success: true, Message: 'started', JobID: 'job-1', RunID: 'run-a', CompanyIntegrationID: 'ci-1' });

    await wizard.StartRestore();

    expect(service.StartArchiveSeed).toHaveBeenCalledWith({
      CompanyID: 'company-1',
      ConnectionName: 'Legacy CRM',
      BackupUrls: 'https://acct.blob.core.windows.net/backups/db.bak',
      SasToken: 'sp=rl&sig=x',
      StorageCredentialID: undefined,
      StagingDatabaseName: 'MJ_ArchiveSeed_1',
      BatchSize: 500000,
    });
    expect(wizard.CurrentStep).toBe(2);
    expect(wizard.JobID).toBe('job-1');
    expect(wizard.RunID).toBe('run-a');
    expect(wizard.ExecutionError).toBeNull();
  });

  it('polling switches runs when CurrentRunID changes and resets the sequence', async () => {
    vi.useFakeTimers();
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.RunID = 'run-a';
    wizard.CurrentState = 'Building';
    (wizard as unknown as Record<string, unknown>)['lastSeq'] = 42;
    service.GetArchiveSeedState.mockResolvedValue(seedState('Mapping', { CurrentRunID: 'run-b' }));
    service.TailBootstrapRun.mockResolvedValue({
      ...emptyTail(3),
      Events: [{ Seq: 3, Ts: 't', EventType: 'stage.start', Stage: 'Mapping', Message: 'Creating entity maps' }],
    });

    await pollOnce(wizard);

    expect(service.TailBootstrapRun).toHaveBeenCalledWith('run-b', 0);
    expect(wizard.RunID).toBe('run-b');
    expect((wizard as unknown as Record<string, unknown>)['lastSeq']).toBe(3);
    expect(wizard.ProgressLog.map(l => l.Message)).toEqual(['Creating entity maps']);
    expect(wizard.CurrentStep).toBe(4);
  });

  it('a state of AwaitingSelection moves to step 3 with the tables from the Tables event, all selected', async () => {
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.RunID = 'run-a';
    wizard.CurrentStep = 2;
    service.GetArchiveSeedState.mockResolvedValue(seedState('AwaitingSelection'));
    service.TailBootstrapRun.mockResolvedValue({
      ...emptyTail(5),
      Events: [{ Seq: 5, Ts: 't', EventType: 'stage.complete', Stage: 'Tables', Message: '3 tables', DataJSON: JSON.stringify({ tables: TABLES }) }],
    });

    await pollOnce(wizard);

    expect(wizard.CurrentStep).toBe(3);
    expect(wizard.Tables.map(t => t.Name)).toEqual(['dbo.Customers', 'dbo.Orders', 'dbo.AuditLog']);
    expect(wizard.AllSelected).toBe(true);
    expect(wizard.Selected.size).toBe(3);
    expect((wizard as unknown as Record<string, unknown>)['pollTimer']).toBeNull();
  });

  it('CreateAndLoad refuses with no selection and otherwise sends the selected names', async () => {
    vi.useFakeTimers();
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.CurrentStep = 3;
    wizard.Tables = TABLES;
    wizard.AllSelected = false;

    await wizard.CreateAndLoad();
    expect(service.SelectArchiveSeedTables).not.toHaveBeenCalled();
    expect(wizard.SelectionError).toBeTruthy();
    expect(wizard.CurrentStep).toBe(3);

    wizard.AllSelected = true;
    wizard.Selected.delete('dbo.AuditLog');
    service.SelectArchiveSeedTables.mockResolvedValue({ Success: true, Message: 'ok' });
    await wizard.CreateAndLoad();

    expect(service.SelectArchiveSeedTables).toHaveBeenCalledWith('job-1', ['dbo.Customers', 'dbo.Orders']);
    expect(wizard.SelectionError).toBeNull();
    expect(wizard.CurrentStep).toBe(4);
    expect(wizard.CurrentState).toBe('Building');
  });

  it('network errors while Building are tolerated until the reconnect window elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.RunID = 'run-a';
    wizard.CurrentStep = 4;
    wizard.CurrentState = 'Building';
    service.GetArchiveSeedState.mockResolvedValue({ Success: false, Message: 'Failed to fetch' });

    await pollOnce(wizard);
    expect(wizard.IsReconnecting).toBe(true);
    expect(wizard.ExecutionError).toBeNull();

    vi.setSystemTime(new Date('2026-10-28T10:04:00Z'));
    await pollOnce(wizard);
    expect(wizard.IsReconnecting).toBe(true);
    expect(wizard.ExecutionError).toBeNull();

    vi.setSystemTime(new Date('2026-10-28T10:05:01Z'));
    await pollOnce(wizard);
    expect(wizard.IsReconnecting).toBe(false);
    expect(wizard.ExecutionError).toContain('Failed to fetch');
    expect((wizard as unknown as Record<string, unknown>)['pollTimer']).toBeNull();
  });

  it('a network error outside Building or Mapping fails the job at once', async () => {
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.CurrentStep = 2;
    wizard.CurrentState = 'Restoring';
    service.GetArchiveSeedState.mockRejectedValue(new Error('boom'));

    await pollOnce(wizard);

    expect(wizard.IsReconnecting).toBe(false);
    expect(wizard.ExecutionError).toContain('boom');
  });

  it('ResumeJobID loads the state and jumps to the matching step', async () => {
    const { wizard, service } = createWizard();
    service.GetArchiveSeedState.mockResolvedValue(seedState('AwaitingCleanupDecision', {
      StagingDatabaseName: 'MJ_ArchiveSeed_9',
      Summary: { TablesProcessed: 2, TotalRowsTransferred: 1200, DurationSeconds: 90, StagingDatabaseDropped: false },
    }));

    wizard.IsOpen = true;
    wizard.ResumeJobID = 'job-1';
    await vi.waitFor(() => expect(wizard.CurrentStep).toBe(5));

    expect(service.GetArchiveSeedState).toHaveBeenCalledWith('job-1');
    expect(service.TailBootstrapRun).toHaveBeenCalledWith('run-a', 0);
    expect(wizard.JobID).toBe('job-1');
    expect(wizard.StagingDatabaseName).toBe('MJ_ArchiveSeed_9');
    expect(wizard.Summary?.TotalRowsTransferred).toBe(1200);
  });

  it('RemoveArchive(true) finishes the job and moves to step 6 with the summary', async () => {
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.CurrentStep = 5;
    (wizard as unknown as Record<string, unknown>)['seedSummary'] = { TablesProcessed: 2, TotalRowsTransferred: 1200, DurationSeconds: 90, StagingDatabaseDropped: false };
    service.FinishArchiveSeed.mockResolvedValue({ Success: true, Message: 'done' });

    await wizard.RemoveArchive(true);

    expect(service.FinishArchiveSeed).toHaveBeenCalledWith('job-1', true);
    expect(wizard.CurrentStep).toBe(6);
    expect(wizard.Summary).toMatchObject({ Success: true, TablesProcessed: 2, TotalRowsTransferred: 1200, StagingDatabaseDropped: true });
    expect(wizard.Completed.emit).toHaveBeenCalledWith(wizard.Summary);
  });

  it('a Failed state shows the job error', async () => {
    const { wizard, service } = createWizard();
    wizard.JobID = 'job-1';
    wizard.CurrentStep = 4;
    wizard.Tables = TABLES;
    service.GetArchiveSeedState.mockResolvedValue(seedState('Failed', { Error: 'CodeGen failed' }));

    await pollOnce(wizard);

    expect(wizard.CurrentStep).toBe(4);
    expect(wizard.ExecutionError).toBe('CodeGen failed');
  });

  it('Close stops following the job and emits Closed', () => {
    const { wizard } = createWizard();
    wizard.JobID = 'job-1';
    wizard.Close();
    expect(wizard.JobID).toBeNull();
    expect(wizard.Closed.emit).toHaveBeenCalled();
  });

  describe('stops following the job once the wizard is closed or destroyed', () => {
    async function pollResolvingAfter(stop: (wizard: ArchiveSeedWizardComponent) => void): Promise<ArchiveSeedWizardComponent> {
      vi.useFakeTimers();
      const { wizard, service } = createWizard();
      wizard.JobID = 'job-1';
      wizard.CurrentStep = 4;
      wizard.CurrentState = 'Building';
      const pending = deferred<ReturnType<typeof seedState>>();
      service.GetArchiveSeedState.mockReturnValue(pending.promise);

      const round = pollOnce(wizard);
      stop(wizard);
      pending.resolve(seedState('Mapping', { CurrentRunID: 'run-b' }));
      await round;

      expect(service.TailBootstrapRun).not.toHaveBeenCalled();
      expect(pollTimerOf(wizard)).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(wizard.JobID).toBeNull();
      return wizard;
    }

    it('an in-flight state read that resolves after Close() arms no timer', async () => {
      const wizard = await pollResolvingAfter(w => w.Close());
      expect(wizard.CurrentState).toBe('Building');
    });

    it('an in-flight state read that resolves after ngOnDestroy() arms no timer', async () => {
      await pollResolvingAfter(w => w.ngOnDestroy());
    });

    it('an in-flight state read that resolves after the host binds IsOpen to false arms no timer', async () => {
      await pollResolvingAfter(w => {
        (w as unknown as Record<string, unknown>)['isOpen'] = true;
        w.IsOpen = false;
      });
    });

    it('an unreachable server after Close() does not keep reconnecting', async () => {
      vi.useFakeTimers();
      const { wizard, service } = createWizard();
      wizard.JobID = 'job-1';
      wizard.CurrentState = 'Building';
      const pending = deferred<{ Success: boolean; Message: string }>();
      service.GetArchiveSeedState.mockReturnValue(pending.promise);

      const round = pollOnce(wizard);
      wizard.Close();
      pending.resolve({ Success: false, Message: 'Failed to fetch' });
      await round;

      expect(wizard.IsReconnecting).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a StartArchiveSeed that resolves after Close() leaves JobID null and arms no timer', async () => {
      vi.useFakeTimers();
      const { wizard, service } = createWizard();
      const pending = deferred<{ Success: boolean; Message: string; JobID: string; RunID: string }>();
      service.StartArchiveSeed.mockReturnValue(pending.promise);

      const starting = wizard.StartRestore();
      wizard.Close();
      pending.resolve({ Success: true, Message: 'started', JobID: 'job-1', RunID: 'run-a' });
      await starting;

      expect(wizard.JobID).toBeNull();
      expect(wizard.RunID).toBeNull();
      expect(pollTimerOf(wizard)).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
