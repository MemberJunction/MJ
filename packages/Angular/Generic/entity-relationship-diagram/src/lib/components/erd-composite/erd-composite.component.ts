import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo, Metadata } from '@memberjunction/core';
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
export class ERDCompositeComponent implements OnInit, OnDestroy {
  @ViewChild(MJEntityERDComponent) mjEntityErd!: MJEntityERDComponent;

  /** Whether the ERD is in a refreshing state */
  @Input() isRefreshingERD = false;

  /**
   * Optional: Focus entities to display in the ERD.
   * When provided, only these entities will be shown (useful for single-entity views).
   * When not provided, all entities from metadata are loaded.
   */
  @Input() focusEntities: EntityInfo[] | null = null;

  /**
   * Whether to show the filter panel on the left.
   * Set to false for focused/single-entity views.
   */
  @Input() showFilterPanel = true;

  /**
   * Depth of relationships to display.
   * 1 = only direct relationships, 2 = relationships of relationships, etc.
   */
  @Input() depth = 1;

  /**
   * Whether to show the ERD header bar.
   */
  @Input() showHeader = true;

  /** All entities loaded from metadata */
  public entities: EntityInfo[] = [];

  /** All entity fields (flattened from all entities) */
  public allEntityFields: EntityFieldInfo[] = [];

  /** Emitted on any state change (debounced 50ms) */
  @Output() stateChange = new EventEmitter<ERDCompositeState>();

  /** Emitted on user-initiated state changes (debounced 1s) for persistence */
  @Output() userStateChange = new EventEmitter<ERDCompositeState>();

  /** Emitted when an entity is opened (e.g., double-clicked in details panel) */
  @Output() entityOpened = new EventEmitter<EntityInfo>();

  /** Emitted when requesting to open an entity record (for navigation) */
  @Output() openRecord = new EventEmitter<{EntityName: string, RecordID: string}>();

  // Panel visibility and configuration
  public filterPanelVisible = true;
  public fieldsSectionExpanded = true;
  public relationshipsSectionExpanded = true;

  /** ERD configuration - skip animation for faster rendering */
  public erdConfig: ERDConfig = { skipAnimation: true };

  // Entity state
  public selectedEntity: EntityInfo | null = null;
  public filteredEntities: EntityInfo[] = [];
  public isDataLoaded = false;

  // Filters
  public filters: EntityFilter = {
    schemaName: null,
    entityName: '',
    entityStatus: null,
    baseTable: '',
  };

  // State management
  private stateChangeSubject = new Subject<ERDCompositeState>();
  private userStateChangeSubject = new Subject<ERDCompositeState>();
  private filterChangeSubject = new Subject<void>();

