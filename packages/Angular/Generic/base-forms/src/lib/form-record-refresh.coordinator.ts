import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { BaseEntity } from '@memberjunction/core';

/**
 * Represents a field-level edit conflict where a remote session modified a field
 * that the user has also modified locally while in Edit Mode.
 */
export interface FormFieldConflict {
    /** Field name on the entity */
    fieldName: string;
    /** Server value before the remote update */
    previousServerValue: unknown;
    /** New value that just arrived from the server */
    incomingServerValue: unknown;
    /** Unsaved value the user currently has in the form */
    localEditedValue: unknown;
}

/**
 * Per-form broadcast that the current record was reloaded from the database.
 *
 * Provided on `<mj-record-form-container>` (same pattern as
 * {@link FormChromeCoordinator} / {@link FormSlotCoordinator}) so projected
 * related-entity grids, slot-mounted panels, the IS-A side panel, and the
 * toolbar can all see it. `providers` (not `viewProviders`) is what makes
 * that visible to `ng-content`.
 *
 * Listeners MUST no-op when they have never loaded (e.g. a related grid still
 * waiting on `DeferLoadUntilVisible`). Parent refresh is not a license to
 * fan out RunView across every collapsed section.
 */
export interface FormRemoteUpdateEvent {
    record: BaseEntity;
    changedFieldNames: ReadonlySet<string>;
    /** Map of lowercased field name -> previous server value for clean fields that were auto-merged while editing */
    autoMergedPreviousValues?: ReadonlyMap<string, unknown>;
    /** Map of lowercased field name -> conflict info for dirty fields whose server value changed */
    conflicts?: ReadonlyMap<string, FormFieldConflict>;
}

/**
 * Per-field comparison between a historical version snapshot and the current live record.
 */
export interface FormVersionPreviewFieldDiff {
    FieldName: string;
    DisplayName?: string;
    HistoricalValue: unknown;
    CurrentLiveValue: unknown;
    IsChanged?: boolean;
}

/**
 * Active In-Form Time-Travel version preview state broadcast to all `<mj-form-field>` instances.
 */
export interface FormVersionPreviewState {
    ChangeID: string;
    ChangedAt: Date | string;
    ChangedByUser?: string;
    UserName?: string;
    VersionLabel?: string;
    VersionSummary?: string;
    ChangeType?: string;
    Type?: string;
    Source?: string;
    Summary?: string;
    Comments?: string;
    /** Raw parsed `FullRecordJSON` map keyed by field name */
    SnapshotValues?: Readonly<Record<string, unknown>>;
    Snapshot?: Readonly<Record<string, unknown>>;
    /** Map of lowercased field name -> diff against the live record */
    FieldDiffs?: ReadonlyMap<string, FormVersionPreviewFieldDiff>;
    ChangedFields?: ReadonlyMap<string, FormVersionPreviewFieldDiff>;
    /** Count of fields that differ between the historical snapshot and current live record */
    DiffCount?: number;
    CurrentIndex?: number;
    TotalRestoreableCount?: number;
}

/**
 * Request emitted when the user clicks "Restore this field" on an individual `<mj-form-field>`
 * while in Time-Travel version preview mode.
 */
export interface FormSingleFieldRestoreRequest {
    FieldName: string;
    HistoricalValue: unknown;
    SourceChangeID?: string;
    ChangeID?: string;
    ChangedAt?: Date | string;
    ChangedByUser?: string;
}

@Injectable()
export class FormRecordRefreshCoordinator {
    private readonly refreshed$ = new Subject<BaseEntity>();
    private readonly remoteUpdated$ = new Subject<FormRemoteUpdateEvent>();
    private readonly activeConflicts = new Map<string, FormFieldConflict>();
    private readonly conflictsChanged$ = new Subject<ReadonlyMap<string, FormFieldConflict>>();
    private activeVersionPreview: FormVersionPreviewState | null = null;
    private readonly versionPreviewChanged$ = new Subject<FormVersionPreviewState | null>();
    private readonly singleFieldRestoreRequested$ = new Subject<FormSingleFieldRestoreRequest>();

