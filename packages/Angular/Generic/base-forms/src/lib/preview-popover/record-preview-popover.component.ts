import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    Output,
    Type,
    inject
} from '@angular/core';
import {
    BaseEntity,
    CompositeKey,
    EntityFieldInfo,
    EntityFieldTSType,
    EntityInfo,
    IMetadataProvider,
    RunView
} from '@memberjunction/core';
import { ClassRegistration, MJGlobal, MJLruCache, OptionalKeyedSpecialization } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CancellableFormEvent } from '../types/form-events';
import { FormNavigationEvent } from '../types/navigation-events';

/**
 * Single summary field rendered inside {@link MjRecordPreviewPopoverComponent}.
 */
export interface RecordPreviewFieldItem {
    FieldName: string;
    Label: string;
    Value: string;
    RawValue?: unknown;
    IsStatusField: boolean;
    /** When true, spans both columns (`grid-column: 1 / -1`) in the 2-column preview grid. */
    IsWide?: boolean;
    IsEditable?: boolean;
    InputType?: 'text' | 'number' | 'boolean' | 'select';
    PossibleValues?: string[];
}

/**
 * Cached summary payload for a target entity record in {@link MjRecordPreviewPopoverComponent}.
 */
export interface RecordPreviewSummary {
    EntityName: string;
    EntityDisplayName: string;
    EntityIcon: string;
    RecordID: string;
    PrimaryKey: CompositeKey;
    Title: string;
    StatusValue: string | null;
    Fields: RecordPreviewFieldItem[];
    CanEditRecord?: boolean;
    NameFieldName?: string | null;
    NameFieldEditable?: boolean;
}

/**
 * Event emitted when inline quick-edit saves updated field values on the previewed target record.
 */
export interface RecordPreviewUpdatedEvent {
    EntityName: string;
    PrimaryKey: CompositeKey;
    UpdatedFields: Record<string, unknown>;
}

/**
 * Cancellable event args emitted before inline Quick Edit saves changes to the target entity record.
 * Set `Cancel = true` to prevent the save operation.
 */
export class BeforeRecordPreviewSaveEventArgs extends CancellableFormEvent {
    public readonly EntityName: string;
    public readonly PrimaryKey: CompositeKey;
    public readonly Summary: RecordPreviewSummary;
    public readonly Drafts: Record<string, string | undefined>;

    constructor(
        entityName: string,
        primaryKey: CompositeKey,
        summary: RecordPreviewSummary,
        drafts: Record<string, string | undefined>
    ) {
        super();
        this.EntityName = entityName;
        this.PrimaryKey = primaryKey;
        this.Summary = summary;
        this.Drafts = drafts;
    }
}

/**
 * Anchor rectangle used to position {@link MjRecordPreviewPopoverComponent} in viewport coordinates.
 */
export interface RecordPreviewAnchorRect {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
}

/**
 * Lightweight hover preview card (`<mj-record-preview-popover>`) that displays key metadata
 * and summary fields (`DefaultInView`) for any foreign-key or polymorphic-FK linked record.
 *
 * ### Pluggable via `@RegisterClass` and `MJGlobal.Instance.ClassFactory`
 * Applications and domain packages can subclass `MjRecordPreviewPopoverComponent` and register
 * their custom hover card with `@RegisterClass`:
 * - **Global replacement (all entities)**:
 *   `@RegisterClass(MjRecordPreviewPopoverComponent)` or `@RegisterClass(MjRecordPreviewPopoverComponent, '*')`
 * - **Schema or wildcard replacement**:
 *   `@RegisterClass(MjRecordPreviewPopoverComponent, 'MJ_BizApps_Common:*')` or
 *   `@RegisterClass(MjRecordPreviewPopoverComponent, 'schema:mj_bizapps_common')`
 * - **Entity-specific replacement**:
 *   `@RegisterClass(MjRecordPreviewPopoverComponent, 'MJ_BizApps_Common: People')`
 *
 * {@link MjRecordPreviewPopoverService} calls {@link ResolveRecordPreviewPopoverType} at runtime
 * to instantiate the highest-priority matching subclass via Angular's `createComponent()`.
 */
