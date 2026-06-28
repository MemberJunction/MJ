/**
 * @module database-designer-dashboard.component
 * @description Root dashboard for the Database Designer feature area.
 *
 * Registered as 'DatabaseDesignerDashboard' via `@RegisterClass(BaseDashboard, ...)`.
 * Registered as a navigation item via metadata (metadata/applications/).
 *
 * Lifecycle:
 *  - `initDashboard()` — sync ?entity= URL param (deep-link support), initialize slide-panel state
 *  - `loadData()` — delegate to DatabaseDesignerEngine singleton; pass result to EntityListComponent
 *
 * The wizard and modify panels open as MjSlidePanel drawers so the entity
 * list remains visible behind them.  The dashboard orchestrates all state
 * transitions; child components communicate only via @Output events.
 */

import {
    Component, ChangeDetectionStrategy, ChangeDetectorRef,
    inject, ViewChild, AfterViewInit,
} from '@angular/core';
import { BaseDashboard, BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, EntityInfo, Metadata } from '@memberjunction/core';

import { DatabaseDesignerEngine } from '../services/database-designer.engine.js';
import { DatabaseDesignerService } from '../services/database-designer.service.js';
import { DatabaseModifyComponent } from './modify/database-modify.component.js';
import { EntityListComponent } from './entity-list.component.js';
import type { AccessibleEntity, AccessibleEntityDetail } from '../database-designer.types.js';
import {
    buildDatabaseDesignerAgentContext,
    buildEntityNotFoundError,
    entityDisplayName,
    resolveEntityByIdOrName,
    type EntityNameCandidate,
    type FieldSummary,
    type RelatedEntitySummary,
    type SchemaGroupSummary,
} from '../database-designer-agent-context.js';
import { AgentToolResult, validateStringParam } from '../../shared/agent-tool-validation.js';

