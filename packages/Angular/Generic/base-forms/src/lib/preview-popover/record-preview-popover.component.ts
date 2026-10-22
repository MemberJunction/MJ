import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    Output,
    inject
} from '@angular/core';
import { CompositeKey, EntityFieldInfo, EntityFieldTSType, EntityInfo, KeyValuePair, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FormNavigationEvent } from '../types/navigation-events';

/**
 * Single summary field rendered inside {@link MjRecordPreviewPopoverComponent}.
 */
export interface RecordPreviewFieldItem {
    FieldName: string;
    Label: string;
    Value: string;
    IsStatusField: boolean;
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
 */
@Component({
    standalone: false,
    selector: 'mj-record-preview-popover',
    templateUrl: './record-preview-popover.component.html',
    styleUrls: ['./record-preview-popover.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjRecordPreviewPopoverComponent extends BaseAngularComponent implements OnDestroy {
    private static readonly CACHE_TTL_MS = 60_000;
    private static readonly summaryCache = new Map<string, { LoadedAt: number; Summary: RecordPreviewSummary }>();

    private cdr = inject(ChangeDetectorRef);
    private _destroyed = false;
    private _visible = false;
    private _entityName: string | null = null;
    private _recordID: string | null = null;
    private _primaryKey: CompositeKey | null = null;
    private _displayName: string | null = null;
    private _anchorRect: RecordPreviewAnchorRect | null = null;
    private _loadSeq = 0;

    @Input()
    public get EntityName(): string | null {
        return this._entityName;
    }
    public set EntityName(value: string | null) {
        if (value !== this._entityName) {
            this._entityName = value;
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
            }
            this.cdr.markForCheck();
        }
    }

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();
    @Output() public MouseEnterCard = new EventEmitter<void>();
    @Output() public MouseLeaveCard = new EventEmitter<void>();

    public IsLoading = false;
    public Summary: RecordPreviewSummary | null = null;
    public CopiedID = false;
    private _copyTimer: ReturnType<typeof setTimeout> | null = null;

    /** Clear the static summary cache (useful in unit tests). */
    public static ClearCache(): void {
        MjRecordPreviewPopoverComponent.summaryCache.clear();
    }

    public ngOnDestroy(): void {
        this._destroyed = true;
        if (this._copyTimer) {
            clearTimeout(this._copyTimer);
            this._copyTimer = null;
        }
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
        const cardWidth = 320;
        const estimatedHeight = 220;
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
        this.MouseLeaveCard.emit();
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

    private resolveCompositeKey(entityInfo?: EntityInfo): CompositeKey | null {
        if (this._primaryKey && this._primaryKey.KeyValuePairs?.length > 0) {
            return this._primaryKey;
        }
        const rawId = this._recordID?.trim();
        if (!rawId) {
            return null;
        }
        if (rawId.includes('|')) {
            return CompositeKey.FromURLSegment(entityInfo, rawId);
        }
        const pkField = entityInfo?.FirstPrimaryKey?.Name || 'ID';
        return new CompositeKey([new KeyValuePair(pkField, rawId)]);
    }

    private async loadSummary(): Promise<void> {
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
        const cacheKey = `${entityName.toLowerCase()}::${recordIdStr.toLowerCase()}`;
        const cached = MjRecordPreviewPopoverComponent.summaryCache.get(cacheKey);
        if (cached && Date.now() - cached.LoadedAt < MjRecordPreviewPopoverComponent.CACHE_TTL_MS) {
            this.Summary = cached.Summary;
            this.IsLoading = false;
            this.cdr.markForCheck();
            return;
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
            Fields: []
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
            MjRecordPreviewPopoverComponent.summaryCache.set(cacheKey, {
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

    private selectPreviewFields(entityInfo: EntityInfo): EntityFieldInfo[] {
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

    private buildSummaryFromRow(
        entityInfo: EntityInfo,
        pk: CompositeKey,
        recordIdStr: string,
        candidateFields: EntityFieldInfo[],
        row: Record<string, unknown> | null
    ): RecordPreviewSummary {
        let title = this._displayName || recordIdStr;
        if (row && entityInfo.NameField) {
            const rawTitle = row[entityInfo.NameField.Name];
            if (rawTitle != null && String(rawTitle).trim().length > 0) {
                title = String(rawTitle).trim();
            }
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(title.trim())) {
            const rawUuid = recordIdStr && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordIdStr.trim())
                ? recordIdStr.trim()
                : title.trim();
            title = `${entityInfo.DisplayNameOrName} · ${rawUuid.slice(0, 6)}…${rawUuid.slice(-4)}`;
        }

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
                    continue;
                }
                if (fields.length < 4) {
                    fields.push({
                        FieldName: f.Name,
                        Label: f.DisplayNameOrName,
                        Value: formatted,
                        IsStatusField: isStatus
                    });
                }
            }
        }

        return {
            EntityName: entityInfo.Name,
            EntityDisplayName: entityInfo.DisplayNameOrName,
            EntityIcon: entityInfo.Icon || 'fa-solid fa-table',
            RecordID: recordIdStr,
            PrimaryKey: pk,
            Title: title,
            StatusValue: statusValue,
            Fields: fields
        };
    }

    private formatPreviewValue(val: unknown, field: EntityFieldInfo): string {
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
