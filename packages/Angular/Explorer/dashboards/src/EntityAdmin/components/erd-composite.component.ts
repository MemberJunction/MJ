import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SplitterModule } from '@progress/kendo-angular-layout';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo, Metadata } from '@memberjunction/core';

import { EntityFilterPanelComponent } from './entity-filter-panel.component';
import { ERDDiagramComponent } from './erd-diagram.component';
import { EntityDetailsComponent } from './entity-details.component';

interface EntityFilter {
  schemaName: string | null;
  entityName: string;
  entityStatus: string | null;
  baseTable: string;
}

interface DashboardState {
  filterPanelVisible: boolean;
  filterPanelWidth: number;
  filters: EntityFilter;
  selectedEntityId: string | null;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  fieldsSectionExpanded: boolean;
  relationshipsSectionExpanded: boolean;
}

@Component({
  selector: 'mj-erd-composite',
  templateUrl: './erd-composite.component.html',
  styleUrls: ['./erd-composite.component.scss']
})
export class ERDCompositeComponent implements OnInit, OnDestroy {
  @ViewChild(ERDDiagramComponent) erdDiagram!: ERDDiagramComponent;
  
  @Input() isRefreshingERD = false;

  // Data loaded internally
  public entities: EntityInfo[] = [];
  public allEntityFields: EntityFieldInfo[] = [];

  @Output() stateChange = new EventEmitter<DashboardState>();
  @Output() userStateChange = new EventEmitter<DashboardState>();
  @Output() entityOpened = new EventEmitter<EntityInfo>();
  @Output() openRecord = new EventEmitter<{EntityName: string, RecordID: string}>();

  // Panel visibility and configuration
  public filterPanelVisible = true;
  public fieldsSectionExpanded = true;
  public relationshipsSectionExpanded = true;

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
  private stateChangeSubject = new Subject<DashboardState>();
  private userStateChangeSubject = new Subject<DashboardState>();
  private filterChangeSubject = new Subject<void>();

  async ngOnInit(): Promise<void> {
    this.setupStateManagement();
    await this.loadData();
    this.filteredEntities = [...this.entities];
    this.applyFilters();
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
    // Load entities
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
    if (this.erdDiagram) {
      this.erdDiagram.triggerResize();
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

  public onSplitterLayoutChange(event: any): void {
    // Trigger ERD diagram resize when splitter layout changes
    if (this.erdDiagram) {
      this.erdDiagram.triggerResize();
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
    const state: DashboardState = {
      filterPanelVisible: this.filterPanelVisible,
      filterPanelWidth: 320,
      filters: { ...this.filters },
      selectedEntityId: this.selectedEntity?.ID || null,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
      fieldsSectionExpanded: this.fieldsSectionExpanded,
      relationshipsSectionExpanded: this.relationshipsSectionExpanded,
    };

    this.stateChangeSubject.next(state);
  }

  private emitUserStateChange(): void {
    const state: DashboardState = {
      filterPanelVisible: this.filterPanelVisible,
      filterPanelWidth: 320,
      filters: { ...this.filters },
      selectedEntityId: this.selectedEntity?.ID || null,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
      fieldsSectionExpanded: this.fieldsSectionExpanded,
      relationshipsSectionExpanded: this.relationshipsSectionExpanded,
    };

    this.userStateChangeSubject.next(state);
  }

  // Public methods for external control
  public loadUserState(state: Partial<DashboardState>): void {
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

  public refreshERD(): void {
    // Emit event to refresh ERD
  }
}