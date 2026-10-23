import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    OnInit,
    OnDestroy,
    inject
} from '@angular/core';
import {
    BaseEntity,
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    IMetadataProvider,
    KeyValuePair,
    RecordDependency,
    RunView,
    RunViewParams
} from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FormNavigationEvent } from '../types/navigation-events';
import {
    type RecordPreviewAnchorRect,
    type RecordPreviewUpdatedEvent
} from '../preview-popover/record-preview-popover.component';

/**
 * System telemetry/audit entities that should never appear in the business-facing Links panel.
 */
const EXCLUDED_SYSTEM_ENTITIES = new Set<string>([
    'MJ: Record Changes',
    'MJ: Audit Logs',
    'MJ: User Record Logs',
    'MJ: Entity Record Documents'
]);

export type RecordLinkFilterType = 'both' | 'soft' | 'hard';
export type RecordLinkDirectionFilter = 'all' | 'outgoing' | 'incoming';

/**
 * Compact summary of record links published to the form toolbar badge and AI agent context.
 */
export interface RecordLinksSummary {
    TotalCount: number;
    OutgoingCount: number;
    IncomingCount: number;
    ByEntity: Array<{
        EntityName: string;
        EntityDisplayName: string;
        Direction: 'outgoing' | 'incoming' | 'both';
        Count: number;
        SampleNames: string[];
    }>;
}

interface OutgoingCandidate {
    EntityName: string;
    RelatedEntity: EntityInfo | undefined;
    FieldInfo: EntityFieldInfo;
    PrimaryKey: CompositeKey;
    PreResolvedDisplayName: string | null;
    IsSoftLink: boolean;
}

/**
 * Enriched representation of a single linked record item.
 */
export interface RecordLinkItem {
    /** Unique key for @for tracking */
    TrackKey: string;
    /** Name of the related entity */
    EntityName: string;
    /** Business-friendly display name of the related entity */
    EntityDisplayName: string;
    /** Font Awesome icon class for the related entity */
    EntityIcon: string;
    /** Primary key of the linked record */
    PrimaryKey: CompositeKey;
    /** Resolved display name / title of the linked record */
    DisplayName: string;
    /** Business-friendly label describing how the record is linked (e.g. "Primary Record", "Customer") */
    RelationshipLabel: string;
    /** Optional status, type, or role badge text from the linked record */
    StatusLabel: string;
    /** Formatted or relative timestamp if available */
    FormattedDate: string;
    /** True for Cross-App Links (soft/entity+record links), false for Direct Relationships (hard FK) */
    IsSoftLink: boolean;
    /** Human-readable link category label ("Cross-App Link" or "Direct Relationship") */
    LinkTypeLabel: 'Cross-App Link' | 'Direct Relationship';
    /** Whether the link originates from a field on this record ('outgoing') or from another record referencing this one ('incoming') */
    Direction: 'outgoing' | 'incoming';
    /** Human-readable direction label ("On This Record" or "Linked To This") */
    DirectionLabel: 'On This Record' | 'Linked To This';
    /** Field name on this record when Direction === 'outgoing' */
    SourceFieldName?: string;
    /** Companion EntityID discriminator field name on this record for outgoing polymorphic links */
    SourceEntityIDFieldName?: string | null;
    /** True when this outgoing link field is nullable and editable so the user can unlink it inline */
    CanUnlink?: boolean;
}

/**
 * Group of linked records belonging to the same entity.
 */
export interface RecordLinkGroup {
    EntityName: string;
    EntityDisplayName: string;
    EntityIcon: string;
    Items: RecordLinkItem[];
}

/**
 * Top category filter chip model.
 */
export interface RecordLinkCategoryChip {
    EntityName: string | null;
    Label: string;
    Icon: string;
    Count: number;
}

/**
 * Reusable `<mj-record-links>` widget that displays all records linked to the current `Record`
 * in both directions:
 * - **Outgoing ("On This Record")**: foreign-key (`RelatedEntity`) and polymorphic-FK (`EntityIDFieldName`) fields populated on this record.
 * - **Incoming ("Linked To This")**: records across the workspace referencing this record via hard FKs or polymorphic/soft links (`GetRecordDependencies`).
 *
 * Can be embedded inline inside any form section/dashboard (`[Mode]="'inline'"`) or rendered as a
 * slide-in drawer (`[Mode]="'drawer'"`).
 */
