import {
    Component, Input, Output, EventEmitter,
    OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, inject
} from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    EntityCardVariant, CardTemplate, CardDisplayField,
    CancelableCardEvent, CardRecordEvent,
    GenerateCardTemplate, GenerateCardTemplateFromMetadata,
    CombineTitleFields, FormatKeyAsLabel,
} from './entity-card.types';

/**
 * `MJEntityCardComponent` — A generic, metadata-driven entity record card.
 *
 * Renders a single entity record as a visual card with automatically prioritized
 * fields based on MemberJunction entity metadata (`IsNameField`, `DefaultInView`,
 * `Sequence`). Designed to work with both full entity records and sparse vector
 * metadata from the Knowledge Hub.
 *
 * ## Variants
 * - `compact` — Tooltip-sized. Title + 2-3 key fields. No avatar.
 * - `card` — Grid card. Avatar + title + subtitle + display fields + badge.
 * - `detail` — Full panel. All available fields with labels.
 *
 * ## Field Resolution
 * 1. **Title**: All `IsNameField` fields combined in Sequence order
 * 2. **Primary fields**: `DefaultInView=true` sorted by Sequence
 * 3. **Fallback**: First 5 non-PK/FK fields when no metadata flags are set
 *
 * ## Events
 * All interactions follow the `BeforeXXX` / `AfterXXX` cancelable event pattern.
 * Set `event.Cancel = true` in a `BeforeXXX` handler to prevent the default action.
 *
 * @example
 * ```html
 * <!-- From entity name + vector metadata -->
 * <mj-entity-card
 *     [EntityName]="'Members'"
 *     [Record]="vectorMetadata"
 *     Variant="card"
 *     (CardClicked)="onCardClick($event)">
 * </mj-entity-card>
 *
 * <!-- From EntityInfo + full record -->
 * <mj-entity-card
 *     [Entity]="entityInfo"
 *     [Record]="record.GetAll()"
 *     Variant="detail"
 *     [ShowOpenButton]="true"
 *     (OpenRequested)="onOpen($event)">
 * </mj-entity-card>
 * ```
 *
 * @selector mj-entity-card
 */
