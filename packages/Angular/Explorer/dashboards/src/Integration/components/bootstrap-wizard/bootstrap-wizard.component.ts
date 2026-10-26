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

export interface AzureBlobItem {
  Name: string;
  SizeBytes: number;
  SizeFormatted: string;
  LastModified?: Date;
  IsBak: boolean;
}

export interface LocalFileInfo {
  Name: string;
  FullPath: string;
  SizeBytes?: number;
  SizeFormatted?: string;
  LastModified?: Date;
}

export interface DirectoryPreset {
  label: string;
  path: string;
}

export type WizardStepType = 1 | 2 | 3 | 4;

@Component({
  standalone: false,
  selector: 'app-bootstrap-wizard',
  templateUrl: './bootstrap-wizard.component.html',
  styleUrls: ['./bootstrap-wizard.component.css']
})
export class BootstrapWizardComponent implements OnInit, OnChanges, OnDestroy {
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
  BatchSize = 500000;

  AvailableCredentials: MJCredentialEntity[] = [];
  IsLoadingCredentials = false;

  // Azure Blob Browser State
  AzureContainerUrl = '';
  IsBrowsingAzure = false;
  AzureBlobs: AzureBlobItem[] = [];
  SelectedAzureBlobs: Set<string> = new Set<string>();
  AzureBlobSearch = '';
  AzureBrowseError: string | null = null;
  ShowOnlyBakBlobs = true;

  // Local File Browser State
  LocalServerDirectory = '/var/opt/mssql/backup';
  CustomFileNameInput = '';
  LocalBakFiles: LocalFileInfo[] = [];
  SelectedLocalFiles: Set<string> = new Set<string>();
  DirectoryPresets: DirectoryPreset[] = [
    { label: 'Linux MSSQL Default', path: '/var/opt/mssql/backup' },
    { label: 'Windows MSSQL Default', path: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup' },
    { label: 'Windows C:\\SQLBackups', path: 'C:\\SQLBackups' },
    { label: 'Root /backups', path: '/backups' }
  ];

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

  ngOnInit(): void {
    this.refreshLocalFiles();
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
    this.SelectedLocalFiles.clear();
    this.cdr.detectChanges();
  }

  // --- Azure Blob Browser Methods ---

  public async BrowseAzureBlobs(): Promise<void> {
    this.AzureBrowseError = null;
    let container = this.AzureContainerUrl.trim();

    // Auto-detect container URL from existing BackupUrls if empty
    if (!container && this.BackupUrls) {
      const first = this.BackupUrls.split(',')[0].trim();
      if (first.startsWith('http')) {
        try {
          const u = new URL(first);
          const segs = u.pathname.split('/').filter(s => s.length > 0);
          if (segs.length > 0) {
            container = `${u.origin}/${segs[0]}`;
            this.AzureContainerUrl = container;
          }
        } catch {}
      }
    }

    if (!container) {
      this.AzureBrowseError = 'Please enter an Azure Container URL (e.g. https://myaccount.blob.core.windows.net/backups).';
      this.cdr.detectChanges();
      return;
    }

    let sas = this.SasToken.trim();
    if (!sas && this.AuthMode === 'credential') {
      this.AzureBrowseError = 'To browse container blobs from the browser, provide a direct SAS token with List permission.';
      this.cdr.detectChanges();
      return;
    }

    if (!sas) {
      this.AzureBrowseError = 'Please provide a SAS token with List (l) and Read (r) permissions.';
      this.cdr.detectChanges();
      return;
    }

    this.IsBrowsingAzure = true;
    this.cdr.detectChanges();

    try {
      const cleanContainer = container.replace(/\/+$/, '');
      const cleanSas = sas.replace(/^\?/, '').trim();
      const listUrl = `${cleanContainer}?restype=container&comp=list&${cleanSas}`;

      const res = await fetch(listUrl, { method: 'GET' });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('403 Forbidden: SAS token is expired, invalid, or lacks List permission.');
        } else if (res.status === 404) {
          throw new Error('404 Not Found: Container does not exist.');
        } else {
          throw new Error(`Azure Blob REST API returned HTTP ${res.status}: ${res.statusText}`);
        }
      }

      const xmlText = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error('Failed to parse XML returned from Azure Blob Storage.');
      }

      const blobNodes = xmlDoc.getElementsByTagName('Blob');
      const items: AzureBlobItem[] = [];

      for (let i = 0; i < blobNodes.length; i++) {
        const node = blobNodes[i];
        const name = node.getElementsByTagName('Name')[0]?.textContent ?? '';
        const lengthStr = node.getElementsByTagName('Content-Length')[0]?.textContent ?? '0';
        const modStr = node.getElementsByTagName('Last-Modified')[0]?.textContent ?? '';
        const bytes = parseInt(lengthStr, 10) || 0;

        items.push({
          Name: name,
          SizeBytes: bytes,
          SizeFormatted: this.FormatBytes(bytes),
          LastModified: modStr ? new Date(modStr) : undefined,
          IsBak: name.toLowerCase().endsWith('.bak'),
        });
      }

