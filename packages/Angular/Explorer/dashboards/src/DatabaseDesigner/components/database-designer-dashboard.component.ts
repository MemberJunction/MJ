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

import { DatabaseDesignerEngine } from '../services/database-designer.engine.js';
import { DatabaseDesignerService } from '../services/database-designer.service.js';
import { DatabaseModifyComponent } from './modify/database-modify.component.js';
import { EntityListComponent } from './entity-list.component.js';
import type { AccessibleEntity } from '../database-designer.types.js';
import { buildDatabaseDesignerAgentContext } from '../database-designer-agent-context.js';
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
        this.UpdateQueryParams({ entity: entity.entityId });
        this.cdr.markForCheck();
        this.publishAgentContext();
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
     * Name of the entity whose detail panel is open, resolved from the loaded list.
     * Null when nothing is selected or the id is not (yet) in the list.
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

    /**
     * Publish the current Database Designer schema-browse state to the AI agent via
     * NavigationService. Reports the accessible-entity count, the current search term,
     * the open selection (id + name), whether the modify/detail panel is open, and the
     * loading flag. The shaping lives in the pure {@link buildDatabaseDesignerAgentContext}
     * helper so it stays unit-testable. Called on init (ngAfterViewInit) and on every
     * browse-state change (load, open/close panel).
     */
    private publishAgentContext(): void {
        const context = buildDatabaseDesignerAgentContext({
            EntityCount: this.Entities.length,
            SearchText: this.currentSearchText,
            SelectedEntityId: this.ModifyEntityId,
            SelectedEntityName: this.SelectedEntityName,
            ShowModifyPanel: !!this.ModifyEntityId,
            IsLoading: this.IsLoadingEntities,
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the READ-ONLY (schema-browse) client tools the AI agent can invoke
     * against the Database Designer. Each handler delegates to the same read-only path a
     * user interaction would take and returns `{ Success: true }` on success or
     * `{ Success: false, ErrorMessage }` on failure. Handlers never throw.
     *
     * Tools (browse only — see SAFETY BOUNDARY above):
     * - SearchEntities: filter the accessible-entity list by a search string.
     * - SelectEntity: open an entity's detail panel by its ID (VIEW context — never applies).
     * - RefreshEntityList: reload the accessible-entity list.
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
                Description: "Open an entity's detail panel by its entity ID to VIEW its schema (read-only — opens the panel but never applies, saves, or runs any change).",
                ParameterSchema: { type: 'object', properties: { entityId: { type: 'string' } }, required: ['entityId'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectEntity(params),
            },
            {
                Name: 'RefreshEntityList',
                Description: 'Reload the accessible-entity list (no schema is modified).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.toolRefreshEntityList(),
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
     * Open an entity's detail panel by ID to VIEW its schema. This opens the SAME panel the
     * user edits in, but the agent only opens it for browsing — it applies nothing.
     */
    private toolSelectEntity(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['entityId'], 'entityId');
        if (!validated.ok) {
            return validated.result;
        }
        const entity = this.Entities.find(e => e.entityId === validated.value);
        if (!entity) {
            return { Success: false, ErrorMessage: `Entity with ID "${validated.value}" is not available in the designer.` };
        }
        this.openModifyPanel(entity);
        return { Success: true };
    }

    /** Reload the accessible-entity list (read-only). */
    private async toolRefreshEntityList(): Promise<AgentToolResult> {
        await this.loadData();
        return { Success: true };
    }
}

/** Tree-shaking prevention — called from module's public-api.ts. */
export function LoadDatabaseDesignerDashboard(): void { /* noop — forces import */ }
