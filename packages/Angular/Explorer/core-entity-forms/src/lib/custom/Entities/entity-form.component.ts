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
    EntityPermissionInfo,
    Metadata,
    CompositeKey,
    RunView
} from '@memberjunction/core';
import { MJEntityEntity } from '@memberjunction/core-entities';
import { ERDCompositeState } from '@memberjunction/ng-entity-relationship-diagram';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { MJEntityFormComponent } from '../../generated/Entities/MJEntity/mjentity.form.component';

export type ExplorerSection =
    | 'overview'
    | 'fields'
    | 'relationships'
    | 'permissions'
    | 'lineage'
    | 'history'
    | 'settings';

export interface NavItem {
    id: ExplorerSection;
    icon: string;
    label: string;
    badge?: number;
}

export interface EntityStats {
    fieldCount: number;
    relationshipCount: number;
    permissionCount: number;
    rowCount: number | null;
    primaryKeyCount: number;
    foreignKeyCount: number;
    encryptedFieldCount: number;
    valueListFieldCount: number;
}

export interface FieldGroup {
    id: string;
    label: string;
    icon: string;
    fields: EntityFieldInfo[];
    expanded: boolean;
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
    entityId: string;
    entityName: string;
    /** All fields on THIS entity that reference the target entity */
    fields: EntityFieldInfo[];
}

/**
 * Grouped incoming relationship - an entity that references this entity
 */
export interface GroupedIncomingRelationship {
    /** The entity that references this entity */
    entityName: string;
    /** All fields on the OTHER entity that reference THIS entity */
    fields: { fieldName: string; type: string; bundleInAPI: boolean }[];
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
export class EntityFormComponentExtended extends MJEntityFormComponent implements OnInit, OnDestroy {
    private sharedService = inject(SharedService);

    /** The Entity record being displayed */
    public record!: MJEntityEntity;

    /** Runtime EntityInfo metadata (populated from record.ID) */
    public entity: EntityInfo | null = null;

    /** All entities for relationship lookups */
    public allEntities: EntityInfo[] = [];

    /** All entity fields (flattened from all entities) for ERD details panel */
    public allEntityFields: EntityFieldInfo[] = [];

    /** Loading state */
    public isExplorerLoading = true;

    /** Error message if loading fails */
    public explorerError: string | null = null;

    /** Current active section in the explorer */
    public activeSection: ExplorerSection = 'overview';

    /** Navigation items for the rail - world-class minimalist icons */
    public navItems: NavItem[] = [
        { id: 'overview', icon: 'fa-solid fa-house', label: 'Overview' },
        { id: 'fields', icon: 'fa-solid fa-table-cells', label: 'Fields' },
        { id: 'relationships', icon: 'fa-solid fa-diagram-project', label: 'Relations' },
        { id: 'permissions', icon: 'fa-solid fa-lock', label: 'Security' },
        { id: 'lineage', icon: 'fa-solid fa-code-branch', label: 'Lineage' },
        { id: 'history', icon: 'fa-solid fa-clock-rotate-left', label: 'History' },
        { id: 'settings', icon: 'fa-solid fa-sliders', label: 'Settings' }
    ];

    /** Computed statistics for the entity */
    public stats: EntityStats = {
        fieldCount: 0,
        relationshipCount: 0,
        permissionCount: 0,
        rowCount: null,
        primaryKeyCount: 0,
        foreignKeyCount: 0,
        encryptedFieldCount: 0,
        valueListFieldCount: 0
    };

    /** Semantically grouped fields */
    public fieldGroups: FieldGroup[] = [];

    /** Field search term for filtering */
    public fieldSearchTerm = '';

    /** Set of expanded field group IDs */
    public expandedFieldGroups = new Set<string>();

    /** Field view mode: grouped by category or flat list */
    public fieldViewMode: 'grouped' | 'list' = 'grouped';