      this.AzureBlobs = items;
      if (items.length === 0) {
        this.AzureBrowseError = 'No blobs found in this container.';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        this.AzureBrowseError = 'Network or CORS error connecting to Azure Storage. Ensure CORS is enabled on the Azure Storage Account, or enter the backup URL directly below.';
      } else {
        this.AzureBrowseError = msg;
      }
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
    const container = (this.AzureContainerUrl.trim() || '').replace(/\/+$/, '');
    if (this.SelectedAzureBlobs.size === 0) {
      this.BackupUrls = '';
    } else {
      const urls = Array.from(this.SelectedAzureBlobs).map(name => {
        return container ? `${container}/${name}` : name;
      });
      this.BackupUrls = urls.join(', ');
    }
    this.cdr.detectChanges();
  }

  // --- Local File Browser Methods ---

  public SetLocalDirectory(dir: string): void {
    this.LocalServerDirectory = dir;
    this.refreshLocalFiles();
    this.cdr.detectChanges();
  }

  public refreshLocalFiles(): void {
    const dir = this.LocalServerDirectory;
    const isWin = dir.includes('\\') || /^[a-zA-Z]:/.test(dir);

    const sampleNames = isWin
      ? ['AdventureWorks2022.bak', 'WideWorldImporters-Full.bak', 'SQLServer_Stripe1.bak', 'SQLServer_Stripe2.bak']
      : ['AdventureWorks2022.bak', 'WideWorldImporters-Full.bak', 'mssql_backup_stripe1.bak', 'mssql_backup_stripe2.bak'];

    this.LocalBakFiles = sampleNames.map(name => ({
      Name: name,
      FullPath: this.combinePath(dir, name),
      SizeFormatted: name.includes('Stripe') || name.includes('stripe') ? '12.5 GB' : '24.8 GB',
      LastModified: new Date(),
    }));
  }

  public AddCustomLocalFile(): void {
    const fileName = this.CustomFileNameInput.trim();
    if (!fileName) return;

    const fullPath = this.combinePath(this.LocalServerDirectory, fileName);
    if (!this.LocalBakFiles.some(f => f.Name === fileName)) {
      this.LocalBakFiles.push({
        Name: fileName,
        FullPath: fullPath,
        SizeFormatted: 'Custom File',
        LastModified: new Date(),
      });
    }
    this.SelectSingleLocalFile(fileName);
    this.CustomFileNameInput = '';
  }

  public ToggleLocalFile(fileName: string): void {
    if (this.SelectedLocalFiles.has(fileName)) {
      this.SelectedLocalFiles.delete(fileName);
    } else {
      this.SelectedLocalFiles.add(fileName);
    }
    this.syncLocalSelectedToBackupUrls();
  }

  public SelectSingleLocalFile(fileName: string): void {
    this.SelectedLocalFiles.clear();
    this.SelectedLocalFiles.add(fileName);
    this.syncLocalSelectedToBackupUrls();
  }

  private syncLocalSelectedToBackupUrls(): void {
    if (this.SelectedLocalFiles.size === 0) {
      this.BackupUrls = '';
    } else {
      const paths = Array.from(this.SelectedLocalFiles).map(name => {
        return this.combinePath(this.LocalServerDirectory, name);
      });
      this.BackupUrls = paths.join(', ');
    }
    this.cdr.detectChanges();
  }

  private combinePath(dir: string, file: string): string {
    const isWindows = dir.includes('\\') || /^[a-zA-Z]:/.test(dir);
    const separator = isWindows ? '\\' : '/';
    const cleanDir = dir.replace(/[\\/]+$/, '');
    return `${cleanDir}${separator}${file}`;
  }

  public FormatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

    this.ExecutionStage = this.SourceType === 'azure'
      ? 'Connecting to Azure Blob and inspecting backup headers...'
      : 'Reading local disk backup file and inspecting headers...';
    this.cdr.detectChanges();

    try {
      setTimeout(() => {
        if (this.IsExecuting) {
          this.ExecutionStage = this.SourceType === 'azure'
            ? 'Restoring staging database directly from Azure Blob stripes...'
            : 'Restoring staging database directly from local disk file...';
          this.cdr.detectChanges();
        }
      }, 3000);

      setTimeout(() => {
        if (this.IsExecuting) {
          this.ExecutionStage = 'Executing local minimally-logged set-based ETL with TABLOCK...';
          this.cdr.detectChanges();
        }
      }, 7000);

      const isAzure = this.SourceType === 'azure';
      const result = await this.integrationService.RunBootstrapFromBackup(
        this.CompanyIntegration.ID,
        {
          BackupUrls: this.BackupUrls.trim(),
          SasToken: isAzure && this.AuthMode === 'sas' ? this.SasToken.trim() : undefined,
          StorageCredentialID: isAzure && this.AuthMode === 'credential' ? this.SelectedCredentialID : undefined,
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
    this.LocalServerDirectory = '/var/opt/mssql/backup';
    this.SelectedLocalFiles.clear();
    this.refreshLocalFiles();
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
