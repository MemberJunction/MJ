import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Metadata, EntityInfo } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';

interface VersionGraphPreferences {
    SchemaFilter: string;
}
interface EntityNode {
    Name: string;
    ID: string;
    SchemaName: string;
    ReferencedByCount: number;
    DependsOnCount: number;
    IsSelected: boolean;
}

interface RelationshipEdge {
    FromEntity: string;
    ToEntity: string;
    RelatedEntityJoinField: string;
    Type: string;
}

@RegisterClass(BaseResourceComponent, 'VersionHistoryGraphResource')
@Component({
  standalone: false,
    selector: 'mj-version-history-graph-resource',
    templateUrl: './graph-resource.component.html',
    styleUrls: ['./graph-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionHistoryGraphResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public IsLoading = true;

    // Entity browser
    public AllEntities: EntityNode[] = [];
    public FilteredEntities: EntityNode[] = [];
    public SearchText = '';
    public SchemaFilter = '';
    public AvailableSchemas: string[] = [];

    // Selected entity detail
    public SelectedEntity: EntityNode | null = null;
    public SelectedEntityInfo: EntityInfo | null = null;
    public ReferencedByEntities: RelationshipEdge[] = [];
    public DependsOnEntities: RelationshipEdge[] = [];

    // Stats
    public TotalEntities = 0;
    public EntitiesWithDependents = 0;
    public TotalRelationships = 0;

    private static readonly PREFS_KEY = 'VersionHistory.Graph.UserPreferences';
    private preferencesLoaded = false;
    private metadata = new Metadata();
    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        this.loadUserPreferences();
        this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Dependency Graph';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-diagram-project';
    }

    public LoadData(): void {
        try {
            this.IsLoading = true;
            this.cdr.markForCheck();

            const entities = this.metadata.Entities;

            this.AllEntities = entities.map(e => ({
                Name: e.Name,
                ID: e.ID,
                SchemaName: e.SchemaName,
                ReferencedByCount: this.countReferencedBy(e),
                DependsOnCount: this.countDependsOn(e),
                IsSelected: false
            })).sort((a, b) => a.Name.localeCompare(b.Name));

            // Extract unique schemas, sorted
            const schemaSet = new Set(this.AllEntities.map(e => e.SchemaName));
            this.AvailableSchemas = Array.from(schemaSet).sort();

            this.TotalEntities = this.AllEntities.length;
            this.EntitiesWithDependents = this.AllEntities.filter(e => e.ReferencedByCount > 0).length;
            this.TotalRelationships = this.AllEntities.reduce((sum, e) => sum + e.ReferencedByCount, 0);

            this.applyFilter();
        } catch (error) {
            console.error('Error loading dependency graph data:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    /** Count entities that reference this entity (have FKs pointing to it), excluding self-references */
    private countReferencedBy(entity: EntityInfo): number {
        return entity.RelatedEntities.filter(r =>
            r.Type.trim().toUpperCase() === 'ONE TO MANY' &&
            r.RelatedEntity !== entity.Name
        ).length;
    }

    /** Count entities this entity depends on (has FKs pointing to), excluding self-references */
    private countDependsOn(entity: EntityInfo): number {
        return this.metadata.Entities.filter(e =>
            e.Name !== entity.Name &&
            e.RelatedEntities.some(r =>
                r.Type.trim().toUpperCase() === 'ONE TO MANY' &&
                r.RelatedEntity === entity.Name
            )
        ).length;
    }

    public OnSearchChange(text: string): void {
        this.SearchText = text;
        this.applyFilter();
    }

    public OnSchemaFilterChange(schema: string): void {
        this.SchemaFilter = this.SchemaFilter === schema ? '' : schema;
        this.applyFilter();
        this.persistPreferences();
    }

    private loadUserPreferences(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(VersionHistoryGraphResourceComponent.PREFS_KEY);
            if (raw) {
                const prefs: VersionGraphPreferences = JSON.parse(raw);
                if (prefs.SchemaFilter != null) {
                    this.SchemaFilter = prefs.SchemaFilter;
                }
            }
        } catch (error) {
            console.error('Error loading graph preferences:', error);
            this.SchemaFilter = '';
        }
        this.preferencesLoaded = true;
    }

    private persistPreferences(): void {
        if (!this.preferencesLoaded) return;
        const prefs: VersionGraphPreferences = {
            SchemaFilter: this.SchemaFilter
        };
        UserInfoEngine.Instance.SetSettingDebounced(VersionHistoryGraphResourceComponent.PREFS_KEY, JSON.stringify(prefs));
    }

    private applyFilter(): void {
        let result = this.AllEntities;

        if (this.SchemaFilter) {
            result = result.filter(e => e.SchemaName === this.SchemaFilter);
        }

        if (this.SearchText) {
            const search = this.SearchText.toLowerCase();
            result = result.filter(e => e.Name.toLowerCase().includes(search));
        }

        this.FilteredEntities = result;
        this.cdr.markForCheck();
    }

    public SelectEntity(entityNode: EntityNode): void {
        if (this.SelectedEntity) {
            this.SelectedEntity.IsSelected = false;
        }

        entityNode.IsSelected = true;
        this.SelectedEntity = entityNode;

        const entityInfo = this.metadata.Entities.find(e => e.ID === entityNode.ID);
        this.SelectedEntityInfo = entityInfo ?? null;

        if (entityInfo) {
            this.ReferencedByEntities = this.buildReferencedByList(entityInfo);
            this.DependsOnEntities = this.buildDependsOnList(entityInfo);
        } else {
            this.ReferencedByEntities = [];
            this.DependsOnEntities = [];
        }

        this.cdr.markForCheck();
    }

    /** Entities that have FKs pointing TO the selected entity (it is the "one" side) */
    private buildReferencedByList(entityInfo: EntityInfo): RelationshipEdge[] {
        return entityInfo.RelatedEntities
            .filter(r =>
                r.Type.trim().toUpperCase() === 'ONE TO MANY' &&
                r.RelatedEntity !== entityInfo.Name
            )
            .map(r => ({
                FromEntity: entityInfo.Name,
                ToEntity: r.RelatedEntity,
                RelatedEntityJoinField: r.RelatedEntityJoinField,
                Type: r.Type
            }))
            .sort((a, b) => a.ToEntity.localeCompare(b.ToEntity));
    }

    /** Entities the selected entity has FKs pointing to (it is the "many" side) */
    private buildDependsOnList(entityInfo: EntityInfo): RelationshipEdge[] {
        return this.metadata.Entities
            .filter(e =>
                e.Name !== entityInfo.Name &&
                e.RelatedEntities.some(r =>
                    r.Type.trim().toUpperCase() === 'ONE TO MANY' &&
                    r.RelatedEntity === entityInfo.Name
                )
            )
            .map(e => {
                const rel = e.RelatedEntities.find(r =>
                    r.Type.trim().toUpperCase() === 'ONE TO MANY' &&
                    r.RelatedEntity === entityInfo.Name
                )!;
                return {
                    FromEntity: e.Name,
                    ToEntity: entityInfo.Name,
                    RelatedEntityJoinField: rel.RelatedEntityJoinField,
                    Type: rel.Type
                };
            })
            .sort((a, b) => a.FromEntity.localeCompare(b.FromEntity));
    }

    public NavigateToEntity(entityName: string): void {
        const node = this.AllEntities.find(e => e.Name === entityName);
        if (node) {
            // Clear schema filter so the entity is visible
            if (this.SchemaFilter && node.SchemaName !== this.SchemaFilter) {
                this.SchemaFilter = '';
                this.applyFilter();
            }
            this.SelectEntity(node);
        }
    }

    public GetDependencyLevel(count: number): string {
        if (count === 0) return 'level-none';
        if (count <= 3) return 'level-low';
        if (count <= 10) return 'level-medium';
        return 'level-high';
    }

    public GetSchemaEntityCount(schema: string): number {
        return this.AllEntities.filter(e => e.SchemaName === schema).length;
    }

    public Refresh(): void {
        this.LoadData();
    }
}