@Component({
    standalone: false,
    selector: 'mj-database-designer-dashboard',
    templateUrl: './database-designer-dashboard.component.html',
    styleUrls: ['./database-designer-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseResourceComponent, 'DatabaseDesignerDashboard')
export class DatabaseDesignerDashboardComponent extends BaseDashboard implements AfterViewInit {

    // ─── Injected services ─────────────────────────────────────────────────

    /** Angular DI: write operations (create, modify, validate). */
    protected readonly designerService = inject(DatabaseDesignerService);

    /** Change detection ref for OnPush updates. */
    private readonly cdr = inject(ChangeDetectorRef);

    // ─── ViewChild ─────────────────────────────────────────────────────────

    /** Reference to the active modify component — used for close-guard state. */
    @ViewChild(DatabaseModifyComponent) private modifyRef?: DatabaseModifyComponent;

    /** Reference to the entity list — used to drive the agent's read-only search/refresh. */
    @ViewChild(EntityListComponent) private entityListRef?: EntityListComponent;

    // ─── Slide-panel close guard ───────────────────────────────────────────

    /**
     * Passed as `[CanClose]` to the modify slide panel.
     * Prevents the panel from closing while a pipeline is running and prompts the user
     * for confirmation.  Defined as an arrow function so `this` is captured correctly
     * when called by `MjSlidePanelComponent` (no angular binding issues).
     */
    public readonly ModifyPanelCanClose = (): boolean => {
        if (!this.modifyRef?.IsPipelineRunning) return true;
        return window.confirm(
            'A pipeline operation is in progress. Closing will hide the progress panel ' +
            'but the operation will continue running on the server.\n\nAre you sure?'
        );
    };

    // ─── Entity list ───────────────────────────────────────────────────────

    /** Entities displayed in EntityListComponent — set by loadData(). */
    public Entities: AccessibleEntity[] = [];

    public IsLoadingEntities = false;
    public LoadError: string | null = null;

    // ─── Slide panel state ─────────────────────────────────────────────────

    /** Whether the Create Wizard drawer is open. */
    public ShowCreateWizard = false;

    /** ID of the entity currently being modified; null if panel is closed. */
    public ModifyEntityId: string | null = null;

    /** ID to deep-link into on first load (from ?entity= query param). */
    private _deepLinkEntityId: string | null = null;

    /**
     * Loaded field/column detail for the currently selected entity, used ONLY to enrich the
     * agent context (the modify panel loads its own detail independently). Cleared when the
     * panel closes; refreshed (best-effort) when an entity is selected.
     */
    private _selectedEntityDetail: AccessibleEntityDetail | null = null;

    // ─── BaseDashboard implementation ──────────────────────────────────────

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Database Designer';
    }

    /**
     * After the view initializes, publish the initial agent context and register the
     * (read-only) client tools the AI agent can invoke against this surface. The ongoing
     * context re-emit happens from {@link loadData} and the slide-panel handlers as the
     * browse state changes.
     */
    ngAfterViewInit(): void {
        this.publishAgentContext();
        this.registerAgentClientTools();
    }

    /** Sync ?entity=<id> URL param; set initial slide-panel state. */
    protected initDashboard(): void {
        const params = this.GetQueryParams();
        if (params['entity']) {
            this._deepLinkEntityId = params['entity'];
        }
    }

    /** Load accessible entities from the engine's cached store. */
    protected async loadData(): Promise<void> {
        this.IsLoadingEntities = true;
        this.LoadError = null;
        this.cdr.markForCheck();

        try {
            this.Entities = await DatabaseDesignerEngine.Instance.loadAccessibleEntities();

            // Honor deep-link: open modify panel if the entity exists in the list.
            if (this._deepLinkEntityId) {
                const target = this.Entities.find(e => e.entityId === this._deepLinkEntityId);
                if (target) {
                    this.openModifyPanel(target);
                }
                this._deepLinkEntityId = null;
            }
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoadingEntities = false;
            this.cdr.markForCheck();
            // Keep the agent's view of the entity list in sync after each (re)load.
            this.publishAgentContext();
        }
    }

    // ─── Entity list event handlers ────────────────────────────────────────

    /** Opens the Create Wizard drawer. */
    public OnNewEntity(): void {
        this.ShowCreateWizard = true;
        this.cdr.markForCheck();
    }

    /** Opens the Modify panel for an existing entity. */
    public OnEditEntity(entity: AccessibleEntity): void {
        this.openModifyPanel(entity);
    }

    /** Opens the Modify panel (read-only view) for an existing entity. */
    public OnViewEntity(entity: AccessibleEntity): void {
        this.openModifyPanel(entity);
    }

    // ─── Slide-panel event handlers ────────────────────────────────────────

    /** Called when the Create Wizard drawer closes (cancel or success). */
    public OnWizardClosed(): void {
        this.ShowCreateWizard = false;
        this.cdr.markForCheck();
    }

    /** Called when the wizard successfully creates an entity. */
    public OnEntityCreated(): void {
        this.ShowCreateWizard = false;
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.loadData();
    }

    /** Called when the Modify panel drawer closes. */
    public OnModifyPanelClosed(): void {
        this.ModifyEntityId = null;
        this._selectedEntityDetail = null;
        this.UpdateQueryParams({ entity: null });
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    /** Called when the modify wizard successfully alters an entity. */
    public OnEntityModified(): void {
        this.ModifyEntityId = null;
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.loadData();
    }

    /**
     * React to ?entity= changes that arrive after initial load — e.g. clicking a Home pin
     * for a specific entity, or browser back/forward — when this tab is re-focused rather
     * than freshly mounted (so initDashboard() does not run again). Without this, the modify
     * panel would not open for the pinned/linked entity. (initDashboard handles the very
     * first load via _deepLinkEntityId.)
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const entityId = params['entity'] || null;
        if (entityId) {
            if (entityId !== this.ModifyEntityId) {
                const target = this.Entities.find(e => e.entityId === entityId);
                if (target) {
                    this.openModifyPanel(target);
                }
            }
        } else if (this.ModifyEntityId) {
            this.OnModifyPanelClosed();
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private openModifyPanel(entity: AccessibleEntity): void {
        this.ModifyEntityId = entity.entityId;
        this._selectedEntityDetail = null;
        this.UpdateQueryParams({ entity: entity.entityId });
        this.cdr.markForCheck();
        this.publishAgentContext();
        // Best-effort: load the field detail so the agent context can include the selected
        // entity's field/relationship summary. Fire-and-forget — a failure just leaves the
        // summary absent (never throws into the open path).
        void this.loadSelectedEntityDetailForContext(entity.entityId);
    }

    /**
     * Load the selected entity's field detail (read-only) purely to enrich the agent
     * context. Guarded against a newer selection superseding this load. Re-publishes context
     * once the detail is available.
     */
    private async loadSelectedEntityDetailForContext(entityId: string): Promise<void> {
        try {
            const detail = await DatabaseDesignerEngine.Instance.loadEntityDetail(entityId);
            // Only apply if this entity is still the selected one.
            if (this.ModifyEntityId === entityId) {
                this._selectedEntityDetail = detail;
                this.publishAgentContext();
            }
        } catch {
            // Read-only enrichment — ignore failures, the summary simply stays absent.
        }
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS
    //
    // 🔒 SAFETY BOUNDARY: The Database Designer surface CAN MUTATE the database
    // schema — it creates entities (Create Wizard), alters tables, adds/removes
    // fields, and runs the DDL pipeline (modify panel). EVERYTHING published and
    // registered below is STRICTLY READ-ONLY / SCHEMA-BROWSE:
    //   - context reports only the accessible-entity list, search, selection, and
    //     whether the detail panel is open;
    //   - tools only search the list, open an entity's detail panel for VIEWING,
    //     and refresh the list.
    // NONE of the following is exposed to the agent, and NONE may ever be added
    // here: OpenCreateWizard / CreateNewEntity, ModifyEntitySchema,
    // AddField / RemoveField / ChangeFieldType, DeleteEntity, ApplyDatabaseChanges,
    // RunDatabasePipeline — or any other schema mutation. The agent browses the
    // schema; the USER makes changes from the wizard / modify panel.
    //
    // NOTE on SelectEntity: the modify panel it opens is the SAME drawer the user
    // edits in, but the agent only OPENS it (read/browse context). It never applies,
    // saves, or runs the pipeline — there is no tool that can.
    // ========================================

    /**
     * Registered Name of the entity whose detail panel is open, resolved from the loaded
     * list. Null when nothing is selected or the id is not (yet) in the list.
     */
    public get SelectedEntityName(): string | null {
        if (!this.ModifyEntityId) {
            return null;
        }
        return this.Entities.find(e => e.entityId === this.ModifyEntityId)?.entityName ?? null;
    }

    /** Current free-text search term applied to the entity list (reads the child list's state). */
    private get currentSearchText(): string {
        return this.entityListRef?.SearchTerm ?? '';
    }

    /** Active schema filter applied to the entity list (reads the child list's state). */
    private get currentSchemaFilter(): string {
        return this.entityListRef?.SelectedSchema ?? '';
    }

    /** Count of entities visible after the child list's search + schema filter. */
    private get filteredEntityCount(): number {
        return this.entityListRef?.FilteredEntities.length ?? this.Entities.length;
    }

    /**
     * Build the resolver candidate list: every accessible entity as an
     * {@link EntityNameCandidate}, enriched with the entity's `DisplayName` from `EntityInfo`
     * metadata when available (so display-name resolution matches what the user reads).
     */
    private buildEntityCandidates(): EntityNameCandidate[] {
        return this.Entities.map(e => ({
            ID: e.entityId,
            Name: e.entityName,
            DisplayName: this.lookupEntityInfo(e.entityName)?.DisplayName ?? null,
        }));
    }

    /** Resolve the `EntityInfo` for a registered entity name (for DisplayName + RelatedEntities). */
    private lookupEntityInfo(entityName: string): EntityInfo | undefined {
        // global-provider-ok: client-side Angular dashboard, single provider; metadata-only read.
        return new Metadata().EntityByName(entityName);
    }

    /** The on-screen DISPLAY label for an accessible entity (DisplayName, else prefix-stripped Name). */
    private displayNameForEntity(entity: AccessibleEntity): string {
        return entityDisplayName(entity.entityName, this.lookupEntityInfo(entity.entityName)?.DisplayName);
    }

    /** Bounded-by-the-helper list of the DISPLAY names of the currently-filtered entities. */
    private get availableEntityDisplayNames(): string[] {
        const rows = this.entityListRef?.FilteredEntities ?? this.Entities;
        return rows.map(e => this.displayNameForEntity(e));
    }

    /** Schema → entity-count groupings across all accessible entities. */
    private buildSchemaGroups(): SchemaGroupSummary[] {
        const counts = new Map<string, number>();
        for (const e of this.Entities) {
            counts.set(e.schemaName, (counts.get(e.schemaName) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([SchemaName, EntityCount]) => ({ SchemaName, EntityCount }))
            .sort((a, b) => a.SchemaName.localeCompare(b.SchemaName));
    }

    /** Field summaries for the selected entity (from the loaded detail), for the agent context. */
    private buildSelectedEntityFields(): FieldSummary[] {
        const cols = this._selectedEntityDetail?.columns ?? [];
        return cols.map(c => ({
            Name: c.Name,
            Type: c.RawSqlType ?? c.Type ?? 'unknown',
            IsNullable: c.IsNullable,
        }));
    }

    /** Related-entity summaries for the selected entity (from EntityInfo.RelatedEntities). */
    private buildSelectedRelatedEntities(): RelatedEntitySummary[] {
        const name = this.SelectedEntityName;
        if (!name) {
            return [];
        }
        const info = this.lookupEntityInfo(name);
        if (!info) {
            return [];
        }
        return info.RelatedEntities.map(r => ({
            Name: r.DisplayName || r.RelatedEntity || '(unnamed)',
            RelationshipType: r.Type ?? 'unknown',
        }));
    }

    /**
     * Publish the current Database Designer schema-browse state to the AI agent via
     * NavigationService. Reports the accessible-entity count + filtered count, the current
     * search/schema filters, the open selection (id + registered name + DISPLAY name +
     * schema + table + field count + bounded field/relationship summary), whether the
     * modify/detail panel is open, the loading flag, the bounded available-entity DISPLAY
     * names, and the schema-grouping landscape. The shaping lives in the pure
     * {@link buildDatabaseDesignerAgentContext} helper so it stays unit-testable. Called on
     * init (ngAfterViewInit) and on every browse-state change (load, filter, open/close
     * panel, detail load).
     */
    private publishAgentContext(): void {
        const selectedEntity = this.ModifyEntityId
            ? this.Entities.find(e => e.entityId === this.ModifyEntityId) ?? null
            : null;
        const context = buildDatabaseDesignerAgentContext({
            EntityCount: this.Entities.length,
            FilteredEntityCount: this.filteredEntityCount,
            SearchText: this.currentSearchText,
            SchemaFilter: this.currentSchemaFilter,
            SelectedEntityId: this.ModifyEntityId,
            SelectedEntityName: this.SelectedEntityName,
            SelectedEntityDisplayName: selectedEntity ? this.displayNameForEntity(selectedEntity) : null,
            SelectedEntitySchema: selectedEntity?.schemaName ?? null,
            SelectedEntityTable: selectedEntity?.tableName ?? null,
            SelectedEntityFieldCount: this._selectedEntityDetail?.fieldCount ?? null,
            SelectedEntityFields: this.buildSelectedEntityFields(),
            RelatedEntities: this.buildSelectedRelatedEntities(),
            ShowModifyPanel: !!this.ModifyEntityId,
            IsLoading: this.IsLoadingEntities,
            AvailableEntityNames: this.availableEntityDisplayNames,
            SchemaGroups: this.buildSchemaGroups(),
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the READ-ONLY (schema-browse) client tools the AI agent can invoke against
     * the Database Designer. Each handler delegates to the same read-only path a user
     * interaction would take and returns `{ Success: true }` on success or
     * `{ Success: false, ErrorMessage }` on failure. Handlers never throw.
     *
     * Tools (browse only — see SAFETY BOUNDARY above):
     * - SearchEntities: filter the accessible-entity list by a search string.
     * - SelectEntity: open an entity's detail panel by its ID OR name/display-name (VIEW).
     * - FilterBySchema: narrow the entity list to a schema (empty string clears the filter).
     * - RefreshEntityList: reload the accessible-entity list.
     * - NavigateToEntityRecord: open the `MJ: Entities` record for an entity to VIEW it.
     *
     * Intentionally NOT exposed (mutations — see SAFETY BOUNDARY): create wizard,
     * modify-schema, add/remove/change fields, delete entity, apply changes, run pipeline.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SearchEntities',
                Description: 'Filter the accessible-entity list by a free-text search string (matches entity name, table, or schema). Read-only.',
                ParameterSchema: { type: 'object', properties: { searchText: { type: 'string' } }, required: ['searchText'] },
                Handler: async (params: Record<string, unknown>) => this.toolSearchEntities(params),
            },
            {
                Name: 'SelectEntity',
                Description: "Open an entity's detail panel to VIEW its schema. Accepts the entity ID, the registered name, or the on-screen DISPLAY name (e.g. \"AI Models\" — the \"MJ: \" prefix is not required). Read-only — opens the panel but never applies, saves, or runs any change.",
                ParameterSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Entity ID, registered name, or display name.' } }, required: ['entity'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectEntity(params),
            },
            {
                Name: 'FilterBySchema',
                Description: 'Narrow the accessible-entity list to a single SQL schema (e.g. "__mj_UDT"). Pass an empty string to clear the schema filter. Read-only.',
                ParameterSchema: { type: 'object', properties: { schema: { type: 'string' } }, required: ['schema'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterBySchema(params),
            },
            {
                Name: 'RefreshEntityList',
                Description: 'Reload the accessible-entity list (no schema is modified).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.toolRefreshEntityList(),
            },
            {
                Name: 'NavigateToEntityRecord',
                Description: "Open the `MJ: Entities` record for an entity (by ID, registered name, or display name) in a tab to VIEW its full metadata. Read-only navigation — does not edit.",
                ParameterSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Entity ID, registered name, or display name.' } }, required: ['entity'] },
                Handler: async (params: Record<string, unknown>) => this.toolNavigateToEntityRecord(params),
            },
        ]);
    }

    /** Apply a read-only search filter to the entity list via the child list component. */
    private toolSearchEntities(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['searchText'], 'searchText');
        if (!validated.ok) {
            return validated.result;
        }
        if (!this.entityListRef) {
            return { Success: false, ErrorMessage: 'The entity list is not ready yet.' };
        }
        this.entityListRef.SearchTerm = validated.value;
        this.cdr.markForCheck();
        this.publishAgentContext();
        return { Success: true };
    }

    /**
     * Open an entity's detail panel to VIEW its schema. Resolves the agent's reference by ID,
     * registered name, or DISPLAY name. This opens the SAME panel the user edits in, but the
     * agent only opens it for browsing — it applies nothing.
     */
    private toolSelectEntity(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['entity'], 'entity');
        if (!validated.ok) {
            return validated.result;
        }
        const candidate = resolveEntityByIdOrName(validated.value, this.buildEntityCandidates());
        if (!candidate) {
            return { Success: false, ErrorMessage: buildEntityNotFoundError(validated.value, this.buildEntityCandidates()) };
        }
        const entity = this.Entities.find(e => e.entityId === candidate.ID);
        if (!entity) {
            return { Success: false, ErrorMessage: buildEntityNotFoundError(validated.value, this.buildEntityCandidates()) };
        }
        this.openModifyPanel(entity);
        return { Success: true };
    }

    /** Narrow the entity list to a schema (empty string clears it). Read-only. */
    private toolFilterBySchema(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['schema'], 'schema');
        if (!validated.ok) {
            return validated.result;
        }
        if (!this.entityListRef) {
            return { Success: false, ErrorMessage: 'The entity list is not ready yet.' };
        }
        const schema = validated.value.trim();
        const available = this.entityListRef.AvailableFilterSchemas;
        if (schema && !available.includes(schema)) {
            return { Success: false, ErrorMessage: `Schema "${schema}" is not present in the accessible entities. Available schemas: ${available.join(', ') || '(none)'}.` };
        }
        this.entityListRef.SelectedSchema = schema;
        this.cdr.markForCheck();
        this.publishAgentContext();
        return { Success: true };
    }

    /** Reload the accessible-entity list (read-only). */
    private async toolRefreshEntityList(): Promise<AgentToolResult> {
        await this.loadData();
        return { Success: true };
    }

    /**
     * Open the `MJ: Entities` record for an entity in a tab to VIEW its full metadata.
     * Resolves by ID / registered name / display name. Read-only navigation.
     */
    private toolNavigateToEntityRecord(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['entity'], 'entity');
        if (!validated.ok) {
            return validated.result;
        }
        const candidate = resolveEntityByIdOrName(validated.value, this.buildEntityCandidates());
        if (!candidate) {
            return { Success: false, ErrorMessage: buildEntityNotFoundError(validated.value, this.buildEntityCandidates()) };
        }
        this.navigationService.OpenEntityRecord('MJ: Entities', CompositeKey.FromID(candidate.ID));
        return { Success: true };
    }
}

/** Tree-shaking prevention — called from module's public-api.ts. */
export function LoadDatabaseDesignerDashboard(): void { /* noop — forces import */ }
