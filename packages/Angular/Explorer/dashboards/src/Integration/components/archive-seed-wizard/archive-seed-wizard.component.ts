import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type {
  IntegrationArchiveSeedState,
  IntegrationArchiveSeedSummary,
  IntegrationArchiveSeedTable,
} from '@memberjunction/graphql-dataprovider';
import { IntegrationDataService, InspectBackupResult } from '../../services/integration-data.service';
import {
  ArchiveSeedWizardStep,
  BootstrapProgressLine,
  BootstrapResultSummary,
  ProgressLinesFromEvents,
  ReadSeedTablesFromEvents,
  StepForSeedState,
  SummarizeArchiveSeed,
} from '../../services/backup-source.helpers';
import { BackupSourceValue, DefaultBackupSourceValue, IsBackupSourceValid } from '../backup-source-picker/backup-source-picker.component';

/** How often the wizard reads the job's state and run events while the job works. */
const RUN_POLL_INTERVAL_MS = 2500;
/** How long the wizard keeps retrying while the API restarts after CodeGen. */
const RECONNECT_WINDOW_MS = 5 * 60_000;
/** Job states during which the API restarts, so an unreachable server is expected. */
const RESTARTING_STATES = new Set(['Building', 'Mapping']);
/** The prefix the server's drop action accepts; a staging name without it could never be cleaned up. */
const STAGING_PREFIX = 'MJ_Staging_';
/** Job states the wizard stops polling at: the user acts next, or the job is over. */
const RESTING_STATES = new Set(['AwaitingSelection', 'AwaitingCleanupDecision', 'Done', 'Failed']);

/**
 * Seeds a new SQL Server connection from a backup archive: restore the archive to a staging
 * database, pick the tables to bring in, build the tables and entities (CodeGen plus an API
 * restart), load them, then decide whether to keep the restored archive. The job runs detached on
 * the server; the wizard follows it by polling its state and tailing the current run's events, and
 * can resume an existing job by ID.
 */