@Component({
    standalone: true,
    selector: 'mj-entity-card',
    templateUrl: './entity-card.component.html',
    styleUrls: ['./entity-card.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJEntityCardComponent extends BaseAngularComponent implements OnChanges {
    private cdr = inject(ChangeDetectorRef);

    // ================================================================
    // Data Inputs
    // ================================================================

    /**
     * The entity name (e.g., "Members"). Used to look up `EntityInfo` from
     * the MJ Metadata cache. Mutually exclusive with `Entity` — if both are
     * provided, `Entity` takes precedence.
     */
    @Input() EntityName: string | null = null;

    /**
     * Pre-resolved EntityInfo object. Takes precedence over `EntityName`.
     * Use this when you already have the EntityInfo to avoid a redundant lookup.
     */
    @Input() Entity: EntityInfo | null = null;

    /**
     * The record data as a plain key-value object. Works with both full entity
     * records (`record.GetAll()`) and sparse vector metadata.
     *
     * Fields not present in the record are gracefully skipped in the display.
     */
    @Input() Record: Record<string, unknown> = {};

    /**
     * Visual variant controlling size, layout, and detail level.
     * @default 'card'
     */
    @Input() Variant: EntityCardVariant = 'card';

    // ================================================================
    // Customization Inputs
    // ================================================================

    /**
     * Custom card template. When provided, overrides the auto-generated template.
     * Use `GenerateCardTemplate()` from the types module to build one programmatically.
     */
    @Input() Template: CardTemplate | null = null;

    /**
     * Maximum number of display fields in the card body.
     * Only applies when using the auto-generated template.
     * @default 4 for 'card', 2 for 'compact', unlimited for 'detail'
     */
    @Input() MaxDisplayFields: number | null = null;

    /**
     * Whether to show the entity icon/avatar.
     * @default true for 'card', false for 'compact', true for 'detail'
     */
    @Input() ShowAvatar: boolean | null = null;

    /**
     * Whether to show the "Open Record" button.
     * @default false
     */
    @Input() ShowOpenButton = false;

    /**
     * Whether to show field labels alongside values.
     * @default true for 'detail', false for 'compact', true for 'card'
     */
    @Input() ShowFieldLabels: boolean | null = null;

    /**
     * CSS class to apply to the outer container for custom styling.
     */
    @Input() CssClass = '';

    // ================================================================
    // Events — BeforeXXX / AfterXXX Pattern
    // ================================================================

    /**
     * Fires before the card is clicked. Set `Cancel = true` to prevent
     * the `CardClicked` event from firing.
     */
    @Output() BeforeCardClick = new EventEmitter<CancelableCardEvent<CardRecordEvent>>();

    /** Fires after the card is clicked (if not canceled). */
    @Output() CardClicked = new EventEmitter<CardRecordEvent>();

    /**
     * Fires before the "Open Record" button is clicked. Set `Cancel = true`
     * to prevent the `OpenRequested` event from firing.
     */
    @Output() BeforeOpen = new EventEmitter<CancelableCardEvent<CardRecordEvent>>();

    /** Fires when the "Open Record" button is clicked (if not canceled). */
    @Output() OpenRequested = new EventEmitter<CardRecordEvent>();

    // ================================================================
    // Computed State
    // ================================================================

    /** The resolved EntityInfo (from Entity input or EntityName lookup) */
    public ResolvedEntity: EntityInfo | null = null;

    /** The effective card template (custom or auto-generated) */
    public EffectiveTemplate: CardTemplate | null = null;

    /** The combined title string */
    public Title = '';

    /** The entity icon class (from vector metadata or entity info) */
    public EntityIcon = '';

    /** Resolved entity display name */
    public EntityDisplayName = '';

    // ================================================================
    // Lifecycle
    // ================================================================

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Entity'] || changes['EntityName'] || changes['Record'] || changes['Template'] || changes['Variant']) {
            this.resolve();
        }
    }

    // ================================================================
    // Event Handlers
    // ================================================================

    /** @internal Handle card click with cancelable before/after pattern */
    public OnCardClick(): void {
        const payload = this.BuildEventPayload();
        const cancelable: CancelableCardEvent<CardRecordEvent> = { Data: payload, Cancel: false };
        this.BeforeCardClick.emit(cancelable);
        if (!cancelable.Cancel) {
            this.CardClicked.emit(payload);
        }
    }

    /** @internal Handle open button click with cancelable before/after pattern */
    public OnOpenClick(event: MouseEvent): void {
        event.stopPropagation();
        const payload = this.BuildEventPayload();
        const cancelable: CancelableCardEvent<CardRecordEvent> = { Data: payload, Cancel: false };
        this.BeforeOpen.emit(cancelable);
        if (!cancelable.Cancel) {
            this.OpenRequested.emit(payload);
        }
    }

    // ================================================================
    // Display Helpers (used in template)
    // ================================================================

    /** Get the resolved display fields, respecting maxFields for variant */
    public get DisplayFields(): CardDisplayField[] {
        if (!this.EffectiveTemplate) return [];
        const max = this.ResolvedMaxFields;
        return this.EffectiveTemplate.DisplayFields.slice(0, max);
    }

    /** Whether to show the avatar based on variant and input */
    public get ShouldShowAvatar(): boolean {
        if (this.ShowAvatar != null) return this.ShowAvatar;
        return this.Variant !== 'compact';
    }

    /** Whether to show field labels based on variant and input */
    public get ShouldShowLabels(): boolean {
        if (this.ShowFieldLabels != null) return this.ShowFieldLabels;
        return this.Variant !== 'compact';
    }

    /** Get formatted value for a display field */
    public GetFieldValue(field: CardDisplayField): string {
        const value = this.Record[field.Name];
        if (value == null || String(value).trim() === '') return '';
        return this.FormatValue(value, field);
    }

    /** Get the label for a field */
    public GetFieldLabel(fieldName: string): string {
        return this.EffectiveTemplate?.FieldLabels[fieldName] ?? FormatKeyAsLabel(fieldName);
    }

    /** Get initials from the title for avatar fallback */
    public get Initials(): string {
        if (!this.Title || this.Title === 'Unknown') return '?';
        const words = this.Title.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }

    /** Get a deterministic color for the avatar based on the record */
    public get AvatarColor(): string {
        const colors = [
            'var(--mj-brand-primary)', 'var(--mj-status-success)',
            'var(--mj-status-warning)', 'var(--mj-status-info)',
        ];
        let hash = 0;
        const key = this.Title + (this.Record['RecordID'] ?? '');
        for (let i = 0; i < key.length; i++) {
            hash = key.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    /** Get the subtitle value */
    public get Subtitle(): string {
        if (!this.EffectiveTemplate?.SubtitleField) return '';
        const v = this.Record[this.EffectiveTemplate.SubtitleField];
        return v != null ? String(v) : '';
    }

    /** Get the description value */
    public get Description(): string {
        if (!this.EffectiveTemplate?.DescriptionField) return '';
        const v = this.Record[this.EffectiveTemplate.DescriptionField];
        if (v == null) return '';
        const s = String(v);
        return s.length > 120 ? s.substring(0, 120) + '...' : s;
    }

    /** Check if a thumbnail is available */
    public get HasThumbnail(): boolean {
        if (!this.EffectiveTemplate?.ThumbnailFields) return false;
        return this.EffectiveTemplate.ThumbnailFields.some(f => {
            const v = this.Record[f];
            return v != null && String(v).trim() !== '';
        });
    }

    /** Get the thumbnail URL or icon class */
    public get ThumbnailValue(): string {
        if (!this.EffectiveTemplate?.ThumbnailFields) return '';
        for (const f of this.EffectiveTemplate.ThumbnailFields) {
            const v = this.Record[f];
            if (v != null && String(v).trim() !== '') return String(v);
        }
        return '';
    }

    /** Whether the thumbnail is an image URL */
    public get ThumbnailIsImage(): boolean {
        const v = this.ThumbnailValue;
        return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/');
    }

    /** Whether the thumbnail is an icon class */
    public get ThumbnailIsIcon(): boolean {
        const v = this.ThumbnailValue.toLowerCase();
        return v.startsWith('fa-') || v.startsWith('fa ') || v.startsWith('fas ') || v.startsWith('far ');
    }

    // ================================================================
    // Private Methods
    // ================================================================

    private get ResolvedMaxFields(): number {
        if (this.MaxDisplayFields != null) return this.MaxDisplayFields;
        switch (this.Variant) {
            case 'compact': return 3;
            case 'card': return 4;
            case 'detail': return 999;
        }
    }

    private resolve(): void {
        this.ResolvedEntity = this.resolveEntity();
        this.EffectiveTemplate = this.resolveTemplate();
        this.Title = this.resolveTitle();
        this.EntityIcon = this.resolveEntityIcon();
        this.EntityDisplayName = this.resolveEntityDisplayName();
        this.cdr.markForCheck();
    }

    private resolveEntity(): EntityInfo | null {
        if (this.Entity) return this.Entity;
        if (!this.EntityName) return null;
        try {
            const md = this.ProviderToUse;
            return md.Entities.find(e => e.Name === this.EntityName) ?? null;
        } catch {
            return null;
        }
    }

    private resolveTemplate(): CardTemplate | null {
        if (this.Template) return this.Template;
        const entityName = this.Entity?.Name ?? this.EntityName;
        if (!entityName) return null;

        const metadataKeys = Object.keys(this.Record);
        if (this.ResolvedEntity) {
            const full = GenerateCardTemplate(this.ResolvedEntity, this.ResolvedMaxFields);
            // Filter to fields present in the record
            const keySet = new Set(metadataKeys);
            return {
                ...full,
                TitleFields: full.TitleFields.filter(f => keySet.has(f)),
                DisplayFields: full.DisplayFields.filter(f => keySet.has(f.Name)),
                SubtitleField: full.SubtitleField && keySet.has(full.SubtitleField) ? full.SubtitleField : null,
                DescriptionField: full.DescriptionField && keySet.has(full.DescriptionField) ? full.DescriptionField : null,
                ThumbnailFields: full.ThumbnailFields.filter(f => keySet.has(f)),
                BadgeField: full.BadgeField && keySet.has(full.BadgeField) ? full.BadgeField : null,
            };
        }

        return GenerateCardTemplateFromMetadata(entityName, metadataKeys, this.ResolvedMaxFields, this.ProviderToUse);
    }

    private resolveTitle(): string {
        if (!this.EffectiveTemplate || this.EffectiveTemplate.TitleFields.length === 0) {
            return String(this.Record['Name'] ?? this.Record['Title'] ?? 'Unknown');
        }
        return CombineTitleFields(this.Record, this.EffectiveTemplate.TitleFields);
    }

    private resolveEntityIcon(): string {
        // From vector metadata first
        const metaIcon = this.Record['EntityIcon'];
        if (metaIcon && typeof metaIcon === 'string') return metaIcon;
        // From entity info
        if (this.ResolvedEntity?.Icon) return this.ResolvedEntity.Icon;
        return 'fa-solid fa-table';
    }

    private resolveEntityDisplayName(): string {
        const metaEntity = this.Record['Entity'];
        if (metaEntity && typeof metaEntity === 'string') return metaEntity;
        return this.ResolvedEntity?.Name ?? this.EntityName ?? '';
    }

    private FormatValue(value: unknown, field: CardDisplayField): string {
        switch (field.Type) {
            case 'number': {
                const num = Number(value);
                if (isNaN(num)) return String(value);
                if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
                const nameLower = field.Name.toLowerCase();
                if (['amount', 'price', 'cost', 'value', 'revenue', 'total'].some(k => nameLower.includes(k))) {
                    return `$${num.toLocaleString()}`;
                }
                return num.toLocaleString();
            }
            case 'boolean':
                return value ? 'Yes' : 'No';
            case 'date': {
                try {
                    const d = value instanceof Date ? value : new Date(value as string | number);
                    if (isNaN(d.getTime())) return String(value);
                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                } catch {
                    return String(value);
                }
            }
            default: {
                const s = String(value);
                return s.length > 60 ? s.substring(0, 60) + '...' : s;
            }
        }
    }

    private BuildEventPayload(): CardRecordEvent {
        return {
            EntityName: this.EntityDisplayName,
            Record: this.Record,
            RecordID: String(this.Record['RecordID'] ?? this.Record['ID'] ?? ''),
        };
    }
}
