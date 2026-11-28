import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CompositeKey, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactPermissionEngine,
  MJArtifactVersionEntity,
  type ResolvedArtifactPermissions,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { ArtifactVersionSavedEvent } from '../artifact-viewer-panel.component';
import { MarkdownArtifactViewerComponent } from '../plugins/markdown-artifact-viewer.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';

/** Display chrome mode supported by `<mj-embedded-doc-panel>`. */
export type EmbeddedDocPanelMode = 'compact' | 'full';

/** Lifecycle status of debounced `ArtifactWorkingState` autosave in `<mj-embedded-doc-panel>`. */
export type EmbeddedDocAutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'version-saved' | 'error';

/** Payload persisted by debounced working-state autosave. */
export interface EmbeddedDocWorkingStatePayload {
  ArtifactID: string;
  VersionNumber: number;
  Content: string;
  SavedAt: Date;
}

interface ArtifactTitleRow {
  ID: string;
  Name: string;
}

interface VersionMaxRow {
  ID: string;
  VersionNumber: number;
}

/**
 * Reusable inline Markdown document panel (`Mode="compact" | "full"`) wrapping
 * `MarkdownArtifactViewerComponent` with:
 * - Compact chrome hiding outline rail and secondary studio bars,
 * - Debounced `ArtifactWorkingState` autosave with a strict `>= 1000ms` debounce floor
 *   (flushed/cancelled cleanly on explicit `Save Version`, `[ArtifactID]` change, and `ngOnDestroy`),
 * - Delegated permission enforcement via `ArtifactPermissionEngine` (read-only users have
 *   edit and `Save Version` controls hidden/disabled), and
 * - Explicit `Save Version` and `Open Full Studio` actions.
 */