@Component({
    standalone: false,
    selector: 'mj-record-links',
    templateUrl: './record-links.component.html',
    styleUrls: ['./record-links.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjRecordLinksComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private static readonly DEP_CACHE_TTL_MS = 30_000;
    private static readonly depCache = new Map<string, { LoadedAt: number; Deps: RecordDependency[] }>();

    private cdr = inject(ChangeDetectorRef);

    private _record: BaseEntity | null = null;
    private _lastRecordSignature = '';

    @Input()
    set Record(value: BaseEntity | null) {
        const prev = this._record;
        this._record = value;
        const nextSig = this.computeRecordSignature(value);
        if (nextSig !== this._lastRecordSignature || prev !== value) {
            this._lastRecordSignature = nextSig;
            if (this.isInitialized) {
                void this.LoadLinks();
            }
        }
    }
    get Record(): BaseEntity | null {
        return this._record;
    }

    private _initialLinkFilter: RecordLinkFilterType = 'both';
    @Input()
    set InitialLinkFilter(value: RecordLinkFilterType) {
        this._initialLinkFilter = value || 'both';
        this.LinkFilter = this._initialLinkFilter;
        this.cdr.markForCheck();
    }
    get InitialLinkFilter(): RecordLinkFilterType {
        return this._initialLinkFilter;
    }

    /**
     * Rendering mode:
     * - `'inline'`: embedded widget for custom form sections or dashboards
     * - `'drawer'`: slide-in drawer with backdrop and close header
     */
    @Input() Mode: 'inline' | 'drawer' = 'inline';

    /** Whether the drawer is open when `Mode === 'drawer'`. */
    @Input() IsOpen = true;

    /** Whether nullable outgoing links can be unlinked directly from the card list. */
    @Input() AllowQuickUnlink = true;

    /** Emitted when the user clicks a linked record card to navigate to it. */
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();

    /** Emitted when the slide-in drawer requests to close. */
    @Output() Close = new EventEmitter<void>();

    /** Emitted whenever the total loaded link count changes. */
    @Output() LinkCountChange = new EventEmitter<number>();

    /** Emitted whenever the enriched links summary changes. */
    @Output() LinksSummaryChange = new EventEmitter<RecordLinksSummary>();

    /** Emitted when an outgoing link is unlinked or a target record is updated via Quick Edit. */
    @Output() RecordLinkModified = new EventEmitter<{ Action: 'unlinked' | 'updated'; Item: RecordLinkItem }>();

    /** Loading state */
    public IsLoading = false;

    /** TrackKey of the outgoing link currently being unlinked */
    public UnlinkingTrackKey: string | null = null;

    /** Error message if loading fails */
    public ErrorMessage: string | null = null;

    /** Current search query */
    public SearchText = '';

    /** Whether the collapsible Link Type filter panel is expanded */
    public ShowFilterPanel = false;

    /** Active link type filter: 'both' (All Links), 'soft' (Cross-App Links), or 'hard' (Direct Relationships) */
    public LinkFilter: RecordLinkFilterType = 'both';

    /** Active direction filter: 'all', 'outgoing' (On This Record), or 'incoming' (Linked To This) */
    public DirectionFilter: RecordLinkDirectionFilter = 'all';

    /** Currently selected entity filter chip (`null` means All) */
    public SelectedEntityName: string | null = null;

    /** All loaded and enriched link items for the current record */
    public AllItems: RecordLinkItem[] = [];

    /** Hover preview card state */
    public HoveredItem: RecordLinkItem | null = null;
    public HoverAnchorRect: RecordPreviewAnchorRect | null = null;

    private isInitialized = false;
    private isDestroyed = false;
    private loadVersion = 0;
    private hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
    private hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

    /** Clear the static dependency cache (useful in unit tests). */
    public static ClearDependencyCache(): void {
        MjRecordLinksComponent.depCache.clear();
    }

    /**
     * Synchronously computes the outgoing links summary from the record's in-memory FK and
     * polymorphic-FK fields without making any network calls.
     */
    public static BuildOutgoingLinksSummary(
        record: BaseEntity,
        provider: IMetadataProvider | null | undefined
    ): RecordLinksSummary {
        if (!record || !record.IsSaved || !record.EntityInfo) {
            return { TotalCount: 0, OutgoingCount: 0, IncomingCount: 0, ByEntity: [] };
        }
        const entities = provider?.Entities ?? [];
        const outgoing = MjRecordLinksComponent.extractOutgoingCandidates(record, provider, entities);
        const byEntityMap = new Map<string, {
            EntityName: string;
            EntityDisplayName: string;
            Count: number;
            SampleNames: string[];
        }>();

        for (const out of outgoing) {
            const displayName = out.RelatedEntity?.DisplayNameOrName || out.EntityName;
            let entry = byEntityMap.get(out.EntityName);
            if (!entry) {
                entry = {
                    EntityName: out.EntityName,
                    EntityDisplayName: displayName,
                    Count: 0,
                    SampleNames: []
                };
                byEntityMap.set(out.EntityName, entry);
            }
            entry.Count += 1;
            if (out.PreResolvedDisplayName && entry.SampleNames.length < 3) {
                entry.SampleNames.push(out.PreResolvedDisplayName);
            }
        }

        return {
            TotalCount: outgoing.length,
            OutgoingCount: outgoing.length,
            IncomingCount: 0,
            ByEntity: Array.from(byEntityMap.values()).map(e => ({
                EntityName: e.EntityName,
                EntityDisplayName: e.EntityDisplayName,
                Direction: 'outgoing' as const,
                Count: e.Count,
                SampleNames: e.SampleNames
            }))
        };
    }

    /**
     * Pre-warms the total bidirectional link count (outgoing FK/polymorphic fields on the record
     * + incoming `GetRecordDependencies`) and caches the incoming dependencies so opening the
     * `<mj-record-links>` drawer reuses them without a duplicate network request.
     */
    public static async PrewarmRecordLinkCount(
        record: BaseEntity,
        provider: IMetadataProvider | null | undefined
    ): Promise<RecordLinksSummary> {
        if (!record || !record.IsSaved || !record.EntityInfo || !provider) {
            return { TotalCount: 0, OutgoingCount: 0, IncomingCount: 0, ByEntity: [] };
        }
        const entities = provider.Entities ?? [];
        const outgoing = MjRecordLinksComponent.extractOutgoingCandidates(record, provider, entities);
        const rawDeps = await MjRecordLinksComponent.fetchDependenciesWithCache(record, provider, false);
        const incoming = MjRecordLinksComponent.filterIncomingDependencies(rawDeps, entities);

        const byEntityMap = new Map<string, {
            EntityName: string;
            EntityDisplayName: string;
            HasOutgoing: boolean;
            HasIncoming: boolean;
            Count: number;
            SampleNames: string[];
        }>();

        for (const out of outgoing) {
            const displayName = out.RelatedEntity?.DisplayNameOrName || out.EntityName;
            let entry = byEntityMap.get(out.EntityName);
            if (!entry) {
                entry = {
                    EntityName: out.EntityName,
                    EntityDisplayName: displayName,
                    HasOutgoing: true,
                    HasIncoming: false,
                    Count: 0,
                    SampleNames: []
                };
                byEntityMap.set(out.EntityName, entry);
            }
            entry.HasOutgoing = true;
            entry.Count += 1;
            if (out.PreResolvedDisplayName && entry.SampleNames.length < 3) {
                entry.SampleNames.push(out.PreResolvedDisplayName);
            }
        }

        for (const dep of incoming) {
            const entityInfo = MjRecordLinksComponent.findEntityInfoStatic(entities, dep.RelatedEntityName);
            const displayName = entityInfo?.DisplayNameOrName || dep.RelatedEntityName;
            let entry = byEntityMap.get(dep.RelatedEntityName);
            if (!entry) {
                entry = {
                    EntityName: dep.RelatedEntityName,
                    EntityDisplayName: displayName,
                    HasOutgoing: false,
                    HasIncoming: true,
                    Count: 0,
                    SampleNames: []
                };
                byEntityMap.set(dep.RelatedEntityName, entry);
            }
            entry.HasIncoming = true;
            entry.Count += 1;
        }

        return {
            TotalCount: outgoing.length + incoming.length,
            OutgoingCount: outgoing.length,
            IncomingCount: incoming.length,
            ByEntity: Array.from(byEntityMap.values()).map(e => ({
                EntityName: e.EntityName,
                EntityDisplayName: e.EntityDisplayName,
                Direction: e.HasOutgoing && e.HasIncoming ? 'both' : e.HasOutgoing ? 'outgoing' : 'incoming',
                Count: e.Count,
                SampleNames: e.SampleNames
            }))
        };
    }

    private static async fetchDependenciesWithCache(
        record: BaseEntity,
        provider: IMetadataProvider,
        forceRefresh: boolean
    ): Promise<RecordDependency[]> {
        const pkStr = MjRecordLinksComponent.getPrimaryKeyStringStatic(record.PrimaryKey);
        const cacheKey = `${record.EntityInfo.Name}::${pkStr}`;
        if (!forceRefresh) {
            const cached = MjRecordLinksComponent.depCache.get(cacheKey);
            if (cached && Date.now() - cached.LoadedAt < MjRecordLinksComponent.DEP_CACHE_TTL_MS) {
                return cached.Deps;
            }
        }
        const deps = await provider.GetRecordDependencies(record.EntityInfo.Name, record.PrimaryKey, {
            IncludeSystemEntities: false
        });
        const safeDeps = deps ?? [];
        MjRecordLinksComponent.depCache.set(cacheKey, {
            LoadedAt: Date.now(),
            Deps: safeDeps
        });
        return safeDeps;
    }

    private static filterIncomingDependencies(
        deps: RecordDependency[],
        entities: EntityInfo[]
    ): RecordDependency[] {
        return (deps ?? []).filter(dep => {
            if (!dep || !dep.RelatedEntityName) {
                return false;
            }
            if (EXCLUDED_SYSTEM_ENTITIES.has(dep.RelatedEntityName.trim())) {
                return false;
            }
            const entityInfo = MjRecordLinksComponent.findEntityInfoStatic(entities, dep.RelatedEntityName);
            const entityWithPerm = entityInfo as (EntityInfo & { CanRead?: boolean }) | null;
            if (entityWithPerm && (entityWithPerm.CanRead === false || entityWithPerm.IncludeInAPI === false)) {
                return false;
            }
            return true;
        });
    }

    private static extractOutgoingCandidates(
        record: BaseEntity,
        provider: IMetadataProvider | null | undefined,
        entities: EntityInfo[]
    ): OutgoingCandidate[] {
        const candidates: OutgoingCandidate[] = [];
        const fields = record.EntityInfo?.Fields ?? [];
        const seenKeys = new Set<string>();

        for (const field of fields) {
            if (field.IsPrimaryKey || field.Name.startsWith('__mj_')) {
                continue;
            }
            if (field.Status === 'Deprecated' || field.Status === 'Disabled') {
                continue;
            }

            // 1. Polymorphic FK configured via EntityField.EntityIDFieldName (Rule 2e)
            const entityIdFieldName = field.EntityIDFieldName?.trim();
            if (entityIdFieldName) {
                const rawRecordId = record.Get(field.Name);
                const rawEntityRef = record.Get(entityIdFieldName);
                if (rawRecordId == null || String(rawRecordId).trim() === '' || rawEntityRef == null || String(rawEntityRef).trim() === '') {
                    continue;
                }
                const entityRefStr = String(rawEntityRef).trim();
                const targetEntity = provider?.EntityByID?.(entityRefStr) ?? MjRecordLinksComponent.findEntityInfoStatic(entities, entityRefStr);
                if (!targetEntity || EXCLUDED_SYSTEM_ENTITIES.has(targetEntity.Name.trim())) {
                    continue;
                }
                const entityWithPerm = targetEntity as (EntityInfo & { CanRead?: boolean });
                if (entityWithPerm.CanRead === false || entityWithPerm.IncludeInAPI === false) {
                    continue;
                }
                const pk = CompositeKey.FromURLSegment(targetEntity, String(rawRecordId).trim());
                const dedupeKey = `poly:${targetEntity.Name}:${field.Name}:${MjRecordLinksComponent.getPrimaryKeyStringStatic(pk)}`;
                if (seenKeys.has(dedupeKey)) {
                    continue;
                }
                seenKeys.add(dedupeKey);
                candidates.push({
                    EntityName: targetEntity.Name,
                    RelatedEntity: targetEntity,
                    FieldInfo: field,
                    PrimaryKey: pk,
                    PreResolvedDisplayName: null,
                    IsSoftLink: true
                });
                continue;
            }

            // 2. Standard hard Foreign Key via EntityField.RelatedEntity
            const relatedEntityName = field.RelatedEntity?.trim();
            if (!relatedEntityName || EXCLUDED_SYSTEM_ENTITIES.has(relatedEntityName)) {
                continue;
            }
            const fkValue = record.Get(field.Name);
            if (fkValue == null || String(fkValue).trim() === '') {
                continue;
            }
            const targetEntity = MjRecordLinksComponent.findEntityInfoStatic(entities, relatedEntityName);
            const entityWithPerm = targetEntity as (EntityInfo & { CanRead?: boolean }) | undefined;
            if (entityWithPerm && (entityWithPerm.CanRead === false || entityWithPerm.IncludeInAPI === false)) {
                continue;
            }
            const pkFieldName = field.RelatedEntityFieldName || targetEntity?.FirstPrimaryKey?.Name; // first-pk-ok: an FK targets a single-column key by design
            if (!pkFieldName) {
                continue; // no resolvable target key: skip the link rather than guess a column name
            }
            const pk = new CompositeKey([new KeyValuePair(pkFieldName, fkValue)]);
            const dedupeKey = `fk:${relatedEntityName}:${field.Name}:${MjRecordLinksComponent.getPrimaryKeyStringStatic(pk)}`;
            if (seenKeys.has(dedupeKey)) {
                continue;
            }
            seenKeys.add(dedupeKey);

            let preResolvedName: string | null = null;
            if (field.RelatedEntityNameFieldMap) {
                const joinedVal = record.Get(field.RelatedEntityNameFieldMap);
                if (joinedVal != null && String(joinedVal).trim() !== '') {
                    preResolvedName = String(joinedVal).trim();
                }
            }

            candidates.push({
                EntityName: targetEntity?.Name || relatedEntityName,
                RelatedEntity: targetEntity,
                FieldInfo: field,
                PrimaryKey: pk,
                PreResolvedDisplayName: preResolvedName,
                IsSoftLink: false
            });
        }

        return candidates;
    }

    private static findEntityInfoStatic(entities: EntityInfo[], entityName: string): EntityInfo | undefined {
        const normalized = entityName.trim().toLowerCase();
        return entities.find(e => e.Name.trim().toLowerCase() === normalized);
    }

    private static getPrimaryKeyStringStatic(primaryKey: CompositeKey | undefined | null): string {
        if (!primaryKey) {
            return '';
        }
        if (typeof primaryKey.ToConcatenatedString === 'function') {
            return primaryKey.ToConcatenatedString();
        }
        if (Array.isArray(primaryKey.KeyValuePairs)) {
            return primaryKey.KeyValuePairs.map(kv => `${kv.FieldName}|${kv.Value}`).join('||');
        }
        return '';
    }

    ngOnInit(): void {
        this.isInitialized = true;
        this.LinkFilter = this._initialLinkFilter;
        if (this._record) {
            void this.LoadLinks();
        }
    }

    ngOnDestroy(): void {
        this.isDestroyed = true;
        this.clearHoverTimers();
    }

    /** Total number of links loaded for this record */
    public get TotalLinkCount(): number {
        return this.AllItems.length;
    }

    /** Count of Outgoing links ("On This Record") */
    public get OutgoingLinkCount(): number {
        return this.AllItems.filter(i => i.Direction === 'outgoing').length;
    }

    /** Count of Incoming links ("Linked To This") */
    public get IncomingLinkCount(): number {
        return this.AllItems.filter(i => i.Direction === 'incoming').length;
    }

    /** Count of Cross-App Links (`IsSoftLink === true`) */
    public get CrossAppLinkCount(): number {
        return this.AllItems.filter(i => i.IsSoftLink).length;
    }

    /** Count of Direct Relationships (`IsSoftLink === false`) */
    public get DirectRelationshipCount(): number {
        return this.AllItems.filter(i => !i.IsSoftLink).length;
    }

    /** Items matching the active Direction, Link Type, and Search filters (prior to entity chip selection) */
    public get ItemsMatchingTypeAndSearch(): RecordLinkItem[] {
        const search = this.SearchText.trim().toLowerCase();
        return this.AllItems.filter(item => {
            if (this.DirectionFilter !== 'all' && item.Direction !== this.DirectionFilter) {
                return false;
            }
            if (this.LinkFilter === 'soft' && !item.IsSoftLink) {
                return false;
            }
            if (this.LinkFilter === 'hard' && item.IsSoftLink) {
                return false;
            }
            if (search.length > 0) {
                const matchesTitle = item.DisplayName.toLowerCase().includes(search);
                const matchesEntity = item.EntityDisplayName.toLowerCase().includes(search);
                const matchesRel = item.RelationshipLabel.toLowerCase().includes(search);
                const matchesStatus = item.StatusLabel.toLowerCase().includes(search);
                if (!matchesTitle && !matchesEntity && !matchesRel && !matchesStatus) {
                    return false;
                }
            }
            return true;
        });
    }

    /** Category chips for the top bar ("All (N)" + one chip per entity) */
    public get CategoryChips(): RecordLinkCategoryChip[] {
        const items = this.ItemsMatchingTypeAndSearch;
        const chips: RecordLinkCategoryChip[] = [
            {
                EntityName: null,
                Label: 'All',
                Icon: 'fa-solid fa-layer-group',
                Count: items.length
            }
        ];

        const byEntity = new Map<string, { displayName: string; icon: string; count: number }>();
        for (const item of items) {
            const existing = byEntity.get(item.EntityName);
            if (existing) {
                existing.count += 1;
            } else {
                byEntity.set(item.EntityName, {
                    displayName: item.EntityDisplayName,
                    icon: item.EntityIcon,
                    count: 1
                });
            }
        }

        for (const [entityName, info] of byEntity.entries()) {
            chips.push({
                EntityName: entityName,
                Label: info.displayName,
                Icon: info.icon,
                Count: info.count
            });
        }

        return chips;
    }

    /** Final grouped items after applying DirectionFilter, LinkType, SearchText, and SelectedEntityName filters */
    public get FilteredGroups(): RecordLinkGroup[] {
        const items = this.ItemsMatchingTypeAndSearch.filter(item =>
            this.SelectedEntityName === null || item.EntityName === this.SelectedEntityName
        );

        const groupMap = new Map<string, RecordLinkGroup>();
        for (const item of items) {
            let group = groupMap.get(item.EntityName);
            if (!group) {
                group = {
                    EntityName: item.EntityName,
                    EntityDisplayName: item.EntityDisplayName,
                    EntityIcon: item.EntityIcon,
                    Items: []
                };
                groupMap.set(item.EntityName, group);
            }
            group.Items.push(item);
        }

        return Array.from(groupMap.values());
    }

    /** Total count of currently visible items */
    public get FilteredLinkCount(): number {
        return this.FilteredGroups.reduce((sum, g) => sum + g.Items.length, 0);
    }

    /** Human-readable label for the active LinkFilter */
    public get ActiveLinkFilterLabel(): string {
        switch (this.LinkFilter) {
            case 'soft':
                return 'Cross-App Links';
            case 'hard':
                return 'Direct Relationships';
            default:
                return 'All Links';
        }
    }

    /** Toggle the collapsible filter panel */
    public ToggleFilterPanel(): void {
        this.ShowFilterPanel = !this.ShowFilterPanel;
        this.cdr.markForCheck();
    }

    /** Select a Direction filter ('all' | 'outgoing' | 'incoming') */
    public SetDirectionFilter(direction: RecordLinkDirectionFilter): void {
        this.DirectionFilter = direction;
        this.pruneSelectedEntityChipIfNeeded();
        this.cdr.markForCheck();
    }

    /** Select a Link Type filter ('both' | 'soft' | 'hard') */
    public SetLinkFilter(filter: RecordLinkFilterType): void {
        this.LinkFilter = filter;
        this.pruneSelectedEntityChipIfNeeded();
        this.cdr.markForCheck();
    }

    private pruneSelectedEntityChipIfNeeded(): void {
        if (this.SelectedEntityName !== null) {
            const stillHasEntity = this.ItemsMatchingTypeAndSearch.some(
                i => i.EntityName === this.SelectedEntityName
            );
            if (!stillHasEntity) {
                this.SelectedEntityName = null;
            }
        }
    }

    /** Select a category chip by entity name (`null` for All) */
    public SelectCategoryChip(entityName: string | null): void {
        this.SelectedEntityName = entityName;
        this.cdr.markForCheck();
    }

    /** Update search filter text from DOM input event */
    public OnSearchInput(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        this.OnSearchChange(target?.value ?? '');
    }

    /** Update search filter text */
    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.cdr.markForCheck();
    }

    /** Clear search text */
    public ClearSearch(): void {
        this.SearchText = '';
        this.cdr.markForCheck();
    }

    /** Reset all active filters back to defaults */
    public ResetFilters(): void {
        this.SearchText = '';
        this.LinkFilter = 'both';
        this.DirectionFilter = 'all';
        this.SelectedEntityName = null;
        this.cdr.markForCheck();
    }

    /** Handle navigation emitted by `[mjRecordLink]` on a linked record card */
    public OnItemNavigate(_item: RecordLinkItem, navEvent: FormNavigationEvent): void {
        this.clearHoverTimers();
        this.HoveredItem = null;
        this.Navigate.emit(navEvent);
    }

    /** Handle inline Quick Edit save emitted by `[mjRecordLink]` on a linked record card */
    public OnItemQuickEdited(item: RecordLinkItem, _event: RecordPreviewUpdatedEvent): void {
        this.RecordLinkModified.emit({ Action: 'updated', Item: item });
        void this.LoadLinks(true);
    }

    /** Handle clicking a linked record card */
    public OnItemClick(item: RecordLinkItem, event?: MouseEvent): void {
        this.clearHoverTimers();
        this.HoveredItem = null;
        const navEvent: FormNavigationEvent = event && (event.metaKey || event.ctrlKey)
            ? {
                Kind: 'record',
                EntityName: item.EntityName,
                PrimaryKey: item.PrimaryKey,
                OpenInNewTab: true
            }
            : {
                Kind: 'record',
                EntityName: item.EntityName,
                PrimaryKey: item.PrimaryKey
            };
        this.Navigate.emit(navEvent);
    }

    /** Open `<mj-record-preview-popover>` when hovering over a link card */
    public OnCardMouseEnter(item: RecordLinkItem, event: MouseEvent): void {
        const anchorEl = event.currentTarget as HTMLElement | null;
        if (!anchorEl) return;

        if (this.hoverCloseTimer) {
            clearTimeout(this.hoverCloseTimer);
            this.hoverCloseTimer = null;
        }
        if (this.hoverOpenTimer) {
            clearTimeout(this.hoverOpenTimer);
        }

        this.hoverOpenTimer = setTimeout(() => {
            this.hoverOpenTimer = null;
            if (this.isDestroyed) return;
            const r = anchorEl.getBoundingClientRect();
            this.HoverAnchorRect = {
                top: r.top,
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                width: r.width,
                height: r.height
            };
            this.HoveredItem = item;
            this.cdr.markForCheck();
        }, 280);
    }

    /** Schedule closing the hover preview popover when the pointer leaves a card */
    public OnCardMouseLeave(): void {
        if (this.hoverOpenTimer) {
            clearTimeout(this.hoverOpenTimer);
            this.hoverOpenTimer = null;
        }
        if (this.hoverCloseTimer) {
            clearTimeout(this.hoverCloseTimer);
        }
        this.hoverCloseTimer = setTimeout(() => {
            this.hoverCloseTimer = null;
            if (!this.isDestroyed) {
                this.HoveredItem = null;
                this.cdr.markForCheck();
            }
        }, 180);
    }

    public OnPreviewCardMouseEnter(): void {
        if (this.hoverCloseTimer) {
            clearTimeout(this.hoverCloseTimer);
            this.hoverCloseTimer = null;
        }
    }

    public OnPreviewCardMouseLeave(): void {
        this.OnCardMouseLeave();
    }

    public OnPreviewCardNavigate(navEvent: FormNavigationEvent): void {
        this.clearHoverTimers();
        this.HoveredItem = null;
        this.Navigate.emit(navEvent);
        this.cdr.markForCheck();
    }

    public OnPreviewRecordUpdated(_event: RecordPreviewUpdatedEvent): void {
        const currentHovered = this.HoveredItem;
        if (currentHovered) {
            this.RecordLinkModified.emit({ Action: 'updated', Item: currentHovered });
        }
        void this.LoadLinks(true);
    }

    /**
     * Unlinks a nullable outgoing foreign-key or polymorphic-FK field on `this.Record`
     * and saves the record if it was already saved.
     */
    public async OnUnlinkItem(item: RecordLinkItem, event: MouseEvent): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        const record = this._record;
        if (
            !record ||
            !this.AllowQuickUnlink ||
            item.Direction !== 'outgoing' ||
            !item.CanUnlink ||
            !item.SourceFieldName ||
            this.UnlinkingTrackKey
        ) {
            return;
        }

        this.clearHoverTimers();
        if (this.HoveredItem?.TrackKey === item.TrackKey) {
            this.HoveredItem = null;
        }

        this.UnlinkingTrackKey = item.TrackKey;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            record.Set(item.SourceFieldName, null);
            if (item.SourceEntityIDFieldName) {
                const entityIdCol = item.SourceEntityIDFieldName;
                const sharedByAnotherActiveField = (record.EntityInfo?.Fields ?? []).some(f => {
                    if (f.Name === item.SourceFieldName) return false;
                    if (f.EntityIDFieldName?.trim() !== entityIdCol) return false;
                    const val = record.Get(f.Name);
                    return val != null && String(val).trim() !== '';
                });
                const entityIdFieldInfo = record.EntityInfo?.Fields?.find(f => f.Name === entityIdCol);
                if (!sharedByAnotherActiveField && entityIdFieldInfo?.AllowsNull) {
                    record.Set(entityIdCol, null);
                }
            }

            if (record.IsSaved && typeof record.Save === 'function') {
                const saved = await record.Save();
                if (!saved) {
                    const latestMsg = (record as BaseEntity & { LatestResult?: { Message?: string } }).LatestResult?.Message;
                    this.ErrorMessage = latestMsg || 'Unable to unlink record.';
                    this.UnlinkingTrackKey = null;
                    this.cdr.markForCheck();
                    return;
                }
            }

            this.AllItems = this.AllItems.filter(existing => existing.TrackKey !== item.TrackKey);
            this.UnlinkingTrackKey = null;
            this.emitCountAndSummary();
            this.RecordLinkModified.emit({ Action: 'unlinked', Item: item });
            this.cdr.markForCheck();
        } catch (err: unknown) {
            this.ErrorMessage = err instanceof Error ? err.message : 'Unable to unlink record.';
            this.UnlinkingTrackKey = null;
            this.cdr.markForCheck();
        }
    }

    private clearHoverTimers(): void {
        if (this.hoverOpenTimer) {
            clearTimeout(this.hoverOpenTimer);
            this.hoverOpenTimer = null;
        }
        if (this.hoverCloseTimer) {
            clearTimeout(this.hoverCloseTimer);
            this.hoverCloseTimer = null;
        }
    }

    /** Request to close the drawer */
    public OnClose(): void {
        this.Close.emit();
    }

    /**
     * Load bidirectional links for `this.Record` (both outgoing FK / polymorphic FK fields on
     * this record and incoming dependencies via `GetRecordDependencies`), filter out system
     * telemetry entities and unreadable entities, and batch-enrich record names/dates via `RunViews`.
     */
    public async LoadLinks(forceRefresh = false): Promise<void> {
        const record = this._record;
        if (!record || !record.IsSaved || !record.EntityInfo) {
            this.AllItems = [];
            this.IsLoading = false;
            this.ErrorMessage = null;
            this.emitCountAndSummary();
            this.cdr.markForCheck();
            return;
        }

        const currentVersion = ++this.loadVersion;
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            const provider = this.ProviderToUse;
            const entities: EntityInfo[] = provider.Entities ?? [];

            // 1. Outgoing candidates from this record's own FK and polymorphic FK fields
            const outgoingCandidates = MjRecordLinksComponent.extractOutgoingCandidates(record, provider, entities);

            // 2. Incoming dependencies from GetRecordDependencies (reusing pre-warmed cache when fresh)
            const deps = await MjRecordLinksComponent.fetchDependenciesWithCache(record, provider, forceRefresh);

            if (this.isDestroyed || currentVersion !== this.loadVersion) {
                return;
            }

            const filteredDeps = MjRecordLinksComponent.filterIncomingDependencies(deps, entities);

            if (outgoingCandidates.length === 0 && filteredDeps.length === 0) {
                this.AllItems = [];
                this.IsLoading = false;
                this.emitCountAndSummary();
                this.cdr.markForCheck();
                return;
            }

            // Combine target primary keys per related entity so we batch-enrich both outgoing and incoming in a single RunViews call
            const keysByEntity = new Map<string, CompositeKey[]>();
            for (const out of outgoingCandidates) {
                const list = keysByEntity.get(out.EntityName) ?? [];
                list.push(out.PrimaryKey);
                keysByEntity.set(out.EntityName, list);
            }
            for (const dep of filteredDeps) {
                const list = keysByEntity.get(dep.RelatedEntityName) ?? [];
                list.push(dep.PrimaryKey);
                keysByEntity.set(dep.RelatedEntityName, list);
            }

            const groupEntries = Array.from(keysByEntity.entries());
            const viewParamsList: RunViewParams[] = [];

            for (const [relatedEntityName, pks] of groupEntries) {
                const relatedEntity = this.findEntityInfo(entities, relatedEntityName);
                const fieldsToRequest = this.buildFieldsToRequestForKeys(relatedEntity, pks);
                const extraFilter = this.buildBatchWhereClauseForKeys(pks.slice(0, 50));

                viewParamsList.push({
                    EntityName: relatedEntityName,
                    ExtraFilter: extraFilter,
                    Fields: fieldsToRequest,
                    ResultType: 'simple',
                    MaxRows: 50
                });
            }

            const rowsByEntity = new Map<string, Record<string, unknown>[]>();
            if (viewParamsList.length > 0) {
                try {
                    const rv = RunView.FromMetadataProvider(provider);
                    const viewResults = await rv.RunViews(viewParamsList);
                    if (Array.isArray(viewResults)) {
                        for (let i = 0; i < groupEntries.length; i++) {
                            const [relatedEntityName] = groupEntries[i];
                            const res = viewResults[i];
                            if (res && res.Success && Array.isArray(res.Results)) {
                                rowsByEntity.set(
                                    relatedEntityName,
                                    res.Results as Record<string, unknown>[]
                                );
                            }
                        }
                    }
                } catch {
                    // Fallback gracefully to primary-key display labels if batch view enrichment fails
                }
            }

            if (this.isDestroyed || currentVersion !== this.loadVersion) {
                return;
            }

            const enrichedItems: RecordLinkItem[] = [];
            let index = 0;

            // Build Outgoing items first ("On This Record")
            for (const out of outgoingCandidates) {
                const relatedEntity = out.RelatedEntity ?? this.findEntityInfo(entities, out.EntityName);
                const entityDisplayName = relatedEntity?.DisplayNameOrName || out.EntityName;
                const entityIcon = relatedEntity?.Icon || 'fa-solid fa-link';
                const entityRows = rowsByEntity.get(out.EntityName) ?? [];
                const matchedRow = this.findMatchingRow(entityRows, out.PrimaryKey);
                const displayName = out.PreResolvedDisplayName || this.resolveRecordDisplayName(
                    matchedRow,
                    relatedEntity,
                    entityDisplayName,
                    out.PrimaryKey
                );
                const relationshipLabel = this.humanizeFieldName(out.FieldInfo.DisplayNameOrName || out.FieldInfo.Name);
                const statusLabel = this.resolveStatusLabel(matchedRow, relatedEntity);
                const formattedDate = this.resolveFormattedDate(matchedRow);
                const pkConcat = this.getPrimaryKeyString(out.PrimaryKey);
                const canUnlink = Boolean(
                    out.FieldInfo.AllowsNull &&
                    !out.FieldInfo.ReadOnly &&
                    out.FieldInfo.AllowUpdateAPI !== false
                );

                enrichedItems.push({
                    TrackKey: `out:${out.EntityName}:${out.FieldInfo.Name}:${pkConcat}:${index++}`,
                    EntityName: out.EntityName,
                    EntityDisplayName: entityDisplayName,
                    EntityIcon: entityIcon,
                    PrimaryKey: out.PrimaryKey,
                    DisplayName: displayName,
                    RelationshipLabel: relationshipLabel,
                    StatusLabel: statusLabel,
                    FormattedDate: formattedDate,
                    IsSoftLink: out.IsSoftLink,
                    LinkTypeLabel: out.IsSoftLink ? 'Cross-App Link' : 'Direct Relationship',
                    Direction: 'outgoing',
                    DirectionLabel: 'On This Record',
                    SourceFieldName: out.FieldInfo.Name,
                    SourceEntityIDFieldName: out.FieldInfo.EntityIDFieldName?.trim() || null,
                    CanUnlink: canUnlink
                });
            }

            // Build Incoming items ("Linked To This")
            for (const dep of filteredDeps) {
                const relatedEntity = this.findEntityInfo(entities, dep.RelatedEntityName);
                const entityDisplayName = relatedEntity?.DisplayNameOrName || dep.RelatedEntityName;
                const entityIcon = relatedEntity?.Icon || 'fa-solid fa-link';
                const entityRows = rowsByEntity.get(dep.RelatedEntityName) ?? [];
                const matchedRow = this.findMatchingRow(entityRows, dep.PrimaryKey);
                const displayName = this.resolveRecordDisplayName(
                    matchedRow,
                    relatedEntity,
                    entityDisplayName,
                    dep.PrimaryKey
                );
                const relationshipLabel = this.resolveRelationshipLabel(dep, relatedEntity);
                const statusLabel = this.resolveStatusLabel(matchedRow, relatedEntity);
                const formattedDate = this.resolveFormattedDate(matchedRow);
                const isSoft = Boolean(dep.IsSoftLink);
                const pkConcat = this.getPrimaryKeyString(dep.PrimaryKey);

                enrichedItems.push({
                    TrackKey: `in:${dep.RelatedEntityName}:${dep.FieldName}:${pkConcat}:${index++}`,
                    EntityName: dep.RelatedEntityName,
                    EntityDisplayName: entityDisplayName,
                    EntityIcon: entityIcon,
                    PrimaryKey: dep.PrimaryKey,
                    DisplayName: displayName,
                    RelationshipLabel: relationshipLabel,
                    StatusLabel: statusLabel,
                    FormattedDate: formattedDate,
                    IsSoftLink: isSoft,
                    LinkTypeLabel: isSoft ? 'Cross-App Link' : 'Direct Relationship',
                    Direction: 'incoming',
                    DirectionLabel: 'Linked To This'
                });
            }

            this.AllItems = enrichedItems;
            this.IsLoading = false;
            this.emitCountAndSummary();
            this.cdr.markForCheck();
        } catch (err: unknown) {
            if (this.isDestroyed || currentVersion !== this.loadVersion) {
                return;
            }
            this.AllItems = [];
            this.IsLoading = false;
            this.ErrorMessage = err instanceof Error ? err.message : 'Unable to load linked records.';
            this.emitCountAndSummary();
            this.cdr.markForCheck();
        }
    }

    private emitCountAndSummary(): void {
        this.LinkCountChange.emit(this.AllItems.length);
        const byEntityMap = new Map<string, {
            EntityName: string;
            EntityDisplayName: string;
            HasOutgoing: boolean;
            HasIncoming: boolean;
            Count: number;
            SampleNames: string[];
        }>();

        for (const item of this.AllItems) {
            let entry = byEntityMap.get(item.EntityName);
            if (!entry) {
                entry = {
                    EntityName: item.EntityName,
                    EntityDisplayName: item.EntityDisplayName,
                    HasOutgoing: false,
                    HasIncoming: false,
                    Count: 0,
                    SampleNames: []
                };
                byEntityMap.set(item.EntityName, entry);
            }
            if (item.Direction === 'outgoing') entry.HasOutgoing = true;
            if (item.Direction === 'incoming') entry.HasIncoming = true;
            entry.Count += 1;
            if (item.DisplayName && entry.SampleNames.length < 3) {
                entry.SampleNames.push(item.DisplayName);
            }
        }

        this.LinksSummaryChange.emit({
            TotalCount: this.AllItems.length,
            OutgoingCount: this.OutgoingLinkCount,
            IncomingCount: this.IncomingLinkCount,
            ByEntity: Array.from(byEntityMap.values()).map(e => ({
                EntityName: e.EntityName,
                EntityDisplayName: e.EntityDisplayName,
                Direction: e.HasOutgoing && e.HasIncoming ? 'both' : e.HasOutgoing ? 'outgoing' : 'incoming',
                Count: e.Count,
                SampleNames: e.SampleNames
            }))
        });
    }

    private computeRecordSignature(record: BaseEntity | null): string {
        if (!record || !record.EntityInfo) {
            return '';
        }
        const pk = this.getPrimaryKeyString(record.PrimaryKey);
        return `${record.EntityInfo.Name}:${pk}:${record.IsSaved}`;
    }

    private findEntityInfo(entities: EntityInfo[], entityName: string): EntityInfo | undefined {
        return MjRecordLinksComponent.findEntityInfoStatic(entities, entityName);
    }

    private buildFieldsToRequestForKeys(
        relatedEntity: EntityInfo | undefined,
        pks: CompositeKey[]
    ): string[] {
        const fieldSet = new Set<string>();

        if (relatedEntity?.PrimaryKeys?.length) {
            for (const pk of relatedEntity.PrimaryKeys) {
                fieldSet.add(pk.Name);
            }
        }
        for (const pk of pks) {
            for (const kv of pk?.KeyValuePairs ?? []) {
                if (kv.FieldName) {
                    fieldSet.add(kv.FieldName);
                }
            }
        }
        if (fieldSet.size === 0) {
            fieldSet.add('ID');
        }

        if (relatedEntity?.NameField?.Name) {
            fieldSet.add(relatedEntity.NameField.Name);
        } else if (relatedEntity?.Fields?.length) {
            for (const candidate of ['Name', 'Title', 'Subject']) {
                const found = relatedEntity.Fields.find(
                    f => f.Name.toLowerCase() === candidate.toLowerCase()
                );
                if (found) {
                    fieldSet.add(found.Name);
                }
            }
        }

        if (!relatedEntity?.Fields?.length || relatedEntity.Fields.some(f => f.Name === '__mj_UpdatedAt')) {
            fieldSet.add('__mj_UpdatedAt');
        }

        if (relatedEntity?.Fields?.length) {
            for (const candidate of ['Status', 'Type', 'Role']) {
                const found = relatedEntity.Fields.find(
                    f => f.Name.toLowerCase() === candidate.toLowerCase()
                );
                if (found) {
                    fieldSet.add(found.Name);
                }
            }
        }

        return Array.from(fieldSet);
    }

    private buildBatchWhereClauseForKeys(pks: CompositeKey[]): string {
        const clauses: string[] = [];
        for (const pkRaw of pks) {
            const pk = pkRaw as (CompositeKey & { WhereClause?: () => string }) | undefined;
            if (!pk) {
                continue;
            }
            const wc =
                typeof pk.ToWhereClause === 'function'
                    ? pk.ToWhereClause()
                    : typeof pk.WhereClause === 'function'
                      ? pk.WhereClause()
                      : '';
            if (wc && wc.trim().length > 0) {
                clauses.push(`(${wc})`);
                continue;
            }
            if (Array.isArray(pk.KeyValuePairs) && pk.KeyValuePairs.length > 0) {
                const parts = pk.KeyValuePairs.map(
                    kv => `[${kv.FieldName}] = '${String(kv.Value).replace(/'/g, "''")}'`
                );
                clauses.push(`(${parts.join(' AND ')})`);
            }
        }
        return clauses.join(' OR ');
    }

    private findMatchingRow(
        rows: Record<string, unknown>[],
        primaryKey: CompositeKey
    ): Record<string, unknown> | undefined {
        const kvPairs = primaryKey?.KeyValuePairs ?? [];
        if (kvPairs.length === 0 || rows.length === 0) {
            return undefined;
        }
        return rows.find(row =>
            kvPairs.every(kv => {
                const rowVal = row[kv.FieldName];
                if (rowVal === undefined || rowVal === null) {
                    return false;
                }
                return String(rowVal).trim().toLowerCase() === String(kv.Value).trim().toLowerCase();
            })
        );
    }

    private resolveRecordDisplayName(
        row: Record<string, unknown> | undefined,
        relatedEntity: EntityInfo | undefined,
        entityDisplayName: string,
        primaryKey: CompositeKey
    ): string {
        if (row) {
            const nameFieldName = relatedEntity?.NameField?.Name;
            if (nameFieldName && row[nameFieldName] !== undefined && row[nameFieldName] !== null && String(row[nameFieldName]).trim() !== '') {
                const candidateName = String(row[nameFieldName]).trim();
                if (!this.isRawUuid(candidateName)) {
                    return candidateName;
                }
            }
            for (const candidate of ['Name', 'Title', 'Subject', 'DisplayName']) {
                const val = row[candidate];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    const candidateName = String(val).trim();
                    if (!this.isRawUuid(candidateName)) {
                        return candidateName;
                    }
                }
            }
        }
        const pkValue = primaryKey?.KeyValuePairs?.[0]?.Value;
        if (pkValue !== undefined && pkValue !== null && String(pkValue).trim() !== '') {
            const rawPk = String(pkValue).trim();
            if (this.isRawUuid(rawPk)) {
                return `${entityDisplayName} · ${rawPk.slice(0, 6)}…${rawPk.slice(-4)}`;
            }
            return `${entityDisplayName} #${rawPk}`;
        }
        return entityDisplayName;
    }

    private isRawUuid(value: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
    }

    private resolveRelationshipLabel(
        dep: RecordDependency,
        relatedEntity: EntityInfo | undefined
    ): string {
        const depWithDisplay = dep as RecordDependency & { FieldDisplayName?: string };
        if (depWithDisplay.FieldDisplayName && depWithDisplay.FieldDisplayName.trim().length > 0) {
            return depWithDisplay.FieldDisplayName.trim();
        }
        const fieldInfo = relatedEntity?.Fields?.find(
            f => f.Name.trim().toLowerCase() === dep.FieldName.trim().toLowerCase()
        );
        if (fieldInfo?.DisplayNameOrName && fieldInfo.DisplayNameOrName.trim().length > 0) {
            const label = fieldInfo.DisplayNameOrName.trim();
            if (label.toLowerCase() !== 'record id' && label.toLowerCase() !== 'recordid') {
                return label;
            }
            return 'Linked Record';
        }
        return this.humanizeFieldName(dep.FieldName);
    }

    private humanizeFieldName(fieldName: string): string {
        if (!fieldName) {
            return 'Linked Record';
        }
        const trimmed = fieldName.trim();
        if (trimmed.toLowerCase() === 'recordid' || trimmed.toLowerCase() === 'record id') {
            return 'Linked Record';
        }
        const withoutId = trimmed.replace(/\s*ID$/i, '');
        const spaced = withoutId.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
        return spaced.length > 0 ? spaced : 'Linked Record';
    }

    private resolveStatusLabel(
        row: Record<string, unknown> | undefined,
        relatedEntity: EntityInfo | undefined
    ): string {
        if (!row) {
            return '';
        }
        for (const candidate of ['Status', 'Type', 'Role']) {
            const fieldName =
                relatedEntity?.Fields?.find(f => f.Name.toLowerCase() === candidate.toLowerCase())?.Name ??
                candidate;
            const val = row[fieldName];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                return String(val).trim();
            }
        }
        return '';
    }

    private resolveFormattedDate(row: Record<string, unknown> | undefined): string {
        if (!row) {
            return '';
        }
        const raw = row['__mj_UpdatedAt'];
        if (!raw) {
            return '';
        }
        const date = raw instanceof Date ? raw : new Date(String(raw));
        if (isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    private getPrimaryKeyString(primaryKey: CompositeKey | undefined | null): string {
        return MjRecordLinksComponent.getPrimaryKeyStringStatic(primaryKey);
    }
}
