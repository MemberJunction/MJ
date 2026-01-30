import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Metadata, EntityInfo } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadVersionHistoryGraphResource() {
    // Prevents tree-shaking
}

interface EntityNode {
    Name: string;
    ID: string;
    DependentCount: number;
    ParentCount: number;
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

    // Selected entity detail
    public SelectedEntity: EntityNode | null = null;
    public SelectedEntityInfo: EntityInfo | null = null;
    public DependentEntities: RelationshipEdge[] = [];
    public ParentEntities: RelationshipEdge[] = [];

    // Stats
    public TotalEntities = 0;
    public EntitiesWithDependents = 0;
    public TotalRelationships = 0;

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
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

            this.AllEntities = entities.map(e => {
                const dependents = this.countDependents(e);
                const parents = this.countParents(e);
                return {
                    Name: e.Name,
                    ID: e.ID,
                    DependentCount: dependents,
                    ParentCount: parents,
                    IsSelected: false
                };
            }).sort((a, b) => b.DependentCount - a.DependentCount);

            this.TotalEntities = this.AllEntities.length;
            this.EntitiesWithDependents = this.AllEntities.filter(e => e.DependentCount > 0).length;
            this.TotalRelationships = this.AllEntities.reduce((sum, e) => sum + e.DependentCount, 0);

            this.applyFilter();
        } catch (error) {
            console.error('Error loading dependency graph data:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private countDependents(entity: EntityInfo): number {
        return entity.RelatedEntities.filter(r => r.Type === 'One to Many').length;
    }

    private countParents(entity: EntityInfo): number {
        return entity.RelatedEntities.filter(r => r.Type === 'Many to One').length;
    }

    public OnSearchChange(text: string): void {
        this.SearchText = text;
        this.applyFilter();
    }

    private applyFilter(): void {
        if (!this.SearchText) {
            this.FilteredEntities = this.AllEntities;
        } else {
            const search = this.SearchText.toLowerCase();
            this.FilteredEntities = this.AllEntities.filter(e =>
                e.Name.toLowerCase().includes(search)
            );
        }
        this.cdr.markForCheck();
    }

    public SelectEntity(entityNode: EntityNode): void {
        // Deselect previous
        if (this.SelectedEntity) {
            this.SelectedEntity.IsSelected = false;
        }

        entityNode.IsSelected = true;
        this.SelectedEntity = entityNode;

        const entityInfo = this.metadata.Entities.find(e => e.ID === entityNode.ID);
        this.SelectedEntityInfo = entityInfo ?? null;

        if (entityInfo) {
            this.DependentEntities = entityInfo.RelatedEntities
                .filter(r => r.Type === 'One to Many')
                .map(r => ({
                    FromEntity: entityInfo.Name,
                    ToEntity: r.RelatedEntity,
                    RelatedEntityJoinField: r.RelatedEntityJoinField,
                    Type: r.Type
                }));

            this.ParentEntities = entityInfo.RelatedEntities
                .filter(r => r.Type === 'Many to One')
                .map(r => ({
                    FromEntity: entityInfo.Name,
                    ToEntity: r.RelatedEntity,
                    RelatedEntityJoinField: r.RelatedEntityJoinField,
                    Type: r.Type
                }));
        } else {
            this.DependentEntities = [];
            this.ParentEntities = [];
        }

        this.cdr.markForCheck();
    }

    public NavigateToEntity(entityName: string): void {
        const node = this.AllEntities.find(e => e.Name === entityName);
        if (node) {
            this.SelectEntity(node);
        }
    }

    public GetDependencyLevel(count: number): string {
        if (count === 0) return 'level-none';
        if (count <= 3) return 'level-low';
        if (count <= 10) return 'level-medium';
        return 'level-high';
    }

    public Refresh(): void {
        this.LoadData();
    }
}