    /** Emits the live parent record after a successful `RefreshRecord()`. */
    public readonly Refreshed$ = this.refreshed$.asObservable();

    /**
     * Emits when the parent record was auto-refreshed due to a remote/cross-tab
     * update, carrying the set of field names (lowercased and original) whose
     * values changed so `<mj-form-field>` instances can briefly highlight them
     * and refresh any cached FK labels.
     */
    public readonly RemoteUpdated$ = this.remoteUpdated$.asObservable();

    /**
     * Emits whenever the map of unresolved field conflicts changes.
     */
    public readonly ConflictsChanged$ = this.conflictsChanged$.asObservable();

    /**
     * Emits whenever the active In-Form Time-Travel version preview state changes.
     */
    public readonly VersionPreviewChanged$ = this.versionPreviewChanged$.asObservable();

    /**
     * Emits when a single `<mj-form-field>` requests restoring only its historical value.
     */
    public readonly SingleFieldRestoreRequested$ = this.singleFieldRestoreRequested$.asObservable();

    /**
     * Current map of unresolved field conflicts (keyed by lowercased field name).
     */
    public get ActiveConflicts(): ReadonlyMap<string, FormFieldConflict> {
        return this.activeConflicts;
    }

    /**
     * Currently active In-Form Time-Travel version preview state, or `null` when viewing live data.
     */
    public get ActiveVersionPreview(): FormVersionPreviewState | null {
        return this.activeVersionPreview;
    }

    /**
     * Enter, update, or exit In-Form Time-Travel version preview mode.
     */
    public SetVersionPreview(preview: FormVersionPreviewState | null): void {
        this.activeVersionPreview = preview;
        this.versionPreviewChanged$.next(preview);
    }

    /**
     * Request restoring a single field's historical value from the active Time-Travel preview.
     */
    public RequestRestoreSingleField(request: FormSingleFieldRestoreRequest): void {
        this.singleFieldRestoreRequested$.next(request);
    }

    /**
     * Push a successful parent-record refresh to in-form listeners.
     */
    public Notify(record: BaseEntity): void {
        this.refreshed$.next(record);
    }

    /**
     * Push a remote/cross-tab update notification with the set of changed field names,
     * optional auto-merged clean field baselines, and optional dirty-field conflicts.
     */
    public NotifyRemoteUpdate(
        record: BaseEntity,
        changedFieldNames: ReadonlySet<string>,
        autoMergedPreviousValues?: ReadonlyMap<string, unknown>,
        conflicts?: ReadonlyMap<string, FormFieldConflict>
    ): void {
        if (conflicts && conflicts.size > 0) {
            for (const [key, conflict] of conflicts.entries()) {
                this.activeConflicts.set(key.toLowerCase(), conflict);
            }
            this.conflictsChanged$.next(new Map(this.activeConflicts));
        }
        this.remoteUpdated$.next({
            record,
            changedFieldNames,
            autoMergedPreviousValues,
            conflicts
        });
        this.refreshed$.next(record);
    }

    /**
     * Mark a single field's conflict as resolved and notify subscribers.
     */
    public ResolveConflict(fieldName: string): void {
        if (!fieldName) {
            return;
        }
        const key = fieldName.toLowerCase();
        if (this.activeConflicts.delete(key)) {
            this.conflictsChanged$.next(new Map(this.activeConflicts));
        }
    }

    /**
     * Clear all active conflicts (e.g. when saving, cancelling edit mode, or switching records).
     */
    public ClearAllConflicts(): void {
        if (this.activeConflicts.size > 0) {
            this.activeConflicts.clear();
            this.conflictsChanged$.next(new Map(this.activeConflicts));
        } else {
            this.conflictsChanged$.next(new Map());
        }
    }
}