@Component({
  standalone: false,
  selector: 'mj-embedded-doc-panel',
  templateUrl: './mj-embedded-doc-panel.component.html',
  styleUrls: ['./mj-embedded-doc-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJEmbeddedDocPanelComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  /** Minimum autosave debounce delay in milliseconds to protect working-state write throughput. */
  public static readonly MIN_AUTOSAVE_DEBOUNCE_MS = 1000; // >= 1000ms floor per CostAndQuota

  /** Default autosave debounce delay in milliseconds when caller omits `AutosaveDebounceMs`. */
  public static readonly DEFAULT_AUTOSAVE_DEBOUNCE_MS = 1500; // 1.5s default typing settle window

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly collaborationService = inject(DocumentCollaborationService, { optional: true });

  @ViewChild(MarkdownArtifactViewerComponent)
  public MarkdownViewer?: MarkdownArtifactViewerComponent;

  private _artifactId = '';
  private _versionNumber: number | undefined = undefined;
  private _currentUser: UserInfo | null = null;
  private _mode: EmbeddedDocPanelMode = 'compact';
  private _autosaveDebounceMs = MJEmbeddedDocPanelComponent.DEFAULT_AUTOSAVE_DEBOUNCE_MS;
  private _canEditOverride: boolean | undefined = undefined;
  private isInitialized = false;
  private isDestroyed = false;
  private isFlushingFromViewer = false;
  private loadSequence = 0;

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAutosaveContent: string | null = null;
  private pendingAutosaveArtifactId: string | null = null;

  @Input()
  public set ArtifactID(value: string) {
    const normalized = (value ?? '').trim();
    if (normalized !== this._artifactId) {
      this.flushOrCancelPendingAutosaveBeforeSwitch();
      this._artifactId = normalized;
      if (this.isInitialized) {
        void this.LoadArtifact();
      }
    }
  }
  public get ArtifactID(): string {
    return this._artifactId;
  }

  @Input()
  public set VersionNumber(value: number | undefined) {
    if (value !== this._versionNumber) {
      this._versionNumber = value;
      if (this.isInitialized && this._artifactId) {
        void this.LoadArtifact();
      }
    }
  }
  public get VersionNumber(): number | undefined {
    return this._versionNumber;
  }

  @Input()
  public set CurrentUser(value: UserInfo | null) {
    if (value !== this._currentUser) {
      this._currentUser = value;
      if (this.isInitialized && this._artifactId) {
        void this.LoadArtifact();
      }
    }
  }
  public get CurrentUser(): UserInfo | null {
    return this._currentUser;
  }

  @Input()
  public set Mode(value: EmbeddedDocPanelMode) {
    const normalized: EmbeddedDocPanelMode = value === 'full' ? 'full' : 'compact';
    if (normalized !== this._mode) {
      this._mode = normalized;
      this.cdr.markForCheck();
    }
  }
  public get Mode(): EmbeddedDocPanelMode {
    return this._mode;
  }

  /**
   * Autosave debounce delay in milliseconds. Values below {@link MIN_AUTOSAVE_DEBOUNCE_MS} (1000ms)
   * are clamped up to 1000ms to prevent excessive working-state write bursts.
   */
  @Input()
  public set AutosaveDebounceMs(value: number) {
    const parsed = Number.isFinite(value) ? value : MJEmbeddedDocPanelComponent.DEFAULT_AUTOSAVE_DEBOUNCE_MS;
    this._autosaveDebounceMs = Math.max(MJEmbeddedDocPanelComponent.MIN_AUTOSAVE_DEBOUNCE_MS, parsed);
  }
  public get AutosaveDebounceMs(): number {
    return this._autosaveDebounceMs;
  }

  /** Optional explicit editability override (otherwise resolved via `ArtifactPermissionEngine`). */
  @Input()
  public set CanEditOverride(value: boolean | undefined) {
    this._canEditOverride = value;
    if (value !== undefined) {
      this.CanEdit = Boolean(value);
      this.cdr.markForCheck();
    }
  }
  public get CanEditOverride(): boolean | undefined {
    return this._canEditOverride;
  }

  /** Optional WebSocket URL override for live collaboration sessions. */
  @Input() public CollaborationWsUrl: string | null = null;

  /**
   * Optional custom persistence hook for debounced working-state autosave.
   * When omitted, working state routes through `DocumentCollaborationService` (never direct
   * client `MJArtifactWorkingStateEntity.Save()`, which is API-locked by security design).
   */
  @Input() public AutosaveHandler?: (payload: EmbeddedDocWorkingStatePayload) => Promise<void> | void;

  /** Emitted when a new immutable `MJ: Artifact Versions` snapshot is saved. */
  @Output() public VersionSaved = new EventEmitter<ArtifactVersionSavedEvent>();

  /** Emitted whenever a debounced working-state autosave settles. */
  @Output() public WorkingStateAutosaved = new EventEmitter<EmbeddedDocWorkingStatePayload>();

  /** Emitted when the user clicks `Open Full Studio`. */
  @Output() public OpenFullStudioRequested = new EventEmitter<string>();

  /** Bubbles non-artifact record link activations from the wrapped document viewer. */
  @Output() public OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();

  public ArtifactName = '';
  public CurrentVersion: MJArtifactVersionEntity | null = null;
  public ResolvedPermissions: ResolvedArtifactPermissions | null = null;
  public CanEdit = false;
  public IsLoading = false;
  public IsSavingVersion = false;
  public HasPendingChanges = false;
  public ErrorMessage: string | null = null;
  public AutosaveStatus: EmbeddedDocAutosaveStatus = 'idle';
  public LastAutosavedAt: Date | null = null;
  public DraftContent = '';

  public get EffectiveUser(): UserInfo | null {
    return this._currentUser ?? this.ProviderToUse?.CurrentUser ?? null;
  }

  public get IsCompactMode(): boolean {
    return this._mode === 'compact';
  }

  public get HasPendingAutosaveTimer(): boolean {
    return this.autosaveTimer !== null;
  }

  public get EffectiveAutosaveDebounceMs(): number {
    return Math.max(MJEmbeddedDocPanelComponent.MIN_AUTOSAVE_DEBOUNCE_MS, this._autosaveDebounceMs);
  }

  public get CurrentVersionNumber(): number {
    return this.CurrentVersion?.VersionNumber ?? this._versionNumber ?? 1;
  }

  public get AutosaveStatusLabel(): string {
    switch (this.AutosaveStatus) {
      case 'pending':
        return 'Unsaved changes…';
      case 'saving':
        return 'Saving working draft…';
      case 'saved':
        return 'Draft synced';
      case 'version-saved':
        return `Saved v${this.CurrentVersionNumber}`;
      case 'error':
        return 'Autosave failed';
      default:
        return this.CanEdit ? 'Ready' : 'Read-only';
    }
  }

  public ngOnInit(): void {
    this.isInitialized = true;
    if (this._artifactId) {
      void this.LoadArtifact();
    }
  }

  public ngOnDestroy(): void {
    this.isDestroyed = true;
    this.cancelPendingAutosaveTimer();
  }

  /** Loads the active artifact version and resolves viewer edit permissions. */
  public async LoadArtifact(): Promise<void> {
    const seq = ++this.loadSequence;
    this.ErrorMessage = null;

    if (!this._artifactId) {
      this.CurrentVersion = null;
      this.ArtifactName = '';
      this.CanEdit = false;
      this.IsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const provider = this.ProviderToUse;
    const user = this.EffectiveUser;
    if (!provider || !user) {
      this.ErrorMessage = 'Metadata provider or user context unavailable.';
      this.CanEdit = false;
      this.IsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const perms = await this.resolveEffectivePermissions(user);
      if (seq !== this.loadSequence || this.isDestroyed) {
        return;
      }
      this.ResolvedPermissions = perms;
      this.CanEdit = this._canEditOverride !== undefined ? Boolean(this._canEditOverride) : perms.CanEdit;

      if (!perms.CanRead && this._canEditOverride === undefined) {
        this.CurrentVersion = null;
        this.ErrorMessage = perms.Reason || 'You do not have permission to view this document.';
        return;
      }

      const [title, version] = await Promise.all([
        this.loadArtifactTitle(user),
        this.loadActiveVersion(user),
      ]);
      if (seq !== this.loadSequence || this.isDestroyed) {
        return;
      }

      this.ArtifactName = title || version?.Name || 'Document';
      this.CurrentVersion = version;
      this.DraftContent = version?.Content ?? '';
      this.HasPendingChanges = false;
      this.AutosaveStatus = 'idle';
    } catch (err) {
      if (seq !== this.loadSequence || this.isDestroyed) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MJEmbeddedDocPanelComponent.LoadArtifact failed: ${message}`);
      this.ErrorMessage = message;
    } finally {
      if (seq === this.loadSequence && !this.isDestroyed) {
        this.IsLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Schedules a debounced working-state autosave (`>= 1000ms`) for live edits.
   * No-ops cleanly for read-only viewers.
   */
  public OnDraftContentChanged(nextContent: string): void {
    if (!this.CanEdit || !this._artifactId) {
      return;
    }
    if (this.isFlushingFromViewer) {
      this.DraftContent = nextContent;
      return;
    }
    this.DraftContent = nextContent;
    this.HasPendingChanges = true;
    this.AutosaveStatus = 'pending';
    this.pendingAutosaveContent = nextContent;
    this.pendingAutosaveArtifactId = this._artifactId;

    this.clearAutosaveTimerOnly();
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.flushPendingWorkingState();
    }, this.EffectiveAutosaveDebounceMs);

    this.cdr.markForCheck();
  }

  /**
   * Explicitly saves a new immutable `MJ: Artifact Versions` record, cancelling any pending
   * autosave debounce timer first so working-state writes never race version creation.
   */
  public async OnSaveVersion(): Promise<void> {
    if (!this.CanEdit || this.IsSavingVersion || !this._artifactId) {
      return;
    }

    this.cancelPendingAutosaveTimer();
    this.IsSavingVersion = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();

    try {
      this.flushViewerPendingEdits();
      const contentToPersist = this.MarkdownViewer?.MarkdownContent ?? this.DraftContent;
      const saved = await this.persistNewVersion(contentToPersist);
      if (!saved) {
        return;
      }
      this.DraftContent = contentToPersist;
      this.HasPendingChanges = false;
      this.AutosaveStatus = 'version-saved';
      this.VersionSaved.emit(saved);
    } finally {
      if (!this.isDestroyed) {
        this.IsSavingVersion = false;
        this.cdr.markForCheck();
      }
    }
  }

  /** Handles `ContentCommitted` bubbled from the wrapped `MarkdownArtifactViewerComponent`. */
  public OnViewerContentCommitted(committedMarkdown: string): void {
    this.cancelPendingAutosaveTimer();
    this.DraftContent = committedMarkdown;
    this.HasPendingChanges = false;
    this.AutosaveStatus = 'version-saved';
    this.VersionSaved.emit({
      ArtifactID: this._artifactId,
      VersionID: this.CurrentVersion?.ID,
      VersionNumber: this.CurrentVersionNumber,
      UpdatedAt: new Date(),
    });
    this.cdr.markForCheck();
  }

  /** Emits `OpenFullStudioRequested` with the active `ArtifactID`. */
  public OnOpenFullStudio(): void {
    if (!this._artifactId) {
      return;
    }
    this.OpenFullStudioRequested.emit(this._artifactId);
  }

  private async resolveEffectivePermissions(user: UserInfo): Promise<ResolvedArtifactPermissions> {
    if (this._canEditOverride !== undefined) {
      return {
        ArtifactID: this._artifactId,
        CanRead: true,
        CanEdit: Boolean(this._canEditOverride),
        CanDelete: false,
        CanShare: Boolean(this._canEditOverride),
        Source: 'Delegate',
        Reason: 'Explicit CanEditOverride supplied by host.',
      };
    }
    return ArtifactPermissionEngine.Instance.ResolvePermissions(this.ProviderToUse, this._artifactId, user);
  }

  private async loadArtifactTitle(user: UserInfo): Promise<string> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const res = await rv.RunView<ArtifactTitleRow>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID='${EscapeSQLString(this._artifactId)}'`,
        Fields: ['ID', 'Name'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      user,
    );
    return res.Success && res.Results.length > 0 ? res.Results[0].Name : '';
  }

  private async loadActiveVersion(user: UserInfo): Promise<MJArtifactVersionEntity | null> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const filter =
      this._versionNumber != null
        ? `ArtifactID='${EscapeSQLString(this._artifactId)}' AND VersionNumber=${Math.trunc(this._versionNumber)}`
        : `ArtifactID='${EscapeSQLString(this._artifactId)}'`;
    const res = await rv.RunView<MJArtifactVersionEntity>(
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: filter,
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'entity_object',
      },
      user,
    );
    return res.Success && res.Results.length > 0 ? res.Results[0] : null;
  }

  private async flushPendingWorkingState(): Promise<void> {
    if (this.isDestroyed || this.pendingAutosaveContent === null || !this.pendingAutosaveArtifactId) {
      return;
    }
    const payload = this.buildPendingWorkingStatePayload();
    this.AutosaveStatus = 'saving';
    this.cdr.markForCheck();

    try {
      const failureMessage = await this.persistWorkingState(payload);
      if (this.isDestroyed) {
        return;
      }
      if (failureMessage) {
        this.reportAutosaveFailure(failureMessage);
        return;
      }
      this.ErrorMessage = null;
      this.LastAutosavedAt = payload.SavedAt;
      this.AutosaveStatus = 'saved';
      this.WorkingStateAutosaved.emit(payload);
      this.cdr.markForCheck();
    } catch (err) {
      if (!this.isDestroyed) {
        this.reportAutosaveFailure(err instanceof Error ? err.message : String(err));
      }
    }
  }

  private buildPendingWorkingStatePayload(): EmbeddedDocWorkingStatePayload {
    const targetArtifactId = this.pendingAutosaveArtifactId ?? this._artifactId;
    const queuedContent = this.pendingAutosaveContent ?? this.DraftContent;
    this.pendingAutosaveContent = null;
    this.pendingAutosaveArtifactId = null;

    const isSameArtifact = targetArtifactId === this._artifactId;
    if (isSameArtifact) {
      this.flushViewerPendingEdits();
    }
    const contentToPersist = isSameArtifact
      ? (this.MarkdownViewer?.MarkdownContent ?? this.DraftContent)
      : queuedContent;
    if (isSameArtifact) {
      this.DraftContent = contentToPersist;
    }
    return {
      ArtifactID: targetArtifactId,
      VersionNumber: this.CurrentVersionNumber,
      Content: contentToPersist,
      SavedAt: new Date(),
    };
  }

  private async persistWorkingState(payload: EmbeddedDocWorkingStatePayload): Promise<string | null> {
    if (this.AutosaveHandler) {
      await this.AutosaveHandler(payload);
      return null;
    }
    if (!this.collaborationService) {
      return 'Working-state autosave unavailable: no autosave handler or collaboration service configured.';
    }
    const result = await this.collaborationService.CommitInlineEditOnServer(
      payload.ArtifactID,
      payload.Content,
      false,
      this.ProviderToUse,
    );
    if (!result.HandledByServer || !result.Success) {
      return (
        result.ErrorMessage ||
        (result.HandledByServer
          ? 'Working-state autosave failed on server.'
          : 'Working-state autosave unavailable: server collaboration endpoint did not handle the request.')
      );
    }
    return null;
  }

  private reportAutosaveFailure(message: string): void {
    LogError(`MJEmbeddedDocPanelComponent autosave failed: ${message}`);
    this.ErrorMessage = message;
    this.AutosaveStatus = 'error';
    this.cdr.markForCheck();
  }

  private flushViewerPendingEdits(): void {
    if (!this.MarkdownViewer) {
      return;
    }
    this.isFlushingFromViewer = true;
    try {
      this.MarkdownViewer.FlushPendingEdits();
    } finally {
      this.isFlushingFromViewer = false;
    }
  }

  private async persistNewVersion(content: string): Promise<ArtifactVersionSavedEvent | null> {
    const provider = this.ProviderToUse;
    const user = this.EffectiveUser;
    if (!provider || !user) {
      this.ErrorMessage = 'Metadata provider or user context unavailable.';
      return null;
    }

    if (this.collaborationService) {
      const serverCommit = await this.collaborationService.CommitInlineEditOnServer(
        this._artifactId,
        content,
        true,
        provider,
      );
      if (serverCommit.HandledByServer) {
        if (!serverCommit.Success) {
          this.ErrorMessage = serverCommit.ErrorMessage || 'Failed to save document version.';
          return null;
        }
        const nextNum = serverCommit.VersionNumber ?? this.CurrentVersionNumber + 1;
        return {
          ArtifactID: this._artifactId,
          VersionID: serverCommit.VersionID,
          VersionNumber: nextNum,
          UpdatedAt: new Date(),
        };
      }
    }

    const rv = RunView.FromMetadataProvider(provider);
    const maxRes = await rv.RunView<VersionMaxRow>(
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${EscapeSQLString(this._artifactId)}'`,
        OrderBy: 'VersionNumber DESC',
        Fields: ['ID', 'VersionNumber'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      user,
    );
    const dbMax = maxRes.Success && maxRes.Results.length > 0 ? maxRes.Results[0].VersionNumber : 0;
    const nextVersionNumber = Math.max(dbMax, this.CurrentVersion?.VersionNumber ?? 0) + 1;

    const ver = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
    ver.NewRecord();
    ver.ArtifactID = this._artifactId;
    ver.VersionNumber = nextVersionNumber;
    ver.Name = this.ArtifactName || 'Document';
    ver.Content = content;
    ver.ContentMode = 'Text';
    ver.UserID = user.ID;

    const ok = await ver.Save();
    if (!ok) {
      this.ErrorMessage = ver.LatestResult?.CompleteMessage ?? 'Failed to save document version.';
      return null;
    }

    this.CurrentVersion = ver;
    return {
      ArtifactID: this._artifactId,
      VersionID: ver.ID,
      VersionNumber: nextVersionNumber,
      UpdatedAt: new Date(),
    };
  }

  private flushOrCancelPendingAutosaveBeforeSwitch(): void {
    if (this.autosaveTimer !== null) {
      this.clearAutosaveTimerOnly();
      if (this.pendingAutosaveContent !== null && this.pendingAutosaveArtifactId) {
        void this.flushPendingWorkingState();
      }
    }
  }

  private clearAutosaveTimerOnly(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private cancelPendingAutosaveTimer(): void {
    this.clearAutosaveTimerOnly();
    this.pendingAutosaveContent = null;
    this.pendingAutosaveArtifactId = null;
  }
}
