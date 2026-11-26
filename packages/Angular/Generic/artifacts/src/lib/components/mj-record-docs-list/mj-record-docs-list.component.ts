import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { EntityInfo, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactPermissionEngine,
  DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME,
  DEFAULT_RECORD_ARTIFACT_ROLE,
  PromoteNoteToArtifact,
  type PromoteNoteToArtifactResult,
  type ResolvedArtifactPermissions,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJArtifactSlideoverService } from '../../services/mj-artifact-slideover.service';

/** Projected view-model item rendered by `<mj-record-docs-list>`. */
export interface RecordDocListItem {
  RecordArtifactID: string;
  ArtifactID: string;
  ArtifactName: string;
  ArtifactDescription: string | null;
  PlainPreviewExcerpt: string;
  ArtifactTypeName: string;
  Role: string;
  Sequence: number;
  PinnedArtifactVersionID: string | null;
  PinnedVersionNumber?: number;
  ContextDescription: string | null;
  UpdatedAt: Date | string | null;
  CanRead: boolean;
  CanEdit: boolean;
  CanDelete: boolean;
  CanShare: boolean;
  PermissionSource: ResolvedArtifactPermissions['Source'];
}

/** Event emitted when a user activates an artifact row in `<mj-record-docs-list>`. */
export interface RecordDocOpenedEvent {
  ArtifactID: string;
  RecordArtifactID: string;
  VersionNumber?: number;
  Role: string;
  ArtifactName: string;
  CanEdit: boolean;
  CanShare: boolean;
}

/** Event emitted when the user clicks Synthesize Slides from the record's linked documents. */
export interface RecordDocSynthesizeSlidesEvent {
  EntityName: string;
  RecordID: string;
  SourceArtifactIDs: string[];
  SourceItems: ReadonlyArray<RecordDocListItem>;
}

interface RecordArtifactRow {
  ID: string;
  EntityID: string;
  RecordID: string;
  ArtifactID: string;
  PinnedArtifactVersionID: string | null;
  Role: string;
  Sequence: number;
  ContextDescription: string | null;
  __mj_UpdatedAt: Date | string | null;
}

interface ArtifactHeaderRow {
  ID: string;
  Name: string;
  Description: string | null;
  Type: string | null;
  __mj_UpdatedAt: Date | string | null;
}

interface ArtifactVersionNumberRow {
  ID: string;
  VersionNumber: number;
}

/**
 * Strips raw Markdown syntax (`#` headings, `**bold**`, fenced code blocks, links, inline code)
 * into clean plain text so record list cards never leak raw Markdown tokens.
 */
