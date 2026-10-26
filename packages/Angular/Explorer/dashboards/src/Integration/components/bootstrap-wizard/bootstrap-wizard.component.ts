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
import { Metadata, RunView } from '@memberjunction/core';
import { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { IntegrationDataService, EntityMapRow } from '../../services/integration-data.service';

export interface BootstrapResultSummary {
  Success: boolean;
  Message: string;
  BackupStartDate?: string;
  StagingDatabaseName?: string;
  TablesProcessed?: number;
  TotalRowsTransferred?: number;
  DurationSeconds?: number;
  StagingDatabaseDropped?: boolean;
}

export type WizardStepType = 1 | 2 | 3 | 4;

@Component({
  standalone: false,
  selector: 'app-bootstrap-wizard',
  templateUrl: './bootstrap-wizard.component.html',
  styleUrls: ['./bootstrap-wizard.component.css']
})
export class BootstrapWizardComponent implements OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private integrationService = inject(IntegrationDataService);

  @Input() CompanyIntegration: MJCompanyIntegrationEntity | null = null;
  @Input() IsOpen = false;

  @Output() Closed = new EventEmitter<void>();
  @Output() Completed = new EventEmitter<BootstrapResultSummary>();

  // Wizard state
  CurrentStep: WizardStepType = 1;

  // Step 1: Configuration
  BackupUrls = '';
  AuthMode: 'sas' | 'credential' = 'sas';
  SasToken = '';
  SelectedCredentialID = '';
  StagingDatabaseName = '';
  DropStagingDbOnComplete = true;
  BatchSize = 500000;

  AvailableCredentials: MJCredentialEntity[] = [];
  IsLoadingCredentials = false;

  // Step 2: Inspection & Preview
  EntityMaps: EntityMapRow[] = [];
  IsLoadingPreview = false;

  // Step 3: Execution Cockpit
  IsExecuting = false;
  ExecutionStage = 'Preparing SQL Server instance...';
  ElapsedSeconds = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  ExecutionError: string | null = null;

  // Step 4: Completion
  ResultSummary: BootstrapResultSummary | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.resetWizard();
      this.loadCredentials();
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  public get IsStep1Valid(): boolean {
    const hasUrls = this.BackupUrls.trim().length > 0;
    const hasAuth = this.AuthMode === 'sas'
      ? this.SasToken.trim().length > 0
      : this.SelectedCredentialID.trim().length > 0;
    const hasDbName = this.StagingDatabaseName.trim().length > 0;
    return hasUrls && hasAuth && hasDbName;
  }

  public GoToStep(step: WizardStepType): void {
    if (step === 2) {
      if (!this.IsStep1Valid) return;
      this.loadPreview();
    }
    this.CurrentStep = step;
    this.cdr.detectChanges();
  }

  public async StartBootstrap(): Promise<void> {
    if (!this.CompanyIntegration) return;

    this.CurrentStep = 3;
    this.IsExecuting = true;
    this.ExecutionError = null;
    this.ElapsedSeconds = 0;
    this.startTimer();

    this.ExecutionStage = 'Connecting to Azure Blob and inspecting backup headers...';
    this.cdr.detectChanges();

    try {
      // Small simulated stages for UX responsiveness while backend action runs
      setTimeout(() => {
        if (this.IsExecuting) {
          this.ExecutionStage = 'Restoring staging database directly from Azure Blob stripes...';
          this.cdr.detectChanges();
        }
      }, 3000);

      setTimeout(() => {
        if (this.IsExecuting) {
          this.ExecutionStage = 'Executing local minimally-logged set-based ETL with TABLOCK...';
          this.cdr.detectChanges();
        }
      }, 7000);

      const result = await this.integrationService.RunBootstrapFromBackup(
        this.CompanyIntegration.ID,
        {
          BackupUrls: this.BackupUrls.trim(),
          SasToken: this.AuthMode === 'sas' ? this.SasToken.trim() : undefined,
          StorageCredentialID: this.AuthMode === 'credential' ? this.SelectedCredentialID : undefined,
          StagingDatabaseName: this.StagingDatabaseName.trim(),
          DropStagingDbOnComplete: this.DropStagingDbOnComplete,
          BatchSize: this.BatchSize,
        }
      );

      this.stopTimer();
      this.IsExecuting = false;

      if (result.Success) {
        this.ResultSummary = result;
        this.CurrentStep = 4;
        this.Completed.emit(result);
      } else {
        this.ExecutionError = result.Message || 'Bootstrap failed unexpectedly.';
      }
    } catch (err) {
      this.stopTimer();
      this.IsExecuting = false;
      this.ExecutionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  public Close(): void {
    this.stopTimer();
    this.IsOpen = false;
    this.Closed.emit();
  }

  public Finish(): void {
    this.Close();
  }

  private resetWizard(): void {
    this.CurrentStep = 1;
    this.BackupUrls = '';
    this.AuthMode = 'sas';
    this.SasToken = '';
    this.SelectedCredentialID = '';
    this.DropStagingDbOnComplete = true;
    this.BatchSize = 500000;
    this.IsExecuting = false;
    this.ExecutionError = null;
    this.ResultSummary = null;
    this.stopTimer();

    if (this.CompanyIntegration) {
      const cleanId = this.CompanyIntegration.ID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
      this.StagingDatabaseName = `MJ_Staging_${cleanId}_${Date.now().toString().slice(-4)}`;
    } else {
      this.StagingDatabaseName = `MJ_Staging_${Date.now()}`;
    }
  }

  private async loadCredentials(): Promise<void> {
    this.IsLoadingCredentials = true;
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJCredentialEntity>({
        EntityName: 'MJ: Credentials',
        ExtraFilter: "Status = 'Active'",
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      });
      if (result.Success) {
        this.AvailableCredentials = result.Results ?? [];
      }
    } catch {
      // Non-fatal, user can use direct SAS token
    } finally {
      this.IsLoadingCredentials = false;
      this.cdr.detectChanges();
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
