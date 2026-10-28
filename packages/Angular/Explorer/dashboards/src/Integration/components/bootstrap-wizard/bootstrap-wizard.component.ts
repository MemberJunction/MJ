import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
  IntegrationDataService,
  EntityMapRow,
  InspectBackupResult,
  AzureBlobItem,
  ListAzureBackupBlobsResult
} from '../../services/integration-data.service';
import {
  BootstrapProgressLine,
  BootstrapResultSummary,
  ProgressLinesFromEvents,
  SummarizeBootstrapRun,
} from '../../services/backup-source.helpers';
import { BackupSourceValue, DefaultBackupSourceValue, IsBackupSourceValid } from '../backup-source-picker/backup-source-picker.component';

export type { AzureBlobItem, InspectBackupResult, ListAzureBackupBlobsResult, BootstrapResultSummary, BootstrapProgressLine };

/** How often the wizard asks the server for new run events while a bootstrap is running. */
const RUN_POLL_INTERVAL_MS = 2500;

export type WizardStepType = 1 | 2 | 3 | 4;
export type ExecutionStatusType = 'idle' | 'running' | 'succeeded' | 'failed';

@Component({
  standalone: false,
  selector: 'app-bootstrap-wizard',
  templateUrl: './bootstrap-wizard.component.html',
  styleUrls: ['./bootstrap-wizard.component.css']
})
export class BootstrapWizardComponent extends BaseAngularComponent implements OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private integrationService = inject(IntegrationDataService);

  @Input() CompanyIntegration: MJCompanyIntegrationEntity | null = null;
  @Input() IsOpen = false;

  @Output() Closed = new EventEmitter<void>();
  @Output() Completed = new EventEmitter<BootstrapResultSummary>();

  // Wizard state
  CurrentStep: WizardStepType = 1;

  // Step 1: Configuration — the backup source half is owned by <app-backup-source-picker>
  Source: BackupSourceValue = DefaultBackupSourceValue();
  /** The header of the local backup the picker last verified, if any. */
  VerifiedBackup: InspectBackupResult | null = null;
  StagingDatabaseName = '';
  DropStagingDbOnComplete = true;
  TruncateTargetBeforeLoad = false;
  BatchSize = 500000;

  // Step 2: Inspection & Preview
  EntityMaps: EntityMapRow[] = [];
  IsLoadingPreview = false;

  // Step 3: Execution Cockpit — a detached server run the wizard follows by polling its event stream
  ExecutionStatus: ExecutionStatusType = 'idle';
  ExecutionStage = 'Preparing SQL Server instance...';
  ElapsedSeconds = 0;
  RunID: string | null = null;
  ProgressLog: BootstrapProgressLine[] = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeq = 0;
  ExecutionError: string | null = null;

  // Step 4: Completion
  ResultSummary: BootstrapResultSummary | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.resetWizard();
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.stopPolling();
  }

  public get IsExecuting(): boolean {
    return this.ExecutionStatus === 'running';
  }

  public get IsStep1Valid(): boolean {
    return IsBackupSourceValid(this.Source) && this.StagingDatabaseName.trim().length > 0;
  }

  /** The picker read a local backup's header. */
  public OnVerified(result: InspectBackupResult): void {
    this.VerifiedBackup = result;
  }

  public GoToStep(step: WizardStepType): void {
    if (step === 2) {
      if (!this.IsStep1Valid) return;
      this.loadPreview();
    }
    this.CurrentStep = step;
    this.cdr.detectChanges();
  }

  /**
   * Launches the bootstrap as a detached server run and follows it. The restore and loads take
   * hours, so nothing here awaits the work itself: the server answers with a run ID at once and the
   * wizard polls the run's event stream until it is terminal.
   */
  public async StartBootstrap(): Promise<void> {
    if (!this.CompanyIntegration) return;

    this.CurrentStep = 3;
    this.ExecutionStatus = 'running';
    this.ExecutionError = null;
    this.ElapsedSeconds = 0;
    this.RunID = null;
    this.ProgressLog = [];
    this.lastSeq = 0;
    this.ExecutionStage = 'Starting the bootstrap run...';
    this.startTimer();
    this.cdr.detectChanges();

    try {
      const isAzure = this.Source.SourceType === 'azure';
      const started = await this.integrationService.StartBootstrapFromBackup(
        this.CompanyIntegration.ID,
        {
          BackupUrls: this.Source.BackupUrls.trim(),
          SasToken: isAzure && this.Source.AuthMode === 'sas' ? this.Source.SasToken.trim() : undefined,
          StorageCredentialID: isAzure && this.Source.AuthMode === 'credential' ? this.Source.StorageCredentialID : undefined,
          StagingDatabaseName: this.StagingDatabaseName.trim(),
          DropStagingDbOnComplete: this.DropStagingDbOnComplete,
          TruncateTargetBeforeLoad: this.TruncateTargetBeforeLoad,
          BatchSize: this.BatchSize,
        }
      );

      if (!started.Success || !started.RunID) {
        this.failRun(started.Message || 'The bootstrap could not be started.');
        return;
      }
      this.RunID = started.RunID;
      this.ExecutionStage = 'Run started; waiting for the first stage...';
      await this.pollRun(started.RunID);
    } catch (err) {
      this.failRun(err instanceof Error ? err.message : String(err));
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** One polling round: append new events to the log, then finish the run or schedule the next round. */
  private async pollRun(runID: string): Promise<void> {
    if (this.RunID !== runID) {
      return; // the wizard was closed or reset while the request was in flight
    }
    const tail = await this.integrationService.TailBootstrapRun(runID, this.lastSeq);
    if (this.RunID !== runID) {
      return;
    }
    if (!tail.Success) {
      this.failRun(tail.Message || 'Lost track of the bootstrap run.');
      return;
    }
    const lines = ProgressLinesFromEvents(tail.Events);
    if (lines.length > 0) {
      this.ProgressLog = [...this.ProgressLog, ...lines];
      this.ExecutionStage = lines[lines.length - 1].Message;
    }
    this.lastSeq = Math.max(this.lastSeq, tail.LatestSeq);
    this.cdr.detectChanges();

    if (tail.IsInFlight) {
      this.pollTimer = setTimeout(() => { void this.pollRun(runID); }, RUN_POLL_INTERVAL_MS);
      return;
    }
    await this.finishRun(runID);
  }

  /** The run is terminal: read its outcome and move to the completion step or show the failure. */
  private async finishRun(runID: string): Promise<void> {
    const detail = await this.integrationService.GetBootstrapRun(runID);
    if (this.RunID !== runID) {
      return;
    }
    this.stopTimer();
    const summary = detail.Run
      ? SummarizeBootstrapRun(detail.Run, this.ProgressLog.map(line => ({ Seq: line.Seq, Ts: line.Ts, EventType: 'log', Message: line.Message })), detail.Errors)
      : { Success: false, Message: detail.Message || 'The bootstrap run could not be read.', RunID: runID };
    if (detail.Run && summary.Success) {
      // The outputs ride on the Summary event; re-read the tail so the summary sees that event's data.
      const full = await this.integrationService.TailBootstrapRun(runID, 0);
      const withOutputs = SummarizeBootstrapRun(detail.Run, full.Events, detail.Errors);
      this.ExecutionStatus = 'succeeded';
      this.ResultSummary = withOutputs;
      this.CurrentStep = 4;
      this.Completed.emit(withOutputs);
    } else {
      this.ExecutionStatus = 'failed';
      this.ExecutionError = summary.Message;
    }
    this.cdr.detectChanges();
  }

  private failRun(message: string): void {
    this.stopTimer();
    this.stopPolling();
    this.ExecutionStatus = 'failed';
    this.ExecutionError = message;
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public Close(): void {
    this.stopTimer();
    this.stopPolling();
    this.RunID = null;
    this.Closed.emit();
  }

  public Finish(): void {
    this.Close();
  }

  private resetWizard(): void {
    this.CurrentStep = 1;
    this.Source = DefaultBackupSourceValue();
    this.VerifiedBackup = null;
    this.DropStagingDbOnComplete = true;
    this.TruncateTargetBeforeLoad = false;
    this.BatchSize = 500000;
    this.ExecutionStatus = 'idle';
    this.ExecutionError = null;
    this.ResultSummary = null;
    this.RunID = null;
    this.ProgressLog = [];
    this.lastSeq = 0;
    this.stopTimer();
    this.stopPolling();

    if (this.CompanyIntegration) {
      const cleanId = this.CompanyIntegration.ID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
      this.StagingDatabaseName = `MJ_Staging_${cleanId}_${Date.now().toString().slice(-4)}`;
    } else {
      this.StagingDatabaseName = `MJ_Staging_${Date.now()}`;
    }
  }

  private async loadPreview(): Promise<void> {
    if (!this.CompanyIntegration) return;

    this.IsLoadingPreview = true;
    try {
      this.EntityMaps = await this.integrationService.LoadEntityMaps(this.CompanyIntegration.ID);
    } catch {
      this.EntityMaps = [];
    } finally {
      this.IsLoadingPreview = false;
      this.cdr.detectChanges();
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.ElapsedSeconds = 0;
    this.timerInterval = setInterval(() => {
      this.ElapsedSeconds++;
      this.cdr.detectChanges();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  public FormatSeconds(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }
}