@Component({
  standalone: false,
  selector: 'app-archive-seed-wizard',
  templateUrl: './archive-seed-wizard.component.html',
  styleUrls: ['./archive-seed-wizard.component.css']
})
export class ArchiveSeedWizardComponent extends BaseAngularComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private integrationService = inject(IntegrationDataService);

  private isOpen = false;
  @Input()
  set IsOpen(value: boolean) {
    const opening = value && !this.isOpen;
    const closing = !value && this.isOpen;
    this.isOpen = value;
    if (closing) {
      this.stopFollowing();
    }
    if (opening) {
      this.resetWizard();
      if (this.resumeJobID) {
        void this.resumeJob(this.resumeJobID);
      }
    }
  }
  get IsOpen(): boolean {
    return this.isOpen;
  }

  @Input() Companies: Array<{ ID: string; Name: string }> = [];

  private defaultCompanyID: string | null = null;
  @Input()
  set DefaultCompanyID(value: string | null) {
    this.defaultCompanyID = value;
    if (!this.SelectedCompanyID && value) {
      this.SelectedCompanyID = value;
    }
  }
  get DefaultCompanyID(): string | null {
    return this.defaultCompanyID;
  }

  private resumeJobID: string | null = null;
  /** An existing job to follow; when set while open, the wizard jumps to the job's step. */
  @Input()
  set ResumeJobID(value: string | null) {
    this.resumeJobID = value;
    if (value && this.isOpen && this.JobID !== value) {
      void this.resumeJob(value);
    }
  }
  get ResumeJobID(): string | null {
    return this.resumeJobID;
  }

  /** Emitted on close; `true` when a job was started or followed, so the host reloads its cards. */
  @Output() Closed = new EventEmitter<boolean>();
  /** Emitted once per job when it reaches Done (whether finished here or found Done on resume). */
  @Output() Completed = new EventEmitter<BootstrapResultSummary>();

  CurrentStep: ArchiveSeedWizardStep = 1;
  readonly Steps: ReadonlyArray<{ Number: ArchiveSeedWizardStep; Label: string }> = [
    { Number: 1, Label: 'Archive' },
    { Number: 2, Label: 'Restore' },
    { Number: 3, Label: 'Tables' },
    { Number: 4, Label: 'Build' },
    { Number: 5, Label: 'Cleanup' },
    { Number: 6, Label: 'Done' },
  ];

  // Step 1: Archive
  Source: BackupSourceValue = DefaultBackupSourceValue();
  ConnectionName = '';
  SelectedCompanyID = '';
  StagingDatabaseName = '';
  BatchSize = 500000;

  // The job
  JobID: string | null = null;
  RunID: string | null = null;
  /** The job's last known server state (e.g. Restoring, AwaitingSelection, Building). */
  CurrentState: string | null = null;
  ProgressLog: BootstrapProgressLine[] = [];
  ExecutionError: string | null = null;
  IsReconnecting = false;
  IsSubmitting = false;

  // Step 3: Tables
  Tables: IntegrationArchiveSeedTable[] = [];
  Selected: Set<string> = new Set<string>();
  SelectionError: string | null = null;

  // Steps 5-6: Cleanup and completion
  Summary: BootstrapResultSummary | null = null;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeq = 0;
  private reconnectStartedAt: number | null = null;
  /**
   * Bumped whenever the wizard stops following a job (close, destroy, a new job). Every async path
   * captures it before awaiting and bails out afterwards when it changed, so a request still in
   * flight can never re-arm the poll timer or write state into a closed or destroyed wizard.
   */
  private generation = 0;
  private eventTables: IntegrationArchiveSeedTable[] | undefined = undefined;
  private seedSummary: IntegrationArchiveSeedSummary | undefined = undefined;
  /** Completed was already emitted for the followed job. */
  private completedEmitted = false;

  ngOnDestroy(): void {
    this.stopFollowing();
  }

  public get IsStep1Valid(): boolean {
    return IsBackupSourceValid(this.Source)
      && this.ConnectionName.trim().length > 0
      && this.SelectedCompanyID.length > 0
      && this.StagingDatabaseName.trim().length > 0;
  }

  public get AllSelected(): boolean {
    return this.Tables.length > 0 && this.Selected.size === this.Tables.length;
  }
  public set AllSelected(value: boolean) {
    this.Selected = value ? new Set(this.Tables.map(t => t.Name)) : new Set<string>();
  }

  /** The step-4 headline for the job's current state. */
  public get BuildStageLabel(): string {
    switch (this.CurrentState) {
      case 'Building': return 'Creating tables and entities (CodeGen and an API restart)…';
      case 'Mapping': return 'Mapping the new entities to the connection…';
      case 'Loading':
      case 'Seeding': return 'Loading the selected tables…';
      default: return 'Working…';
    }
  }

  public FormatSeconds(seconds: number | undefined): string {
    if (seconds === undefined) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins === 0 ? `${secs}s` : `${mins}m ${secs}s`;
  }

  public ToggleTable(name: string): void {
    if (this.Selected.has(name)) {
      this.Selected.delete(name);
    } else {
      this.Selected.add(name);
    }
    this.SelectionError = null;
  }

  /** The picker read a local backup's header; name the connection after its database when unnamed. */
  public OnVerified(result: InspectBackupResult): void {
    if (!this.ConnectionName.trim() && result.DatabaseName) {
      this.ConnectionName = result.DatabaseName;
    }
  }

  /** Step 1 → 2: launches the job (restore and discover) and starts following it. */
  public async StartRestore(): Promise<void> {
    if (!this.IsStep1Valid || this.IsSubmitting) return;
    this.clearJob();
    const generation = this.generation;
    this.CurrentStep = 2;
    this.IsSubmitting = true;
    this.cdr.detectChanges();
    try {
      const isAzure = this.Source.SourceType === 'azure';
      const started = await this.integrationService.StartArchiveSeed({
        CompanyID: this.SelectedCompanyID,
        ConnectionName: this.ConnectionName.trim(),
        BackupUrls: this.Source.BackupUrls.trim(),
        SasToken: isAzure && this.Source.AuthMode === 'sas' ? this.Source.SasToken.trim() : undefined,
        StorageCredentialID: isAzure && this.Source.AuthMode === 'credential' ? this.Source.StorageCredentialID : undefined,
        StagingDatabaseName: this.StagingDatabaseName.trim(),
        BatchSize: this.BatchSize,
      });
      if (generation !== this.generation) return; // closed or destroyed while starting
      if (!started.Success || !started.JobID) {
        this.ExecutionError = started.Message || 'The archive seed could not be started.';
        return;
      }
      this.JobID = started.JobID;
      this.RunID = started.RunID ?? null;
      this.CurrentState = 'Restoring';
      this.schedulePoll(started.JobID);
    } catch (err) {
      this.ExecutionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.IsSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /** Step 3 → 4: sends the selected tables; the build runs detached on the server. */
  public async CreateAndLoad(): Promise<void> {
    if (!this.JobID || this.IsSubmitting) return;
    const names = this.Tables.filter(t => this.Selected.has(t.Name)).map(t => t.Name);
    if (names.length === 0) {
      this.SelectionError = 'Select at least one table to seed.';
      this.cdr.detectChanges();
      return;
    }
    const jobID = this.JobID;
    const generation = this.generation;
    this.IsSubmitting = true;
    this.SelectionError = null;
    this.cdr.detectChanges();
    try {
      const result = await this.integrationService.SelectArchiveSeedTables(jobID, names);
      if (generation !== this.generation) return;
      if (!result.Success) {
        this.SelectionError = result.Message || 'The table selection was not accepted.';
        return;
      }
      // The API restarts during the build; marking the state now lets polling ride out the restart.
      this.CurrentState = 'Building';
      this.ExecutionError = null;
      this.CurrentStep = 4;
      this.schedulePoll(jobID);
    } finally {
      this.IsSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /** Step 5 → 6: finishes the job, dropping the restored staging database when `drop` is true. */
  public async RemoveArchive(drop: boolean): Promise<void> {
    if (!this.JobID || this.IsSubmitting) return;
    const generation = this.generation;
    this.IsSubmitting = true;
    this.ExecutionError = null;
    this.cdr.detectChanges();
    try {
      const result = await this.integrationService.FinishArchiveSeed(this.JobID, drop);
      if (generation !== this.generation) return;
      if (!result.Success) {
        this.ExecutionError = result.Message || 'The archive seed could not be finished.';
        return;
      }
      const summary = SummarizeArchiveSeed(this.seedSummary, undefined);
      this.Summary = { ...summary, Success: true, Message: 'Archive seed completed.', StagingDatabaseDropped: drop };
      this.CurrentState = 'Done';
      this.CurrentStep = 6;
      this.emitCompleted(this.Summary);
    } catch (err) {
      this.ExecutionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.IsSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /** Back to step 1 after a launch failed. */
  public BackToArchive(): void {
    this.clearJob();
    this.CurrentStep = 1;
    this.cdr.detectChanges();
  }

  /** Closes the wizard. The job keeps running on the server and can be resumed by its ID. */
  public Close(): void {
    const jobStarted = this.JobID !== null;
    this.stopFollowing();
    this.Closed.emit(jobStarted);
  }

  public Finish(): void {
    this.Close();
  }

  // --- Following the job ---

  private async resumeJob(jobID: string): Promise<void> {
    this.clearJob();
    this.JobID = jobID;
    this.CurrentStep = 2;
    this.cdr.detectChanges();
    await this.pollJob(jobID);
  }

  /** One polling round: read the job's state, tail its current run, then show the state. */
  private async pollJob(jobID: string): Promise<void> {
    const generation = this.generation;
    if (this.JobID !== jobID) return;
    const read = await this.readState(jobID);
    if (generation !== this.generation || this.JobID !== jobID) return;
    if (!read.State) {
      this.handleUnreachable(jobID, read.Message);
      return;
    }
    this.reconnectStartedAt = null;
    this.IsReconnecting = false;
    await this.tailRun(read.State.CurrentRunID);
    if (generation !== this.generation || this.JobID !== jobID) return;
    this.applyState(read.State);
    if (!RESTING_STATES.has(read.State.State)) {
      this.schedulePoll(jobID);
    }
    this.cdr.detectChanges();
  }

  /** The job's state, or a message saying why it could not be read (a thrown call counts as unreachable). */
  private async readState(jobID: string): Promise<{ State?: IntegrationArchiveSeedState; Message: string }> {
    try {
      const result = await this.integrationService.GetArchiveSeedState(jobID);
      return result.Success && result.State
        ? { State: result.State, Message: '' }
        : { Message: result.Message || 'The archive seed job could not be read.' };
    } catch (err) {
      return { Message: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * The server could not be reached. While the job builds, the API restarts, so the wizard keeps
   * retrying for RECONNECT_WINDOW_MS; at any other time, or once the window passes, the job is
   * reported as lost.
   */
  private handleUnreachable(jobID: string, message: string): void {
    const now = Date.now();
    const restarting = this.CurrentState !== null && RESTARTING_STATES.has(this.CurrentState);
    if (restarting && this.reconnectStartedAt === null) {
      this.reconnectStartedAt = now;
    }
    if (!restarting || now - (this.reconnectStartedAt ?? now) > RECONNECT_WINDOW_MS) {
      const prefix = restarting ? 'The API did not come back after the restart' : 'Lost track of the archive seed job';
      this.failJob(`${prefix}: ${message}`);
      return;
    }
    this.IsReconnecting = true;
    this.schedulePoll(jobID);
    this.cdr.detectChanges();
  }

  /** Appends the run's new events to the log. The job opens a new run after the API restart; a new run starts from its first event. */
  private async tailRun(runID: string | undefined): Promise<void> {
    if (!runID) return;
    const generation = this.generation;
    if (runID !== this.RunID) {
      this.RunID = runID;
      this.lastSeq = 0;
    }
    try {
      const tail = await this.integrationService.TailBootstrapRun(runID, this.lastSeq);
      if (generation !== this.generation || !tail.Success || this.RunID !== runID) return;
      this.ProgressLog = [...this.ProgressLog, ...ProgressLinesFromEvents(tail.Events)];
      this.eventTables = ReadSeedTablesFromEvents(tail.Events) ?? this.eventTables;
      this.lastSeq = Math.max(this.lastSeq, tail.LatestSeq);
    } catch {
      // The log is best effort; the job's state drives the wizard.
    }
  }

  /** Moves the wizard to the step the job's state calls for, with that step's data. */
  private applyState(state: IntegrationArchiveSeedState): void {
    this.CurrentState = state.State;
    if (state.StagingDatabaseName) {
      this.StagingDatabaseName = state.StagingDatabaseName;
    }
    if (state.State === 'AwaitingSelection') {
      this.enterTableSelection(state.Tables);
    }
    if (state.State === 'AwaitingCleanupDecision' || state.State === 'Done') {
      this.seedSummary = state.Summary ?? this.seedSummary;
      this.Summary = SummarizeArchiveSeed(this.seedSummary, undefined);
    }
    if (state.State === 'Done' && this.Summary) {
      // A job found already Done (resumed after it finished elsewhere) still completes once here.
      this.emitCompleted(this.Summary);
    }
    if (state.State === 'Failed') {
      this.stopPolling();
      this.ExecutionError = state.Error ?? 'The archive seed failed.';
    }
    const hasTables = this.Tables.length > 0 || (state.Tables?.length ?? 0) > 0;
    this.CurrentStep = StepForSeedState(state.State, hasTables);
  }

  /** Shows the discovered tables, all selected, the first time the job asks for a selection. */
  private enterTableSelection(stateTables: IntegrationArchiveSeedTable[] | undefined): void {
    if (this.Tables.length > 0) return;
    this.Tables = stateTables && stateTables.length > 0 ? stateTables : this.eventTables ?? [];
    this.AllSelected = true;
  }

  private emitCompleted(summary: BootstrapResultSummary): void {
    if (this.completedEmitted) return;
    this.completedEmitted = true;
    this.Completed.emit(summary);
  }

  private failJob(message: string): void {
    this.stopPolling();
    this.IsReconnecting = false;
    this.ExecutionError = message;
    this.cdr.detectChanges();
  }

  /** Stops following the current job: in-flight requests are discarded and no further poll runs. */
  private stopFollowing(): void {
    this.generation++;
    this.stopPolling();
    this.JobID = null;
  }

  private schedulePoll(jobID: string): void {
    this.stopPolling();
    this.pollTimer = setTimeout(() => { void this.pollJob(jobID); }, RUN_POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = null;
  }

  /** Forgets the followed job (stops polling) and everything learned from it. */
  private clearJob(): void {
    this.stopFollowing();
    this.RunID = null;
    this.CurrentState = null;
    this.ProgressLog = [];
    this.lastSeq = 0;
    this.reconnectStartedAt = null;
    this.ExecutionError = null;
    this.IsReconnecting = false;
    this.Tables = [];
    this.Selected = new Set<string>();
    this.SelectionError = null;
    this.Summary = null;
    this.eventTables = undefined;
    this.seedSummary = undefined;
    this.completedEmitted = false;
  }

  private resetWizard(): void {
    this.clearJob();
    this.IsSubmitting = false;
    this.CurrentStep = 1;
    this.Source = DefaultBackupSourceValue();
    this.ConnectionName = '';
    this.SelectedCompanyID = this.defaultCompanyID ?? '';
    // The server's prefix, so the job's drop accepts it; the timestamp keeps it unique per open.
    this.StagingDatabaseName = `${STAGING_PREFIX}Seed_${Date.now()}`;
    this.BatchSize = 500000;
  }
}
