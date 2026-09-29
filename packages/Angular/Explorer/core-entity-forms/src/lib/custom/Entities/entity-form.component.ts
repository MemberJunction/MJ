import {
    Component,
    OnInit,
    OnDestroy,
    ChangeDetectionStrategy,
    inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import {
    EntityInfo,
    EntityFieldInfo,
    EntityRelationshipInfo,
    EntityOrganicKeyInfo,
    EntityOrganicKeyRelatedEntityInfo,
    EntityPermissionInfo,
    Metadata,
    CompositeKey,
    RunView,
    type IEntityConfiguration,
    type IEntityFormConfiguration,
    type RelatedFormRoleCandidate,
} from '@memberjunction/core';
import { MJEntityEntity } from '@memberjunction/core-entities';
import { ERDCompositeState } from '@memberjunction/ng-entity-relationship-diagram';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { MJEntityFormComponent } from '../../generated/Entities/MJEntity/mjentity.form.component';

export type ExplorerSection =
    | 'overview'
    | 'fields'
    | 'relationships'
    | 'organicKeys'
    | 'permissions'
    | 'data'
    | 'lineage'
    | 'history'
    | 'settings';

export interface NavItem {
    id: ExplorerSection;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    icon: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    label: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    badge?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface EntityStats {
    fieldCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    relationshipCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    permissionCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    rowCount: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    primaryKeyCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    foreignKeyCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    encryptedFieldCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    valueListFieldCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface FieldGroup {
    id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    label: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    icon: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    fields: EntityFieldInfo[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    expanded: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Represents a group of fields organized by their source entity in an IS-A hierarchy.
 */
export interface ISAFieldGroup {
    /** The source entity name (e.g., "Products", "Meetings") */
    EntityName: string;
    /** The EntityInfo for the source entity */
    EntityInfo: EntityInfo | null;
    /** Label like "Own Fields" or "Inherited from Products" */
    Label: string;
    /** Hierarchy level: 0 = own, 1 = parent, 2 = grandparent, etc. */
    Level: number;
    /** Fields belonging to this group */
    Fields: EntityFieldInfo[];
    /** Whether this group is expanded in the UI */
    Expanded: boolean;
}

/**
 * Record count for a child entity type
 */
export interface ChildEntityCount {
    EntityName: string;
    EntityInfo: EntityInfo;
    RecordCount: number | null;
    IsLoading: boolean;
}

/**
 * Grouped outgoing relationship - an entity this entity references via FK fields
 */
export interface GroupedOutgoingRelationship {
    /** The entity being referenced */
    entityId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    entityName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** All fields on THIS entity that reference the target entity */
    fields: EntityFieldInfo[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Grouped incoming relationship - an entity that references this entity
 */
export interface GroupedIncomingRelationship {
    /** The entity that references this entity */
    entityName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** All fields on the OTHER entity that reference THIS entity */
    fields: { fieldName: string; type: string; bundleInAPI: boolean }[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * An organic key defined on THIS entity, with its related entity targets
 */
export interface OrganicKeyOutgoing {
    OrganicKey: EntityOrganicKeyInfo;
    RelatedEntities: { Info: EntityOrganicKeyRelatedEntityInfo; EntityName: string; EntityIcon: string }[];
}

/**
 * An organic key on ANOTHER entity that targets THIS entity as a related entity
 */
export interface OrganicKeyIncoming {
    SourceEntityID: string;
    SourceEntityName: string;
    SourceEntityIcon: string;
    OrganicKey: EntityOrganicKeyInfo;
    RelatedEntityConfig: EntityOrganicKeyRelatedEntityInfo;
    MatchType: 'Direct' | 'Transitive';
}

/**
 * World-class Entity Explorer form component that provides an exploration-focused
 * interface for understanding entities in the MemberJunction system.
 *
 * This component replaces the traditional edit-focused entity form with a rich
 * exploration experience featuring:
 * - Three-zone architecture (Header, Nav Rail, Main Canvas)
 * - Seven exploration sections: Overview, Fields, Relationships, Permissions, Lineage, History, Settings
 * - Semantic field grouping by purpose (Primary Keys, Foreign Keys, Encrypted, etc.)
 * - Visual ERD integration for relationship exploration
 * - Slide-in detail panels for contextual information
 */
@RegisterClass(BaseFormComponent, 'MJ: Entities')
@Component({
  standalone: false,
    selector: 'mj-entity-form',
    templateUrl: './entity-form.component.html',
    styleUrls: ['./entity-form.component.css', '../../../shared/form-styles.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJEntityFormComponentExtended extends MJEntityFormComponent implements OnInit, OnDestroy {
    private sharedService = inject(SharedService);

    /** The Entity record being displayed */
    public record!: MJEntityEntity;

    /** Runtime EntityInfo metadata (populated from record.ID) */
    public entity: EntityInfo | null = null;

    /** All entities for relationship lookups */
    public AllEntities: EntityInfo[] = [];

    /** @deprecated Use {@link AllEntities}. */
    public get allEntities(): EntityInfo[] {
      return this.AllEntities;
    }
    /** @deprecated Use {@link AllEntities}. */
    public set allEntities(value: EntityInfo[]) {
      this.AllEntities = value;
    }

    /** All entity fields (flattened from all entities) for ERD details panel */
    public AllEntityFields: EntityFieldInfo[] = [];

    /** @deprecated Use {@link AllEntityFields}. */
    public get allEntityFields(): EntityFieldInfo[] {
      return this.AllEntityFields;
    }
    /** @deprecated Use {@link AllEntityFields}. */
    public set allEntityFields(value: EntityFieldInfo[]) {
      this.AllEntityFields = value;
    }

    /** Loading state */
    public IsExplorerLoading = true;

    /** @deprecated Use {@link IsExplorerLoading}. */
    public get isExplorerLoading() {
      return this.IsExplorerLoading;
    }
    /** @deprecated Use {@link IsExplorerLoading}. */
    public set isExplorerLoading(value) {
      this.IsExplorerLoading = value;
    }

    /** Error message if loading fails */
    public ExplorerError: string | null = null;

    /** @deprecated Use {@link ExplorerError}. */
    public get explorerError(): string | null {
      return this.ExplorerError;
    }
    /** @deprecated Use {@link ExplorerError}. */
    public set explorerError(value: string | null) {
      this.ExplorerError = value;
    }

    /** Current active section in the explorer */
    public ActiveSection: ExplorerSection = 'overview';

    /** @deprecated Use {@link ActiveSection}. */
    public get activeSection(): ExplorerSection {
      return this.ActiveSection;
    }
    /** @deprecated Use {@link ActiveSection}. */
    public set activeSection(value: ExplorerSection) {
      this.ActiveSection = value;
    }

    /** Navigation items for the rail - world-class minimalist icons */
    public NavItems: NavItem[] = [
        { id: 'overview', icon: 'fa-solid fa-house', label: 'Overview' },
        { id: 'fields', icon: 'fa-solid fa-table-cells', label: 'Fields' },
        { id: 'relationships', icon: 'fa-solid fa-diagram-project', label: 'Relations' },
        { id: 'organicKeys', icon: 'fa-solid fa-fingerprint', label: 'Organic Keys' },
        { id: 'permissions', icon: 'fa-solid fa-lock', label: 'Security' },
        { id: 'data', icon: 'fa-solid fa-table-list', label: 'Data' },
        { id: 'lineage', icon: 'fa-solid fa-code-branch', label: 'Lineage' },
        { id: 'history', icon: 'fa-solid fa-clock-rotate-left', label: 'History' },
        { id: 'settings', icon: 'fa-solid fa-sliders', label: 'Settings' }
    ];

    /** @deprecated Use {@link NavItems}. */
    public get navItems(): NavItem[] {
      return this.NavItems;
    }
    /** @deprecated Use {@link NavItems}. */
    public set navItems(value: NavItem[]) {
      this.NavItems = value;
    }

    /** Computed statistics for the entity */
    public Stats: EntityStats = {
        fieldCount: 0,
        relationshipCount: 0,
        permissionCount: 0,
        rowCount: null,
        primaryKeyCount: 0,
        foreignKeyCount: 0,
        encryptedFieldCount: 0,
        valueListFieldCount: 0
    };

    /** @deprecated Use {@link Stats}. */
    public get stats(): EntityStats {
      return this.Stats;
    }
    /** @deprecated Use {@link Stats}. */
    public set stats(value: EntityStats) {
      this.Stats = value;
    }

    /** Semantically grouped fields */
    public FieldGroups: FieldGroup[] = [];

    /** @deprecated Use {@link FieldGroups}. */
    public get fieldGroups(): FieldGroup[] {
      return this.FieldGroups;
    }
    /** @deprecated Use {@link FieldGroups}. */
    public set fieldGroups(value: FieldGroup[]) {
      this.FieldGroups = value;
    }

    /** Field search term for filtering */
    public FieldSearchTerm = '';

    /** @deprecated Use {@link FieldSearchTerm}. */
    public get fieldSearchTerm() {
      return this.FieldSearchTerm;
    }
    /** @deprecated Use {@link FieldSearchTerm}. */
    public set fieldSearchTerm(value) {
      this.FieldSearchTerm = value;
    }

    /** Set of expanded field group IDs */
    public ExpandedFieldGroups = new Set<string>();

    /** @deprecated Use {@link ExpandedFieldGroups}. */
    public get expandedFieldGroups() {
      return this.ExpandedFieldGroups;
    }
    /** @deprecated Use {@link ExpandedFieldGroups}. */
    public set expandedFieldGroups(value) {
      this.ExpandedFieldGroups = value;
    }

    /** Field view mode: grouped by category or flat list */
    public FieldViewMode: 'grouped' | 'list' = 'grouped';

    /** @deprecated Use {@link FieldViewMode}. */
    public get fieldViewMode(): 'grouped' | 'list' {
      return this.FieldViewMode;
    }
    /** @deprecated Use {@link FieldViewMode}. */
    public set fieldViewMode(value: 'grouped' | 'list') {
      this.FieldViewMode = value;
    }

    /** IS-A field groups organized by source entity */
    public IsaFieldGroups: ISAFieldGroup[] = [];

    /** @deprecated Use {@link IsaFieldGroups}. */
    public get isaFieldGroups(): ISAFieldGroup[] {
      return this.IsaFieldGroups;
    }
    /** @deprecated Use {@link IsaFieldGroups}. */
    public set isaFieldGroups(value: ISAFieldGroup[]) {
      this.IsaFieldGroups = value;
    }

    /** Child entity record counts for the IS-A parent type summary */
    public ChildEntityCounts: ChildEntityCount[] = [];

    /** @deprecated Use {@link ChildEntityCounts}. */
    public get childEntityCounts(): ChildEntityCount[] {
      return this.ChildEntityCounts;
    }
    /** @deprecated Use {@link ChildEntityCounts}. */
    public set childEntityCounts(value: ChildEntityCount[]) {
      this.ChildEntityCounts = value;
    }

    /** Whether the IS-A field inspector panel is expanded */
    public IsaFieldInspectorExpanded = true;

    /** @deprecated Use {@link IsaFieldInspectorExpanded}. */
    public get isaFieldInspectorExpanded() {
      return this.IsaFieldInspectorExpanded;
    }
    /** @deprecated Use {@link IsaFieldInspectorExpanded}. */
    public set isaFieldInspectorExpanded(value) {
      this.IsaFieldInspectorExpanded = value;
    }

    /** Field list sort configuration */
    public FieldListSortColumn: string = 'Sequence';

    /** @deprecated Use {@link FieldListSortColumn}. */
    public get fieldListSortColumn(): string {
      return this.FieldListSortColumn;
    }
    /** @deprecated Use {@link FieldListSortColumn}. */
    public set fieldListSortColumn(value: string) {
      this.FieldListSortColumn = value;
    }
    public FieldListSortDirection: 'asc' | 'desc' = 'asc';

    /** @deprecated Use {@link FieldListSortDirection}. */
    public get fieldListSortDirection(): 'asc' | 'desc' {
      return this.FieldListSortDirection;
    }
    /** @deprecated Use {@link FieldListSortDirection}. */
    public set fieldListSortDirection(value: 'asc' | 'desc') {
      this.FieldListSortDirection = value;
    }

    /** Relationship view mode toggle */
    public RelationshipViewMode: 'diagram' | 'list' = 'diagram';

    /** @deprecated Use {@link RelationshipViewMode}. */
    public get relationshipViewMode(): 'diagram' | 'list' {
      return this.RelationshipViewMode;
    }
    /** @deprecated Use {@link RelationshipViewMode}. */
    public set relationshipViewMode(value: 'diagram' | 'list') {
      this.RelationshipViewMode = value;
    }

    /** ERD depth level (1-5) */
    public ErdDepth: number = 1;

    /** @deprecated Use {@link ErdDepth}. */
    public get erdDepth(): number {
      return this.ErdDepth;
    }
    /** @deprecated Use {@link ErdDepth}. */
    public set erdDepth(value: number) {
      this.ErdDepth = value;
    }

    /** Whether the row count is loading */
    public IsRowCountLoading = false;

    /** @deprecated Use {@link IsRowCountLoading}. */
    public get isRowCountLoading() {
      return this.IsRowCountLoading;
    }
    /** @deprecated Use {@link IsRowCountLoading}. */
    public set isRowCountLoading(value) {
      this.IsRowCountLoading = value;
    }

    /** Outgoing relationships (this entity references others) */
    public OutgoingRelationships: EntityRelationshipInfo[] = [];

    /** @deprecated Use {@link OutgoingRelationships}. */
    public get outgoingRelationships(): EntityRelationshipInfo[] {
      return this.OutgoingRelationships;
    }
    /** @deprecated Use {@link OutgoingRelationships}. */
    public set outgoingRelationships(value: EntityRelationshipInfo[]) {
      this.OutgoingRelationships = value;
    }

    /** Incoming relationships (other entities reference this one) */
    public IncomingRelationships: EntityRelationshipInfo[] = [];

    /** @deprecated Use {@link IncomingRelationships}. */
    public get incomingRelationships(): EntityRelationshipInfo[] {
      return this.IncomingRelationships;
    }
    /** @deprecated Use {@link IncomingRelationships}. */
    public set incomingRelationships(value: EntityRelationshipInfo[]) {
      this.IncomingRelationships = value;
    }

    /** Grouped outgoing relationships by target entity */
    public GroupedOutgoingRelationships: GroupedOutgoingRelationship[] = [];

    /** @deprecated Use {@link GroupedOutgoingRelationships}. */
    public get groupedOutgoingRelationships(): GroupedOutgoingRelationship[] {
      return this.GroupedOutgoingRelationships;
    }
    /** @deprecated Use {@link GroupedOutgoingRelationships}. */
    public set groupedOutgoingRelationships(value: GroupedOutgoingRelationship[]) {
      this.GroupedOutgoingRelationships = value;
    }

    /** Grouped incoming relationships by source entity */
    public GroupedIncomingRelationships: GroupedIncomingRelationship[] = [];

    /** @deprecated Use {@link GroupedIncomingRelationships}. */
    public get groupedIncomingRelationships(): GroupedIncomingRelationship[] {
      return this.GroupedIncomingRelationships;
    }
    /** @deprecated Use {@link GroupedIncomingRelationships}. */
    public set groupedIncomingRelationships(value: GroupedIncomingRelationship[]) {
      this.GroupedIncomingRelationships = value;
    }

    /** Outgoing organic keys (defined on THIS entity) */
    public OrganicKeysOutgoing: OrganicKeyOutgoing[] = [];

    /** @deprecated Use {@link OrganicKeysOutgoing}. */
    public get organicKeysOutgoing(): OrganicKeyOutgoing[] {
      return this.OrganicKeysOutgoing;
    }
    /** @deprecated Use {@link OrganicKeysOutgoing}. */
    public set organicKeysOutgoing(value: OrganicKeyOutgoing[]) {
      this.OrganicKeysOutgoing = value;
    }

    /** Incoming organic keys (other entities targeting THIS entity) */
    public OrganicKeysIncoming: OrganicKeyIncoming[] = [];

    /** @deprecated Use {@link OrganicKeysIncoming}. */
    public get organicKeysIncoming(): OrganicKeyIncoming[] {
      return this.OrganicKeysIncoming;
    }
    /** @deprecated Use {@link OrganicKeysIncoming}. */
    public set organicKeysIncoming(value: OrganicKeyIncoming[]) {
      this.OrganicKeysIncoming = value;
    }

    /** Whether detail panel is open */
    public DetailPanelOpen = false;

    /** @deprecated Use {@link DetailPanelOpen}. */
    public get detailPanelOpen() {
      return this.DetailPanelOpen;
    }
    /** @deprecated Use {@link DetailPanelOpen}. */
    public set detailPanelOpen(value) {
      this.DetailPanelOpen = value;
    }

    /** Currently selected field for detail panel */
    public SelectedField: EntityFieldInfo | null = null;

    /** @deprecated Use {@link SelectedField}. */
    public get selectedField(): EntityFieldInfo | null {
      return this.SelectedField;
    }
    /** @deprecated Use {@link SelectedField}. */
    public set selectedField(value: EntityFieldInfo | null) {
      this.SelectedField = value;
    }

    /** Currently selected relationship for detail panel */
    public SelectedRelationship: EntityRelationshipInfo | null = null;

    /** @deprecated Use {@link SelectedRelationship}. */
    public get selectedRelationship(): EntityRelationshipInfo | null {
      return this.SelectedRelationship;
    }
    /** @deprecated Use {@link SelectedRelationship}. */
    public set selectedRelationship(value: EntityRelationshipInfo | null) {
      this.SelectedRelationship = value;
    }

    private destroy$ = new Subject<void>();
    private stateChange$ = new Subject<void>();
    private get _metadata() { return this.ProviderToUse; }
    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.setupStateManagement();
        this.loadExplorerData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private setupStateManagement(): void {
        this.stateChange$.pipe(
            debounceTime(100),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.cdr.markForCheck();
        });
    }

    private loadExplorerData(): void {
        this.IsExplorerLoading = true;
        this.ExplorerError = null;
        this.cdr.markForCheck();

        try {
            this.AllEntities = this._metadata.Entities;

            // Flatten all entity fields for ERD details panel
            this.AllEntityFields = this.AllEntities.flatMap(e => e.Fields);

            // Find the EntityInfo by the record's ID
            if (this.record?.ID) {
                this.entity = this.AllEntities.find(e => UUIDsEqual(e.ID, this.record.ID)) || null;
            }

            if (this.entity) {
                this.computeStats();
                this.buildFieldGroups();
                this.buildISAFieldGroups();
                this.buildRelationships();
                this.buildOrganicKeys();
                this.recomputeIsaEntityLists();
                this.updateNavBadges();

                // Load row count asynchronously (don't block UI)
                this.loadRowCountAsync();

                // Load IS-A child entity counts asynchronously
                if (this.IsParentType) {
                    this.loadChildEntityCounts();
                }
            } else {
                this.ExplorerError = `Entity metadata not found for: ${this.record?.Name || 'Unknown'}`;
            }
        } catch (err) {
            this.ExplorerError = err instanceof Error ? err.message : 'Failed to load entity metadata';
            console.error('Error loading entity explorer data:', err);
        } finally {
            this.IsExplorerLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Loads the row count asynchronously using RunView with count_only.
     * This doesn't block the UI - updates when complete.
     */
    private async loadRowCountAsync(): Promise<void> {
        if (!this.entity) return;

        this.IsRowCountLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView({
                EntityName: this.entity.Name,
                ResultType: 'count_only'
            });

            if (result.Success) {
                this.Stats = {
                    ...this.Stats,
                    rowCount: result.TotalRowCount
                };
            }
        } catch (err) {
            console.warn('Failed to load row count:', err);
            // Keep the default N/A - don't show error for this
        } finally {
            this.IsRowCountLoading = false;
            this.cdr.markForCheck();
        }
    }

    private computeStats(): void {
        if (!this.entity) return;

        const fields = this.entity.Fields;
        // Count unique outgoing relationships (fields with RelatedEntityID, grouped by target entity)
        const outgoingEntityIds = new Set(fields.filter(f => f.RelatedEntityID).map(f => f.RelatedEntityID));
        // Count unique incoming relationships (RelatedEntities, grouped by source entity)
        const incomingEntityNames = new Set(this.entity.RelatedEntities.map(r => r.RelatedEntity));

        this.Stats = {
            fieldCount: fields.length,
            relationshipCount: outgoingEntityIds.size + incomingEntityNames.size,
            permissionCount: this.entity.Permissions.length,
            rowCount: this.entity.RowCount,
            primaryKeyCount: fields.filter(f => f.IsPrimaryKey).length,
            foreignKeyCount: fields.filter(f => f.RelatedEntityID).length,
            encryptedFieldCount: fields.filter(f => f.Encrypt).length,
            valueListFieldCount: fields.filter(f => f.ValueListType !== 'None').length
        };
    }

    private buildFieldGroups(): void {
        if (!this.entity) return;

        const fields = this.entity.Fields;
        const groups: FieldGroup[] = [];

        // Primary Keys
        const primaryKeys = fields.filter(f => f.IsPrimaryKey);
        if (primaryKeys.length > 0) {
            groups.push({
                id: 'primary-keys',
                label: 'Primary Keys',
                icon: 'fa-solid fa-key',
                fields: primaryKeys,
                expanded: true
            });
        }

        // Identity Fields (Name, Code, Description, DisplayName)
        const identityFields = fields.filter(f =>
            !f.IsPrimaryKey &&
            (f.IsNameField || ['Name', 'Code', 'Description', 'DisplayName'].includes(f.Name))
        );
        if (identityFields.length > 0) {
            groups.push({
                id: 'identity',
                label: 'Identity Fields',
                icon: 'fa-solid fa-id-card',
                fields: identityFields,
                expanded: true
            });
        }

        // Foreign Keys
        const foreignKeys = fields.filter(f => f.RelatedEntityID && !f.IsPrimaryKey);
        if (foreignKeys.length > 0) {
            groups.push({
                id: 'foreign-keys',
                label: 'Foreign Keys',
                icon: 'fa-solid fa-link',
                fields: foreignKeys,
                expanded: true
            });
        }

        // Encrypted Fields
        const encryptedFields = fields.filter(f => f.Encrypt);
        if (encryptedFields.length > 0) {
            groups.push({
                id: 'encrypted',
                label: 'Encrypted Fields',
                icon: 'fa-solid fa-lock',
                fields: encryptedFields,
                expanded: false
            });
        }

        // Value List Fields
        const valueListFields = fields.filter(f => f.ValueListType !== 'None' && !f.Encrypt);
        if (valueListFields.length > 0) {
            groups.push({
                id: 'value-lists',
                label: 'Value List Fields',
                icon: 'fa-solid fa-list-check',
                fields: valueListFields,
                expanded: false
            });
        }

        // Audit Fields
        const auditFields = fields.filter(f => f.IsSpecialDateField);
        if (auditFields.length > 0) {
            groups.push({
                id: 'audit',
                label: 'Audit Fields',
                icon: 'fa-solid fa-clock',
                fields: auditFields,
                expanded: false
            });
        }

        // Remaining fields grouped by Category
        const usedFieldIds = new Set(groups.flatMap(g => g.fields.map(f => f.ID)));
        const remainingFields = fields.filter(f => !usedFieldIds.has(f.ID));

        // Group by category
        const categoryMap = new Map<string, EntityFieldInfo[]>();
        for (const field of remainingFields) {
            const category = field.Category || 'General';
            if (!categoryMap.has(category)) {
                categoryMap.set(category, []);
            }
            categoryMap.get(category)!.push(field);
        }

        // Sort categories and add as groups
        const sortedCategories = Array.from(categoryMap.keys()).sort();
        for (const category of sortedCategories) {
            const categoryFields = categoryMap.get(category)!;
            groups.push({
                id: `category-${category.toLowerCase().replace(/\s+/g, '-')}`,
                label: category,
                icon: 'fa-solid fa-folder',
                fields: categoryFields.sort((a, b) => a.Sequence - b.Sequence),
                expanded: false
            });
        }

        this.FieldGroups = groups;

        // Initialize expanded state
        for (const group of groups) {
            if (group.expanded) {
                this.ExpandedFieldGroups.add(group.id);
            }
        }
    }

    /**
     * Builds field groups organized by source entity in the IS-A hierarchy.
     * Own fields first, then parent fields, then grandparent, etc.
     */
    private buildISAFieldGroups(): void {
        if (!this.entity) return;

        const groups: ISAFieldGroup[] = [];
        const allFields = this.entity.Fields;

        // Own fields (non-virtual, or virtual but NOT inherited from parent)
        const ownFields = allFields.filter(f => !this.IsInheritedField(f));
        groups.push({
            EntityName: this.entity.Name,
            EntityInfo: this.entity,
            Label: 'Own Fields',
            Level: 0,
            Fields: ownFields.sort((a, b) => a.Sequence - b.Sequence),
            Expanded: true
        });

        // Parent chain fields, grouped by source entity
        if (this.IsChildType) {
            for (let i = 0; i < this.ParentChain.length; i++) {
                const parent = this.ParentChain[i];
                const parentFields = allFields.filter(f => {
                    const source = this.GetISAFieldSource(f);
                    return source === parent.Name;
                });

                if (parentFields.length > 0) {
                    const levelLabel = i === 0 ? 'parent' : i === 1 ? 'grandparent' : `ancestor level ${i + 1}`;
                    groups.push({
                        EntityName: parent.Name,
                        EntityInfo: parent,
                        Label: `Inherited from ${parent.Name} (${levelLabel})`,
                        Level: i + 1,
                        Fields: parentFields.sort((a, b) => a.Sequence - b.Sequence),
                        Expanded: true
                    });
                }
            }
        }

        this.IsaFieldGroups = groups;
    }

    /**
     * Loads record counts for each IS-A child entity type asynchronously.
     */
    private async loadChildEntityCounts(): Promise<void> {
        if (!this.entity || !this.IsParentType) return;

        // Initialize with loading state
        this.ChildEntityCounts = this.ChildEntities.map(child => ({
            EntityName: child.Name,
            EntityInfo: child,
            RecordCount: null,
            IsLoading: true
        }));
        this.cdr.markForCheck();

        // Load counts in parallel using count_only for efficiency
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const countPromises = this.ChildEntities.map(async (child, index) => {
            const result = await rv.RunView({
                EntityName: child.Name,
                ExtraFilter: '',
                ResultType: 'count_only'
            });

            if (this.ChildEntityCounts[index]) {
                this.ChildEntityCounts[index].RecordCount = result?.TotalRowCount ?? 0;
                this.ChildEntityCounts[index].IsLoading = false;
            }
        });

        await Promise.all(countPromises);
        this.cdr.markForCheck();
    }

    private buildRelationships(): void {
        if (!this.entity) return;

        // Incoming: Relationships defined on this entity (other entities that reference this one)
        this.IncomingRelationships = this.entity.RelatedEntities;

        // Outgoing relationships could be computed from fields with RelatedEntityID
        this.OutgoingRelationships = [];

        // Build grouped outgoing relationships (fields on THIS entity that reference OTHER entities)
        const outgoingMap = new Map<string, GroupedOutgoingRelationship>();
        for (const field of this.entity.Fields) {
            if (field.RelatedEntityID) {
                const existing = outgoingMap.get(field.RelatedEntityID);
                if (existing) {
                    existing.fields.push(field);
                } else {
                    const relatedEntity = this.AllEntities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
                    outgoingMap.set(field.RelatedEntityID, {
                        entityId: field.RelatedEntityID,
                        entityName: relatedEntity?.Name || field.RelatedEntity || 'Unknown',
                        fields: [field]
                    });
                }
            }
        }
        this.GroupedOutgoingRelationships = Array.from(outgoingMap.values())
            .sort((a, b) => a.entityName.localeCompare(b.entityName));

        // Build grouped incoming relationships (fields on OTHER entities that reference THIS entity)
        // Group by RelatedEntity name (the entity that references this one), deduplicate fields
        const incomingMap = new Map<string, GroupedIncomingRelationship>();
        for (const rel of this.entity.RelatedEntities) {
            // rel.RelatedEntity is the entity that has the FK pointing to THIS entity
            const existing = incomingMap.get(rel.RelatedEntity);
            if (existing) {
                // Only add if this field name isn't already in the list
                const fieldExists = existing.fields.some(f => f.fieldName === rel.RelatedEntityJoinField);
                if (!fieldExists) {
                    existing.fields.push({
                        fieldName: rel.RelatedEntityJoinField,
                        type: rel.Type,
                        bundleInAPI: rel.BundleInAPI
                    });
                }
            } else {
                incomingMap.set(rel.RelatedEntity, {
                    entityName: rel.RelatedEntity,
                    fields: [{
                        fieldName: rel.RelatedEntityJoinField,
                        type: rel.Type,
                        bundleInAPI: rel.BundleInAPI
                    }]
                });
            }
        }
        this.GroupedIncomingRelationships = Array.from(incomingMap.values())
            .sort((a, b) => a.entityName.localeCompare(b.entityName));
    }

    private buildOrganicKeys(): void {
        if (!this.entity) return;

        // Outgoing: organic keys defined ON this entity
        this.OrganicKeysOutgoing = this.entity.OrganicKeys.map(ok => ({
            OrganicKey: ok,
            RelatedEntities: ok.RelatedEntities.map(re => {
                const relEntity = this.AllEntities.find(e => UUIDsEqual(e.ID, re.RelatedEntityID));
                return {
                    Info: re,
                    EntityName: re.RelatedEntity || relEntity?.Name || 'Unknown',
                    EntityIcon: relEntity?.Icon || 'fa-solid fa-table',
                };
            }),
        }));

        // Incoming: organic keys on OTHER entities that reference THIS entity
        this.OrganicKeysIncoming = [];
        for (const otherEntity of this.AllEntities) {
            if (UUIDsEqual(otherEntity.ID, this.entity.ID)) continue;
            for (const ok of otherEntity.OrganicKeys) {
                for (const re of ok.RelatedEntities) {
                    if (UUIDsEqual(re.RelatedEntityID, this.entity.ID)) {
                        this.OrganicKeysIncoming.push({
                            SourceEntityID: otherEntity.ID,
                            SourceEntityName: otherEntity.Name,
                            SourceEntityIcon: otherEntity.Icon || 'fa-solid fa-table',
                            OrganicKey: ok,
                            RelatedEntityConfig: re,
                            MatchType: re.IsTransitiveMatch ? 'Transitive' : 'Direct',
                        });
                    }
                }
            }
        }
    }

    /**
     * Navigate to the Entity admin form for a given entity ID.
     */
    public NavigateToEntityByID(entityID: string): void {
        this.sharedService.OpenEntityRecord('MJ: Entities', CompositeKey.FromID(entityID));
    }

    /** Total organic key connection count (outgoing targets + incoming sources) */
    get OrganicKeyTotalCount(): number {
        const outCount = this.OrganicKeysOutgoing.reduce((sum, ok) => sum + ok.RelatedEntities.length, 0);
        return outCount + this.OrganicKeysIncoming.length;
    }

    private updateNavBadges(): void {
        if (!this.entity) return;

        this.NavItems = this.NavItems.map(item => {
            switch (item.id) {
                case 'fields':
                    return { ...item, badge: this.Stats.fieldCount };
                case 'relationships':
                    return { ...item, badge: this.Stats.relationshipCount };
                case 'organicKeys':
                    return { ...item, badge: this.OrganicKeyTotalCount > 0 ? this.OrganicKeyTotalCount : undefined };
                case 'permissions':
                    return { ...item, badge: this.Stats.permissionCount };
                default:
                    return item;
            }
        });
    }

    // === Public Methods ===

    public SetActiveSection(section: ExplorerSection): void {
        this.ActiveSection = section;
        this.CloseDetailPanel();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SetActiveSection}. */
    public setActiveSection(section: ExplorerSection): void {
      return this.SetActiveSection(section);
    }

    public get FormChromeConfig(): IEntityFormConfiguration | null {
        return this.record?.ConfigurationObject?.UI?.Form ?? null;
    }

    public get FormChromeCandidates(): RelatedFormRoleCandidate[] {
        if (!this.entity) return [];
        return this.entity.RelatedEntities.map((rel) => ({
            ID: rel.ID,
            RelatedEntity: rel.RelatedEntity,
            RelatedEntityID: rel.RelatedEntityID,
            RelatedEntityJoinField: rel.RelatedEntityJoinField,
            RelatedEntitySchemaName: this.AllEntities.find((e) => UUIDsEqual(e.ID, rel.RelatedEntityID))?.SchemaName ?? '',
            DisplayInForm: rel.DisplayInForm,
            DisplayLocation: rel.DisplayLocation,
            DisplayComponentID: rel.DisplayComponentID,
            RelatedRecordCollection: rel.RelatedRecordCollection,
            JoinView: rel.JoinView,
            Type: rel.Type,
            Sequence: rel.Sequence,
            Configuration: rel.Configuration,
        }));
    }

    public OnFormChromeConfigChange(form: IEntityFormConfiguration): void {
        if (!this.record) return;
        const current: IEntityConfiguration = this.record.ConfigurationObject ?? {};
        this.record.ConfigurationObject = {
            ...current,
            UI: { ...(current.UI ?? {}), Form: form },
        };
        this.cdr.markForCheck();
    }

    /**
     * Handle record opened from the entity viewer (double-click or open button).
     * Emits a Navigate event so the host app can open the record.
     */
    public OnRecordOpened(event: RecordOpenedEvent): void {
        this.Navigate.emit({
            Kind: 'record',
            EntityName: event.entity.Name,
            PrimaryKey: event.compositeKey
        });
    }

    /**
     * Handle add requested from the entity viewer toolbar.
     * Emits a Navigate event to create a new record of this entity type.
     */
    public OnAddRequested(): void {
        if (this.entity) {
            this.Navigate.emit({
                Kind: 'new-record',
                EntityName: this.entity.Name,
                DefaultValues: {}
            });
        }
    }

    public ToggleFieldGroup(groupId: string): void {
        if (this.ExpandedFieldGroups.has(groupId)) {
            this.ExpandedFieldGroups.delete(groupId);
        } else {
            this.ExpandedFieldGroups.add(groupId);
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleFieldGroup}. */
    public toggleFieldGroup(groupId: string): void {
      return this.ToggleFieldGroup(groupId);
    }

    /**
     * Applies the expanded/collapsed state emitted by an mj-accordion-panel for a
     * field group. Sets (not flips) the value so it stays in sync with the panel,
     * and marks for check (OnPush change detection).
     */
    public OnFieldGroupExpandedChange(groupId: string, expanded: boolean): void {
        if (expanded) {
            this.ExpandedFieldGroups.add(groupId);
        } else {
            this.ExpandedFieldGroups.delete(groupId);
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnFieldGroupExpandedChange}. */
    public onFieldGroupExpandedChange(groupId: string, expanded: boolean): void {
      return this.OnFieldGroupExpandedChange(groupId, expanded);
    }

    public IsFieldGroupExpanded(groupId: string): boolean {
        return this.ExpandedFieldGroups.has(groupId);
    }

    /** @deprecated Use {@link IsFieldGroupExpanded}. */
    public isFieldGroupExpanded(groupId: string): boolean {
      return this.IsFieldGroupExpanded(groupId);
    }

    public ExpandAllFieldGroups(): void {
        for (const group of this.FieldGroups) {
            this.ExpandedFieldGroups.add(group.id);
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ExpandAllFieldGroups}. */
    public expandAllFieldGroups(): void {
      return this.ExpandAllFieldGroups();
    }

    public CollapseAllFieldGroups(): void {
        this.ExpandedFieldGroups.clear();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link CollapseAllFieldGroups}. */
    public collapseAllFieldGroups(): void {
      return this.CollapseAllFieldGroups();
    }

    public get AllFieldGroupsExpanded(): boolean {
        return this.FieldGroups.length > 0 &&
               this.FieldGroups.every(g => this.ExpandedFieldGroups.has(g.id));
    }

    /** @deprecated Use {@link AllFieldGroupsExpanded}. */
    public get allFieldGroupsExpanded(): boolean {
      return this.AllFieldGroupsExpanded;
    }

    public get AllFieldGroupsCollapsed(): boolean {
        return this.ExpandedFieldGroups.size === 0;
    }

    /** @deprecated Use {@link AllFieldGroupsCollapsed}. */
    public get allFieldGroupsCollapsed(): boolean {
      return this.AllFieldGroupsCollapsed;
    }

    /**
     * Get all fields for the list view with sorting and filtering applied.
     */
    public GetFilteredFieldsList(): EntityFieldInfo[] {
        if (!this.entity) return [];
        let fields = [...this.entity.Fields];

        // Apply search filter
        if (this.FieldSearchTerm) {
            const term = this.FieldSearchTerm.toLowerCase();
            fields = fields.filter(f =>
                f.Name.toLowerCase().includes(term) ||
                (f.DisplayName && f.DisplayName.toLowerCase().includes(term)) ||
                (f.Description && f.Description.toLowerCase().includes(term)) ||
                f.Type.toLowerCase().includes(term)
            );
        }

        // Apply sorting
        fields.sort((a, b) => {
            const col = this.FieldListSortColumn;
            const dir = this.FieldListSortDirection === 'asc' ? 1 : -1;

            let aVal = this.getFieldSortValue(a, col);
            let bVal = this.getFieldSortValue(b, col);

            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return aVal.localeCompare(bVal) * dir;
            }
            if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
                return (aVal === bVal ? 0 : aVal ? -1 : 1) * dir;
            }
            return ((aVal as number) - (bVal as number)) * dir;
        });

        return fields;
    }

    /** @deprecated Use {@link GetFilteredFieldsList}. */
    public getFilteredFieldsList(): EntityFieldInfo[] {
      return this.GetFilteredFieldsList();
    }

    private getFieldSortValue(field: EntityFieldInfo, column: string): string | number | boolean | null {
        switch (column) {
            case 'Sequence': return field.Sequence;
            case 'Name': return field.Name;
            case 'DisplayName': return field.DisplayName || field.Name;
            case 'Type': return field.Type;
            case 'Length': return field.Length;
            case 'AllowsNull': return field.AllowsNull;
            case 'Description': return field.Description || '';
            default: return field.Sequence;
        }
    }

    public SortFieldList(column: string): void {
        if (this.FieldListSortColumn === column) {
            this.FieldListSortDirection = this.FieldListSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.FieldListSortColumn = column;
            this.FieldListSortDirection = 'asc';
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SortFieldList}. */
    public sortFieldList(column: string): void {
      return this.SortFieldList(column);
    }

    public SelectField(field: EntityFieldInfo): void {
        this.SelectedField = field;
        this.SelectedRelationship = null;
        this.DetailPanelOpen = true;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SelectField}. */
    public selectField(field: EntityFieldInfo): void {
      return this.SelectField(field);
    }

    public SelectRelationship(relationship: EntityRelationshipInfo): void {
        this.SelectedRelationship = relationship;
        this.SelectedField = null;
        this.DetailPanelOpen = true;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SelectRelationship}. */
    public selectRelationship(relationship: EntityRelationshipInfo): void {
      return this.SelectRelationship(relationship);
    }

    public CloseDetailPanel(): void {
        this.DetailPanelOpen = false;
        this.SelectedField = null;
        this.SelectedRelationship = null;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link CloseDetailPanel}. */
    public closeDetailPanel(): void {
      return this.CloseDetailPanel();
    }

    public ToggleRelationshipView(): void {
        this.RelationshipViewMode = this.RelationshipViewMode === 'diagram' ? 'list' : 'diagram';
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleRelationshipView}. */
    public toggleRelationshipView(): void {
      return this.ToggleRelationshipView();
    }

    /**
     * Change the ERD depth level.
     */
    public SetErdDepth(depth: number): void {
        if (depth >= 1 && depth <= 5) {
            this.ErdDepth = depth;
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link SetErdDepth}. */
    public setErdDepth(depth: number): void {
      return this.SetErdDepth(depth);
    }

    /**
     * Handle open record from the ERD composite component.
     * Navigates to the selected entity's form using SharedService.
     */
    public OnERDOpenRecord(event: { EntityName: string; RecordID: string }): void {
        // The ERD can open any entity — resolve its key column(s) from metadata, not a hardcoded ID.
        const pkey = CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(event.EntityName), event.RecordID);
        this.sharedService.OpenEntityRecord(event.EntityName, pkey);
    }

    /** @deprecated Use {@link OnERDOpenRecord}. */
    public onERDOpenRecord(event: { EntityName: string; RecordID: string }): void {
      return this.OnERDOpenRecord(event);
    }

    /**
     * Handle ERD composite state changes (for future persistence if needed).
     */
    public OnERDStateChange(_state: ERDCompositeState): void {
        // ERD composite now handles all internal state management
        // This handler is kept for potential future state persistence needs
    }

    /** @deprecated Use {@link OnERDStateChange}. */
    public onERDStateChange(_state: ERDCompositeState): void {
      return this.OnERDStateChange(_state);
    }

    public OnFieldSearch(term: string): void {
        this.FieldSearchTerm = term.toLowerCase();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnFieldSearch}. */
    public onFieldSearch(term: string): void {
      return this.OnFieldSearch(term);
    }

    public GetFilteredFieldGroups(): FieldGroup[] {
        if (!this.FieldSearchTerm) {
            return this.FieldGroups;
        }

        return this.FieldGroups
            .map(group => ({
                ...group,
                fields: group.fields.filter(f =>
                    f.Name.toLowerCase().includes(this.FieldSearchTerm) ||
                    (f.DisplayName && f.DisplayName.toLowerCase().includes(this.FieldSearchTerm)) ||
                    (f.Description && f.Description.toLowerCase().includes(this.FieldSearchTerm))
                )
            }))
            .filter(group => group.fields.length > 0);
    }

    /** @deprecated Use {@link GetFilteredFieldGroups}. */
    public getFilteredFieldGroups(): FieldGroup[] {
      return this.GetFilteredFieldGroups();
    }

    // === Computed Getters ===

    // === IS-A Type Relationship Computed Properties ===

    /** Whether this entity is a virtual entity (read-only view) */
    public get IsVirtualEntity(): boolean {
        return this.entity?.VirtualEntity === true;
    }

    /** Whether this entity is a child type in an IS-A relationship */
    public get IsChildType(): boolean {
        return this.entity?.IsChildType === true;
    }

    /** Whether this entity is a parent type in an IS-A relationship */
    public get IsParentType(): boolean {
        return this.entity?.IsParentType === true;
    }

    /** Whether this entity allows overlapping subtypes (multiple children per parent record) */
    public get HasOverlappingSubtypes(): boolean {
        return this.entity?.HasOverlappingSubtypes === true;
    }

    /** The parent chain for IS-A child entities */
    public get ParentChain(): EntityInfo[] {
        return this.entity?.ParentChain ?? [];
    }

    /** Child entities for IS-A parent entities */
    public get ChildEntities(): EntityInfo[] {
        return this.entity?.ChildEntities ?? [];
    }

    /** Whether this entity has any IS-A relationship (parent or child) */
    public get HasISARelationship(): boolean {
        return this.IsChildType || this.IsParentType;
    }

    /** IS-A breadcrumb string: "Webinar IS-A Meeting IS-A Product" */
    public get IsaBreadcrumb(): string {
        if (!this.entity?.IsChildType) return '';
        const chain = [this.entity, ...this.entity.ParentChain];
        return chain.map(e => e.Name).join(' IS-A ');
    }

    /** Number of fields inherited from parent entities */
    public get InheritedFieldCount(): number {
        return this.entity?.AllParentFields?.length ?? 0;
    }

    /** Navigate to an entity record in the Entity Explorer */
    public NavigateToEntity(entityInfo: EntityInfo): void {
        this.sharedService.OpenEntityRecord('MJ: Entities', CompositeKey.FromID(entityInfo.ID));
    }

    /**
     * Returns the source entity name for an IS-A inherited field, or null if the
     * field is owned by this entity. Used for displaying field source badges.
     */
    public GetISAFieldSource(field: EntityFieldInfo): string | null {
        if (!this.IsChildType || !field.IsVirtual || !field.AllowUpdateAPI) return null;
        for (const parent of this.ParentChain) {
            const parentField = parent.Fields.find(
                pf => pf.Name === field.Name && !pf.IsVirtual
            );
            if (parentField) return parent.Name;
        }
        return this.ParentChain[0]?.Name ?? null;
    }

    /**
     * Returns true if the given field is inherited from a parent entity via IS-A.
     */
    public IsInheritedField(field: EntityFieldInfo): boolean {
        return this.GetISAFieldSource(field) !== null;
    }

    /**
     * All entities available as potential IS-A parents (excluding self and
     * descendants), sorted by name. Precomputed by {@link recomputeIsaEntityLists}
     * whenever {@link entity} changes — previously a getter that filtered/sorted
     * `md.Entities` (hundreds of rows) with per-item `UUIDsEqual` on every CD
     * cycle while bound inside a template `@for`.
     */
    public AvailableParentEntities: EntityInfo[] = [];

    /**
     * Sibling entities that share the same IS-A parent type. Precomputed by
     * {@link recomputeIsaEntityLists} when {@link entity} changes — previously a
     * per-CD getter filtering `ParentEntityInfo.ChildEntities` with `UUIDsEqual`.
     */
    public SiblingEntities: EntityInfo[] = [];

    /**
     * Recomputes {@link AvailableParentEntities} and {@link SiblingEntities} from
     * the current {@link entity}. Called from `loadExplorerData()` once the entity
     * metadata is resolved — never during change detection.
     *
     * Accepted staleness tradeoff: these IS-A lists are built from `md.Entities`
     * once per entity-load and are NOT reactive — a mid-session metadata reload
     * (a newly added/removed entity) would not refresh them until this form
     * re-loads. That is acceptable for the entity form (its IS-A parent/sibling
     * set is effectively static within an editing session); we deliberately do
     * NOT wire observable reactivity here. The former getters re-filtered/sorted
     * hundreds of rows on every CD, which was the perf cost we removed.
     */
    private recomputeIsaEntityLists(): void {
        if (!this.entity) {
            this.AvailableParentEntities = [];
            this.SiblingEntities = [];
            return;
        }

        const md = this.ProviderToUse;
        const descendantIds = new Set<string>();
        const collectDescendants = (e: EntityInfo): void => {
            descendantIds.add(e.ID);
            for (const child of e.ChildEntities) {
                collectDescendants(child);
            }
        };
        collectDescendants(this.entity);
        this.AvailableParentEntities = md.Entities
            .filter(e => !descendantIds.has(e.ID) && !UUIDsEqual(e.ID, this.entity!.ID) && !e.VirtualEntity)
            .sort((a, b) => a.Name.localeCompare(b.Name));

        if (this.IsChildType && this.entity.ParentEntityInfo) {
            this.SiblingEntities = this.entity.ParentEntityInfo.ChildEntities
                .filter(e => !UUIDsEqual(e.ID, this.entity!.ID));
        } else {
            this.SiblingEntities = [];
        }
    }

    public get StatusClass(): string {
        if (!this.entity) return '';
        switch (this.entity.Status) {
            case 'Active': return 'status-active';
            case 'Deprecated': return 'status-deprecated';
            case 'Disabled': return 'status-disabled';
            default: return '';
        }
    }

    /** @deprecated Use {@link StatusClass}. */
    public get statusClass(): string {
      return this.StatusClass;
    }

    public get EntityIcon(): string {
        return this.entity?.Icon || 'fa-solid fa-database';
    }

    /** @deprecated Use {@link EntityIcon}. */
    public get entityIcon(): string {
      return this.EntityIcon;
    }

    public get EntityDisplayName(): string {
        if (!this.entity) return '';
        return this.entity.DisplayName || this.entity.Name;
    }

    /** @deprecated Use {@link EntityDisplayName}. */
    public get entityDisplayName(): string {
      return this.EntityDisplayName;
    }

    public get FormattedRowCount(): string {
        if (this.Stats.rowCount === null) return 'N/A';
        return this.Stats.rowCount.toLocaleString();
    }

    /** @deprecated Use {@link FormattedRowCount}. */
    public get formattedRowCount(): string {
      return this.FormattedRowCount;
    }

    public get CapabilitySummary(): string[] {
        if (!this.entity) return [];
        const caps: string[] = [];
        if (this.entity.IncludeInAPI) caps.push('API');
        if (this.entity.AllowCreateAPI) caps.push('Create');
        if (this.entity.AllowUpdateAPI) caps.push('Update');
        if (this.entity.AllowDeleteAPI) caps.push('Delete');
        if (this.entity.TrackRecordChanges) caps.push('Track Changes');
        if (this.entity.FullTextSearchEnabled) caps.push('FTS');
        return caps;
    }

    /** @deprecated Use {@link CapabilitySummary}. */
    public get capabilitySummary(): string[] {
      return this.CapabilitySummary;
    }

    public GetFieldTypeIcon(field: EntityFieldInfo): string {
        if (field.IsPrimaryKey) return 'fa-solid fa-key';
        if (field.RelatedEntityID) return 'fa-solid fa-link';
        if (field.Encrypt) return 'fa-solid fa-lock';
        if (field.ValueListType !== 'None') return 'fa-solid fa-list';
        if (field.IsSpecialDateField) return 'fa-solid fa-clock';

        // Type-based icons
        switch (field.TSType) {
            case 'number': return 'fa-solid fa-hashtag';
            case 'boolean': return 'fa-solid fa-toggle-on';
            case 'Date': return 'fa-solid fa-calendar';
            default: return 'fa-solid fa-font';
        }
    }

    /** @deprecated Use {@link GetFieldTypeIcon}. */
    public getFieldTypeIcon(field: EntityFieldInfo): string {
      return this.GetFieldTypeIcon(field);
    }

    public GetRelatedEntityName(field: EntityFieldInfo): string | null {
        if (!field.RelatedEntityID) return null;
        const related = this.AllEntities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
        return related?.Name || null;
    }

    /** @deprecated Use {@link GetRelatedEntityName}. */
    public getRelatedEntityName(field: EntityFieldInfo): string | null {
      return this.GetRelatedEntityName(field);
    }

    public GetRelatedEntity(field: EntityFieldInfo): EntityInfo | null {
        if (!field.RelatedEntityID) return null;
        return this.AllEntities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID)) || null;
    }

    /** @deprecated Use {@link GetRelatedEntity}. */
    public getRelatedEntity(field: EntityFieldInfo): EntityInfo | null {
      return this.GetRelatedEntity(field);
    }

    public NavigateToRelatedEntity(field: EntityFieldInfo): void {
        const related = this.GetRelatedEntity(field);
        if (related) {
            this.sharedService.OpenEntityRecord('MJ: Entities', CompositeKey.FromID(related.ID));
        }
    }

    /** @deprecated Use {@link NavigateToRelatedEntity}. */
    public navigateToRelatedEntity(field: EntityFieldInfo): void {
      return this.NavigateToRelatedEntity(field);
    }

    /**
     * Open an entity record from the field detail panel.
     */
    public OpenRelatedEntityFromField(entityId: string): void {
        if (entityId) {
            this.sharedService.OpenEntityRecord('MJ: Entities', CompositeKey.FromID(entityId));
        }
    }

    /** @deprecated Use {@link OpenRelatedEntityFromField}. */
    public openRelatedEntityFromField(entityId: string): void {
      return this.OpenRelatedEntityFromField(entityId);
    }

    public FormatFieldType(field: EntityFieldInfo): string {
        let type = field.Type;
        if (field.Length && field.Length > 0) {
            type += `(${field.Length})`;
        } else if (field.Precision && field.Scale !== undefined) {
            type += `(${field.Precision},${field.Scale})`;
        }
        return type;
    }

    /** @deprecated Use {@link FormatFieldType}. */
    public formatFieldType(field: EntityFieldInfo): string {
      return this.FormatFieldType(field);
    }

    /**
     * Get the role name for a permission entry.
     * The EntityPermissionInfo.Role property is not populated because the database view
     * returns 'RoleName' but the class expects 'Role'. This helper looks up the role
     * from the Metadata.Roles collection using the RoleID.
     */
    public GetRoleName(perm: EntityPermissionInfo): string {
        if (!perm.RoleID) return 'Unknown';
        const role = this._metadata.Roles.find(r => UUIDsEqual(r.ID, perm.RoleID));
        return role?.Name || 'Unknown';
    }

    /** @deprecated Use {@link GetRoleName}. */
    public getRoleName(perm: EntityPermissionInfo): string {
      return this.GetRoleName(perm);
    }

    /**
     * Checks if a string value is valid JSON (object or array).
     */
    public IsJsonValue(value: string): boolean {
        if (!value || typeof value !== 'string') return false;
        const trimmed = value.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
        try {
            JSON.parse(trimmed);
            return true;
        } catch {
            return false;
        }
    }

    /** @deprecated Use {@link IsJsonValue}. */
    public isJsonValue(value: string): boolean {
      return this.IsJsonValue(value);
    }

    /**
     * Formats a JSON string for display with proper indentation.
     */
    /** Case-insensitive UUID check whether an entity field is the currently selected field. */
    public IsFieldSelected(field: EntityFieldInfo): boolean {
        return UUIDsEqual(this.SelectedField?.ID, field.ID);
    }

    public FormatJsonValue(value: string): string {
        if (!value) return '';
        try {
            const parsed = JSON.parse(value.trim());
            return JSON.stringify(parsed, null, 2);
        } catch {
            return value;
        }
    }

    /** @deprecated Use {@link FormatJsonValue}. */
    public formatJsonValue(value: string): string {
      return this.FormatJsonValue(value);
    }
}
