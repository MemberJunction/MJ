import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Metadata, EntityInfo } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { AgentToolResult, validateStringParam } from '../../shared/agent-tool-validation';
import { buildVersionHistoryGraphAgentContext } from '../version-history-graph-agent-context';

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
export class VersionHistoryGraphResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
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
    private metadata = this.ProviderToUse;
    protected override destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadUserPreferences();
        this.LoadData();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * After the view initializes, publish the initial agent context and register
     * the client tools the AI agent can invoke against this surface. The ongoing
     * context re-emit happens in {@link applyFilter} and {@link SelectEntity}.
     */
    ngAfterViewInit(): void {
        this.publishAgentContext();
        this.registerAgentClientTools();
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS
    //
    // 🔒 SAFETY BOUNDARY: This surface is a read-only browse/filter/inspect view
    // over entity-relationship metadata. It exposes ONLY select / filter / search
    // tools to the agent — NO mutation of any kind (no schema edits, no entity
    // changes, no restore/rollback, no deletion). Every tool below only changes
    // what the user is LOOKING at; none changes data.
    // ========================================

    /**
     * Publish the current Dependency-Graph state to the AI agent via
     * NavigationService. Shaping lives in the pure
     * {@link buildVersionHistoryGraphAgentContext} helper so it stays
     * unit-testable. Called on load, on filter changes, and on entity selection.
     */
    private publishAgentContext(): void {
        const context = buildVersionHistoryGraphAgentContext({
            SelectedEntityName: this.SelectedEntity?.Name ?? null,
            TotalEntities: this.TotalEntities,
            EntitiesWithDependents: this.EntitiesWithDependents,
            TotalRelationships: this.TotalRelationships,
            SearchText: this.SearchText,
            SchemaFilter: this.SchemaFilter,
            VisibleEntityCount: this.FilteredEntities.length,
            VisibleEntityNames: this.FilteredEntities.map(e => e.Name),
            AvailableSchemas: this.AvailableSchemas,
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the read-only client tools the AI agent can invoke against the
     * Dependency Graph. Each handler is tolerant — it never throws and returns a
     * typed `{ Success, Data?, ErrorMessage? }` result.
     *
     * Tools:
     * - SelectEntityForDependencyView: select an entity by name to inspect its
     *   dependencies (delegates to {@link NavigateToEntity}, which clears any
     *   schema filter so the entity is reachable).
     * - FilterEntitiesBySchema: filter the entity list to a single schema.
     * - SearchEntities: filter the entity list by an entity-name substring.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SelectEntityForDependencyView',
                Description: 'Select an entity by name to inspect what references it and what it depends on. Clears any active schema filter so the entity is reachable.',
                ParameterSchema: { type: 'object', properties: { entityName: { type: 'string' } }, required: ['entityName'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectEntity(params),
            },
            {
                Name: 'FilterEntitiesBySchema',
                Description: 'Filter the entity list to a single schema. Pass an empty string to clear the schema filter.',
                ParameterSchema: { type: 'object', properties: { schema: { type: 'string' } }, required: ['schema'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterBySchema(params),
            },
            {
                Name: 'SearchEntities',
                Description: 'Filter the entity list by an entity-name substring. Pass an empty string to clear the search.',
                ParameterSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
                Handler: async (params: Record<string, unknown>) => this.toolSearchEntities(params),
            },
        ]);
    }

    /** Resolve an entity by name and select it for the dependency view. */
    private toolSelectEntity(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
        const parsed = validateStringParam(params['entityName'], 'entityName');
        if (!parsed.ok) {
            return parsed.result;
        }
        const lowered = parsed.value.trim().toLowerCase();
        const node = this.AllEntities.find(e => e.Name.toLowerCase() === lowered);
        if (!node) {
            return { Success: false, ErrorMessage: `Entity "${parsed.value}" was not found in the dependency graph.` };
        }
        this.NavigateToEntity(node.Name);
        return { Success: true, Data: { SelectedEntityName: node.Name } };
    }

    /** Apply a schema filter deterministically (no toggle), validating it exists. */
    private toolFilterBySchema(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
        const parsed = validateStringParam(params['schema'], 'schema');
        if (!parsed.ok) {
            return parsed.result;
        }
        const value = parsed.value.trim();
        if (value && !this.AvailableSchemas.includes(value)) {
            return { Success: false, ErrorMessage: `Schema "${value}" is not available. Available schemas: ${this.AvailableSchemas.join(', ')}.` };
        }
        // Set deterministically rather than via OnSchemaFilterChange's toggle semantics,
        // so the agent always lands on the requested filter regardless of current state.
        this.SchemaFilter = value;
        this.applyFilter();
        this.persistPreferences();
        return { Success: true, Data: { SchemaFilter: this.SchemaFilter, VisibleEntityCount: this.FilteredEntities.length } };
    }

    /** Apply an entity-name search filter. */
    private toolSearchEntities(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
        const parsed = validateStringParam(params['text'], 'text');
        if (!parsed.ok) {
            return parsed.result;
        }
        this.OnSearchChange(parsed.value);
        return { Success: true, Data: { SearchText: this.SearchText, VisibleEntityCount: this.FilteredEntities.length } };
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
            this.publishAgentContext();
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
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public SelectEntity(entityNode: EntityNode): void {
        if (this.SelectedEntity) {
            this.SelectedEntity.IsSelected = false;
        }

        entityNode.IsSelected = true;
        this.SelectedEntity = entityNode;

        const entityInfo = this.metadata.Entities.find(e => UUIDsEqual(e.ID, entityNode.ID));
        this.SelectedEntityInfo = entityInfo ?? null;

        if (entityInfo) {
            this.ReferencedByEntities = this.buildReferencedByList(entityInfo);
            this.DependsOnEntities = this.buildDependsOnList(entityInfo);
        } else {
            this.ReferencedByEntities = [];
            this.DependsOnEntities = [];
        }

        this.publishAgentContext();
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
