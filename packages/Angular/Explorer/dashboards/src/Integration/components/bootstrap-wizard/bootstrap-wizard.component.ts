import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
  IntegrationDataService,
  EntityMapRow,
  InspectBackupResult,
  AzureBlobItem,
  ListAzureBackupBlobsResult
} from '../../services/integration-data.service';
import { AppendDirectoryPreset, BuildBackupUrlList, DeriveContainerUrl, FirstBackupUrl, FormatBytes } from '../../services/backup-source.helpers';

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

export type { AzureBlobItem, InspectBackupResult, ListAzureBackupBlobsResult };

export interface DirectoryPreset {
  Label: string;
  Path: string;
}

export type WizardStepType = 1 | 2 | 3 | 4;
export type ExecutionStatusType = 'idle' | 'running' | 'succeeded' | 'failed';

@Component({
  standalone: false,
  selector: 'app-bootstrap-wizard',
  templateUrl: './bootstrap-wizard.component.html',
  styleUrls: ['./bootstrap-wizard.component.css']
})
export class BootstrapWizardComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private integrationService = inject(IntegrationDataService);

  @Input() CompanyIntegration: MJCompanyIntegrationEntity | null = null;
  @Input() IsOpen = false;

  @Output() Closed = new EventEmitter<void>();
  @Output() Completed = new EventEmitter<BootstrapResultSummary>();

  // Wizard state
  CurrentStep: WizardStepType = 1;

  // Step 1: Configuration
  SourceType: 'azure' | 'local' = 'azure';
  BackupUrls = '';
  AuthMode: 'sas' | 'credential' = 'sas';
  SasToken = '';
  SelectedCredentialID = '';
  StagingDatabaseName = '';
  DropStagingDbOnComplete = true;
  TruncateTargetBeforeLoad = false;
  BatchSize = 500000;

  AvailableCredentials: MJCredentialEntity[] = [];
  IsLoadingCredentials = false;
  CredentialsError: string | null = null;

  // Azure Blob Browser State
  AzureContainerUrl = '';
  IsBrowsingAzure = false;
  AzureBlobs: AzureBlobItem[] = [];
  SelectedAzureBlobs: Set<string> = new Set<string>();
  AzureBlobSearch = '';
  AzureBrowseError: string | null = null;
  ShowOnlyBakBlobs = true;

  // Local File & Verification State
  IsVerifyingBackup = false;
  VerifiedBackupHeader: InspectBackupResult | null = null;
  VerifyBackupError: string | null = null;
  DirectoryPresets: DirectoryPreset[] = [
    { Label: 'Linux MSSQL Default', Path: '/var/opt/mssql/backup' },
    { Label: 'Windows MSSQL Default', Path: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup' },
    { Label: 'Windows C:\\SQLBackups', Path: 'C:\\SQLBackups' },
    { Label: 'Root /backups', Path: '/backups' }
  ];

  // Step 2: Inspection & Preview
  EntityMaps: EntityMapRow[] = [];
  IsLoadingPreview = false;

  // Step 3: Execution Cockpit
  ExecutionStatus: ExecutionStatusType = 'idle';
  ExecutionStage = 'Preparing SQL Server instance...';
  ElapsedSeconds = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  ExecutionError: string | null = null;

  // Step 4: Completion
  ResultSummary: BootstrapResultSummary | null = null;

  ngOnInit(): void {
    this.RefreshLocalFiles();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.resetWizard();
      this.loadCredentials();
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  public get IsExecuting(): boolean {
    return this.ExecutionStatus === 'running';
  }

  public get IsStep1Valid(): boolean {
    const hasUrls = this.BackupUrls.trim().length > 0;
    const hasDbName = this.StagingDatabaseName.trim().length > 0;

    if (this.SourceType === 'local') {
      return hasUrls && hasDbName;
    }

    const hasAuth = this.AuthMode === 'sas'
      ? this.SasToken.trim().length > 0
      : this.SelectedCredentialID.trim().length > 0;
    return hasUrls && hasAuth && hasDbName;
  }

  public SetSourceType(type: 'azure' | 'local'): void {
    if (this.SourceType === type) return;
    this.SourceType = type;
    this.BackupUrls = '';
    this.SelectedAzureBlobs.clear();
    this.RefreshLocalFiles();
    this.cdr.detectChanges();
  }

  // --- Azure Blob Browser Methods ---

  public async BrowseAzureBlobs(): Promise<void> {
    this.AzureBrowseError = null;
    let container = this.AzureContainerUrl.trim();

    // Auto-detect the container URL from an already-entered blob URL
    if (!container && this.BackupUrls) {
      const derived = DeriveContainerUrl(FirstBackupUrl(this.BackupUrls));
      if (derived) {
        container = derived;
        this.AzureContainerUrl = derived;
      }
    }

    if (!container) {
      this.AzureBrowseError = 'Please enter an Azure Container URL (e.g. https://myaccount.blob.core.windows.net/backups).';
      this.cdr.detectChanges();
      return;
    }

    const isSas = this.AuthMode === 'sas';
    const sas = isSas ? this.SasToken.trim() : undefined;
    const credId = !isSas ? this.SelectedCredentialID : undefined;

    if (isSas && !sas) {
      this.AzureBrowseError = 'Please provide a SAS token with List (l) and Read (r) permissions.';
      this.cdr.detectChanges();
      return;
    }

    if (!isSas && !credId) {
      this.AzureBrowseError = 'Please select a storage credential.';
      this.cdr.detectChanges();
      return;
    }

    this.IsBrowsingAzure = true;
    this.cdr.detectChanges();

    try {
      const result = await this.integrationService.ListAzureBackupBlobs(
        this.CompanyIntegration?.ID ?? '',
        {
          ContainerUrl: container,
          SasToken: sas,
          StorageCredentialID: credId
        }
      );

      if (result.Success) {
        this.AzureBlobs = result.Blobs;
        if (result.Blobs.length === 0) {
          this.AzureBrowseError = 'No blobs found in this container.';
        }
      } else {
        this.AzureBrowseError = result.Message || 'Failed to list container blobs.';
      }
    } catch (err) {
      this.AzureBrowseError = err instanceof Error ? err.message : String(err);
    } finally {
      this.IsBrowsingAzure = false;
      this.cdr.detectChanges();
    }
  }

  public get FilteredAzureBlobs(): AzureBlobItem[] {
    let list = this.AzureBlobs;
    if (this.ShowOnlyBakBlobs) {
      list = list.filter(b => b.IsBak);
    }
    if (this.AzureBlobSearch.trim()) {
      const q = this.AzureBlobSearch.trim().toLowerCase();
      list = list.filter(b => b.Name.toLowerCase().includes(q));
    }
    return list;
  }

  public ToggleAzureBlob(blobName: string): void {
    if (this.SelectedAzureBlobs.has(blobName)) {
      this.SelectedAzureBlobs.delete(blobName);
    } else {
      this.SelectedAzureBlobs.add(blobName);
    }
    this.syncAzureSelectedToBackupUrls();
  }

  public SelectSingleAzureBlob(blobName: string): void {
    this.SelectedAzureBlobs.clear();
    this.SelectedAzureBlobs.add(blobName);
    this.syncAzureSelectedToBackupUrls();
  }

  private syncAzureSelectedToBackupUrls(): void {
    this.BackupUrls = BuildBackupUrlList(this.AzureContainerUrl, this.SelectedAzureBlobs);
    this.cdr.detectChanges();
  }

  // --- Local Backup File & Verification Methods ---

  public RefreshLocalFiles(): void {
    this.VerifiedBackupHeader = null;
    this.VerifyBackupError = null;
  }

  public ApplyDirectoryPreset(path: string): void {
    this.BackupUrls = AppendDirectoryPreset(this.BackupUrls, path);
    this.RefreshLocalFiles();
    this.cdr.detectChanges();
  }

  public OnBackupPathChanged(): void {
    this.RefreshLocalFiles();
  }

  public async VerifyLocalBackup(): Promise<void> {
    if (!this.BackupUrls.trim()) {
      this.VerifyBackupError = 'Please enter a backup file path to verify.';
      this.cdr.detectChanges();
      return;
    }

    this.IsVerifyingBackup = true;
    this.VerifyBackupError = null;
    this.VerifiedBackupHeader = null;
    this.cdr.detectChanges();

    try {
      const result = await this.integrationService.InspectSQLServerBackup(
        this.CompanyIntegration?.ID ?? '',
        {
          BackupUrls: this.BackupUrls.trim()
        }
      );

      if (result.Success) {
        this.VerifiedBackupHeader = result;
      } else {
        this.VerifyBackupError = result.Message || 'Failed to inspect SQL Server backup header.';
      }
    } catch (err) {
      this.VerifyBackupError = err instanceof Error ? err.message : String(err);
    } finally {
      this.IsVerifyingBackup = false;
      this.cdr.detectChanges();
    }
  }

  public FormatBytes(bytes: number): string {
    return FormatBytes(bytes);
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
    this.ExecutionStatus = 'running';
    this.ExecutionError = null;
    this.ElapsedSeconds = 0;
    this.startTimer();

    this.ExecutionStage = this.SourceType === 'azure'
      ? 'Executing database restore from Azure Blob and running local set-based ETL...'
      : 'Executing database restore from host storage and running local set-based ETL...';
    this.cdr.detectChanges();

    try {
      const isAzure = this.SourceType === 'azure';
      const result = await this.integrationService.RunBootstrapFromBackup(
        this.CompanyIntegration.ID,
        {
          BackupUrls: this.BackupUrls.trim(),
          SasToken: isAzure && this.AuthMode === 'sas' ? this.SasToken.trim() : undefined,
          StorageCredentialID: isAzure && this.AuthMode === 'credential' ? this.SelectedCredentialID : undefined,
          StagingDatabaseName: this.StagingDatabaseName.trim(),
          DropStagingDbOnComplete: this.DropStagingDbOnComplete,
          TruncateTargetBeforeLoad: this.TruncateTargetBeforeLoad,
          BatchSize: this.BatchSize,
        }
      );

      this.stopTimer();

      if (result.Success) {
        this.ExecutionStatus = 'succeeded';
        this.ResultSummary = result;
        this.CurrentStep = 4;
        this.Completed.emit(result);
      } else {
        this.ExecutionStatus = 'failed';
        this.ExecutionError = result.Message || 'Bootstrap failed unexpectedly.';
      }
    } catch (err) {
      this.stopTimer();
      this.ExecutionStatus = 'failed';
      this.ExecutionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  public Close(): void {
    this.stopTimer();
    this.Closed.emit();
  }

  public Finish(): void {
    this.Close();
  }

  private resetWizard(): void {
    this.CurrentStep = 1;
    this.SourceType = 'azure';
    this.BackupUrls = '';
    this.AuthMode = 'sas';
    this.SasToken = '';
    this.SelectedCredentialID = '';
    this.AzureContainerUrl = '';
    this.AzureBlobs = [];
    this.SelectedAzureBlobs.clear();
    this.AzureBlobSearch = '';
    this.AzureBrowseError = null;
    this.RefreshLocalFiles();
    this.DropStagingDbOnComplete = true;
    this.TruncateTargetBeforeLoad = false;
    this.BatchSize = 500000;
    this.ExecutionStatus = 'idle';
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
    this.CredentialsError = null;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJCredentialEntity>({
        EntityName: 'MJ: Credentials',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      });
      if (result.Success) {
        this.AvailableCredentials = result.Results ?? [];
      } else {
        this.CredentialsError = result.ErrorMessage || 'Failed to load credentials.';
        LogError(`[BootstrapWizard] Error loading credentials: ${result.ErrorMessage}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.CredentialsError = msg;
      LogError(`[BootstrapWizard] Exception loading credentials: ${msg}`);
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