@OptionalKeyedSpecialization()
@Component({
    standalone: false,
    selector: 'mj-record-preview-popover',
    templateUrl: './record-preview-popover.component.html',
    styleUrls: ['./record-preview-popover.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjRecordPreviewPopoverComponent extends BaseAngularComponent implements OnDestroy {
    protected static readonly CACHE_MAX_ENTRIES = 500;
    protected static readonly CACHE_TTL_MS = 60_000;
    /** Bounded: one entry per previewed record would otherwise accumulate for the whole session. */
    protected static readonly summaryCache = new MJLruCache<string, { LoadedAt: number; Summary: RecordPreviewSummary }>({
        maxSize: MjRecordPreviewPopoverComponent.CACHE_MAX_ENTRIES,
        ttlMs: MjRecordPreviewPopoverComponent.CACHE_TTL_MS
    });
    private static providerScopeIds = new WeakMap<object, number>();
    private static nextProviderScopeId = 1;

    protected cdr = inject(ChangeDetectorRef);
    protected _destroyed = false;
    protected _visible = false;
    protected _entityName: string | null = null;
    protected _recordID: string | null = null;
    protected _primaryKey: CompositeKey | null = null;
    protected _displayName: string | null = null;
    protected _anchorRect: RecordPreviewAnchorRect | null = null;
    protected _loadSeq = 0;

    @Input()
    public get EntityName(): string | null {
        return this._entityName;
    }
    public set EntityName(value: string | null) {
        if (value !== this._entityName) {
            this._entityName = value;
            this.resetEditState();
            if (this._visible) {
                void this.loadSummary();
            }
        }
    }

    @Input()
    public get RecordID(): string | null {
        return this._recordID;
    }
    public set RecordID(value: string | null) {
        if (value !== this._recordID) {
            this._recordID = value;
            this.resetEditState();
            if (this._visible) {
                void this.loadSummary();
            }
        }
    }

    @Input()
    public get PrimaryKey(): CompositeKey | null {
        return this._primaryKey;
    }
    public set PrimaryKey(value: CompositeKey | null) {
        if (value !== this._primaryKey) {
            this._primaryKey = value;
            this.resetEditState();
            if (this._visible) {
                void this.loadSummary();
            }
        }
    }

    @Input()
    public get DisplayName(): string | null {
        return this._displayName;
    }
    public set DisplayName(value: string | null) {
        this._displayName = value;
    }

    @Input()
    public get AnchorRect(): RecordPreviewAnchorRect | null {
        return this._anchorRect;
    }
    public set AnchorRect(value: RecordPreviewAnchorRect | null) {
        this._anchorRect = value;
        this.cdr.markForCheck();
    }

    @Input()
    public get Visible(): boolean {
        return this._visible;
    }
    public set Visible(value: boolean) {
        if (value !== this._visible) {
            this._visible = value;
            if (value) {
                void this.loadSummary();
            } else {
                this.resetEditState();
            }
            this.cdr.markForCheck();
        }
    }

    /** Whether inline quick-edit of summary fields is allowed inside the popover. */
    @Input() public AllowQuickEdit = true;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();
    @Output() public MouseEnterCard = new EventEmitter<void>();
    @Output() public MouseLeaveCard = new EventEmitter<void>();
    /** Cancellable event emitted before Quick Edit saves field changes to the target entity. */
    @Output() public BeforeQuickEditSave = new EventEmitter<BeforeRecordPreviewSaveEventArgs>();
    /** Emitted after Quick Edit successfully saves field changes to the target entity. */
    @Output() public AfterQuickEditSaved = new EventEmitter<RecordPreviewUpdatedEvent>();
    /** Emitted after Quick Edit saves field changes (alias/companion to `AfterQuickEditSaved`). */
    @Output() public RecordUpdated = new EventEmitter<RecordPreviewUpdatedEvent>();

    public IsLoading = false;
    public Summary: RecordPreviewSummary | null = null;
    public CopiedID = false;
    public IsEditing = false;
    public IsSavingEdit = false;
    public EditErrorMessage: string | null = null;
    public EditDrafts: Record<string, string | undefined> = {};
    private _copyTimer: ReturnType<typeof setTimeout> | null = null;

    /** Clear the static summary cache (useful in unit tests). */
    public static ClearCache(): void {
        MjRecordPreviewPopoverComponent.summaryCache.Clear();
    }

    private static getProviderScopeId(provider: IMetadataProvider | null | undefined): number {
        if (!provider || (typeof provider !== 'object' && typeof provider !== 'function')) {
            return 0;
        }
        let scopeId = MjRecordPreviewPopoverComponent.providerScopeIds.get(provider);
        if (scopeId === undefined) {
            scopeId = MjRecordPreviewPopoverComponent.nextProviderScopeId++;
            MjRecordPreviewPopoverComponent.providerScopeIds.set(provider, scopeId);
        }
        return scopeId;
    }

    protected buildSummaryCacheKey(entityName: string, recordKey: string): string {
        const providerScope = MjRecordPreviewPopoverComponent.getProviderScopeId(this.ProviderToUse);
        return `p${providerScope}::${entityName.trim().toLowerCase()}::${recordKey.trim().toLowerCase()}`;
    }

    public ngOnDestroy(): void {
        this._destroyed = true;
        if (this._copyTimer) {
            clearTimeout(this._copyTimer);
            this._copyTimer = null;
        }
    }

    protected resetEditState(): void {
        this.IsEditing = false;
        this.IsSavingEdit = false;
        this.EditErrorMessage = null;
        this.EditDrafts = {};
    }

    public get CompactRecordID(): string {
        const raw = (this.Summary?.RecordID ?? this._recordID ?? '').trim();
        if (!raw) return '';
        if (raw.length <= 12) return raw;
        return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
    }

    public OnCopyRecordID(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const raw = (this.Summary?.RecordID ?? this._recordID ?? '').trim();
        if (!raw) return;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(raw);
            }
        } catch {
            // Ignore clipboard errors in restricted environments
        }
        this.CopiedID = true;
        this.cdr.markForCheck();
        if (this._copyTimer) {
            clearTimeout(this._copyTimer);
        }
        this._copyTimer = setTimeout(() => {
            this._copyTimer = null;
            if (!this._destroyed) {
                this.CopiedID = false;
                this.cdr.markForCheck();
            }
        }, 1500);
    }

    public get PopoverPositionStyle(): Record<string, string> {
        const rect = this._anchorRect;
        if (!rect || typeof window === 'undefined') {
            return { display: 'none' };
        }
        const cardWidth = 328;
        const estimatedHeight = 200;
        const gap = 8;
        const viewportW = window.innerWidth || 1024;
        const viewportH = window.innerHeight || 768;

        const left = Math.max(12, Math.min(rect.left, viewportW - cardWidth - 12));
        const spaceBelow = viewportH - rect.bottom;
        const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;

        if (openAbove) {
            return {
                position: 'fixed',
                left: `${left}px`,
                bottom: `${Math.max(12, viewportH - rect.top + gap)}px`,
                top: 'auto',
                width: `${cardWidth}px`,
                'z-index': '10050'
            };
        }

        return {
            position: 'fixed',
            left: `${left}px`,
            top: `${rect.bottom + gap}px`,
            bottom: 'auto',
            width: `${cardWidth}px`,
            'z-index': '10050'
        };
    }

    public OnCardMouseEnter(): void {
        this.MouseEnterCard.emit();
    }

    public OnCardMouseLeave(): void {
        if (this.IsEditing || this.IsSavingEdit) {
            return;
        }
        this.MouseLeaveCard.emit();
    }

    public OnStartEdit(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const summary = this.Summary;
        if (!summary || !summary.CanEditRecord || !this.AllowQuickEdit) {
            return;
        }
        const drafts: Record<string, string> = {};
        if (summary.NameFieldEditable && summary.NameFieldName) {
            drafts[summary.NameFieldName] = summary.Title;
        }
        for (const item of summary.Fields) {
            if (!item.IsEditable) continue;
            if (item.InputType === 'boolean') {
                drafts[item.FieldName] =
                    item.RawValue === true || item.RawValue === 1 || item.RawValue === 'true' || item.Value === 'Yes'
                        ? 'true'
                        : 'false';
            } else {
                drafts[item.FieldName] = item.RawValue != null ? String(item.RawValue) : item.Value;
            }
        }
        this.EditDrafts = drafts;
        this.EditErrorMessage = null;
        this.IsEditing = true;
        this.cdr.markForCheck();
    }

    public OnCancelEdit(event?: MouseEvent): void {
        event?.preventDefault();
        event?.stopPropagation();
        this.resetEditState();
        this.cdr.markForCheck();
    }

    public OnEditDraftInput(fieldName: string, eventOrValue: Event | string): void {
        if (typeof eventOrValue === 'string') {
            this.EditDrafts[fieldName] = eventOrValue;
            this.cdr.markForCheck();
            return;
        }
        const target = eventOrValue.target as HTMLInputElement | HTMLSelectElement | null;
        if (!target) return;
        this.EditDrafts[fieldName] = target.value;
        this.cdr.markForCheck();
    }

    public async OnSaveEdit(event?: MouseEvent): Promise<void> {
        event?.preventDefault();
        event?.stopPropagation();
        const summary = this.Summary;
        if (!summary || this.IsSavingEdit) {
            return;
        }

        const beforeArgs = new BeforeRecordPreviewSaveEventArgs(
            summary.EntityName,
            summary.PrimaryKey,
            summary,
            this.EditDrafts
        );
        this.BeforeQuickEditSave.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return;
        }

        const md = this.ProviderToUse;
        const entityInfo = md?.EntityByName(summary.EntityName);
        if (!md || !entityInfo) {
            this.EditErrorMessage = 'Entity metadata is unavailable.';
            this.cdr.markForCheck();
            return;
        }

        this.IsSavingEdit = true;
        this.EditErrorMessage = null;
        this.cdr.markForCheck();

        try {
            const record = await md.GetEntityObject<BaseEntity>(summary.EntityName, md.CurrentUser);
            const loaded = await record.InnerLoad(summary.PrimaryKey);
            if (!loaded) {
                this.EditErrorMessage = record.LatestResult?.Message || 'Could not load target record for editing.';
                this.IsSavingEdit = false;
                this.cdr.markForCheck();
                return;
            }

            const updatedFields: Record<string, unknown> = {};
            for (const [fieldName, draftValue] of Object.entries(this.EditDrafts)) {
                if (draftValue === undefined) continue;
                const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
                const coerced = this.coerceDraftValue(draftValue, fieldInfo);
                const currentVal = record.Get(fieldName);
                if (String(currentVal ?? '') !== String(coerced ?? '')) {
                    record.Set(fieldName, coerced);
                    updatedFields[fieldName] = coerced;
                }
            }

            const saved = await record.Save();
            if (this._destroyed) return;

            if (!saved) {
                this.EditErrorMessage = record.LatestResult?.Message || 'Failed to save changes.';
                this.IsSavingEdit = false;
                this.cdr.markForCheck();
                return;
            }

            const cacheKey = this.buildSummaryCacheKey(summary.EntityName, summary.RecordID);
            MjRecordPreviewPopoverComponent.summaryCache.Delete(cacheKey);
            this.resetEditState();
            await this.loadSummary(true);
            const updatedEvent: RecordPreviewUpdatedEvent = {
                EntityName: summary.EntityName,
                PrimaryKey: summary.PrimaryKey,
                UpdatedFields: updatedFields
            };
            this.AfterQuickEditSaved.emit(updatedEvent);
            this.RecordUpdated.emit(updatedEvent);
            this.cdr.markForCheck();
        } catch (err: unknown) {
            if (!this._destroyed) {
                this.EditErrorMessage = err instanceof Error ? err.message : 'Unexpected error while saving.';
                this.IsSavingEdit = false;
                this.cdr.markForCheck();
            }
        }
    }

    protected coerceDraftValue(draft: string, field?: EntityFieldInfo): unknown {
        if (!field) {
            return draft;
        }
        if (field.TSType === EntityFieldTSType.Boolean) {
            const norm = draft.trim().toLowerCase();
            return norm === 'true' || norm === '1' || norm === 'yes';
        }
        if (field.TSType === EntityFieldTSType.Number) {
            const trimmed = draft.trim();
            if (trimmed === '') return null;
            const parsed = Number(trimmed);
            return Number.isNaN(parsed) ? draft : parsed;
        }
        return draft;
    }

    /**
     * Handles primary click on the record title link in the Option A header.
     * Supports Ctrl/Cmd/Shift-click to open in a new tab.
     */
    public OnTitleClick(event: MouseEvent): void {
        const openInNewTab = Boolean(event.ctrlKey || event.metaKey || event.shiftKey);
        this.OnOpenRecord(openInNewTab, event);
    }

    /**
     * Handles middle-click (`auxclick` button 1) on the record title link to open in a new tab.
     */
    public OnTitleAuxClick(event: MouseEvent): void {
        if (event.button === 1) {
            this.OnOpenRecord(true, event);
        }
    }

    public OnOpenRecord(openInNewTab: boolean, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const summary = this.Summary;
        const entityName = summary?.EntityName || this._entityName;
        if (!entityName) {
            return;
        }
        const pk = summary?.PrimaryKey || this.resolveCompositeKey();
        if (!pk) {
            return;
        }
        this.Navigate.emit({
            Kind: 'record',
            EntityName: entityName,
            PrimaryKey: pk,
            OpenInNewTab: openInNewTab
        });
    }

    protected resolveCompositeKey(entityInfo?: EntityInfo): CompositeKey | null {
        if (this._primaryKey && this._primaryKey.KeyValuePairs?.length > 0) {
            return this._primaryKey;
        }
        const rawId = this._recordID?.trim();
        if (!rawId) {
            return null;
        }
        return CompositeKey.FromURLSegment(entityInfo, rawId);
    }

    protected async loadSummary(forceRefresh = false): Promise<void> {
        const entityName = this._entityName?.trim();
        if (!entityName) {
            this.Summary = null;
            return;
        }
        const entityInfo = this.ProviderToUse?.EntityByName(entityName);
        const pk = this.resolveCompositeKey(entityInfo);
        if (!pk) {
            this.Summary = null;
            return;
        }

        const recordIdStr = this._recordID?.trim() || pk.Values();
        const canonicalEntityName = entityInfo?.Name || entityName;
        const cacheKey = this.buildSummaryCacheKey(canonicalEntityName, recordIdStr);
        if (!forceRefresh) {
            const cached = MjRecordPreviewPopoverComponent.summaryCache.Get(cacheKey);
            if (cached && Date.now() - cached.LoadedAt < MjRecordPreviewPopoverComponent.CACHE_TTL_MS) {
                this.Summary = cached.Summary;
                this.IsLoading = false;
                this.cdr.markForCheck();
                return;
            }
        }

        const seq = ++this._loadSeq;
        this.IsLoading = true;
        this.Summary = {
            EntityName: entityInfo?.Name || entityName,
            EntityDisplayName: entityInfo?.DisplayNameOrName || entityName,
            EntityIcon: entityInfo?.Icon || 'fa-solid fa-table',
            RecordID: recordIdStr,
            PrimaryKey: pk,
            Title: this._displayName || recordIdStr,
            StatusValue: null,
            Fields: [],
            CanEditRecord: false,
            NameFieldName: null,
            NameFieldEditable: false
        };
        this.cdr.markForCheck();

        if (!entityInfo) {
            this.IsLoading = false;
            this.cdr.markForCheck();
            return;
        }

        try {
            const candidateFields = this.selectPreviewFields(entityInfo);
            const fieldNamesToFetch = new Set<string>();
            for (const pkKey of entityInfo.PrimaryKeys) {
                fieldNamesToFetch.add(pkKey.Name);
            }
            if (entityInfo.NameField) {
                fieldNamesToFetch.add(entityInfo.NameField.Name);
            }
            for (const f of candidateFields) {
                fieldNamesToFetch.add(f.Name);
                if (f.RelatedEntityNameFieldMap) {
                    fieldNamesToFetch.add(f.RelatedEntityNameFieldMap);
                }
            }

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entityInfo.Name,
                ExtraFilter: pk.ToWhereClause(),
                Fields: Array.from(fieldNamesToFetch),
                MaxRows: 1,
                ResultType: 'simple'
            });

            if (this._destroyed || seq !== this._loadSeq) {
                return;
            }

            const row = result.Success && result.Results?.length > 0 ? result.Results[0] : null;
            const summary = this.buildSummaryFromRow(entityInfo, pk, recordIdStr, candidateFields, row);
            MjRecordPreviewPopoverComponent.summaryCache.Set(cacheKey, {
                LoadedAt: Date.now(),
                Summary: summary
            });
            this.Summary = summary;
        } catch {
            // Keep fallback summary populated from inputs on error
        } finally {
            if (!this._destroyed && seq === this._loadSeq) {
                this.IsLoading = false;
                this.cdr.markForCheck();
            }
        }
    }

    protected selectPreviewFields(entityInfo: EntityInfo): EntityFieldInfo[] {
        const nameFieldLower = entityInfo.NameField?.Name?.toLowerCase() ?? '';
        const eligible = entityInfo.Fields.filter(f => {
            if (f.IsPrimaryKey) return false;
            if (f.Name.startsWith('__mj_')) return false;
            if (f.Name.toLowerCase() === nameFieldLower) return false;
            if (f.Status === 'Deprecated' || f.Status === 'Disabled') return false;
            if (f.MaxLength < 0 || f.MaxLength > 500) return false;
            return true;
        });

        const defaultInView = eligible.filter(f => f.DefaultInView);
        const pool = defaultInView.length >= 2 ? defaultInView : eligible;
        return pool.slice(0, 5);
    }

    /**
     * Determines whether a summary field should span the full 2-column width (`grid-column: 1 / -1`)
     * so long values like emails, URLs, titles, or addresses never truncate unnecessarily.
     * Subclasses can override this hook to customize column spanning.
     */
    protected isFieldWide(field: EntityFieldInfo, formattedValue: string): boolean {
        if (/(email|url|website|uri|address|street|description|notes|summary|title|subject|headline|path)/i.test(field.Name)) {
            return true;
        }
        if (formattedValue.includes('@') || formattedValue.startsWith('http://') || formattedValue.startsWith('https://')) {
            return true;
        }
        return formattedValue.length > 22;
    }

    protected isFieldQuickEditable(field: EntityFieldInfo | null | undefined, canEditEntity: boolean): boolean {
        if (!field || !canEditEntity) return false;
        if (field.IsPrimaryKey || field.ReadOnly || field.IsVirtual || field.AllowUpdateAPI === false) {
            return false;
        }
        if (field.RelatedEntity || field.EntityIDFieldName) {
            return false;
        }
        return (
            field.TSType === EntityFieldTSType.String ||
            field.TSType === EntityFieldTSType.Number ||
            field.TSType === EntityFieldTSType.Boolean
        );
    }

    protected resolveFieldInputType(field: EntityFieldInfo): {
        InputType: 'text' | 'number' | 'boolean' | 'select';
        PossibleValues?: string[];
    } {
        if (field.TSType === EntityFieldTSType.Boolean) {
            return { InputType: 'boolean', PossibleValues: ['true', 'false'] };
        }
        const values = (field as EntityFieldInfo & { EntityFieldValues?: Array<{ Value: string }> }).EntityFieldValues;
        if (Array.isArray(values) && values.length > 0) {
            return {
                InputType: 'select',
                PossibleValues: values.map(v => v.Value)
            };
        }
        if (field.TSType === EntityFieldTSType.Number) {
            return { InputType: 'number' };
        }
        return { InputType: 'text' };
    }

    protected buildSummaryFromRow(
        entityInfo: EntityInfo,
        pk: CompositeKey,
        recordIdStr: string,
        candidateFields: EntityFieldInfo[],
        row: Record<string, unknown> | null
    ): RecordPreviewSummary {
        const entityWithPerm = entityInfo as EntityInfo & {
            AllowUpdateAPI?: boolean;
            UserPermissions?: { CanUpdate?: boolean };
        };
        const canEditEntity =
            entityWithPerm.AllowUpdateAPI !== false &&
            (entityWithPerm.UserPermissions?.CanUpdate ?? true);

        let title = this._displayName || recordIdStr;
        if (row && entityInfo.NameField) {
            const rawTitle = row[entityInfo.NameField.Name];
            if (rawTitle != null && String(rawTitle).trim().length > 0) {
                title = String(rawTitle).trim();
            }
        }
        const isUuidTitle = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(title.trim());
        if (isUuidTitle) {
            const rawUuid = recordIdStr && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordIdStr.trim())
                ? recordIdStr.trim()
                : title.trim();
            title = `${entityInfo.DisplayNameOrName} · ${rawUuid.slice(0, 6)}…${rawUuid.slice(-4)}`;
        }

        const nameField =
            (entityInfo.NameField
                ? entityInfo.Fields.find(f => f.Name === entityInfo.NameField?.Name)
                : undefined) ?? entityInfo.NameField;
        const nameFieldEditable = Boolean(
            row && !isUuidTitle && this.isFieldQuickEditable(nameField, canEditEntity)
        );

        let statusValue: string | null = null;
        const fields: RecordPreviewFieldItem[] = [];

        if (row) {
            for (const f of candidateFields) {
                const rawVal = f.RelatedEntityNameFieldMap && row[f.RelatedEntityNameFieldMap] != null
                    ? row[f.RelatedEntityNameFieldMap]
                    : row[f.Name];
                const formatted = this.formatPreviewValue(rawVal, f);
                if (!formatted) {
                    continue;
                }
                const isStatus = /^(status|state|stage|priority|health)$/i.test(f.Name);
                if (isStatus && !statusValue) {
                    statusValue = formatted;
                }
                if (fields.length < 4) {
                    const editable = this.isFieldQuickEditable(f, canEditEntity);
                    const inputMeta = editable ? this.resolveFieldInputType(f) : undefined;
                    fields.push({
                        FieldName: f.Name,
                        Label: f.DisplayNameOrName,
                        Value: formatted,
                        RawValue: row[f.Name],
                        IsStatusField: isStatus,
                        IsWide: this.isFieldWide(f, formatted),
                        IsEditable: editable,
                        InputType: inputMeta?.InputType,
                        PossibleValues: inputMeta?.PossibleValues
                    });
                }
            }
        }

        // Balance 2-column grid layout so a narrow field followed by a wide field (or at the end of an odd row) spans cleanly
        let colCursor = 0;
        for (let i = 0; i < fields.length; i++) {
            const item = fields[i];
            const next = i + 1 < fields.length ? fields[i + 1] : null;
            if (item.IsWide) {
                colCursor = 0;
            } else if (colCursor === 0 && (!next || next.IsWide)) {
                item.IsWide = true;
                colCursor = 0;
            } else {
                colCursor = (colCursor + 1) % 2;
            }
        }

        const canEditRecord =
            Boolean(row) &&
            canEditEntity &&
            (nameFieldEditable || fields.some(item => item.IsEditable));

        return {
            EntityName: entityInfo.Name,
            EntityDisplayName: entityInfo.DisplayNameOrName,
            EntityIcon: entityInfo.Icon || 'fa-solid fa-table',
            RecordID: recordIdStr,
            PrimaryKey: pk,
            Title: title,
            StatusValue: statusValue,
            Fields: fields,
            CanEditRecord: canEditRecord,
            NameFieldName: nameField?.Name ?? null,
            NameFieldEditable: nameFieldEditable
        };
    }

    protected formatPreviewValue(val: unknown, field: EntityFieldInfo): string {
        if (val === null || val === undefined || val === '') {
            return '';
        }
        if (field.TSType === EntityFieldTSType.Boolean) {
            return val === true || val === 1 || val === 'true' ? 'Yes' : 'No';
        }
        if (val instanceof Date) {
            return isNaN(val.getTime()) ? '' : val.toLocaleDateString();
        }
        if (field.TSType === EntityFieldTSType.Date && typeof val === 'string') {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString();
            }
        }
        const str = String(val).trim();
        return str.length > 80 ? `${str.slice(0, 77)}…` : str;
    }
}

