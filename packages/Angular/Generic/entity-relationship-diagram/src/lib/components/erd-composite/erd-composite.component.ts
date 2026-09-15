import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJEntityERDComponent } from '../mj-entity-erd.component';
import { EntitySelectedEvent, OpenEntityRecordEvent } from '../mj-entity-erd.component';
import { ERDConfig, ERDState } from '../../interfaces/erd-types';
import { EntityFilter } from '../entity-filter-panel/entity-filter-panel.component';

/**
 * State object for the ERD composite component.
 * Used for state persistence and restoration.
 */
export interface ERDCompositeState {
  filterPanelVisible: boolean;
  filterPanelWidth: number;
  filters: EntityFilter;
  selectedEntityId: string | null;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  fieldsSectionExpanded: boolean;
  relationshipsSectionExpanded: boolean;
  /** User's preferred layout algorithm — 'schema-grid' (default) or 'dagre'. */
  layoutAlgorithm?: 'schema-grid' | 'dagre';
}

/**
 * ERD Composite component that combines the ERD diagram with filter and details panels.
 *
 * This is a complete, ready-to-use ERD exploration interface that includes:
 * - Left panel: Entity filter controls (schema, name, status, etc.)
 * - Center: Interactive ERD diagram
 * - Right panel: Entity details (shown when an entity is selected)
 *
 * The component handles all internal state but emits events for:
 * - State changes (for parent to persist user preferences)
 * - Open record requests (for parent to handle navigation)
 *
 * ## Usage
 *
 * ```html
 * <mj-erd-composite
 *   (stateChange)="onStateChange($event)"
 *   (userStateChange)="saveUserPreferences($event)"
 *   (openRecord)="navigateToRecord($event)">
 * </mj-erd-composite>
 * ```
 *
 * ## State Persistence
 *
 * The component emits `userStateChange` events (debounced 1s) when user changes
 * any settings. The parent should save this state and restore it using `loadUserState()`:
 *
 * ```typescript
 * @ViewChild(ERDCompositeComponent) erdComposite!: ERDCompositeComponent;
 *
 * ngAfterViewInit() {
 *   const savedState = await this.loadSavedState();
 *   if (savedState) {
 *     this.erdComposite.loadUserState(savedState);
 *   }
 * }
 *
 * onUserStateChange(state: ERDCompositeState) {
 *   await this.saveState(state);
 * }
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-erd-composite',
  templateUrl: './erd-composite.component.html',
  styleUrls: ['./erd-composite.component.css']
})
export class ERDCompositeComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @ViewChild(MJEntityERDComponent) mjEntityErd!: MJEntityERDComponent;

  /** Whether the ERD is in a refreshing state */
  @Input() IsRefreshingERD = false;

  /** @deprecated Use {@link IsRefreshingERD}. */
  @Input() set isRefreshingERD(value: ERDCompositeComponent['IsRefreshingERD']) {
    this.IsRefreshingERD = value;
  }
  /** @deprecated Use {@link IsRefreshingERD}. */
  get isRefreshingERD(): ERDCompositeComponent['IsRefreshingERD'] {
    return this.IsRefreshingERD;
  }

  /**
   * Optional: Focus entities to display in the ERD.
   * When provided, only these entities will be shown (useful for single-entity views).
   * When not provided, all entities from metadata are loaded.
   */
  @Input() FocusEntities: EntityInfo[] | null = null;

  /** @deprecated Use {@link FocusEntities}. */
  @Input() set focusEntities(value: EntityInfo[] | null) {
    this.FocusEntities = value;
  }
  /** @deprecated Use {@link FocusEntities}. */
  get focusEntities(): EntityInfo[] | null {
    return this.FocusEntities;
  }

  /**
   * Whether to show the filter panel on the left.
   * Set to false for focused/single-entity views.
   */
  @Input() ShowFilterPanel = true;

  /** @deprecated Use {@link ShowFilterPanel}. */
  @Input() set showFilterPanel(value: ERDCompositeComponent['ShowFilterPanel']) {
    this.ShowFilterPanel = value;
  }
  /** @deprecated Use {@link ShowFilterPanel}. */
  get showFilterPanel(): ERDCompositeComponent['ShowFilterPanel'] {
    return this.ShowFilterPanel;
  }

  /**
   * Depth of relationships to display.
   * 1 = only direct relationships, 2 = relationships of relationships, etc.
   */
  @Input() Depth = 1;

  /** @deprecated Use {@link Depth}. */
  @Input() set depth(value: ERDCompositeComponent['Depth']) {
    this.Depth = value;
  }
  /** @deprecated Use {@link Depth}. */
  get depth(): ERDCompositeComponent['Depth'] {
    return this.Depth;
  }

  /**
   * Whether to show the ERD header bar.
   */
  @Input() ShowHeader = true;

  /** @deprecated Use {@link ShowHeader}. */
  @Input() set showHeader(value: ERDCompositeComponent['ShowHeader']) {
    this.ShowHeader = value;
  }
  /** @deprecated Use {@link ShowHeader}. */
  get showHeader(): ERDCompositeComponent['ShowHeader'] {
    return this.ShowHeader;
  }

  /** All entities loaded from metadata */
  public Entities: EntityInfo[] = [];

  /** @deprecated Use {@link Entities}. */
  public get entities(): EntityInfo[] {
    return this.Entities;
  }
  /** @deprecated Use {@link Entities}. */
  public set entities(value: EntityInfo[]) {
    this.Entities = value;
  }

  /** All entity fields (flattened from all entities) */
  public AllEntityFields: EntityFieldInfo[] = [];

  /** @deprecated Use {@link AllEntityFields}. */
  public get allEntityFields(): EntityFieldInfo[] {
    return this.AllEntityFields;
  }
  /** @deprecated Use {@link AllEntityFields}. */
  public set allEntityFields(value: EntityFieldInfo[]) {
    this.AllEntityFields = value;
  }

  /** Emitted on any state change (debounced 50ms) */
  @Output() StateChange = new EventEmitter<ERDCompositeState>();

  /**
   * @deprecated Use {@link StateChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (stateChange) keeps working. Must stay AFTER StateChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() stateChange = this.StateChange;

  /** Emitted on user-initiated state changes (debounced 1s) for persistence */
  @Output() UserStateChange = new EventEmitter<ERDCompositeState>();

  /**
   * @deprecated Use {@link UserStateChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (userStateChange) keeps working. Must stay AFTER UserStateChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() userStateChange = this.UserStateChange;

  /** Emitted when an entity is opened (e.g., double-clicked in details panel) */
  @Output() EntityOpened = new EventEmitter<EntityInfo>();

  /**
   * @deprecated Use {@link EntityOpened}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (entityOpened) keeps working. Must stay AFTER EntityOpened: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() entityOpened = this.EntityOpened;

  /** Emitted when requesting to open an entity record (for navigation) */
  @Output() OpenRecord = new EventEmitter<{EntityName: string, RecordID: string}>();

  /**
   * @deprecated Use {@link OpenRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openRecord) keeps working. Must stay AFTER OpenRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openRecord = this.OpenRecord;

  // Panel visibility and configuration
  public FilterPanelVisible = true;

  /** @deprecated Use {@link FilterPanelVisible}. */
  public get filterPanelVisible() {
    return this.FilterPanelVisible;
  }
  /** @deprecated Use {@link FilterPanelVisible}. */
  public set filterPanelVisible(value) {
    this.FilterPanelVisible = value;
  }
  public FieldsSectionExpanded = true;

  /** @deprecated Use {@link FieldsSectionExpanded}. */
  public get fieldsSectionExpanded() {
    return this.FieldsSectionExpanded;
  }
  /** @deprecated Use {@link FieldsSectionExpanded}. */
  public set fieldsSectionExpanded(value) {
    this.FieldsSectionExpanded = value;
  }
  public RelationshipsSectionExpanded = true;

  /** @deprecated Use {@link RelationshipsSectionExpanded}. */
  public get relationshipsSectionExpanded() {
    return this.RelationshipsSectionExpanded;
  }
  /** @deprecated Use {@link RelationshipsSectionExpanded}. */
  public set relationshipsSectionExpanded(value) {
    this.RelationshipsSectionExpanded = value;
  }

  /** ERD configuration - skip animation for faster rendering */
  public ErdConfig: ERDConfig = { skipAnimation: true };

  /** @deprecated Use {@link ErdConfig}. */
  public get erdConfig(): ERDConfig {
    return this.ErdConfig;
  }
  /** @deprecated Use {@link ErdConfig}. */
  public set erdConfig(value: ERDConfig) {
    this.ErdConfig = value;
  }

  // Entity state
  public SelectedEntity: EntityInfo | null = null;

  /** @deprecated Use {@link SelectedEntity}. */
  public get selectedEntity(): EntityInfo | null {
    return this.SelectedEntity;
  }
  /** @deprecated Use {@link SelectedEntity}. */
  public set selectedEntity(value: EntityInfo | null) {
    this.SelectedEntity = value;
  }
  public FilteredEntities: EntityInfo[] = [];

  /** @deprecated Use {@link FilteredEntities}. */
  public get filteredEntities(): EntityInfo[] {
    return this.FilteredEntities;
  }
  /** @deprecated Use {@link FilteredEntities}. */
  public set filteredEntities(value: EntityInfo[]) {
    this.FilteredEntities = value;
  }
  public IsDataLoaded = false;

  /** @deprecated Use {@link IsDataLoaded}. */
  public get isDataLoaded() {
    return this.IsDataLoaded;
  }
  /** @deprecated Use {@link IsDataLoaded}. */
  public set isDataLoaded(value) {
    this.IsDataLoaded = value;
  }

  // Filters
  public Filters: EntityFilter = {
    schemaName: null,
    entityName: '',
    entityStatus: null,
    baseTable: '',
  };

  /** @deprecated Use {@link Filters}. */
  public get filters(): EntityFilter {
    return this.Filters;
  }
  /** @deprecated Use {@link Filters}. */
  public set filters(value: EntityFilter) {
    this.Filters = value;
  }

  // State management
  private stateChangeSubject = new Subject<ERDCompositeState>();
  private userStateChangeSubject = new Subject<ERDCompositeState>();
  private filterChangeSubject = new Subject<void>();

  async ngOnInit(): Promise<void> {
    // Initialize filter panel visibility based on input
    this.FilterPanelVisible = this.ShowFilterPanel;

    this.setupStateManagement();
    await this.loadData();

    // Use focusEntities if provided, otherwise use all entities
    if (this.FocusEntities && this.FocusEntities.length > 0) {
      this.FilteredEntities = [...this.FocusEntities];
    } else {
      this.FilteredEntities = [...this.Entities];
      this.applyFilters();
    }

    this.IsDataLoaded = true;

    // Notify parent that data is loaded and ready for state loading
    this.emitStateChange();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
    this.userStateChangeSubject.complete();
    this.filterChangeSubject.complete();
  }

  private async loadData(): Promise<void> {
    // Load entities from metadata (always needed for allEntityFields and relationship lookups)
    const md = this.ProviderToUse;
    this.Entities = md.Entities;

    // Load all entity fields from entities
    this.AllEntityFields = this.Entities
      .map((entity) => {
        return entity.Fields;
      })
      .flat();
  }

  private setupStateManagement(): void {
    // State change emissions with debouncing
    this.stateChangeSubject.pipe(
      debounceTime(50)
    ).subscribe(state => {
      this.StateChange.emit(state);
    });

    this.userStateChangeSubject.pipe(
      debounceTime(1000)
    ).subscribe(state => {
      this.UserStateChange.emit(state);
    });

    // Filter changes with debouncing
    this.filterChangeSubject.pipe(
      debounceTime(300)
    ).subscribe(() => {
      this.applyFilters();
      this.emitStateChange();
      this.emitUserStateChange();
    });
  }

  public onFilterChange(): void {
    this.filterChangeSubject.next();
  }

  public OnFiltersChange(newFilters: EntityFilter): void {
    this.Filters = { ...newFilters };
    this.onFilterChange();
  }

  /** @deprecated Use {@link OnFiltersChange}. */
  public onFiltersChange(newFilters: EntityFilter): void {
    return this.OnFiltersChange(newFilters);
  }

  public OnResetFilters(): void {
    this.Filters = {
      schemaName: null,
      entityName: '',
      entityStatus: null,
      baseTable: '',
    };
    this.onFilterChange();
  }

  /** @deprecated Use {@link OnResetFilters}. */
  public onResetFilters(): void {
    return this.OnResetFilters();
  }

  public OnToggleFilterPanel(): void {
    this.FilterPanelVisible = !this.FilterPanelVisible;

    // Trigger ERD resize when filter panel is toggled
    if (this.mjEntityErd) {
      this.mjEntityErd.triggerResize();
    }

    this.emitStateChange();
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnToggleFilterPanel}. */
  public onToggleFilterPanel(): void {
    return this.OnToggleFilterPanel();
  }

  public OnEntityDeselected(): void {
    this.SelectedEntity = null;

    this.emitStateChange();
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnEntityDeselected}. */
  public onEntityDeselected(): void {
    return this.OnEntityDeselected();
  }

  public OnEntitySelected(entity: EntityInfo): void {
    this.SelectedEntity = entity;

    // Bring the entity into view in the diagram and emit nodeSelected
    // upstream so the focus + highlight logic kicks in.  Done in a
    // microtask so the [focusEntityId] binding flushes first and the
    // inner diagram has the new focus state when we ask it to center.
    queueMicrotask(() => {
      this.mjEntityErd?.zoomToEntity(entity.ID);
    });

    this.emitStateChange();
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnEntitySelected}. */
  public onEntitySelected(entity: EntityInfo): void {
    return this.OnEntitySelected(entity);
  }

  /**
   * Handle entity selection from the mj-entity-erd wrapper.
   * Updates internal state.
   */
  public OnERDEntitySelected(event: EntitySelectedEvent): void {
    this.SelectedEntity = event.entity;
    this.emitStateChange();
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnERDEntitySelected}. */
  public onERDEntitySelected(event: EntitySelectedEvent): void {
    return this.OnERDEntitySelected(event);
  }

  /**
   * Handle open record from the mj-entity-erd wrapper (double-click).
   * Opens the entity record using the entity form.
   */
  public OnERDOpenRecord(event: OpenEntityRecordEvent): void {
    this.OpenRecord.emit({ EntityName: event.EntityName, RecordID: event.RecordID });
  }

  /** @deprecated Use {@link OnERDOpenRecord}. */
  public onERDOpenRecord(event: OpenEntityRecordEvent): void {
    return this.OnERDOpenRecord(event);
  }

  /**
   * Handle state changes from the ERD component.
   */
  public OnERDStateChange(_state: ERDState): void {
    // State changes are tracked for user preference persistence
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnERDStateChange}. */
  public onERDStateChange(_state: ERDState): void {
    return this.OnERDStateChange(_state);
  }

  public OnEntityOpened(entity: EntityInfo): void {
    this.EntityOpened.emit(entity);
  }

  /** @deprecated Use {@link OnEntityOpened}. */
  public onEntityOpened(entity: EntityInfo): void {
    return this.OnEntityOpened(entity);
  }

  public OnFieldsSectionToggle(): void {
    this.FieldsSectionExpanded = !this.FieldsSectionExpanded;
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnFieldsSectionToggle}. */
  public onFieldsSectionToggle(): void {
    return this.OnFieldsSectionToggle();
  }

  public OnRelationshipsSectionToggle(): void {
    this.RelationshipsSectionExpanded = !this.RelationshipsSectionExpanded;
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnRelationshipsSectionToggle}. */
  public onRelationshipsSectionToggle(): void {
    return this.OnRelationshipsSectionToggle();
  }

  public OnOpenRecord(event: {EntityName: string, RecordID: string}): void {
    this.OpenRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenRecord}. */
  public onOpenRecord(event: {EntityName: string, RecordID: string}): void {
    return this.OnOpenRecord(event);
  }

  public OnSplitterLayoutChange(_event: unknown): void {
    // Trigger ERD diagram resize when splitter layout changes
    if (this.mjEntityErd) {
      this.mjEntityErd.triggerResize();
    }

    this.emitStateChange();
    this.emitUserStateChange();
  }

  /** @deprecated Use {@link OnSplitterLayoutChange}. */
  public onSplitterLayoutChange(_event: unknown): void {
    return this.OnSplitterLayoutChange(_event);
  }

  private applyFilters(): void {
    this.FilteredEntities = this.Entities.filter(entity => {
      // Schema filter
      if (this.Filters.schemaName && entity.SchemaName !== this.Filters.schemaName) {
        return false;
      }

      // Entity name filter
      if (this.Filters.entityName) {
        const searchTerm = this.Filters.entityName.toLowerCase();
        const entityName = (entity.Name || entity.SchemaName || '').toLowerCase();
        if (!entityName.includes(searchTerm)) {
          return false;
        }
      }

      // Base table filter
      if (this.Filters.baseTable) {
        const searchTerm = this.Filters.baseTable.toLowerCase();
        const baseTable = (entity.BaseTable || '').toLowerCase();
        if (!baseTable.includes(searchTerm)) {
          return false;
        }
      }

      // Status filter
      if (this.Filters.entityStatus && entity.Status !== this.Filters.entityStatus) {
        return false;
      }

      return true;
    });
  }

  private emitStateChange(): void {
    const state = this.buildState();
    this.stateChangeSubject.next(state);
  }

  private emitUserStateChange(): void {
    const state = this.buildState();
    this.userStateChangeSubject.next(state);
  }

  private buildState(): ERDCompositeState {
    return {
      filterPanelVisible: this.FilterPanelVisible,
      filterPanelWidth: 320,
      filters: { ...this.Filters },
      selectedEntityId: this.SelectedEntity?.ID || null,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
      fieldsSectionExpanded: this.FieldsSectionExpanded,
      relationshipsSectionExpanded: this.RelationshipsSectionExpanded,
      layoutAlgorithm: this.mjEntityErd?.erdDiagram?.activeLayout ?? 'schema-grid',
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Load user state from a previously saved state object.
   * Call this after the component is initialized to restore user preferences.
   */
  public LoadUserState(state: Partial<ERDCompositeState>): void {
    if (state.filterPanelVisible !== undefined) {
      this.FilterPanelVisible = state.filterPanelVisible;
    }
    if (state.filters) {
      this.Filters = { ...state.filters };
    }
    if (state.fieldsSectionExpanded !== undefined) {
      this.FieldsSectionExpanded = state.fieldsSectionExpanded;
    }
    if (state.relationshipsSectionExpanded !== undefined) {
      this.RelationshipsSectionExpanded = state.relationshipsSectionExpanded;
    }
    if (state.selectedEntityId && this.Entities.length > 0) {
      const entity = this.Entities.find(e => UUIDsEqual(e.ID, state.selectedEntityId));
      if (entity) {
        this.SelectedEntity = entity;
      }
    } else {
      this.SelectedEntity = null;
    }

    // Restore preferred layout algorithm.  Deferred to microtask so the
    // diagram has mounted by the time we set it.
    if (state.layoutAlgorithm) {
      const algo = state.layoutAlgorithm;
      queueMicrotask(() => this.mjEntityErd?.erdDiagram?.setLayoutAlgorithm(algo));
    }

    this.applyFilters();
  }

  /** @deprecated Use {@link LoadUserState}. */
  public loadUserState(state: Partial<ERDCompositeState>): void {
    return this.LoadUserState(state);
  }

  /**
   * Refresh the ERD diagram.
   */
  public RefreshERD(): void {
    if (this.mjEntityErd) {
      this.mjEntityErd.refresh();
    }
  }

  /** @deprecated Use {@link RefreshERD}. */
  public refreshERD(): void {
    return this.RefreshERD();
  }

  /**
   * Get the current state for external use.
   */
  public GetState(): ERDCompositeState {
    return this.buildState();
  }

  /** @deprecated Use {@link GetState}. */
  public getState(): ERDCompositeState {
    return this.GetState();
  }
}