    /** IS-A field groups organized by source entity */
    public isaFieldGroups: ISAFieldGroup[] = [];

    /** Child entity record counts for the IS-A parent type summary */
    public childEntityCounts: ChildEntityCount[] = [];

    /** Whether the IS-A field inspector panel is expanded */
    public isaFieldInspectorExpanded = true;

    /** Field list sort configuration */
    public fieldListSortColumn: string = 'Sequence';
    public fieldListSortDirection: 'asc' | 'desc' = 'asc';

    /** Relationship view mode toggle */
    public relationshipViewMode: 'diagram' | 'list' = 'diagram';

    /** ERD depth level (1-5) */
    public erdDepth: number = 1;

    /** Whether the row count is loading */
    public isRowCountLoading = false;

    /** Outgoing relationships (this entity references others) */
    public outgoingRelationships: EntityRelationshipInfo[] = [];

    /** Incoming relationships (other entities reference this one) */
    public incomingRelationships: EntityRelationshipInfo[] = [];

    /** Grouped outgoing relationships by target entity */
    public groupedOutgoingRelationships: GroupedOutgoingRelationship[] = [];

    /** Grouped incoming relationships by source entity */
    public groupedIncomingRelationships: GroupedIncomingRelationship[] = [];

    /** Whether detail panel is open */
    public detailPanelOpen = false;

    /** Currently selected field for detail panel */
    public selectedField: EntityFieldInfo | null = null;

    /** Currently selected relationship for detail panel */
    public selectedRelationship: EntityRelationshipInfo | null = null;

    private destroy$ = new Subject<void>();
    private stateChange$ = new Subject<void>();
    private _metadata = new Metadata();

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
        this.isExplorerLoading = true;
        this.explorerError = null;
        this.cdr.markForCheck();

        try {
            this.allEntities = this._metadata.Entities;

            // Flatten all entity fields for ERD details panel
            this.allEntityFields = this.allEntities.flatMap(e => e.Fields);

            // Find the EntityInfo by the record's ID
            if (this.record?.ID) {
                this.entity = this.allEntities.find(e => e.ID === this.record.ID) || null;
            }

            if (this.entity) {
                this.computeStats();
                this.buildFieldGroups();
                this.buildISAFieldGroups();
                this.buildRelationships();
                this.updateNavBadges();

                // Load row count asynchronously (don't block UI)
                this.loadRowCountAsync();

                // Load IS-A child entity counts asynchronously
                if (this.IsParentType) {
                    this.loadChildEntityCounts();
                }
            } else {
                this.explorerError = `Entity metadata not found for: ${this.record?.Name || 'Unknown'}`;
            }
        } catch (err) {
            this.explorerError = err instanceof Error ? err.message : 'Failed to load entity metadata';
            console.error('Error loading entity explorer data:', err);
        } finally {
            this.isExplorerLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Loads the row count asynchronously using RunView with count_only.
     * This doesn't block the UI - updates when complete.
     */
    private async loadRowCountAsync(): Promise<void> {
        if (!this.entity) return;

        this.isRowCountLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: this.entity.Name,
                ResultType: 'count_only'
            });