function isStrictSubclassOf(subCtor: unknown, superCtor: unknown): boolean {
    if (typeof subCtor !== 'function' || typeof superCtor !== 'function' || subCtor === superCtor) {
        return false;
    }
    return Boolean(
        subCtor.prototype &&
        superCtor.prototype &&
        subCtor.prototype instanceof (superCtor as new (...args: unknown[]) => unknown)
    );
}

function selectWinningRegistration(candidates: ClassRegistration[]): ClassRegistration | null {
    if (candidates.length === 0) {
        return null;
    }
    let winner = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (isStrictSubclassOf(candidate.SubClass, winner.SubClass)) {
            winner = candidate;
            continue;
        }
        if (isStrictSubclassOf(winner.SubClass, candidate.SubClass)) {
            continue;
        }
        if (candidate.Priority >= winner.Priority) {
            winner = candidate;
        }
    }
    return winner;
}

/**
 * Resolves the concrete {@link MjRecordPreviewPopoverComponent} class to instantiate for a given
 * entity via `MJGlobal.Instance.ClassFactory`.
 *
 * Resolution precedence:
 * 1. **Exact entity key match** — e.g. `@RegisterClass(MjRecordPreviewPopoverComponent, 'MJ_BizApps_Common: People')`
 * 2. **Wildcard or schema pattern key match** — e.g. `@RegisterClass(MjRecordPreviewPopoverComponent, 'MJ_BizApps_Common:*')`
 *    or `@RegisterClass(MjRecordPreviewPopoverComponent, 'schema:mj_bizapps_common')`
 * 3. **Global unkeyed or `'*'` registration** — e.g. `@RegisterClass(MjRecordPreviewPopoverComponent)`
 * 4. **Default built-in component** — {@link MjRecordPreviewPopoverComponent}
 */
