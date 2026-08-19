import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  inject,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BaseEntity, RunView, CompositeKey } from '@memberjunction/core';
import {
  MJFileEntity,
  MJFileEntityRecordLinkEntity,
  MJFileStorageProviderEntity,
  MJFileStorageAccountEntity,
  FileStorageEngineBase,
  StorageAccountWithProvider,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { z } from 'zod';
import {
  RecordAttachmentItem,
  RecordAttachmentsConfig,
  AttachmentViewMode,
  AttachmentMediaType,
  GetAttachmentMediaType,
  FormatAttachmentFileSize,
} from './record-attachments.types';
import {
  BeforeUploadAttachmentEventArgs,
  AfterUploadAttachmentEventArgs,
  BeforeDeleteAttachmentEventArgs,
  AfterDeleteAttachmentEventArgs,
  BeforeUnlinkAttachmentEventArgs,
  AfterUnlinkAttachmentEventArgs,
  BeforeDownloadAttachmentEventArgs,
  AfterDownloadAttachmentEventArgs,
  BeforePreviewAttachmentEventArgs,
  AfterPreviewAttachmentEventArgs,
  BeforeReplaceAttachmentEventArgs,
  AfterReplaceAttachmentEventArgs,
} from './record-attachments.events';

const FileFieldsFragment = gql`
  fragment FileFields on MJFile_ {
    Category
    CategoryID
    ContentType
    _mj__CreatedAt
    Description
    ID
    Name
    Provider
    ProviderID
    ProviderKey
    Status
    _mj__UpdatedAt
  }
`;

const UploadStorageFileMutation = gql`
  mutation UploadStorageFile($input: UploadStorageFileInput!) {
    UploadStorageFile(input: $input) {
      Success
      FileID
      ErrorMessage
      File {
        Category
        CategoryID
        ContentType
        _mj__CreatedAt
        Description
        ID
        Name
        Provider
        ProviderID
        ProviderKey
        Status
        _mj__UpdatedAt
      }
    }
  }
`;

const UploadStorageFileMutationSchema = z.object({
  UploadStorageFile: z.object({
    Success: z.boolean(),
    FileID: z.string().optional().nullable(),
    ErrorMessage: z.string().optional().nullable(),
    File: z.object({
      ID: z.string(),
      Name: z.string().optional().nullable(),
      ProviderID: z.string().optional().nullable(),
      Provider: z.string().optional().nullable(),
      ContentType: z.string().optional().nullable(),
      Description: z.string().optional().nullable(),
      Status: z.string().optional().nullable(),
      CategoryID: z.string().optional().nullable(),
      Category: z.string().optional().nullable(),
    }).passthrough().optional().nullable(),
  }),
});

const FileDownloadQuery = gql`
  query FileDownloadUrl($FileID: String!) {
    MJFile(ID: $FileID) {
      ContentType
      DownloadUrl
    }
  }
`;

const FileDownloadQuerySchema = z.object({
  MJFile: z.object({
    ContentType: z.string().optional().nullable(),
    DownloadUrl: z.string(),
  }),
});

const CreateMediaAccessTokenMutation = gql`
  mutation CreateMediaAccessToken($fileId: String!) {
    CreateMediaAccessToken(fileId: $fileId) {
      Success
      Token
      Url
      MimeType
      ErrorMessage
    }
  }
`;

const CreateMediaAccessTokenMutationSchema = z.object({
  CreateMediaAccessToken: z.object({
    Success: z.boolean(),
    Token: z.string().optional().nullable(),
    Url: z.string().optional().nullable(),
    MimeType: z.string().optional().nullable(),
    ErrorMessage: z.string().optional().nullable(),
  }),
});

const CreatePreAuthUploadUrlMutation = gql`
  mutation CreatePreAuthUploadUrl($input: CreatePreAuthUploadUrlInput!) {
    CreatePreAuthUploadUrl(input: $input) {
      UploadUrl
      ProviderKey
    }
  }
`;

const CreatePreAuthUploadUrlMutationSchema = z.object({
  CreatePreAuthUploadUrl: z.object({
    UploadUrl: z.string().optional().nullable(),
    ProviderKey: z.string().optional().nullable(),
  }),
});

/**
 * World-class Angular component for displaying, previewing, uploading,
 * and managing file attachments linked to an entity record.
 *
 * Selector: `mj-record-attachments`
 */
@Component({
  standalone: false,
  selector: 'mj-record-attachments',
  templateUrl: './record-attachments.component.html',
  styleUrls: ['./record-attachments.component.css'],
})
export class RecordAttachmentsComponent extends BaseAngularComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);
  private sanitizer = inject(DomSanitizer);

  private static readonly PREF_WIDTH_KEY = 'mj.recordAttachments.width';
  private static readonly PREF_VIEW_MODE_KEY = 'mj.recordAttachments.viewMode';

  // ────────────────────────────────────────────────────────────────────
  // Inputs
  // ────────────────────────────────────────────────────────────────────

  /** Entity record to load attachments for */
  @Input() Record?: BaseEntity;

  /** Explicit EntityID (alternative to passing Record) */
  @Input() EntityID?: string;

  /** Explicit RecordID (alternative to passing Record) */
  @Input() RecordID?: string;

  /** Bound attachment items (supports direct data-binding / manipulation) */
  @Input() Attachments: RecordAttachmentItem[] = [];

  /** Attachment configuration bag */
  @Input() Config?: RecordAttachmentsConfig;

  /** Whether the slide panel is visible */
  @Input() Visible: boolean = true;

  /** Whether the slide panel is resizable */
  @Input() Resizable: boolean = true;

  /** Initial width in px. 0 = auto/persisted setting */
  @Input() WidthPx: number = 0;

  /** Minimum panel width in px */
  @Input() MinWidthPx: number = 420;

  /** Maximum panel width ratio of viewport */
  @Input() MaxWidthRatio: number = 0.65;

  /** Panel title */
  @Input() Title: string = 'Attachments';

  /** Permissions / Feature flags */
  @Input() AllowUpload: boolean = true;
  @Input() AllowDelete: boolean = true;
  @Input() AllowUnlink: boolean = true;
  @Input() AllowDownload: boolean = true;
  @Input() AllowPreview: boolean = true;
  @Input() AllowReplace: boolean = true;
  @Input() AllowEditMetadata: boolean = true;

  /** UI Controls */
  @Input() ShowProviderFilter: boolean = true;
  @Input() ShowSearch: boolean = true;
  @Input() ViewMode: AttachmentViewMode = 'grid';

  // ────────────────────────────────────────────────────────────────────
  // Outputs / Events
  // ────────────────────────────────────────────────────────────────────

  @Output() PanelClosed = new EventEmitter<void>();
  @Output() WidthChanged = new EventEmitter<number>();
  @Output() AttachmentCountChanged = new EventEmitter<number>();
  @Output() ViewModeChanged = new EventEmitter<AttachmentViewMode>();

  @Output() BeforeUpload = new EventEmitter<BeforeUploadAttachmentEventArgs>();
  @Output() AfterUpload = new EventEmitter<AfterUploadAttachmentEventArgs>();

  @Output() BeforeDelete = new EventEmitter<BeforeDeleteAttachmentEventArgs>();
  @Output() AfterDelete = new EventEmitter<AfterDeleteAttachmentEventArgs>();

  @Output() BeforeUnlink = new EventEmitter<BeforeUnlinkAttachmentEventArgs>();
  @Output() AfterUnlink = new EventEmitter<AfterUnlinkAttachmentEventArgs>();

  @Output() BeforeDownload = new EventEmitter<BeforeDownloadAttachmentEventArgs>();
  @Output() AfterDownload = new EventEmitter<AfterDownloadAttachmentEventArgs>();

  @Output() BeforePreview = new EventEmitter<BeforePreviewAttachmentEventArgs>();
  @Output() AfterPreview = new EventEmitter<AfterPreviewAttachmentEventArgs>();

  @Output() BeforeReplace = new EventEmitter<BeforeReplaceAttachmentEventArgs>();
  @Output() AfterReplace = new EventEmitter<AfterReplaceAttachmentEventArgs>();

  // ────────────────────────────────────────────────────────────────────
  // Internal State
  // ────────────────────────────────────────────────────────────────────

  @ViewChild('fileInputRef') fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('replaceInputRef') replaceInputRef?: ElementRef<HTMLInputElement>;

  public IsLoading: boolean = false;
  public IsUploading: boolean = false;
  public UploadProgressPercent: number = 0;
  public UploadStatusText: string = '';
  public UploadingFileName: string = '';
  public SearchTerm: string = '';
  public SelectedProviderFilter: string = 'all'; // 'all' or ProviderID

  public StorageAccounts: StorageAccountWithProvider[] = [];
  public ActiveProviders: MJFileStorageProviderEntity[] = [];
  public SelectedStorageAccountID: string = '';

  /** User Permissions */
  public UserCanCreateFile: boolean = true;
  public UserCanDeleteFile: boolean = true;
  public UserCanUpdateFile: boolean = true;
  public UserCanCreateLink: boolean = true;
  public UserCanDeleteLink: boolean = true;

  /** Active Preview State */
  public PreviewModalOpen: boolean = false;
  public IsLoadingPreview: boolean = false;
  public IsMediaLoaded: boolean = false;
  public ActivePreviewItem: RecordAttachmentItem | null = null;
  public ActivePreviewUrl: string | null = null;
  public ActivePreviewSafeUrl: SafeResourceUrl | null = null;
  public ActivePreviewTextContent: string | null = null;

  /** Replace Target */
  private pendingReplaceItem: RecordAttachmentItem | null = null;
  private navigationService = inject(NavigationService, { optional: true });
  private mediaLoadedTimer?: ReturnType<typeof setTimeout>;

  /** Edit Metadata Dialog */
  public EditMetadataModalOpen: boolean = false;
  public EditMetadataItem: RecordAttachmentItem | null = null;
  public EditMetadataName: string = '';
  public EditMetadataDescription: string = '';

  // ────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    this.RestoreUserPreferences();
    await this.CheckStorageAndPermissions();
    if (this.Attachments.length === 0 && (this.Record || (this.EntityID && this.RecordID))) {
      await this.Refresh();
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['Record'] || changes['EntityID'] || changes['RecordID']) {
      if (!changes['Record']?.firstChange && !changes['EntityID']?.firstChange && !changes['RecordID']?.firstChange) {
        await this.Refresh();
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Preferences & Permissions
  // ────────────────────────────────────────────────────────────────────

  private RestoreUserPreferences(): void {
    const savedWidth = UserInfoEngine.Instance.GetSetting(RecordAttachmentsComponent.PREF_WIDTH_KEY);
    if (savedWidth && !this.WidthPx) {
      this.WidthPx = parseInt(savedWidth, 10) || 520;
    } else if (!this.WidthPx) {
      this.WidthPx = 520;
    }

    const savedMode = UserInfoEngine.Instance.GetSetting(RecordAttachmentsComponent.PREF_VIEW_MODE_KEY);
    if (savedMode === 'grid' || savedMode === 'list') {
      this.ViewMode = savedMode;
    }
  }

  public OnWidthChanged(width: number): void {
    this.WidthPx = width;
    UserInfoEngine.Instance.SetSettingDebounced(RecordAttachmentsComponent.PREF_WIDTH_KEY, String(width));
    this.WidthChanged.emit(width);
  }

  public SetViewMode(mode: AttachmentViewMode): void {
    this.ViewMode = mode;
    UserInfoEngine.Instance.SetSettingDebounced(RecordAttachmentsComponent.PREF_VIEW_MODE_KEY, mode);
    this.ViewModeChanged.emit(mode);
    this.cdr.markForCheck();
  }

  private async CheckStorageAndPermissions(): Promise<void> {
    try {
      await FileStorageEngineBase.Instance.Config(false);
      this.ActiveProviders = FileStorageEngineBase.Instance.Providers.filter((p) => p.IsActive !== false);
      this.StorageAccounts = FileStorageEngineBase.Instance.AccountsWithProviders.filter((ap) => ap.provider.IsActive !== false);

      // If initial cached check returns 0 accounts, force refresh from server in case cache was cold or stale
      if (this.StorageAccounts.length === 0) {
        await FileStorageEngineBase.Instance.Config(true);
        this.ActiveProviders = FileStorageEngineBase.Instance.Providers.filter((p) => p.IsActive !== false);
        this.StorageAccounts = FileStorageEngineBase.Instance.AccountsWithProviders.filter((ap) => ap.provider.IsActive !== false);
      }

      if (this.StorageAccounts.length > 0) {
        const preferredId = this.Config?.DefaultStorageAccountID;
        const matching = this.StorageAccounts.find((sa) => UUIDsEqual(sa.account.ID, preferredId));
        this.SelectedStorageAccountID = matching ? matching.account.ID : this.StorageAccounts[0].account.ID;
      }

      // Check Entity Permissions
      const md = this.ProviderToUse;
      const fileEntity = md.Entities.find((e) => e.Name === 'MJ: Files');
      const linkEntity = md.Entities.find((e) => e.Name === 'MJ: File Entity Record Links');
      const user = md.CurrentUser;

      if (fileEntity && user) {
        const perm = fileEntity.GetUserPermisions(user);
        this.UserCanCreateFile = perm.CanCreate;
        this.UserCanDeleteFile = perm.CanDelete;
        this.UserCanUpdateFile = perm.CanUpdate;
      }
      if (linkEntity && user) {
        const perm = linkEntity.GetUserPermisions(user);
        this.UserCanCreateLink = perm.CanCreate;
        this.UserCanDeleteLink = perm.CanDelete;
      }
    } catch (err) {
      console.warn('[RecordAttachmentsComponent] Storage check error:', err);
    } finally {
      this.cdr.markForCheck();
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Effective IDs
  // ────────────────────────────────────────────────────────────────────

  public get EffectiveEntityID(): string | null {
    if (this.Record?.EntityInfo?.ID) return this.Record.EntityInfo.ID;
    return this.EntityID ?? null;
  }

  public get EffectiveRecordID(): string | null {
    if (this.Record) {
      if (this.Record.PrimaryKey?.KeyValuePairs?.length > 0) {
        const val = this.Record.PrimaryKey.KeyValuePairs[0].Value;
        if (val !== null && val !== undefined && String(val).length > 0) return String(val);
      }
      const pkVal = this.Record.PrimaryKey?.GetValueByIndex(0);
      if (pkVal !== null && pkVal !== undefined && String(pkVal).length > 0) return String(pkVal);
      if ('ID' in this.Record && (this.Record as unknown as { ID: string }).ID) {
        return String((this.Record as unknown as { ID: string }).ID);
      }
    }
    return this.RecordID ?? null;
  }

  public get EffectiveAllowUpload(): boolean {
    return this.AllowUpload && this.UserCanCreateFile && this.UserCanCreateLink && this.StorageAccounts.length > 0;
  }

  public get EffectiveAllowDelete(): boolean {
    return this.AllowDelete && this.UserCanDeleteFile && this.UserCanDeleteLink;
  }

  public get EffectiveAllowUnlink(): boolean {
    return this.AllowUnlink && this.UserCanDeleteLink;
  }

  // ────────────────────────────────────────────────────────────────────
  // Filtering & Computed Lists
  // ────────────────────────────────────────────────────────────────────

  public get FilteredAttachments(): RecordAttachmentItem[] {
    const term = (this.SearchTerm || '').toLowerCase().trim();
    const provider = this.SelectedProviderFilter;

    return this.Attachments.filter((item) => {
      const matchesProvider =
        provider === 'all' ||
        UUIDsEqual(item.ProviderID, provider) ||
        UUIDsEqual(item.StorageAccountID, provider);

      const matchesSearch =
        !term ||
        item.Name.toLowerCase().includes(term) ||
        (item.Description && item.Description.toLowerCase().includes(term)) ||
        (item.CategoryName && item.CategoryName.toLowerCase().includes(term)) ||
        (item.ContentType && item.ContentType.toLowerCase().includes(term));

      return matchesProvider && matchesSearch;
    });
  }

  public get ProviderCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of this.Attachments) {
      const pid = item.ProviderID || 'unknown';
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    return counts;
  }

  public GetProviderItemCount(providerId: string): number {
    return this.ProviderCounts.get(providerId) ?? 0;
  }

  public get TotalSizeFormatted(): string {
    const totalBytes = this.Attachments.reduce((acc, curr) => acc + (curr.FileSize ?? 0), 0);
    return FormatAttachmentFileSize(totalBytes);
  }

  // ────────────────────────────────────────────────────────────────────
  // Public Verbs / Methods
  // ────────────────────────────────────────────────────────────────────

  /**
   * Refreshes the linked attachments list by querying `MJ: File Entity Record Links` and `MJ: Files`.
   */
  public async Refresh(): Promise<void> {
    const entityId = this.EffectiveEntityID;
    const recordId = this.EffectiveRecordID;

    if (!entityId || !recordId) {
      return;
    }

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      await this.CheckStorageAndPermissions();

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const linksResult = await rv.RunView<MJFileEntityRecordLinkEntity>({
        EntityName: 'MJ: File Entity Record Links',
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${recordId}'`,
        ResultType: 'entity_object',
      });

      if (!linksResult.Success || !linksResult.Results) {
        this.Attachments = [];
        this.AttachmentCountChanged.emit(0);
        return;
      }

      const fileIds = linksResult.Results.map((link) => link.FileID).filter((id): id is string => !!id);

      if (fileIds.length === 0) {
        this.Attachments = [];
        this.AttachmentCountChanged.emit(0);
        return;
      }

      // Batch load files
      const fileFilter = fileIds.map((id) => `ID='${id}'`).join(' OR ');
      const filesResult = await rv.RunView<MJFileEntity>({
        EntityName: 'MJ: Files',
        ExtraFilter: fileFilter,
        ResultType: 'entity_object',
      });

      const filesMap = new Map<string, MJFileEntity>();
      if (filesResult.Success && filesResult.Results) {
        for (const file of filesResult.Results) {
          filesMap.set(NormalizeUUID(file.ID), file);
        }
      }

      // Map to RecordAttachmentItem
      this.Attachments = linksResult.Results.map((link) => {
        const file = link.FileID ? filesMap.get(NormalizeUUID(link.FileID)) : undefined;
        return {
          LinkID: link.ID,
          FileID: link.FileID,
          Name: file?.Name ?? 'Untitled File',
          Description: file?.Description,
          ContentType: file?.ContentType,
          Status: file?.Status,
          ProviderName: file?.Provider,
          ProviderID: file?.ProviderID,
          CategoryID: file?.CategoryID,
          CategoryName: file?.Category,
          CreatedAt: file?.__mj_CreatedAt ? new Date(file.__mj_CreatedAt) : link.__mj_CreatedAt ? new Date(link.__mj_CreatedAt) : null,
          UpdatedAt: file?.__mj_UpdatedAt ? new Date(file.__mj_UpdatedAt) : null,
          FileEntity: file,
          LinkEntity: link,
        };
      });

      this.AttachmentCountChanged.emit(this.Attachments.length);
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Refresh error:', err);
      this.notifications.CreateSimpleNotification('Failed to load attachments', 'error');
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Uploads one or more files and links them to the active record.
   */
  public async UploadFiles(files: File[], storageAccountId?: string, categoryId?: string): Promise<RecordAttachmentItem[]> {
    console.log('[RecordAttachmentsComponent] UploadFiles called with', files.length, 'file(s):', files.map(f => ({ name: f.name, size: f.size, type: f.type })));

    if (!files || files.length === 0) return [];

    const entityId = this.EffectiveEntityID;
    const recordId = this.EffectiveRecordID;

    console.log('[RecordAttachmentsComponent] Resolved upload context:', {
      entityId,
      recordId,
      recordName: this.Record?.EntityInfo?.Name,
      explicitEntityID: this.EntityID,
      explicitRecordID: this.RecordID,
      storageAccountsAvailable: this.StorageAccounts.length,
      selectedStorageAccountID: this.SelectedStorageAccountID
    });

    if (!entityId || !recordId) {
      const errMsg = `Cannot upload attachments: Missing record context (EntityID: ${entityId}, RecordID: ${recordId})`;
      console.error(`[RecordAttachmentsComponent] ${errMsg}`);
      this.notifications.CreateSimpleNotification('Cannot upload attachments: No record context available', 'error');
      return [];
    }

    if (this.StorageAccounts.length === 0) {
      const errMsg = 'Cannot upload attachments: No active file storage accounts are configured. Please configure a storage provider in system settings.';
      console.warn(`[RecordAttachmentsComponent] ${errMsg}`);
      this.notifications.CreateSimpleNotification(errMsg, 'warning');
      return [];
    }

    const targetAccountID = storageAccountId ?? this.SelectedStorageAccountID ?? this.StorageAccounts[0]?.account?.ID;
    const targetCategoryID = categoryId ?? this.Config?.DefaultCategoryID;

    // Fire BeforeUpload event
    const beforeEvent = new BeforeUploadAttachmentEventArgs(files, targetAccountID, targetCategoryID);
    this.BeforeUpload.emit(beforeEvent);
    if (beforeEvent.Cancel) {
      console.log('[RecordAttachmentsComponent] Upload cancelled by BeforeUpload event');
      return [];
    }

    this.IsUploading = true;
    this.UploadProgressPercent = 5;
    this.UploadStatusText = `Preparing ${files.length} file${files.length === 1 ? '' : 's'}...`;
    this.cdr.markForCheck();

    const uploadedItems: RecordAttachmentItem[] = [];
    const uploadedFileEntities: MJFileEntity[] = [];

    try {
      const md = this.ProviderToUse;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileIndex = i + 1;
        const progressBase = Math.round((i / files.length) * 100);

        this.UploadingFileName = file.name;
        this.UploadStatusText = `Reading ${file.name} (${fileIndex}/${files.length})...`;
        this.UploadProgressPercent = Math.max(5, progressBase + 10);
        this.cdr.markForCheck();

        console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Starting upload for '${file.name}' (${FormatAttachmentFileSize(file.size)}, type: '${file.type}')`);

        // Enforce max size if configured
        if (this.Config?.MaxFileSizeBytes && file.size > this.Config.MaxFileSizeBytes) {
          const maxStr = FormatAttachmentFileSize(this.Config.MaxFileSizeBytes);
          console.warn(`[RecordAttachmentsComponent] File '${file.name}' exceeds max size of ${maxStr}`);
          this.notifications.CreateSimpleNotification(`File '${file.name}' exceeds max size of ${maxStr}`, 'error');
          continue;
        }

        let fileId: string | null = null;
        let fileEntity: MJFileEntity | null = null;
        let directUploadSucceeded = false;

        const targetAccount = this.StorageAccounts.find((a) => UUIDsEqual(a.account.ID, targetAccountID));
        const timestamp = new Date().toISOString().slice(0, 10);
        const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11);
        const objectPath = `artifacts/${timestamp}/${uniqueId}/${file.name}`;

        // ─────────────────────────────────────────────────────────────────────
        // 1. Try Direct Binary Upload via Pre-Authenticated URL
        // ─────────────────────────────────────────────────────────────────────
        try {
          console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Requesting pre-auth upload URL for '${file.name}' on account '${targetAccountID}'...`);
          const preAuthResult = await GraphQLDataProvider.ExecuteGQL(CreatePreAuthUploadUrlMutation, {
            input: {
              AccountID: targetAccountID,
              ObjectName: objectPath,
              ContentType: file.type || 'application/octet-stream',
            },
          });

          const parsedPreAuth = CreatePreAuthUploadUrlMutationSchema.safeParse(preAuthResult);
          if (
            parsedPreAuth.success &&
            parsedPreAuth.data.CreatePreAuthUploadUrl.UploadUrl
          ) {
            const preAuth = parsedPreAuth.data.CreatePreAuthUploadUrl;

            console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Direct binary upload URL obtained. Streaming raw bytes...`);
            this.UploadStatusText = `Uploading ${file.name} (${fileIndex}/${files.length}) directly to storage...`;
            this.cdr.markForCheck();

            if (preAuth.UploadUrl) {
              await this.uploadBinaryDirect(
                preAuth.UploadUrl,
                file,
                (loaded, total) => {
                  const singleFileSlice = 85 / files.length;
                  const currentFileBase = (i / files.length) * 100;
                  const percent = Math.round((loaded / total) * 100);
                  const computedPercent = Math.min(95, Math.round(currentFileBase + (percent * singleFileSlice / 100)));
                  this.UploadProgressPercent = computedPercent;
                  const loadedStr = FormatAttachmentFileSize(loaded);
                  const totalStr = FormatAttachmentFileSize(total);
                  if (percent < 100) {
                    this.UploadStatusText = `Uploading ${file.name} (${fileIndex}/${files.length}): ${loadedStr} / ${totalStr} (${percent}%)...`;
                  } else {
                    this.UploadStatusText = `Registering ${file.name} in MemberJunction...`;
                  }
                  this.cdr.markForCheck();
                }
              );

              // Raw binary upload to cloud storage succeeded! Create MJ: Files database record
              this.UploadStatusText = `Saving ${file.name} record...`;
              this.cdr.markForCheck();

              const newFile = await md.GetEntityObject<MJFileEntity>('MJ: Files');
              newFile.Name = file.name;
              newFile.ContentType = file.type || 'application/octet-stream';
              newFile.ProviderID = targetAccount?.provider?.ID || '';
              newFile.ProviderKey = preAuth.ProviderKey || objectPath;
              if (targetCategoryID) {
                newFile.CategoryID = targetCategoryID;
              }
              newFile.Status = 'Uploaded';
              const saved = await newFile.Save();
              if (saved) {
                fileEntity = newFile;
                fileId = newFile.ID;
                directUploadSucceeded = true;
                console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Direct binary upload & file record created (FileID: ${fileId})`);
              }
            }
          }
        } catch (preAuthErr) {
          console.warn(`[RecordAttachmentsComponent] Direct binary upload failed for '${file.name}', falling back to server upload:`, preAuthErr);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. Tier 2: Ephemeral Binary Upload Staging + GraphQL Token Commit
        // ─────────────────────────────────────────────────────────────────────
        if (!directUploadSucceeded || !fileId) {
          try {
            console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Staging binary bytes via /media/upload-stage...`);
            this.UploadStatusText = `Uploading ${file.name} (${fileIndex}/${files.length})...`;
            this.UploadProgressPercent = Math.max(5, progressBase + 2);
            this.cdr.markForCheck();

            const uploadToken = await this.uploadBinaryStage(file, (loaded, total) => {
              const singleFileSlice = 85 / files.length;
              const currentFileBase = (i / files.length) * 100;
              const percent = Math.round((loaded / total) * 100);
              const computedPercent = Math.min(95, Math.round(currentFileBase + (percent * singleFileSlice / 100)));
              this.UploadProgressPercent = computedPercent;
              const loadedStr = FormatAttachmentFileSize(loaded);
              const totalStr = FormatAttachmentFileSize(total);
              if (percent < 100) {
                this.UploadStatusText = `Uploading ${file.name} (${fileIndex}/${files.length}): ${loadedStr} / ${totalStr} (${percent}%)...`;
              } else {
                this.UploadStatusText = `Saving ${file.name} to storage provider...`;
              }
              this.cdr.markForCheck();
            });

            this.UploadStatusText = `Finalizing ${file.name} in MemberJunction...`;
            this.cdr.markForCheck();

            const gqlResult = await GraphQLDataProvider.ExecuteGQL(UploadStorageFileMutation, {
              input: {
                UploadToken: uploadToken,
                FileName: file.name,
                MimeType: file.type || 'application/octet-stream',
                AccountID: beforeEvent.StorageAccountID || undefined,
                CategoryID: beforeEvent.CategoryID || undefined,
              },
            });

            const parsed = UploadStorageFileMutationSchema.safeParse(gqlResult);
            if (parsed.success && parsed.data.UploadStorageFile.Success && parsed.data.UploadStorageFile.FileID) {
              fileId = parsed.data.UploadStorageFile.FileID;
              const loadedFile = await md.GetEntityObject<MJFileEntity>('MJ: Files');
              const ok = await loadedFile.Load(fileId);
              if (ok) {
                fileEntity = loadedFile;
                directUploadSucceeded = true;
                console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Tier 2 binary staging & upload completed (FileID: ${fileId})`);
              }
            }
          } catch (stageErr) {
            console.warn(`[RecordAttachmentsComponent] Tier 2 binary staging failed, falling back to base64:`, stageErr);
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. Tier 3 (Fallback): Base64 Upload via UploadStorageFile mutation
        // ─────────────────────────────────────────────────────────────────────
        if (!directUploadSucceeded || !fileId) {
          console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Using Tier 3 fallback base64 server upload...`);
          const base64Data = await this.fileToBase64(file);

          this.UploadStatusText = `Uploading ${file.name} (${fileIndex}/${files.length})...`;
          this.UploadProgressPercent = Math.max(5, progressBase + 2);
          this.cdr.markForCheck();

          const input = {
            FileName: file.name,
            Base64Data: base64Data,
            MimeType: file.type || 'application/octet-stream',
            AccountID: beforeEvent.StorageAccountID || undefined,
            CategoryID: beforeEvent.CategoryID || undefined,
          };

          const gqlResult = await GraphQLDataProvider.ExecuteGQLWithProgress(
            UploadStorageFileMutation,
            { input },
            (progress) => {
              const singleFileSlice = 85 / files.length;
              const currentFileBase = (i / files.length) * 100;
              const computedPercent = Math.min(95, Math.round(currentFileBase + (progress.percent * singleFileSlice / 100)));
              this.UploadProgressPercent = computedPercent;
              const loadedStr = FormatAttachmentFileSize(progress.loaded);
              const totalStr = FormatAttachmentFileSize(progress.total);
              if (progress.percent < 100) {
                this.UploadStatusText = `Uploading ${file.name} (${fileIndex}/${files.length}): ${loadedStr} / ${totalStr} (${progress.percent}%)...`;
              } else {
                this.UploadStatusText = `Processing ${file.name} on storage server...`;
              }
              this.cdr.markForCheck();
            }
          );

          const parsed = UploadStorageFileMutationSchema.safeParse(gqlResult);
          if (!parsed.success || !parsed.data.UploadStorageFile.Success || !parsed.data.UploadStorageFile.FileID) {
            const errorMsg = parsed.success ? parsed.data.UploadStorageFile.ErrorMessage : 'Upload response parsing failed';
            console.error(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Failed to upload '${file.name}':`, errorMsg, parsed);
            this.notifications.CreateSimpleNotification(`Failed to upload '${file.name}': ${errorMsg || 'Unknown error'}`, 'error');
            continue;
          }

          fileId = parsed.data.UploadStorageFile.FileID;
          const loadedFile = await md.GetEntityObject<MJFileEntity>('MJ: Files');
          const ok = await loadedFile.Load(fileId);
          if (ok) {
            fileEntity = loadedFile;
          }
        }

        if (!fileId || !fileEntity) {
          console.error(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] File record unavailable for '${file.name}'`);
          continue;
        }

        uploadedFileEntities.push(fileEntity);

        this.UploadStatusText = `Linking ${file.name} to record...`;
        this.UploadProgressPercent = progressBase + Math.round((1 / files.length) * 95);
        this.cdr.markForCheck();

        // Create Link Entity
        const linkEntity: MJFileEntityRecordLinkEntity = await md.GetEntityObject('MJ: File Entity Record Links');
        linkEntity.FileID = fileId;
        linkEntity.EntityID = entityId;
        linkEntity.RecordID = recordId;
        const linkSuccess = await linkEntity.Save();

        console.log(`[RecordAttachmentsComponent] [${fileIndex}/${files.length}] Record link saved (success: ${linkSuccess}, LinkID: ${linkEntity.ID})`);

        if (linkSuccess && fileEntity) {
          const newItem: RecordAttachmentItem = {
            LinkID: linkEntity.ID,
            FileID: fileEntity.ID,
            Name: fileEntity.Name,
            Description: fileEntity.Description,
            ContentType: fileEntity.ContentType,
            Status: fileEntity.Status,
            ProviderName: fileEntity.Provider,
            ProviderID: fileEntity.ProviderID,
            CategoryID: fileEntity.CategoryID,
            CategoryName: fileEntity.Category,
            CreatedAt: new Date(),
            FileSize: file.size,
            FileEntity: fileEntity,
            LinkEntity: linkEntity,
          };
          uploadedItems.push(newItem);
          this.Attachments.unshift(newItem);
        }
      }

      this.UploadProgressPercent = 100;
      this.UploadStatusText = 'Upload complete!';
      this.cdr.markForCheck();

      if (uploadedItems.length > 0) {
        this.AttachmentCountChanged.emit(this.Attachments.length);
        this.AfterUpload.emit(new AfterUploadAttachmentEventArgs(uploadedItems, uploadedFileEntities));
        this.notifications.CreateSimpleNotification(
          `Successfully attached ${uploadedItems.length} file${uploadedItems.length === 1 ? '' : 's'}`,
          'success'
        );
      }
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Upload error:', err);
      const errMsg = err instanceof Error ? err.message : 'Error uploading attachments';
      this.notifications.CreateSimpleNotification(errMsg, 'error');
    } finally {
      this.IsUploading = false;
      this.UploadProgressPercent = 0;
      this.UploadStatusText = '';
      this.UploadingFileName = '';
      this.cdr.markForCheck();
    }

    return uploadedItems;
  }

  /**
   * Unlinks an attachment from the record (keeps file in storage).
   */
  public async UnlinkAttachment(attachment: RecordAttachmentItem): Promise<boolean> {
    const beforeEvent = new BeforeUnlinkAttachmentEventArgs(attachment);
    this.BeforeUnlink.emit(beforeEvent);
    if (beforeEvent.Cancel) return false;

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const linkEntity: MJFileEntityRecordLinkEntity = attachment.LinkEntity ?? (await md.GetEntityObject('MJ: File Entity Record Links'));
      if (!attachment.LinkEntity) {
        await linkEntity.Load(attachment.LinkID);
      }

      const success = await linkEntity.Delete();
      if (success) {
        this.Attachments = this.Attachments.filter((a) => !UUIDsEqual(a.LinkID, attachment.LinkID));
        this.AttachmentCountChanged.emit(this.Attachments.length);
        this.AfterUnlink.emit(new AfterUnlinkAttachmentEventArgs(attachment));
        this.notifications.CreateSimpleNotification(`Unlinked '${attachment.Name}' from record`, 'info');
        return true;
      } else {
        this.notifications.CreateSimpleNotification(`Failed to unlink '${attachment.Name}'`, 'error');
        return false;
      }
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Unlink error:', err);
      this.notifications.CreateSimpleNotification('Failed to unlink attachment', 'error');
      return false;
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Deletes an attachment completely (unlinks and deletes from storage provider).
   */
  public async DeleteAttachment(attachment: RecordAttachmentItem, hardDelete: boolean = true): Promise<boolean> {
    const beforeEvent = new BeforeDeleteAttachmentEventArgs(attachment, hardDelete);
    this.BeforeDelete.emit(beforeEvent);
    if (beforeEvent.Cancel) return false;

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;

      // 1. Delete link
      if (attachment.LinkID) {
        const linkEntity: MJFileEntityRecordLinkEntity = attachment.LinkEntity ?? (await md.GetEntityObject('MJ: File Entity Record Links'));
        if (!attachment.LinkEntity) {
          await linkEntity.Load(attachment.LinkID);
        }
        await linkEntity.Delete();
      }

      // 2. Delete file if hardDelete requested
      if (hardDelete && attachment.FileID) {
        const fileEntity: MJFileEntity = attachment.FileEntity ?? (await md.GetEntityObject('MJ: Files'));
        if (!attachment.FileEntity) {
          await fileEntity.Load(attachment.FileID);
        }
        await fileEntity.Delete();
      }

      this.Attachments = this.Attachments.filter((a) => !UUIDsEqual(a.LinkID, attachment.LinkID));
      this.AttachmentCountChanged.emit(this.Attachments.length);
      this.AfterDelete.emit(new AfterDeleteAttachmentEventArgs(attachment, hardDelete));
      this.notifications.CreateSimpleNotification(`Deleted '${attachment.Name}'`, 'info');
      return true;
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Delete error:', err);
      this.notifications.CreateSimpleNotification('Failed to delete attachment', 'error');
      return false;
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Resolves an authenticated inline URL for streaming, previewing, and opening in a new tab.
   * Prefers the inline streaming endpoint (/media/:fileId?token=...) so the browser renders
   * the document/media natively without triggering forced attachment downloads or Save As dialogs.
   */
  private async GetInlineFileUrl(fileId: string): Promise<string | null> {
    try {
      const mediaResult = await GraphQLDataProvider.ExecuteGQL(CreateMediaAccessTokenMutation, { fileId });
      const parsedMedia = CreateMediaAccessTokenMutationSchema.safeParse(mediaResult);
      if (parsedMedia.success && parsedMedia.data.CreateMediaAccessToken.Success && parsedMedia.data.CreateMediaAccessToken.Url) {
        return parsedMedia.data.CreateMediaAccessToken.Url;
      }
    } catch (err) {
      console.warn('[RecordAttachmentsComponent] CreateMediaAccessToken failed, trying fallback DownloadUrl:', err);
    }

    try {
      const gqlResult = await GraphQLDataProvider.ExecuteGQL(FileDownloadQuery, { FileID: fileId });
      const parsed = FileDownloadQuerySchema.safeParse(gqlResult);
      if (parsed.success && parsed.data.MJFile?.DownloadUrl) {
        return parsed.data.MJFile.DownloadUrl;
      }
    } catch (err) {
      console.error('[RecordAttachmentsComponent] GetInlineFileUrl fallback failed:', err);
    }

    return null;
  }

  /**
   * Opens the attachment in a new browser tab for direct viewing.
   */
  public async DownloadAttachment(attachment: RecordAttachmentItem): Promise<boolean> {
    const beforeEvent = new BeforeDownloadAttachmentEventArgs(attachment);
    this.BeforeDownload.emit(beforeEvent);
    if (beforeEvent.Cancel) return false;

    try {
      const url = await this.GetInlineFileUrl(attachment.FileID);
      if (url) {
        // Open directly in a new tab so the browser displays the document
        window.open(url, '_blank', 'noopener,noreferrer');
        this.AfterDownload.emit(new AfterDownloadAttachmentEventArgs(attachment, url));
        return true;
      } else {
        this.notifications.CreateSimpleNotification(`Unable to open '${attachment.Name}'`, 'error');
        return false;
      }
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Open in tab error:', err);
      this.notifications.CreateSimpleNotification('Failed to open file', 'error');
      return false;
    }
  }

  /**
   * Opens the in-app rich media preview modal for an attachment.
   */
  public async PreviewAttachment(attachment: RecordAttachmentItem): Promise<boolean> {
    const beforeEvent = new BeforePreviewAttachmentEventArgs(attachment);
    this.BeforePreview.emit(beforeEvent);
    if (beforeEvent.Cancel) return false;

    this.ActivePreviewItem = attachment;
    this.IsLoadingPreview = true;
    this.IsMediaLoaded = false;
    this.PreviewModalOpen = true;
    this.ActivePreviewUrl = null;
    this.ActivePreviewSafeUrl = null;
    this.ActivePreviewTextContent = null;
    this.cdr.markForCheck();

    try {
      const url = await this.GetInlineFileUrl(attachment.FileID);
      if (url) {
        this.ActivePreviewUrl = url;
        this.ActivePreviewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);

        // For text media types, fetch content directly for syntax preview
        const mediaType = this.GetMediaType(attachment);
        if (mediaType === 'text') {
          try {
            const resp = await window.fetch(url);
            if (resp.ok) {
              this.ActivePreviewTextContent = await resp.text();
            }
          } catch {
            // Text fetch failed, fallback to viewer
          }
          this.IsMediaLoaded = true;
        }

        this.AfterPreview.emit(new AfterPreviewAttachmentEventArgs(attachment));
        return true;
      } else {
        this.notifications.CreateSimpleNotification(`Unable to load preview for '${attachment.Name}'`, 'error');
        this.IsMediaLoaded = true;
        return false;
      }
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Preview error:', err);
      this.notifications.CreateSimpleNotification('Preview failed', 'error');
      this.IsMediaLoaded = true;
      return false;
    } finally {
      this.IsLoadingPreview = false;
      this.cdr.markForCheck();
    }
  }

  public OnPreviewMediaLoaded(): void {
    if (this.mediaLoadedTimer) clearTimeout(this.mediaLoadedTimer);
    // Smoothly retain loading spinner for ~350ms so internal iframe/canvas rasterization finishes before fade-in
    this.mediaLoadedTimer = setTimeout(() => {
      this.IsMediaLoaded = true;
      this.cdr.markForCheck();
    }, 350);
  }

  /**
   * Opens the file record in a dedicated MJ Explorer workspace tab and closes the attachments slide-in panel.
   * If running standalone/outside Explorer, falls back to opening the in-app media preview modal.
   */
  public OpenAttachmentRecord(attachment: RecordAttachmentItem): void {
    if (attachment.FileID) {
      const pkey = CompositeKey.FromID(attachment.FileID);
      if (this.navigationService) {
        this.navigationService.OpenEntityRecord('MJ: Files', pkey);
      } else {
        SharedService.Instance.OpenEntityRecord('MJ: Files', pkey);
      }
      this.ClosePanel();
      this.ClosePreviewModal();
    } else {
      void this.PreviewAttachment(attachment);
    }
  }

  /**
   * Initiates replace workflow for an existing attachment.
   */
  public RequestReplace(attachment: RecordAttachmentItem): void {
    this.pendingReplaceItem = attachment;
    this.replaceInputRef?.nativeElement.click();
  }

  /**
   * Replaces an existing attachment with a newly uploaded file.
   */
  public async ReplaceAttachment(attachment: RecordAttachmentItem, newFile: File): Promise<RecordAttachmentItem | null> {
    const beforeEvent = new BeforeReplaceAttachmentEventArgs(attachment, newFile);
    this.BeforeReplace.emit(beforeEvent);
    if (beforeEvent.Cancel) return null;

    this.IsUploading = true;
    this.cdr.markForCheck();

    try {
      // 1. Upload new file
      const uploaded = await this.UploadFiles([newFile], attachment.StorageAccountID || undefined, attachment.CategoryID || undefined);
      if (uploaded.length === 0) return null;

      const newAttachment = uploaded[0];

      // 2. Unlink old file
      await this.UnlinkAttachment(attachment);

      this.AfterReplace.emit(new AfterReplaceAttachmentEventArgs(attachment, newAttachment));
      this.notifications.CreateSimpleNotification(`Replaced '${attachment.Name}' with '${newAttachment.Name}'`, 'success');
      return newAttachment;
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Replace error:', err);
      this.notifications.CreateSimpleNotification('Replace failed', 'error');
      return null;
    } finally {
      this.IsUploading = false;
      this.cdr.markForCheck();
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // UI Actions & Helpers
  // ────────────────────────────────────────────────────────────────────

  public ClosePanel(): void {
    this.PanelClosed.emit();
  }

  public ClosePreviewModal(): void {
    if (this.mediaLoadedTimer) {
      clearTimeout(this.mediaLoadedTimer);
    }
    this.PreviewModalOpen = false;
    this.IsLoadingPreview = false;
    this.IsMediaLoaded = false;
    this.ActivePreviewItem = null;
    this.ActivePreviewUrl = null;
    this.ActivePreviewSafeUrl = null;
    this.ActivePreviewTextContent = null;
    this.cdr.markForCheck();
  }

  public OpenEditMetadata(attachment: RecordAttachmentItem): void {
    this.EditMetadataItem = attachment;
    this.EditMetadataName = attachment.Name;
    this.EditMetadataDescription = attachment.Description || '';
    this.EditMetadataModalOpen = true;
    this.cdr.markForCheck();
  }

  public CloseEditMetadataModal(): void {
    this.EditMetadataModalOpen = false;
    this.EditMetadataItem = null;
    this.cdr.markForCheck();
  }

  public async SaveEditMetadata(): Promise<void> {
    if (!this.EditMetadataItem || !this.EditMetadataName.trim()) return;

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const fileEntity: MJFileEntity = this.EditMetadataItem.FileEntity ?? (await md.GetEntityObject('MJ: Files'));
      if (!this.EditMetadataItem.FileEntity) {
        await fileEntity.Load(this.EditMetadataItem.FileID);
      }

      fileEntity.Name = this.EditMetadataName.trim();
      fileEntity.Description = this.EditMetadataDescription.trim() || null;

      const success = await fileEntity.Save();
      if (success) {
        this.EditMetadataItem.Name = fileEntity.Name;
        this.EditMetadataItem.Description = fileEntity.Description;
        this.notifications.CreateSimpleNotification('Attachment details updated', 'success');
        this.CloseEditMetadataModal();
      } else {
        this.notifications.CreateSimpleNotification('Failed to update attachment details', 'error');
      }
    } catch (err) {
      console.error('[RecordAttachmentsComponent] Save metadata error:', err);
      this.notifications.CreateSimpleNotification('Update failed', 'error');
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public OnFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    console.log('[RecordAttachmentsComponent] OnFilesSelected event fired, files count:', input.files?.length);
    if (input.files && input.files.length > 0) {
      const filesArray = Array.from(input.files);
      input.value = '';
      void this.UploadFiles(filesArray);
    }
  }

  public OnReplaceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    console.log('[RecordAttachmentsComponent] OnReplaceFileSelected event fired, files count:', input.files?.length);
    if (input.files && input.files.length > 0 && this.pendingReplaceItem) {
      const file = input.files[0];
      const target = this.pendingReplaceItem;
      this.pendingReplaceItem = null;
      input.value = '';
      void this.ReplaceAttachment(target, file);
    }
  }

  public OnDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  public OnDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    console.log('[RecordAttachmentsComponent] OnDrop event fired, dataTransfer files count:', event.dataTransfer?.files?.length);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const filesArray = Array.from(event.dataTransfer.files);
      void this.UploadFiles(filesArray);
    }
  }

  public GetMediaType(attachment: RecordAttachmentItem): AttachmentMediaType {
    return GetAttachmentMediaType(attachment.ContentType, attachment.Name);
  }

  public FormatSize(bytes?: number | null): string {
    return FormatAttachmentFileSize(bytes);
  }

  public GetFileIcon(attachment: RecordAttachmentItem): string {
    const mediaType = this.GetMediaType(attachment);
    switch (mediaType) {
      case 'pdf':
        return 'fa-solid fa-file-pdf';
      case 'image':
        return 'fa-solid fa-file-image';
      case 'video':
        return 'fa-solid fa-file-video';
      case 'audio':
        return 'fa-solid fa-file-audio';
      case 'text':
        return 'fa-solid fa-file-code';
      case 'document':
        return 'fa-solid fa-file-word';
      default:
        return 'fa-solid fa-file';
    }
  }

  public GetFileColorClass(attachment: RecordAttachmentItem): string {
    const mediaType = this.GetMediaType(attachment);
    return `mj-attachment-thumb--${mediaType}`;
  }

  private TriggerBrowserDownload(url: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
  }

  /**
   * Performs an authenticated direct binary upload of a raw File/Blob to a pre-authenticated cloud storage URL.
   */
  private uploadBinaryDirect(
    uploadUrl: string,
    file: File,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);

      // Set standard content type
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      // For Azure Blob Storage SAS uploads, add the required block blob header
      if (uploadUrl.includes('.blob.core.windows.net')) {
        xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true);
        } else {
          reject(new Error(`Direct binary upload failed with HTTP status ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred during direct binary upload.'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Direct binary upload timed out.'));
      };

      xhr.send(file);
    });
  }

  /**
   * Performs an authenticated raw binary streaming upload to the /media/upload-stage REST endpoint.
   * Returns an ephemeral single-use upload token to pass to the GraphQL UploadStorageFile mutation.
   */
  private uploadBinaryStage(
    file: File,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let uploadUrl = '/media/upload-stage';
      const gqlUrl = GraphQLDataProvider.Instance?.ConfigData?.URL;
      if (gqlUrl && gqlUrl.startsWith('http')) {
        uploadUrl = gqlUrl.replace(/\/graphql\/?$/i, '') + '/media/upload-stage';
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);

      // Auth header
      const token = GraphQLDataProvider.Instance?.ConfigData?.Token;
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Metadata headers
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText) as { Success?: boolean; UploadToken?: string; ErrorMessage?: string };
            if (res.Success && res.UploadToken) {
              resolve(res.UploadToken);
            } else {
              reject(new Error(res.ErrorMessage || 'Upload staging returned unsuccessful status'));
            }
          } catch {
            reject(new Error('Failed to parse upload staging response JSON'));
          }
        } else {
          reject(new Error(`Upload staging failed with HTTP status ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred during upload staging.'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload staging timed out.'));
      };

      xhr.send(file);
    });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const base64 = result.substring(result.indexOf(',') + 1);
          resolve(base64);
        } else {
          reject(new Error('Failed to read file as base64 string'));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
}
