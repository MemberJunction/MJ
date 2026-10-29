import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ViewToggleOption } from '@memberjunction/ng-ui-components';
import { MJCredentialEntity } from '@memberjunction/core-entities';
import { IntegrationDataService, InspectBackupResult, AzureBlobItem } from '../../services/integration-data.service';
import {
  AppendDirectoryPreset,
  BuildBackupUrlList,
  DeriveContainerUrl,
  FirstBackupUrl,
  FormatBytes,
} from '../../services/backup-source.helpers';

/** Where a SQL Server backup comes from and how the server authenticates to read it. */
export interface BackupSourceValue {
  SourceType: 'azure' | 'local';
  /** One backup file, or the comma-separated stripes of a striped backup. */
  BackupUrls: string;
  AuthMode: 'sas' | 'credential';
  SasToken: string;
  StorageCredentialID: string;
}

/** A directory on the SQL Server host offered as a quick-path chip. */
export interface DirectoryPreset {
  Label: string;
  Path: string;
}

/** An empty Azure source authenticated by SAS token — the picker's starting value. */
export function DefaultBackupSourceValue(): BackupSourceValue {
  return { SourceType: 'azure', BackupUrls: '', AuthMode: 'sas', SasToken: '', StorageCredentialID: '' };
}

/**
 * True when the value names at least one backup and, for Azure, carries the credential its auth
 * mode needs. A local file is read by the SQL Server service account, so it needs no credential.
 */
export function IsBackupSourceValid(value: BackupSourceValue): boolean {
  if (value.BackupUrls.trim().length === 0) {
    return false;
  }
  if (value.SourceType === 'local') {
    return true;
  }
  return value.AuthMode === 'sas'
    ? value.SasToken.trim().length > 0
    : value.StorageCredentialID.trim().length > 0;
}

/**
 * Picks a SQL Server backup source: an Azure Blob container (browsed through a server action, so
 * the SAS token never reaches the browser's network stack) or files on the SQL Server host
 * (verified by reading the backup header). Shared by the bootstrap and archive seed wizards.
 */