            if (result.Success) {
                this.stats = {
                    ...this.stats,
                    rowCount: result.TotalRowCount
                };
            }
        } catch (err) {
            console.warn('Failed to load row count:', err);
            // Keep the default N/A - don't show error for this
        } finally {
            this.isRowCountLoading = false;
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

        this.stats = {
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

        this.fieldGroups = groups;

        // Initialize expanded state
        for (const group of groups) {
            if (group.expanded) {
                this.expandedFieldGroups.add(group.id);
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

        this.isaFieldGroups = groups;
    }

    /**
     * Loads record counts for each IS-A child entity type asynchronously.
     */
    private async loadChildEntityCounts(): Promise<void> {
        if (!this.entity || !this.IsParentType) return;

        // Initialize with loading state
        this.childEntityCounts = this.ChildEntities.map(child => ({
            EntityName: child.Name,
            EntityInfo: child,
            RecordCount: null,
            IsLoading: true
        }));
        this.cdr.markForCheck();

        // Load counts in parallel using count_only for efficiency
        const rv = new RunView();
        const countPromises = this.ChildEntities.map(async (child, index) => {
            const result = await rv.RunView({
                EntityName: child.Name,
                ExtraFilter: '',
                ResultType: 'count_only'
            });

            if (this.childEntityCounts[index]) {
                this.childEntityCounts[index].RecordCount = result?.TotalRowCount ?? 0;
                this.childEntityCounts[index].IsLoading = false;
            }
        });

        await Promise.all(countPromises);
        this.cdr.markForCheck();
    }

    private buildRelationships(): void {
        if (!this.entity) return;

        // Incoming: Relationships defined on this entity (other entities that reference this one)
        this.incomingRelationships = this.entity.RelatedEntities;

        // Outgoing relationships could be computed from fields with RelatedEntityID
        this.outgoingRelationships = [];

        // Build grouped outgoing relationships (fields on THIS entity that reference OTHER entities)
        const outgoingMap = new Map<string, GroupedOutgoingRelationship>();
        for (const field of this.entity.Fields) {
            if (field.RelatedEntityID) {
                const existing = outgoingMap.get(field.RelatedEntityID);
                if (existing) {
                    existing.fields.push(field);
                } else {
                    const relatedEntity = this.allEntities.find(e => e.ID === field.RelatedEntityID);
                    outgoingMap.set(field.RelatedEntityID, {
                        entityId: field.RelatedEntityID,
                        entityName: relatedEntity?.Name || field.RelatedEntity || 'Unknown',
                        fields: [field]
                    });
                }
            }
        }
        this.groupedOutgoingRelationships = Array.from(outgoingMap.values())
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
        this.groupedIncomingRelationships = Array.from(incomingMap.values())
            .sort((a, b) => a.entityName.localeCompare(b.entityName));
    }

    private updateNavBadges(): void {
        if (!this.entity) return;

        this.navItems = this.navItems.map(item => {
            switch (item.id) {
                case 'fields':
                    return { ...item, badge: this.stats.fieldCount };
                case 'relationships':
                    return { ...item, badge: this.stats.relationshipCount };
                case 'permissions':
                    return { ...item, badge: this.stats.permissionCount };
                default:
                    return item;
            }
        });
    }

    // === Public Methods ===

    public setActiveSection(section: ExplorerSection): void {
        this.activeSection = section;
        this.closeDetailPanel();
        this.cdr.markForCheck();
    }

    public toggleFieldGroup(groupId: string): void {
        if (this.expandedFieldGroups.has(groupId)) {
            this.expandedFieldGroups.delete(groupId);
        } else {
            this.expandedFieldGroups.add(groupId);
        }
        this.cdr.markForCheck();
    }

    public isFieldGroupExpanded(groupId: string): boolean {
        return this.expandedFieldGroups.has(groupId);
    }

    public expandAllFieldGroups(): void {
        for (const group of this.fieldGroups) {
            this.expandedFieldGroups.add(group.id);
        }
        this.cdr.markForCheck();
    }

    public collapseAllFieldGroups(): void {
        this.expandedFieldGroups.clear();
        this.cdr.markForCheck();
    }

    public get allFieldGroupsExpanded(): boolean {
        return this.fieldGroups.length > 0 &&
               this.fieldGroups.every(g => this.expandedFieldGroups.has(g.id));
    }

    public get allFieldGroupsCollapsed(): boolean {
        return this.expandedFieldGroups.size === 0;
    }

    /**
     * Get all fields for the list view with sorting and filtering applied.
     */
    public getFilteredFieldsList(): EntityFieldInfo[] {
        if (!this.entity) return [];
        let fields = [...this.entity.Fields];

        // Apply search filter
        if (this.fieldSearchTerm) {
            const term = this.fieldSearchTerm.toLowerCase();
            fields = fields.filter(f =>
                f.Name.toLowerCase().includes(term) ||
                (f.DisplayName && f.DisplayName.toLowerCase().includes(term)) ||
                (f.Description && f.Description.toLowerCase().includes(term)) ||
                f.Type.toLowerCase().includes(term)
            );
        }

        // Apply sorting
        fields.sort((a, b) => {
            const col = this.fieldListSortColumn;
            const dir = this.fieldListSortDirection === 'asc' ? 1 : -1;

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

    private getFieldSortValue(field: EntityFieldInfo, column: string): string | number | boolean | null {
        switch (column) {
            case 'Sequence': return field.Sequence;
            case 'Name': return field.DisplayName || field.Name;
            case 'Type': return field.Type;
            case 'Length': return field.Length;
            case 'AllowsNull': return field.AllowsNull;
            case 'Description': return field.Description || '';
            default: return field.Sequence;
        }
    }

    public sortFieldList(column: string): void {
        if (this.fieldListSortColumn === column) {
            this.fieldListSortDirection = this.fieldListSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.fieldListSortColumn = column;
            this.fieldListSortDirection = 'asc';
        }
        this.cdr.markForCheck();
    }

    public selectField(field: EntityFieldInfo): void {
        this.selectedField = field;
        this.selectedRelationship = null;
        this.detailPanelOpen = true;
        this.cdr.markForCheck();
    }

    public selectRelationship(relationship: EntityRelationshipInfo): void {
        this.selectedRelationship = relationship;
        this.selectedField = null;
        this.detailPanelOpen = true;
        this.cdr.markForCheck();
    }

    public closeDetailPanel(): void {
        this.detailPanelOpen = false;
        this.selectedField = null;
        this.selectedRelationship = null;
        this.cdr.markForCheck();
    }

    public toggleRelationshipView(): void {
        this.relationshipViewMode = this.relationshipViewMode === 'diagram' ? 'list' : 'diagram';
        this.cdr.markForCheck();
    }

    /**
     * Change the ERD depth level.
     */
    public setErdDepth(depth: number): void {
        if (depth >= 1 && depth <= 5) {
            this.erdDepth = depth;
            this.cdr.markForCheck();
        }
    }

    /**
     * Handle open record from the ERD composite component.
     * Navigates to the selected entity's form using SharedService.
     */
    public onERDOpenRecord(event: { EntityName: string; RecordID: string }): void {
        const pkey = new CompositeKey([{ FieldName: 'ID', Value: event.RecordID }]);
        this.sharedService.OpenEntityRecord(event.EntityName, pkey);
    }

    /**
     * Handle ERD composite state changes (for future persistence if needed).
     */
    public onERDStateChange(_state: ERDCompositeState): void {
        // ERD composite now handles all internal state management
        // This handler is kept for potential future state persistence needs
    }

    public onFieldSearch(term: string): void {
        this.fieldSearchTerm = term.toLowerCase();
        this.cdr.markForCheck();
    }

    public getFilteredFieldGroups(): FieldGroup[] {
        if (!this.fieldSearchTerm) {
            return this.fieldGroups;
        }

        return this.fieldGroups
            .map(group => ({
                ...group,
                fields: group.fields.filter(f =>
                    f.Name.toLowerCase().includes(this.fieldSearchTerm) ||
                    (f.DisplayName && f.DisplayName.toLowerCase().includes(this.fieldSearchTerm)) ||
                    (f.Description && f.Description.toLowerCase().includes(this.fieldSearchTerm))
                )
            }))
            .filter(group => group.fields.length > 0);
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
        const pkey = new CompositeKey([{ FieldName: 'ID', Value: entityInfo.ID }]);
        this.sharedService.OpenEntityRecord('Entities', pkey);
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

    /** All entities available as potential IS-A parents (excluding self and descendants) */
    public get AvailableParentEntities(): EntityInfo[] {
        if (!this.entity) return [];
        const md = new Metadata();
        const descendantIds = new Set<string>();
        const collectDescendants = (e: EntityInfo): void => {
            descendantIds.add(e.ID);
            for (const child of e.ChildEntities) {
                collectDescendants(child);
            }
        };
        collectDescendants(this.entity);
        return md.Entities
            .filter(e => !descendantIds.has(e.ID) && e.ID !== this.entity!.ID && !e.VirtualEntity)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /** Sibling entities that share the same parent type */
    public get SiblingEntities(): EntityInfo[] {
        if (!this.IsChildType || !this.entity?.ParentEntityInfo) return [];
        return this.entity.ParentEntityInfo.ChildEntities
            .filter(e => e.ID !== this.entity!.ID);
    }

    public get statusClass(): string {
        if (!this.entity) return '';
        switch (this.entity.Status) {
            case 'Active': return 'status-active';
            case 'Deprecated': return 'status-deprecated';
            case 'Disabled': return 'status-disabled';
            default: return '';
        }
    }

    public get entityIcon(): string {
        return this.entity?.Icon || 'fa-solid fa-database';
    }

    public get entityDisplayName(): string {
        if (!this.entity) return '';
        return this.entity.DisplayName || this.entity.Name;
    }

    public get formattedRowCount(): string {
        if (this.stats.rowCount === null) return 'N/A';
        return this.stats.rowCount.toLocaleString();
    }

    public get capabilitySummary(): string[] {
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

    public getFieldTypeIcon(field: EntityFieldInfo): string {
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

    public getRelatedEntityName(field: EntityFieldInfo): string | null {
        if (!field.RelatedEntityID) return null;
        const related = this.allEntities.find(e => e.ID === field.RelatedEntityID);
        return related?.Name || null;
    }

    public getRelatedEntity(field: EntityFieldInfo): EntityInfo | null {
        if (!field.RelatedEntityID) return null;
        return this.allEntities.find(e => e.ID === field.RelatedEntityID) || null;
    }

    public navigateToRelatedEntity(field: EntityFieldInfo): void {
        const related = this.getRelatedEntity(field);
        if (related) {
            const pkey = new CompositeKey([{ FieldName: 'ID', Value: related.ID }]);
            this.sharedService.OpenEntityRecord('Entities', pkey);
        }
    }

    /**
     * Open an entity record from the field detail panel.
     */
    public openRelatedEntityFromField(entityId: string): void {
        if (entityId) {
            const pkey = new CompositeKey([{ FieldName: 'ID', Value: entityId }]);
            this.sharedService.OpenEntityRecord('Entities', pkey);
        }
    }

    public formatFieldType(field: EntityFieldInfo): string {
        let type = field.Type;
        if (field.Length && field.Length > 0) {
            type += `(${field.Length})`;
        } else if (field.Precision && field.Scale !== undefined) {
            type += `(${field.Precision},${field.Scale})`;
        }
        return type;
    }

    /**
     * Get the role name for a permission entry.
     * The EntityPermissionInfo.Role property is not populated because the database view
     * returns 'RoleName' but the class expects 'Role'. This helper looks up the role
     * from the Metadata.Roles collection using the RoleID.
     */
    public getRoleName(perm: EntityPermissionInfo): string {
        if (!perm.RoleID) return 'Unknown';
        const role = this._metadata.Roles.find(r => r.ID === perm.RoleID);
        return role?.Name || 'Unknown';
    }

    /**
     * Checks if a string value is valid JSON (object or array).
     */
    public isJsonValue(value: string): boolean {
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

    /**
     * Formats a JSON string for display with proper indentation.
     */
    public formatJsonValue(value: string): string {
        if (!value) return '';
        try {
            const parsed = JSON.parse(value.trim());
            return JSON.stringify(parsed, null, 2);
        } catch {
            return value;
        }
    }
}
