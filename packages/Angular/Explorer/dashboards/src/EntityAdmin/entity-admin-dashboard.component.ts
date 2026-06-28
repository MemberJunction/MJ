import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { EntityInfo, CompositeKey, Metadata } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ERDCompositeComponent, ERDCompositeState } from '@memberjunction/ng-entity-relationship-diagram';
import { ResourceData, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';

import {
  buildEntityAdminAgentContext,
  buildEntityNotFoundError,
  entityDisplayName,
  resolveEntityByIdOrName,
  EntityNameCandidate,
  RelatedEntitySummary,
  SchemaGroupSummary,
} from './entity-admin-agent-context';
import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';

/** Settings key for ERD state persistence */
const ERD_SETTINGS_KEY = 'MJ.Admin.Entity.ERD';

@Component({
  standalone: false,
  selector: 'mj-entity-admin-dashboard',
  templateUrl: './entity-admin-dashboard.component.html',
  styleUrls: ['./entity-admin-dashboard.component.css']
})
@RegisterClass(BaseDashboard, 'EntityAdmin')
export class EntityAdminDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  @ViewChild('erdComposite', { static: false }) erdComposite!: ERDCompositeComponent;

  public isLoading = false;
  public isRefreshingERD = false;
  public loadingMessage = '';
  public error: string | null = null;

  // Filter panel visibility for header controls
  public filterPanelVisible = true;
  public selectedEntity: EntityInfo | null = null;
  public filteredEntities: EntityInfo[] = [];

  /** Total unfiltered entity count — feeds the chrome's X-of-Y badge. */
  public get TotalEntityCount(): number {
    return this.erdComposite?.entities?.length ?? 0;
  }

  // State management
  private userStateChangeSubject = new Subject<ERDCompositeState>();
  private hasLoadedUserState = false;
  private metadata = this.ProviderToUse;
  private userSettingEntity: MJUserSettingEntity | null = null;

  ngAfterViewInit(): void {
    // Setup debounced state persistence to MJ: User Settings
    this.userStateChangeSubject.pipe(
      debounceTime(1000)
    ).subscribe(state => {
      this.saveStateToUserSettings(state);
    });

    // Publish the initial agent context and register the (read-only) client tools
    // the AI agent can invoke against this surface. Ongoing re-emit happens in
    // onStateChange (every ERD state change).
    this.publishAgentContext();
    this.registerAgentClientTools();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Entity Administration"
  }

  override ngOnDestroy(): void {
    this.userStateChangeSubject.complete();
    super.ngOnDestroy();
  }

  protected initDashboard(): void {
    // Initialize dashboard - called by BaseDashboard
  }

  protected loadData(): void {
    // Data loading is handled by ERDCompositeComponent
  }

  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
    if (this.erdComposite) {
      this.erdComposite.onToggleFilterPanel();
    }
  }

  public onStateChange(state: ERDCompositeState): void {
    // Update local state to keep header controls in sync
    this.filterPanelVisible = state.filterPanelVisible;
    this.filteredEntities = this.erdComposite?.filteredEntities || [];

    if (state.selectedEntityId && this.erdComposite) {
      this.selectedEntity = this.erdComposite.entities.find(e => UUIDsEqual(e.ID, state.selectedEntityId)) || null;
    } else {
      this.selectedEntity = null;
    }

    // Load user state when data becomes available for the first time
    if (this.erdComposite?.isDataLoaded && !this.hasLoadedUserState) {
      this.hasLoadedUserState = true;
      this.loadStateFromUserSettings();
    }

    // Keep the AI agent's view of this surface in sync with every ERD state change
    // (entity selection, filter panel visibility, filtered count, etc.).
    this.publishAgentContext();
  }

  public onUserStateChange(state: ERDCompositeState): void {
    // Queue state for debounced persistence
    this.userStateChangeSubject.next(state);
  }

  public onEntityOpened(entity: EntityInfo): void {
    this.openEntity(entity);
  }

  public onOpenRecord(event: {EntityName: string, RecordID: string}): void {
    this.OpenEntityRecord.emit({
      EntityName: event.EntityName,
      RecordPKey: new CompositeKey([{FieldName: 'ID', Value: event.RecordID}])
    });
  }

  public openEntity(entity: EntityInfo): void {
    this.Interaction.emit({
      type: 'openEntity',
      entity: entity,
      data: { entityId: entity.ID, entityName: entity.Name }
    });
  }

  /**
   * Load ERD state from MJ: User Settings entity using UserInfoEngine for cached access
   */
  private async loadStateFromUserSettings(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) {
        this.NotifyLoadComplete();
        return;
      }

      const engine = UserInfoEngine.Instance;

      // Find setting from cached user settings
      const setting = engine.UserSettings.find(s => s.Setting === ERD_SETTINGS_KEY);

      if (setting) {
        this.userSettingEntity = setting;
        if (this.userSettingEntity.Value) {
          const savedState = JSON.parse(this.userSettingEntity.Value) as Partial<ERDCompositeState>;
          if (this.erdComposite) {
            this.erdComposite.loadUserState(savedState);
          }
        }
      }

      this.NotifyLoadComplete();
    } catch (error) {
      console.warn('Failed to load ERD state from User Settings:', error);
      this.NotifyLoadComplete();
    }
  }

  /**
   * Save ERD state to MJ: User Settings entity using UserInfoEngine for cached lookup
   */
  private async saveStateToUserSettings(state: ERDCompositeState): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      // Find existing setting from cached user settings if not already loaded
      if (!this.userSettingEntity) {
        const engine = UserInfoEngine.Instance;
        const setting = engine.UserSettings.find(s => s.Setting === ERD_SETTINGS_KEY);

        if (setting) {
          this.userSettingEntity = setting;
        } else {
          this.userSettingEntity = await this.metadata.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
          this.userSettingEntity.UserID = userId;
          this.userSettingEntity.Setting = ERD_SETTINGS_KEY;
        }
      }

      // Save the state as JSON
      this.userSettingEntity.Value = JSON.stringify(state);
      await this.userSettingEntity.Save();
    } catch (error) {
      console.warn('Failed to save ERD state to User Settings:', error);
    }
  }

  // ========================================
  // AI AGENT CONTEXT & CLIENT TOOLS
  //
  // 🔒 SAFETY BOUNDARY: The Entity Admin surface is a metadata BROWSER (the ERD
  // entity explorer). The context published and the tools registered below are
  // STRICTLY READ-ONLY / NAVIGATIONAL — select/clear an entity, toggle the filter
  // panel, refresh the diagram. NO tool here (and none added in future) may edit,
  // create, or delete entity metadata, alter schema, or perform any other mutation.
  // The agent browses; the user makes changes from the dedicated entity forms.
  // ========================================

  /**
   * Publish the current Entity Admin ERD-browser state to the AI agent via
   * NavigationService. Reports — at Data-Explorer depth — the entity counts (total +
   * filtered), the active filter values (schema / search / status), the current
   * selection (id + registered name + DISPLAY name + schema + description + field count
   * + a bounded relationship summary), filter-panel visibility, a bounded list of
   * available entity DISPLAY names, and the schema-grouping landscape. The shaping lives
   * in the pure {@link buildEntityAdminAgentContext} helper so it stays unit-testable.
   * Called on init (ngAfterViewInit) and on every ERD state change (onStateChange).
   */
  private publishAgentContext(): void {
    const filters = this.erdComposite?.filters;
    const context = buildEntityAdminAgentContext({
      TotalEntityCount: this.TotalEntityCount,
      FilteredEntityCount: this.filteredEntities.length,
      SelectedEntityId: this.selectedEntity?.ID ?? null,
      SelectedEntityName: this.selectedEntity?.Name ?? null,
      SelectedEntityDisplayName: this.selectedEntity
        ? entityDisplayName(this.selectedEntity.Name, this.selectedEntity.DisplayName)
        : null,
      SelectedEntitySchema: this.selectedEntity?.SchemaName ?? null,
      SelectedEntityDescription: this.selectedEntity?.Description ?? null,
      SelectedEntityFieldCount: this.selectedEntity?.Fields?.length ?? null,
      RelatedEntities: this.buildRelatedEntitySummaries(),
      FilterPanelVisible: this.filterPanelVisible,
      SchemaFilter: filters?.schemaName ?? null,
      SearchText: filters?.entityName ?? '',
      StatusFilter: filters?.entityStatus ?? null,
      AvailableEntityNames: this.filteredEntities.map(e => entityDisplayName(e.Name, e.DisplayName)),
      SchemaGroups: this.buildSchemaGroupSummaries(),
    });
    this.navigationService.SetAgentContext(this, context);
  }

  /** Related-entity summaries for the selected entity (display name + relationship type). */
  private buildRelatedEntitySummaries(): RelatedEntitySummary[] {
    if (!this.selectedEntity) {
      return [];
    }
    return this.selectedEntity.RelatedEntities.map(re => ({
      Name: re.RelatedEntity ?? re.RelatedEntityID ?? '(unknown)',
      RelationshipType: re.Type ?? 'Related',
    }));
  }

  /** Schema-grouping summaries across the currently-visible (filtered) entities. */
  private buildSchemaGroupSummaries(): SchemaGroupSummary[] {
    const counts = new Map<string, number>();
    for (const e of this.filteredEntities) {
      const schema = e.SchemaName || '(no schema)';
      counts.set(schema, (counts.get(schema) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([SchemaName, EntityCount]) => ({ SchemaName, EntityCount }))
      .sort((a, b) => b.EntityCount - a.EntityCount);
  }

  /** The ERD's loaded entities, narrowed to the resolver's structural shape. */
  private get entityCandidates(): EntityNameCandidate[] {
    return this.erdComposite?.entities ?? [];
  }

  /**
   * Register the (read-only / navigational) client tools the AI agent can invoke
   * against the Entity Admin ERD. Each handler delegates to the same component or
   * ERD method a user interaction would call, and returns `{ Success: true }` on
   * success or `{ Success: false, ErrorMessage }` on failure. Handlers never throw.
   *
   * Tools (browse only — see SAFETY BOUNDARY above):
   * - SelectEntity: select/focus an entity by its ID, registered Name, or DISPLAY name.
   * - ToggleFilterPanel: show/hide the ERD filter panel.
   * - ClearEntitySelection: deselect the currently selected entity.
   * - RefreshERD: re-render the ERD diagram.
   * - FilterEntities: narrow the ERD by schema and/or a name search.
   * - NavigateToEntityRecord: open an entity's record list/view (read-only navigation).
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SelectEntity',
        Description: 'Select and focus an entity in the ERD by its ID, registered name, or the display name shown on screen (e.g. "AI Models" rather than "MJ: AI Models"). Read-only — opens nothing for edit.',
        ParameterSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Entity ID, registered name, or display name.' } }, required: ['entity'] },
        Handler: async (params: Record<string, unknown>) => this.toolSelectEntity(params),
      },
      {
        Name: 'ToggleFilterPanel',
        Description: 'Show or hide the ERD entity filter panel.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.toggleFilterPanel();
          this.publishAgentContext();
          return { Success: true };
        },
      },
      {
        Name: 'ClearEntitySelection',
        Description: 'Clear the currently selected entity in the ERD.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.toolClearEntitySelection(),
      },
      {
        Name: 'RefreshERD',
        Description: 'Re-render the ERD diagram (no data is modified).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.toolRefreshERD(),
      },
      {
        Name: 'FilterEntities',
        Description: 'Narrow the entities shown in the ERD by schema name and/or an entity-name search. Pass an empty string for a field to clear it; pass neither to reset all filters. No data is modified.',
        ParameterSchema: {
          type: 'object',
          properties: {
            schema: { type: 'string', description: 'Schema name to filter by (empty string clears it).' },
            search: { type: 'string', description: 'Entity-name search text (empty string clears it).' },
          },
        },
        Handler: async (params: Record<string, unknown>) => this.toolFilterEntities(params),
      },
      {
        Name: 'NavigateToEntityRecord',
        Description: 'Open the record list / data view for an entity (by ID, registered name, or display name) for viewing. Read-only navigation — opens nothing for edit and creates no records.',
        ParameterSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Entity ID, registered name, or display name.' } }, required: ['entity'] },
        Handler: async (params: Record<string, unknown>) => this.toolNavigateToEntityRecord(params),
      },
    ]);
  }

  /** Resolve an entity by ID / registered name / display name and select/focus it. */
  private toolSelectEntity(params: Record<string, unknown>): AgentToolResult {
    const validated = validateStringParam(params['entity'], 'entity');
    if (!validated.ok) {
      return validated.result;
    }
    if (!this.erdComposite) {
      return { Success: false, ErrorMessage: 'The ERD is not ready yet.' };
    }
    const candidates = this.entityCandidates;
    const match = resolveEntityByIdOrName(validated.value, candidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildEntityNotFoundError(validated.value, candidates) };
    }
    const entity = this.erdComposite.entities.find(e => UUIDsEqual(e.ID, match.ID));
    if (!entity) {
      return { Success: false, ErrorMessage: buildEntityNotFoundError(validated.value, candidates) };
    }
    this.erdComposite.onEntitySelected(entity);
    return { Success: true, ErrorMessage: undefined };
  }

  /** Deselect the currently selected entity in the ERD. */
  private toolClearEntitySelection(): AgentToolResult {
    if (!this.erdComposite) {
      return { Success: false, ErrorMessage: 'The ERD is not ready yet.' };
    }
    this.erdComposite.onEntityDeselected();
    return { Success: true };
  }

  /** Re-render the ERD diagram. */
  private toolRefreshERD(): AgentToolResult {
    if (!this.erdComposite) {
      return { Success: false, ErrorMessage: 'The ERD is not ready yet.' };
    }
    this.erdComposite.refreshERD();
    return { Success: true };
  }

  /** Narrow the ERD by schema and/or a name search (read-only — only changes what's shown). */
  private toolFilterEntities(params: Record<string, unknown>): AgentToolResult {
    if (!this.erdComposite) {
      return { Success: false, ErrorMessage: 'The ERD is not ready yet.' };
    }
    const schemaRaw = params['schema'];
    const searchRaw = params['search'];

    // Neither provided → reset all filters.
    if (schemaRaw === undefined && searchRaw === undefined) {
      this.erdComposite.onResetFilters();
      this.publishAgentContext();
      return { Success: true };
    }

    const next = { ...this.erdComposite.filters };
    if (schemaRaw !== undefined) {
      const validated = validateStringParam(schemaRaw, 'schema');
      if (!validated.ok) {
        return validated.result;
      }
      const schema = validated.value.trim();
      // Tolerant case-insensitive match against the known schemas; empty clears it.
      if (!schema) {
        next.schemaName = null;
      } else {
        const known = Array.from(new Set(this.entityCandidates.map(e => (e as { SchemaName?: string }).SchemaName).filter((s): s is string => !!s)));
        const resolved = known.find(s => s.toLowerCase() === schema.toLowerCase());
        if (!resolved) {
          return { Success: false, ErrorMessage: `No schema matches "${schema}". Available schemas: ${known.join(', ') || '(none)'}.` };
        }
        next.schemaName = resolved;
      }
    }
    if (searchRaw !== undefined) {
      const validated = validateStringParam(searchRaw, 'search');
      if (!validated.ok) {
        return validated.result;
      }
      next.entityName = validated.value;
    }

    this.erdComposite.onFiltersChange(next);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Open an entity's record list / data view for viewing (read-only navigation). */
  private toolNavigateToEntityRecord(params: Record<string, unknown>): AgentToolResult {
    const validated = validateStringParam(params['entity'], 'entity');
    if (!validated.ok) {
      return validated.result;
    }
    const candidates = this.entityCandidates;
    const match = resolveEntityByIdOrName(validated.value, candidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildEntityNotFoundError(validated.value, candidates) };
    }
    // Open the entity's dynamic record view (read-only navigation — no edit, no create).
    this.navigationService.OpenDynamicView(match.Name);
    return { Success: true };
  }
}