@Component({
  standalone: false,
  selector: 'app-backup-source-picker',
  templateUrl: './backup-source-picker.component.html',
  styleUrls: ['../shared/backup-wizard.css', './backup-source-picker.component.css']
})
export class BackupSourcePickerComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private integrationService = inject(IntegrationDataService);

  /** The connection the backup belongs to, or null when none exists yet (archive seed). */
  @Input() CompanyIntegrationID: string | null = null;

  private _value: BackupSourceValue = DefaultBackupSourceValue();
  @Input()
  set Value(value: BackupSourceValue | null) {
    this._value = value ?? DefaultBackupSourceValue();
  }
  get Value(): BackupSourceValue {
    return this._value;
  }

  @Output() ValueChange = new EventEmitter<BackupSourceValue>();
  /** A local backup's header was read successfully. */
  @Output() Verified = new EventEmitter<InspectBackupResult>();

  AvailableCredentials: MJCredentialEntity[] = [];
  IsLoadingCredentials = false;
  CredentialsError: string | null = null;

  // Azure Blob browser
  AzureContainerUrl = '';
  IsBrowsingAzure = false;
  AzureBlobs: AzureBlobItem[] = [];
  SelectedAzureBlobs: Set<string> = new Set<string>();
  AzureBlobSearch = '';
  AzureBrowseError: string | null = null;
  ShowOnlyBakBlobs = true;

  // Local file verification
  IsVerifyingBackup = false;
  VerifiedBackupHeader: InspectBackupResult | null = null;
  VerifyBackupError: string | null = null;
  DirectoryPresets: DirectoryPreset[] = [
    { Label: 'Linux MSSQL Default', Path: '/var/opt/mssql/backup' },
    { Label: 'Windows MSSQL Default', Path: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\Backup' },
    { Label: 'Windows C:\\SQLBackups', Path: 'C:\\SQLBackups' },
    { Label: 'Root /backups', Path: '/backups' }
  ];

  readonly SourceTypeOptions: ViewToggleOption[] = [
    { key: 'azure', icon: 'fa-solid fa-cloud-arrow-down', label: 'Azure Blob Storage' },
    { key: 'local', icon: 'fa-solid fa-hard-drive', label: 'Local Disk File' },
  ];
  readonly AuthModeOptions: ViewToggleOption[] = [
    { key: 'sas', icon: 'fa-solid fa-key', label: 'Direct SAS Token' },
    { key: 'credential', icon: 'fa-solid fa-vault', label: 'Credential Engine' },
  ];

  ngOnInit(): void {
    void this.loadCredentials();
  }

  /** True when the current value is complete enough to start a restore. */
  public get IsValid(): boolean {
    return IsBackupSourceValid(this._value);
  }

  /** Applies a partial change to the value and emits the new value to the two-way binding. */
  public Patch(changes: Partial<BackupSourceValue>): void {
    this._value = { ...this._value, ...changes };
    this.ValueChange.emit(this._value);
  }

  public SetSourceType(type: 'azure' | 'local'): void {
    if (this._value.SourceType === type) return;
    this.SelectedAzureBlobs.clear();
    this.Patch({ SourceType: type, BackupUrls: '' });
    this.RefreshLocalFiles();
    this.cdr.detectChanges();
  }

  /** The source-type toggle picked an option. */
  public OnSourceTypeKey(key: string): void {
    if (key === 'azure' || key === 'local') {
      this.SetSourceType(key);
    }
  }

  /** The authentication toggle picked an option. */
  public OnAuthModeKey(key: string): void {
    if ((key === 'sas' || key === 'credential') && key !== this._value.AuthMode) {
      this.Patch({ AuthMode: key });
    }
  }

  // --- Azure Blob browser ---

  public async BrowseAzureBlobs(): Promise<void> {
    this.AzureBrowseError = null;
    const container = this.resolveContainerUrl();
    const authError = container ? this.azureAuthError() : 'Please enter an Azure Container URL (e.g. https://myaccount.blob.core.windows.net/backups).';
    if (authError) {
      this.AzureBrowseError = authError;
      this.cdr.detectChanges();
      return;
    }

    this.IsBrowsingAzure = true;
    this.cdr.detectChanges();
    try {
      const isSas = this._value.AuthMode === 'sas';
      const result = await this.integrationService.ListAzureBackupBlobs(this.CompanyIntegrationID, {
        ContainerUrl: container,
        SasToken: isSas ? this._value.SasToken.trim() : undefined,
        StorageCredentialID: isSas ? undefined : this._value.StorageCredentialID,
      });
      if (result.Success) {
        this.AzureBlobs = result.Blobs;
        this.AzureBrowseError = result.Blobs.length === 0 ? 'No blobs found in this container.' : null;
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

  /** The container URL to browse, derived from an entered blob URL when the field is empty. */
  private resolveContainerUrl(): string {
    const entered = this.AzureContainerUrl.trim();
    if (entered || !this._value.BackupUrls) {
      return entered;
    }
    const derived = DeriveContainerUrl(FirstBackupUrl(this._value.BackupUrls)) ?? '';
    this.AzureContainerUrl = derived;
    return derived;
  }

  /** Why the current auth mode cannot browse yet, or null when it can. */
  private azureAuthError(): string | null {
    if (this._value.AuthMode === 'sas') {
      return this._value.SasToken.trim() ? null : 'Please provide a SAS token with List (l) and Read (r) permissions.';
    }
    return this._value.StorageCredentialID ? null : 'Please select a storage credential.';
  }

  public get FilteredAzureBlobs(): AzureBlobItem[] {
    let list = this.AzureBlobs;
    if (this.ShowOnlyBakBlobs) {
      list = list.filter(b => b.IsBak);
    }
    const q = this.AzureBlobSearch.trim().toLowerCase();
    if (q) {
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
    this.Patch({ BackupUrls: BuildBackupUrlList(this.AzureContainerUrl, this.SelectedAzureBlobs) });
    this.cdr.detectChanges();
  }

  // --- Local backup file & verification ---

  public RefreshLocalFiles(): void {
    this.VerifiedBackupHeader = null;
    this.VerifyBackupError = null;
  }

  public ApplyDirectoryPreset(path: string): void {
    this.Patch({ BackupUrls: AppendDirectoryPreset(this._value.BackupUrls, path) });
    this.RefreshLocalFiles();
    this.cdr.detectChanges();
  }

  public OnBackupPathChanged(backupUrls: string): void {
    this.Patch({ BackupUrls: backupUrls });
    this.RefreshLocalFiles();
  }

  public async VerifyLocalBackup(): Promise<void> {
    const backupUrls = this._value.BackupUrls.trim();
    if (!backupUrls) {
      this.VerifyBackupError = 'Please enter a backup file path to verify.';
      this.cdr.detectChanges();
      return;
    }

    this.IsVerifyingBackup = true;
    this.RefreshLocalFiles();
    this.cdr.detectChanges();
    try {
      const result = await this.integrationService.InspectSQLServerBackup(this.CompanyIntegrationID, { BackupUrls: backupUrls });
      if (result.Success) {
        this.VerifiedBackupHeader = result;
        this.Verified.emit(result);
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
        LogError(`[BackupSourcePicker] Error loading credentials: ${result.ErrorMessage}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.CredentialsError = msg;
      LogError(`[BackupSourcePicker] Exception loading credentials: ${msg}`);
    } finally {
      this.IsLoadingCredentials = false;
      this.cdr.detectChanges();
    }
  }
}