  async ngOnInit(): Promise<void> {
    // Initialize filter panel visibility based on input
    this.filterPanelVisible = this.showFilterPanel;

    this.setupStateManagement();
    await this.loadData();

    // Use focusEntities if provided, otherwise use all entities
    if (this.focusEntities && this.focusEntities.length > 0) {
      this.filteredEntities = [...this.focusEntities];
    } else {
      this.filteredEntities = [...this.entities];
      this.applyFilters();
    }

    this.isDataLoaded = true;

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
    const md = new Metadata();
    this.entities = md.Entities;

    // Load all entity fields from entities
    this.allEntityFields = this.entities
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
      this.stateChange.emit(state);
    });

    this.userStateChangeSubject.pipe(
      debounceTime(1000)
    ).subscribe(state => {
      this.userStateChange.emit(state);
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

  public onFiltersChange(newFilters: EntityFilter): void {
    this.filters = { ...newFilters };
    this.onFilterChange();
  }

  public onResetFilters(): void {
    this.filters = {
      schemaName: null,
      entityName: '',
      entityStatus: null,
      baseTable: '',
    };
    this.onFilterChange();
  }

  public onToggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;

    // Trigger ERD resize when filter panel is toggled
    if (this.mjEntityErd) {
      this.mjEntityErd.triggerResize();
    }

    this.emitStateChange();
    this.emitUserStateChange();
  }

  public onEntityDeselected(): void {
    this.selectedEntity = null;

    this.emitStateChange();
    this.emitUserStateChange();
  }

  public onEntitySelected(entity: EntityInfo): void {
    this.selectedEntity = entity;

    this.emitStateChange();
    this.emitUserStateChange();
  }

  /**
   * Handle entity selection from the mj-entity-erd wrapper.
   * Updates internal state.
   */
  public onERDEntitySelected(event: EntitySelectedEvent): void {
    this.selectedEntity = event.entity;
    this.emitStateChange();
    this.emitUserStateChange();
  }

  /**
   * Handle open record from the mj-entity-erd wrapper (double-click).
   * Opens the entity record using the entity form.
   */
  public onERDOpenRecord(event: OpenEntityRecordEvent): void {
    this.openRecord.emit({ EntityName: event.EntityName, RecordID: event.RecordID });
  }

  /**
   * Handle state changes from the ERD component.
   */
  public onERDStateChange(_state: ERDState): void {
    // State changes are tracked for user preference persistence
    this.emitUserStateChange();
  }

  public onEntityOpened(entity: EntityInfo): void {
    this.entityOpened.emit(entity);
  }

  public onFieldsSectionToggle(): void {
    this.fieldsSectionExpanded = !this.fieldsSectionExpanded;
    this.emitUserStateChange();
  }

  public onRelationshipsSectionToggle(): void {
    this.relationshipsSectionExpanded = !this.relationshipsSectionExpanded;
    this.emitUserStateChange();
  }

  public onOpenRecord(event: {EntityName: string, RecordID: string}): void {
    this.openRecord.emit(event);
  }

  public onSplitterLayoutChange(_event: unknown): void {
    // Trigger ERD diagram resize when splitter layout changes
    if (this.mjEntityErd) {
      this.mjEntityErd.triggerResize();
    }

    this.emitStateChange();
    this.emitUserStateChange();
  }

  private applyFilters(): void {
    this.filteredEntities = this.entities.filter(entity => {
      // Schema filter
      if (this.filters.schemaName && entity.SchemaName !== this.filters.schemaName) {
        return false;
      }

      // Entity name filter
      if (this.filters.entityName) {
        const searchTerm = this.filters.entityName.toLowerCase();
        const entityName = (entity.Name || entity.SchemaName || '').toLowerCase();
        if (!entityName.includes(searchTerm)) {
          return false;
        }
      }

      // Base table filter
      if (this.filters.baseTable) {
        const searchTerm = this.filters.baseTable.toLowerCase();
        const baseTable = (entity.BaseTable || '').toLowerCase();
        if (!baseTable.includes(searchTerm)) {
          return false;
        }
      }

      // Status filter
      if (this.filters.entityStatus && entity.Status !== this.filters.entityStatus) {
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
      filterPanelVisible: this.filterPanelVisible,
      filterPanelWidth: 320,
      filters: { ...this.filters },
      selectedEntityId: this.selectedEntity?.ID || null,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
      fieldsSectionExpanded: this.fieldsSectionExpanded,
      relationshipsSectionExpanded: this.relationshipsSectionExpanded,
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Load user state from a previously saved state object.
   * Call this after the component is initialized to restore user preferences.
   */
  public loadUserState(state: Partial<ERDCompositeState>): void {
    if (state.filterPanelVisible !== undefined) {
      this.filterPanelVisible = state.filterPanelVisible;
    }
    if (state.filters) {
      this.filters = { ...state.filters };
    }
    if (state.fieldsSectionExpanded !== undefined) {
      this.fieldsSectionExpanded = state.fieldsSectionExpanded;
    }
    if (state.relationshipsSectionExpanded !== undefined) {
      this.relationshipsSectionExpanded = state.relationshipsSectionExpanded;
    }
    if (state.selectedEntityId && this.entities.length > 0) {
      const entity = this.entities.find(e => e.ID === state.selectedEntityId);
      if (entity) {
        this.selectedEntity = entity;
      }
    } else {
      this.selectedEntity = null;
    }

    this.applyFilters();
  }

  /**
   * Refresh the ERD diagram.
   */
  public refreshERD(): void {
    if (this.mjEntityErd) {
      this.mjEntityErd.refresh();
    }
  }

  /**
   * Get the current state for external use.
   */
  public getState(): ERDCompositeState {
    return this.buildState();
  }
}