export function ResolveRecordPreviewPopoverType(
    entityName?: string | null,
    schemaName?: string | null
): Type<MjRecordPreviewPopoverComponent> {
    const cf = MJGlobal.Instance?.ClassFactory;
    if (!cf) {
        return MjRecordPreviewPopoverComponent;
    }

    const byRoot = cf.GetRegistrationsByRootClass(MjRecordPreviewPopoverComponent);
    const byBase = cf.GetAllRegistrations(MjRecordPreviewPopoverComponent);
    const allRegs = Array.from(new Set([...byRoot, ...byBase])).filter(
        r => typeof r.SubClass === 'function' && r.SubClass !== MjRecordPreviewPopoverComponent
    );

    if (allRegs.length === 0) {
        return MjRecordPreviewPopoverComponent;
    }

    const normEntity = (entityName ?? '').trim().toLowerCase();
    const normSchema = (schemaName ?? '').trim().toLowerCase();

    if (normEntity) {
        // 1. Exact entity name match
        const exactMatches = allRegs.filter(
            r => typeof r.Key === 'string' && r.Key.trim().toLowerCase() === normEntity
        );
        const exactWinner = selectWinningRegistration(exactMatches);
        if (exactWinner) {
            return exactWinner.SubClass as Type<MjRecordPreviewPopoverComponent>;
        }

        // 2. Wildcard / schema pattern match
        const patternMatches = allRegs.filter(r => {
            if (typeof r.Key !== 'string') return false;
            const key = r.Key.trim().toLowerCase();
            if (!key || key === '*') return false;
            if (key.startsWith('schema:')) {
                const targetSchema = key.slice('schema:'.length).trim();
                return Boolean(targetSchema && normSchema && normSchema === targetSchema);
            }
            if (key.includes('*')) {
                const escaped = key.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                return new RegExp(`^${escaped}$`, 'i').test(normEntity);
            }
            return false;
        });
        const patternWinner = selectWinningRegistration(patternMatches);
        if (patternWinner) {
            return patternWinner.SubClass as Type<MjRecordPreviewPopoverComponent>;
        }
    }

    // 3. Global unkeyed or '*' registration
    const globalMatches = allRegs.filter(
        r => r.Key === null || r.Key === undefined || r.Key.trim() === '' || r.Key.trim() === '*'
    );
    const globalWinner = selectWinningRegistration(globalMatches);
    if (globalWinner) {
        return globalWinner.SubClass as Type<MjRecordPreviewPopoverComponent>;
    }

    return MjRecordPreviewPopoverComponent;
}