export function StripMarkdownPreviewText(raw: string | null | undefined, maxLength = 180): string {
  if (!raw) {
    return '';
  }
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function chunkIds(ids: ReadonlyArray<string>, chunkSize: number): string[][] {
  if (ids.length === 0) {
    return [];
  }
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildSqlInClause(column: string, values: ReadonlyArray<string>): string {
  if (values.length === 1) {
    return `${column}='${EscapeSQLString(values[0])}'`;
  }
  const list = values.map((v) => `'${EscapeSQLString(v)}'`).join(',');
  return `${column} IN (${list})`;
}

/**
 * Reusable list widget displaying `MJ: Record Artifacts` linked to a host entity record,
 * with batched `RunView` loading (`ResultType: 'simple'`, `<= 200`-ID chunks), delegated
 * permission enforcement via `ArtifactPermissionEngine`, quick note promotion via
 * `PromoteNoteToArtifact`, and optional slide deck synthesis trigger.
 */
@Component({
  standalone: false,
  selector: 'mj-record-docs-list',
  templateUrl: './mj-record-docs-list.component.html',
  styleUrls: ['./mj-record-docs-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJRecordDocsListComponent extends BaseAngularComponent implements OnInit {
  /** Bounded SQL `IN`-clause chunk size to stay below database parameter and expression limits. */
  public static readonly MAX_IN_CLAUSE_CHUNK_SIZE = 200; // <=200 IDs per chunk per CostAndQuota

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly slideoverService = inject(MJArtifactSlideoverService, { optional: true });

  private _entityName = '';
  private _recordId = '';
  private _allowedRoles: readonly string[] = [];
  private _currentUser: UserInfo | null = null;
  private isInitialized = false;
  private loadSequence = 0;

  @Input()
  public set EntityName(value: string) {
    const normalized = (value ?? '').trim();
    if (normalized !== this._entityName) {
      this._entityName = normalized;
      if (this.isInitialized) {
        void this.Refresh();
      }
    }
  }
  public get EntityName(): string {
    return this._entityName;
  }

  @Input()
  public set RecordID(value: string) {
    const normalized = (value ?? '').trim();
    if (normalized !== this._recordId) {
      this._recordId = normalized;
      if (this.isInitialized) {
        void this.Refresh();
      }
    }
  }
  public get RecordID(): string {
    return this._recordId;
  }

  @Input()
  public set CurrentUser(value: UserInfo | null) {
    if (value !== this._currentUser) {
      this._currentUser = value;
      if (this.isInitialized) {
        void this.Refresh();
      }
    }
  }
  public get CurrentUser(): UserInfo | null {
    return this._currentUser;
  }

  @Input()
  public set AllowedRoles(value: readonly string[]) {
    this._allowedRoles = Array.isArray(value) ? value.map((r) => r.trim()).filter(Boolean) : [];
    if (this.isInitialized) {
      void this.Refresh();
    }
  }
  public get AllowedRoles(): readonly string[] {
    return this._allowedRoles;
  }

  /** Default artifact type name when creating a new document or promoting a note. */
  @Input() public DefaultArtifactType: string = DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME;

  /** Whether creating or promoting documents is permitted by the host surface (still gated by entity Update permission). */
  @Input() public AllowCreate = true;

  /** Whether the Synthesize Slides trigger is shown when writable and at least one document is linked. */
  @Input() public AllowSynthesizeSlides = false;

  /** When true, clicking a document opens `<mj-artifact-slideover>` automatically in addition to emitting `ArtifactOpened`. */
  @Input() public OpenInSlideover = false;

  /** Optional quick note content prefilled in the Promote Note form. */
  @Input() public InitialQuickNoteText = '';

  /** Emitted when a user opens an artifact from the list. */
  @Output() public ArtifactOpened = new EventEmitter<RecordDocOpenedEvent>();

  /** Emitted after a new document is created and linked to the record. */
  @Output() public ArtifactCreated = new EventEmitter<RecordDocListItem>();

  /** Emitted after a quick note is promoted via `PromoteNoteToArtifact`. */
  @Output() public NotePromoted = new EventEmitter<PromoteNoteToArtifactResult>();

  /** Emitted when the user requests slide deck synthesis from the linked documents. */
  @Output() public SynthesizeSlidesRequested = new EventEmitter<RecordDocSynthesizeSlidesEvent>();

  public Items: RecordDocListItem[] = [];
  public IsLoading = false;
  public IsSubmitting = false;
  public ErrorMessage: string | null = null;
  public HostCanRead = false;
  public HostCanUpdate = false;
  public SelectedRoleFilter = 'All';

  // Inline Create / Promote Note composer state
  public ComposerMode: 'none' | 'create' | 'promote' = 'none';
  public DraftTitle = '';
  public DraftRole: string = DEFAULT_RECORD_ARTIFACT_ROLE;
  public DraftMarkdown = '';
  public DraftContextDescription = '';

  public get EffectiveUser(): UserInfo | null {
    return this._currentUser ?? this.ProviderToUse?.CurrentUser ?? null;
  }

  public get EffectiveCanCreate(): boolean {
    return this.AllowCreate && this.HostCanUpdate;
  }

  public get EffectiveCanPromote(): boolean {
    return this.AllowCreate && this.HostCanUpdate;
  }

  public get EffectiveCanSynthesizeSlides(): boolean {
    return this.AllowSynthesizeSlides && this.HostCanUpdate && this.Items.length > 0;
  }

  public get AvailableRoles(): string[] {
    if (this._allowedRoles.length > 0) {
      return [...this._allowedRoles];
    }
    const discovered = new Set<string>([DEFAULT_RECORD_ARTIFACT_ROLE]);
    for (const item of this.Items) {
      if (item.Role) {
        discovered.add(item.Role);
      }
    }
    return Array.from(discovered);
  }

  public get FilteredItems(): RecordDocListItem[] {
    if (this.SelectedRoleFilter === 'All') {
      return this.Items;
    }
    const target = this.SelectedRoleFilter.toLowerCase();
    return this.Items.filter((item) => item.Role.toLowerCase() === target);
  }

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Refresh();
  }

  /** Reloads linked artifacts and resolves viewer permissions in batched queries. */
  public async Refresh(): Promise<void> {
    const seq = ++this.loadSequence;
    this.ErrorMessage = null;

    if (!this._entityName || !this._recordId) {
      this.Items = [];
      this.HostCanRead = false;
      this.HostCanUpdate = false;
      this.IsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const provider = this.ProviderToUse;
    const user = this.EffectiveUser;
    if (!provider || !user) {
      this.Items = [];
      this.HostCanRead = false;
      this.HostCanUpdate = false;
      this.ErrorMessage = 'Unable to load record documents: metadata provider or user context is unavailable.';
      this.IsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const entityInfo = provider.EntityByName(this._entityName);
    if (!entityInfo) {
      this.Items = [];
      this.HostCanRead = false;
      this.HostCanUpdate = false;
      this.ErrorMessage = `Entity '${this._entityName}' was not found in metadata.`;
      this.IsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.applyHostPermissions(entityInfo, user);
    if (!this.HostCanRead) {
      this.Items = [];
      this.IsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const items = await this.loadRecordDocItems(entityInfo, user);
      if (seq !== this.loadSequence) {
        return;
      }
      this.Items = items;
    } catch (err) {
      if (seq !== this.loadSequence) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MJRecordDocsListComponent.Refresh failed: ${message}`);
      this.ErrorMessage = message;
      this.Items = [];
    } finally {
      if (seq === this.loadSequence) {
        this.IsLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  public OnSelectRoleFilter(role: string): void {
    this.SelectedRoleFilter = role;
    this.cdr.markForCheck();
  }

  public OnOpenItem(item: RecordDocListItem): void {
    const event: RecordDocOpenedEvent = {
      ArtifactID: item.ArtifactID,
      RecordArtifactID: item.RecordArtifactID,
      VersionNumber: item.PinnedVersionNumber,
      Role: item.Role,
      ArtifactName: item.ArtifactName,
      CanEdit: item.CanEdit,
      CanShare: item.CanShare,
    };
    this.ArtifactOpened.emit(event);
    if (this.OpenInSlideover && this.slideoverService) {
      this.slideoverService.Open({
        ArtifactID: item.ArtifactID,
        VersionNumber: item.PinnedVersionNumber,
        CurrentUser: this.EffectiveUser ?? undefined,
        Provider: this.Provider,
        CanEdit: item.CanEdit,
        CanShare: item.CanShare,
        Title: item.ArtifactName,
      });
    }
  }

  public OpenComposer(mode: 'create' | 'promote'): void {
    if (!this.EffectiveCanCreate) {
      return;
    }
    this.ComposerMode = mode;
    this.DraftTitle = '';
    this.DraftRole = this._allowedRoles[0] ?? DEFAULT_RECORD_ARTIFACT_ROLE;
    this.DraftMarkdown = mode === 'promote' ? this.InitialQuickNoteText : '';
    this.DraftContextDescription = mode === 'promote' ? 'Promoted from record note' : '';
    this.ErrorMessage = null;
    this.cdr.markForCheck();
  }

  public CloseComposer(): void {
    this.ComposerMode = 'none';
    this.cdr.markForCheck();
  }

  public async SubmitComposer(): Promise<void> {
    if (!this.EffectiveCanCreate || this.IsSubmitting) {
      return;
    }
    const mode = this.ComposerMode;
    const title = this.DraftTitle.trim();
    if (!title) {
      this.ErrorMessage = 'Please enter a title before saving.';
      this.cdr.markForCheck();
      return;
    }

    const result = await this.PromoteQuickNote(
      title,
      this.DraftMarkdown,
      this.DraftRole,
      this.DraftContextDescription || undefined,
      mode === 'create' ? this.DefaultArtifactType : DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME,
    );
    if (result.Success) {
      this.ComposerMode = 'none';
      this.DraftTitle = '';
      this.DraftMarkdown = '';
      this.DraftContextDescription = '';
      if (mode === 'create') {
        const createdItem = this.Items.find(
          (it) => NormalizeUUID(it.ArtifactID) === NormalizeUUID(result.ArtifactID ?? ''),
        );
        if (createdItem) {
          this.ArtifactCreated.emit(createdItem);
        }
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Promotes a quick note (or creates a linked document) by delegating to `PromoteNoteToArtifact`,
   * forwarding `EffectiveUser` and `ProviderToUse`.
   */
  public async PromoteQuickNote(
    title: string,
    markdownContent: string,
    role?: string,
    contextDescription?: string,
    artifactTypeName?: string,
  ): Promise<PromoteNoteToArtifactResult> {
    if (!this.EffectiveCanPromote) {
      const denied: PromoteNoteToArtifactResult = {
        Success: false,
        ErrorCode: 'PERMISSION_DENIED',
        ErrorMessage: 'You do not have permission to create or promote documents on this record.',
      };
      this.ErrorMessage = denied.ErrorMessage ?? null;
      this.cdr.markForCheck();
      return denied;
    }

    this.IsSubmitting = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();

    try {
      const result = await PromoteNoteToArtifact(
        {
          Title: title,
          MarkdownContent: markdownContent,
          HostEntityName: this._entityName,
          HostRecordID: this._recordId,
          ArtifactTypeName: artifactTypeName ?? this.DefaultArtifactType,
          LinkRole: role ?? (this._allowedRoles[0] || DEFAULT_RECORD_ARTIFACT_ROLE),
          ContextDescription: contextDescription ?? 'Promoted from record quick note',
          CreateRecordArtifactLink: true,
        },
        this.EffectiveUser ?? undefined,
        this.ProviderToUse,
      );

      if (!result.Success) {
        this.ErrorMessage = result.ErrorMessage ?? 'Failed to promote note to artifact.';
        return result;
      }

      this.NotePromoted.emit(result);
      await this.Refresh();
      return result;
    } finally {
      this.IsSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  public OnSynthesizeSlides(): void {
    if (!this.EffectiveCanSynthesizeSlides) {
      return;
    }
    this.SynthesizeSlidesRequested.emit({
      EntityName: this._entityName,
      RecordID: this._recordId,
      SourceArtifactIDs: this.Items.map((item) => item.ArtifactID),
      SourceItems: [...this.Items],
    });
  }

  public GetTypeIcon(artifactTypeName: string): string {
    const lower = (artifactTypeName ?? '').trim().toLowerCase();
    if (lower.includes('presentation') || lower.includes('slide')) {
      return 'fa-solid fa-display';
    }
    if (lower.includes('spreadsheet') || lower.includes('excel')) {
      return 'fa-solid fa-table';
    }
    return 'fa-solid fa-file-lines';
  }

  private applyHostPermissions(entityInfo: EntityInfo, user: UserInfo): void {
    if (typeof entityInfo.GetUserPermisions === 'function') {
      const perms = entityInfo.GetUserPermisions(user);
      this.HostCanRead = Boolean(perms?.CanRead);
      this.HostCanUpdate = this.HostCanRead && Boolean(perms?.CanUpdate);
      return;
    }
    this.HostCanRead = false;
    this.HostCanUpdate = false;
  }

  private async loadRecordDocItems(entityInfo: EntityInfo, user: UserInfo): Promise<RecordDocListItem[]> {
    const links = await this.fetchRecordArtifactLinks(entityInfo.ID, user);
    if (links.length === 0) {
      return [];
    }

    const uniqueArtifactIds = Array.from(new Set(links.map((l) => l.ArtifactID).filter(Boolean)));
    const uniquePinnedVersionIds = Array.from(
      new Set(links.map((l) => l.PinnedArtifactVersionID).filter((v): v is string => Boolean(v))),
    );

    const [artifactHeaders, pinnedVersions, permsByArtifactId] = await Promise.all([
      this.fetchArtifactHeadersBatched(uniqueArtifactIds, user),
      this.fetchPinnedVersionNumbersBatched(uniquePinnedVersionIds, user),
      ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(this.ProviderToUse, uniqueArtifactIds, user),
    ]);

    const headersById = IndexByUUID(artifactHeaders, (row) => row.ID);
    const versionsById = IndexByUUID(pinnedVersions, (row) => row.ID);

    const items: RecordDocListItem[] = [];
    for (const link of links) {
      const perms = permsByArtifactId.get(link.ArtifactID);
      if (!perms?.CanRead) {
        continue;
      }
      const header = headersById.Get(link.ArtifactID);
      const pinnedVersion = link.PinnedArtifactVersionID
        ? versionsById.Get(link.PinnedArtifactVersionID)
        : undefined;
      const rawPreview = link.ContextDescription || header?.Description || '';

      items.push({
        RecordArtifactID: link.ID,
        ArtifactID: link.ArtifactID,
        ArtifactName: header?.Name || 'Untitled Document',
        ArtifactDescription: header?.Description ?? null,
        PlainPreviewExcerpt: StripMarkdownPreviewText(rawPreview),
        ArtifactTypeName: header?.Type || this.DefaultArtifactType,
        Role: link.Role || DEFAULT_RECORD_ARTIFACT_ROLE,
        Sequence: link.Sequence ?? 0,
        PinnedArtifactVersionID: link.PinnedArtifactVersionID ?? null,
        PinnedVersionNumber: pinnedVersion?.VersionNumber,
        ContextDescription: link.ContextDescription ?? null,
        UpdatedAt: header?.__mj_UpdatedAt ?? link.__mj_UpdatedAt ?? null,
        CanRead: perms.CanRead,
        CanEdit: perms.CanEdit,
        CanDelete: perms.CanDelete,
        CanShare: perms.CanShare,
        PermissionSource: perms.Source,
      });
    }
    return items;
  }

  private async fetchRecordArtifactLinks(entityId: string, user: UserInfo): Promise<RecordArtifactRow[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    let filter = `EntityID='${EscapeSQLString(entityId)}' AND RecordID='${EscapeSQLString(this._recordId)}'`;
    if (this._allowedRoles.length > 0) {
      filter += ` AND ${buildSqlInClause('Role', this._allowedRoles)}`;
    }

    const res = await rv.RunView<RecordArtifactRow>(
      {
        EntityName: 'MJ: Record Artifacts',
        ExtraFilter: filter,
        OrderBy: 'Sequence ASC, __mj_CreatedAt DESC',
        Fields: [
          'ID',
          'EntityID',
          'RecordID',
          'ArtifactID',
          'PinnedArtifactVersionID',
          'Role',
          'Sequence',
          'ContextDescription',
          '__mj_UpdatedAt',
        ],
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      user,
    );
    if (!res.Success) {
      throw new Error(res.ErrorMessage || 'Failed to query MJ: Record Artifacts.');
    }
    return res.Results ?? [];
  }

  private async fetchArtifactHeadersBatched(
    artifactIds: ReadonlyArray<string>,
    user: UserInfo,
  ): Promise<ArtifactHeaderRow[]> {
    const chunks = chunkIds(artifactIds, MJRecordDocsListComponent.MAX_IN_CLAUSE_CHUNK_SIZE);
    if (chunks.length === 0) {
      return [];
    }
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const allRows: ArtifactHeaderRow[] = [];

    for (const chunk of chunks) {
      const res = await rv.RunView<ArtifactHeaderRow>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: buildSqlInClause('ID', chunk),
          Fields: ['ID', 'Name', 'Description', 'Type', '__mj_UpdatedAt'],
          IgnoreMaxRows: true,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        user,
      );
      if (res.Success && Array.isArray(res.Results)) {
        allRows.push(...res.Results);
      }
    }
    return allRows;
  }

  private async fetchPinnedVersionNumbersBatched(
    versionIds: ReadonlyArray<string>,
    user: UserInfo,
  ): Promise<ArtifactVersionNumberRow[]> {
    const chunks = chunkIds(versionIds, MJRecordDocsListComponent.MAX_IN_CLAUSE_CHUNK_SIZE);
    if (chunks.length === 0) {
      return [];
    }
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const allRows: ArtifactVersionNumberRow[] = [];

    for (const chunk of chunks) {
      const res = await rv.RunView<ArtifactVersionNumberRow>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: buildSqlInClause('ID', chunk),
          Fields: ['ID', 'VersionNumber'],
          IgnoreMaxRows: true,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        user,
      );
      if (res.Success && Array.isArray(res.Results)) {
        allRows.push(...res.Results);
      }
    }
    return allRows;
  }
}
