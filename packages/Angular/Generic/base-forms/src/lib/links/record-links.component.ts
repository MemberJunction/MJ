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
    EntityInfo,
    Metadata,
    RecordDependency,
    RunView,
    RunViewParams
} from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FormNavigationEvent } from '../types/navigation-events';

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
 * (both Cross-App Links and Direct Relationships), grouped by entity with search, link-type filter,
 * category chips, and record navigation.
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

    /** Emitted when the user clicks a linked record card to navigate to it. */
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();

    /** Emitted when the slide-in drawer requests to close. */
    @Output() Close = new EventEmitter<void>();

    /** Emitted whenever the total loaded link count changes. */
    @Output() LinkCountChange = new EventEmitter<number>();

    /** Loading state */
    public IsLoading = false;

    /** Error message if loading fails */
    public ErrorMessage: string | null = null;

    /** Current search query */
    public SearchText = '';

    /** Whether the collapsible Link Type filter panel is expanded */
    public ShowFilterPanel = false;

    /** Active link type filter: 'both' (All Links), 'soft' (Cross-App Links), or 'hard' (Direct Relationships) */
    public LinkFilter: RecordLinkFilterType = 'both';

    /** Currently selected entity filter chip (`null` means All) */
    public SelectedEntityName: string | null = null;

    /** All loaded and enriched link items for the current record */
    public AllItems: RecordLinkItem[] = [];

    private isInitialized = false;
    private isDestroyed = false;
    private loadVersion = 0;

    ngOnInit(): void {
        this.isInitialized = true;
        this.LinkFilter = this._initialLinkFilter;
        if (this._record) {
            void this.LoadLinks();
        }
    }

    ngOnDestroy(): void {
        this.isDestroyed = true;
    }

    /** Total number of links loaded for this record */
    public get TotalLinkCount(): number {
        return this.AllItems.length;
    }

    /** Count of Cross-App Links (`IsSoftLink === true`) */
    public get CrossAppLinkCount(): number {
        return this.AllItems.filter(i => i.IsSoftLink).length;
    }

    /** Count of Direct Relationships (`IsSoftLink === false`) */
    public get DirectRelationshipCount(): number {
        return this.AllItems.filter(i => !i.IsSoftLink).length;
    }

    /** Items matching the active Link Type filter and search query (prior to entity chip selection) */
    public get ItemsMatchingTypeAndSearch(): RecordLinkItem[] {
        const search = this.SearchText.trim().toLowerCase();
        return this.AllItems.filter(item => {
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

    /** Final grouped items after applying LinkType, SearchText, and SelectedEntityName filters */
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

    /** Select a Link Type filter ('both' | 'soft' | 'hard') */
    public SetLinkFilter(filter: RecordLinkFilterType): void {
        this.LinkFilter = filter;
        // Reset entity chip if the selected entity no longer has items under the new filter
        if (this.SelectedEntityName !== null) {
            const stillHasEntity = this.ItemsMatchingTypeAndSearch.some(
                i => i.EntityName === this.SelectedEntityName
            );
            if (!stillHasEntity) {
                this.SelectedEntityName = null;
            }
        }
        this.cdr.markForCheck();
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
        this.SelectedEntityName = null;
        this.cdr.markForCheck();
    }

    /** Handle clicking a linked record card */
    public OnItemClick(item: RecordLinkItem, event?: MouseEvent): void {
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

    /** Request to close the drawer */
    public OnClose(): void {
        this.Close.emit();
    }

    /**
     * Load dependencies for `this.Record` via `GetRecordDependencies`, filter out system
     * telemetry entities and unreadable entities, and batch-enrich record names/dates via `RunViews`.
     */
    public async LoadLinks(): Promise<void> {
        const record = this._record;
        if (!record || !record.IsSaved || !record.EntityInfo) {
            this.AllItems = [];
            this.IsLoading = false;
            this.ErrorMessage = null;
            this.LinkCountChange.emit(0);
            this.cdr.markForCheck();
            return;
        }

        const currentVersion = ++this.loadVersion;
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            const md = new Metadata();
            const depOptions = { IncludeSystemEntities: false };
            const deps = this.Provider
                ? await this.Provider.GetRecordDependencies(record.EntityInfo.Name, record.PrimaryKey, depOptions)
                : await md.GetRecordDependencies(record.EntityInfo.Name, record.PrimaryKey, depOptions);

            if (this.isDestroyed || currentVersion !== this.loadVersion) {
                return;
            }

            const entities: EntityInfo[] = (this.Provider ? this.Provider.Entities : md.Entities) ?? [];
            const filteredDeps = (deps ?? []).filter(dep => {
                if (!dep || !dep.RelatedEntityName) {
                    return false;
                }
                if (EXCLUDED_SYSTEM_ENTITIES.has(dep.RelatedEntityName.trim())) {
                    return false;
                }
                const entityInfo = this.findEntityInfo(entities, dep.RelatedEntityName);
                const entityWithPerm = entityInfo as (EntityInfo & { CanRead?: boolean }) | null;
                if (entityWithPerm && (entityWithPerm.CanRead === false || entityWithPerm.IncludeInAPI === false)) {
                    return false;
                }
                return true;
            });

            if (filteredDeps.length === 0) {
                this.AllItems = [];
                this.IsLoading = false;
                this.LinkCountChange.emit(0);
                this.cdr.markForCheck();
                return;
            }

            // Group dependencies by RelatedEntityName
            const groupedDeps = new Map<string, RecordDependency[]>();
            for (const dep of filteredDeps) {
                const list = groupedDeps.get(dep.RelatedEntityName) ?? [];
                list.push(dep);
                groupedDeps.set(dep.RelatedEntityName, list);
            }

            // Build batch RunViews query for each related entity group
            const groupEntries = Array.from(groupedDeps.entries());
            const viewParamsList: RunViewParams[] = [];

            for (const [relatedEntityName, entityDeps] of groupEntries) {
                const relatedEntity = this.findEntityInfo(entities, relatedEntityName);
                const fieldsToRequest = this.buildFieldsToRequest(relatedEntity, entityDeps);
                const extraFilter = this.buildBatchWhereClause(entityDeps.slice(0, 50));

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
                    const rv = this.Provider
                        ? RunView.FromMetadataProvider(this.Provider)
                        : new RunView();
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

            // Build enriched RecordLinkItem list
            const enrichedItems: RecordLinkItem[] = [];
            let index = 0;
            for (const [relatedEntityName, entityDeps] of groupEntries) {
                const relatedEntity = this.findEntityInfo(entities, relatedEntityName);
                const entityDisplayName = relatedEntity?.DisplayNameOrName || relatedEntityName;
                const entityIcon = relatedEntity?.Icon || 'fa-solid fa-link';
                const entityRows = rowsByEntity.get(relatedEntityName) ?? [];

                for (const dep of entityDeps) {
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
                        TrackKey: `${relatedEntityName}:${dep.FieldName}:${pkConcat}:${index++}`,
                        EntityName: relatedEntityName,
                        EntityDisplayName: entityDisplayName,
                        EntityIcon: entityIcon,
                        PrimaryKey: dep.PrimaryKey,
                        DisplayName: displayName,
                        RelationshipLabel: relationshipLabel,
                        StatusLabel: statusLabel,
                        FormattedDate: formattedDate,
                        IsSoftLink: isSoft,
                        LinkTypeLabel: isSoft ? 'Cross-App Link' : 'Direct Relationship'
                    });
                }
            }

            this.AllItems = enrichedItems;
            this.IsLoading = false;
            this.LinkCountChange.emit(this.AllItems.length);
            this.cdr.markForCheck();
        } catch (err: unknown) {
            if (this.isDestroyed || currentVersion !== this.loadVersion) {
                return;
            }
            this.AllItems = [];
            this.IsLoading = false;
            this.ErrorMessage = err instanceof Error ? err.message : 'Unable to load linked records.';
            this.LinkCountChange.emit(0);
            this.cdr.markForCheck();
        }
    }

    private computeRecordSignature(record: BaseEntity | null): string {
        if (!record || !record.EntityInfo) {
            return '';
        }
        const pk = this.getPrimaryKeyString(record.PrimaryKey);
        return `${record.EntityInfo.Name}:${pk}:${record.IsSaved}`;
    }

    private findEntityInfo(entities: EntityInfo[], entityName: string): EntityInfo | undefined {
        const normalized = entityName.trim().toLowerCase();
        return entities.find(e => e.Name.trim().toLowerCase() === normalized);
    }

    private buildFieldsToRequest(
        relatedEntity: EntityInfo | undefined,
        deps: RecordDependency[]
    ): string[] {
        const fieldSet = new Set<string>();

        // Primary key fields
        if (relatedEntity?.PrimaryKeys?.length) {
            for (const pk of relatedEntity.PrimaryKeys) {
                fieldSet.add(pk.Name);
            }
        }
        for (const dep of deps) {
            for (const kv of dep.PrimaryKey?.KeyValuePairs ?? []) {
                if (kv.FieldName) {
                    fieldSet.add(kv.FieldName);
                }
            }
        }
        if (fieldSet.size === 0) {
            fieldSet.add('ID');
        }

        // NameField
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

        // Timestamp field
        if (!relatedEntity?.Fields?.length || relatedEntity.Fields.some(f => f.Name === '__mj_UpdatedAt')) {
            fieldSet.add('__mj_UpdatedAt');
        }

        // Optional Status / Type / Role fields if present on relatedEntity.Fields
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

    private buildBatchWhereClause(deps: RecordDependency[]): string {
        const clauses: string[] = [];
        for (const dep of deps) {
            const pk = dep.PrimaryKey as (CompositeKey & { WhereClause?: () => string }) | undefined;
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
                return String(row[nameFieldName]);
            }
            for (const candidate of ['Name', 'Title', 'Subject', 'DisplayName']) {
                const val = row[candidate];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    return String(val);
                }
            }
        }
        const pkValue = primaryKey?.KeyValuePairs?.[0]?.Value;
        if (pkValue !== undefined && pkValue !== null && String(pkValue).trim() !== '') {
            return `${entityDisplayName} #${String(pkValue)}`;
        }
        return entityDisplayName;
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
        if (trimmed.toLowerCase() === 'recordid') {
            return 'Linked Record';
        }
        const withoutId = trimmed.replace(/ID$/i, '');
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
}
