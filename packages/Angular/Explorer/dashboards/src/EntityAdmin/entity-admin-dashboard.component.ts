import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { EntityInfo, CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ERDCompositeComponent } from './components/erd-composite.component';

interface DashboardState {
  filterPanelVisible: boolean;
  filterPanelWidth: number;
  filters: any;
  selectedEntityId: string | null;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  fieldsSectionExpanded: boolean;
  relationshipsSectionExpanded: boolean;
}

@Component({
  selector: 'mj-entity-admin-dashboard',
  templateUrl: './entity-admin-dashboard.component.html',
  styleUrls: ['./entity-admin-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'EntityAdmin')
export class EntityAdminDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  @ViewChild('erdComposite', { static: false }) erdComposite!: ERDCompositeComponent;

  public isLoading = false; // No longer loading data in this component
  public isRefreshingERD = false;
  public loadingMessage = '';
  public error: string | null = null;

  // Filter panel visibility for header controls
  public filterPanelVisible = true;
  public selectedEntity: EntityInfo | null = null;
  public filteredEntities: EntityInfo[] = [];

  // State management
  private userStateChangeSubject = new Subject<DashboardState>();
  private hasLoadedUserState = false;

  ngAfterViewInit(): void {
    // Setup state persistence
    this.userStateChangeSubject.pipe(
      debounceTime(1000)
    ).subscribe(state => {
      this.emitUserStateChange(state);
    });
  }

  ngOnDestroy(): void {
    this.userStateChangeSubject.complete();
  }

  protected initDashboard(): void {
    // Initialize dashboard - called by BaseDashboard
    // This component initializes in ngAfterViewInit instead
  }

  protected loadData(): void {
    // Data loading is now handled by ERDCompositeComponent
  }

  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
    if (this.erdComposite) {
      this.erdComposite.onToggleFilterPanel();
    }
  }


  public onStateChange(state: DashboardState): void {
    // Update local state to keep header controls in sync
    this.filterPanelVisible = state.filterPanelVisible;
    this.filteredEntities = this.erdComposite?.filteredEntities || [];
    
    if (state.selectedEntityId && this.erdComposite) {
      this.selectedEntity = this.erdComposite.entities.find(e => e.ID === state.selectedEntityId) || null;
    } else {
      this.selectedEntity = null;
    }
    
    // Load user state when data becomes available for the first time
    if (this.erdComposite?.isDataLoaded && !this.hasLoadedUserState) {
      this.hasLoadedUserState = true;
      setTimeout(() => {
        this.loadUserStateFromConfiguration();
      }, 100);
    }
  }

  public onUserStateChange(state: DashboardState): void {
    this.userStateChangeSubject.next(state);
  }

  public onEntityOpened(entity: EntityInfo): void {
    // Handle entity opening - could navigate to entity details page
    this.openEntity(entity);
  }

  public onOpenRecord(event: {EntityName: string, RecordID: string}): void {
    // Emit open record event for parent to handle
    this.OpenEntityRecord.emit({
      EntityName: event.EntityName,
      RecordPKey: new CompositeKey([{FieldName: 'ID', Value: event.RecordID}])
    });
  }

  public openEntity(entity: EntityInfo): void {
    // Emit interaction for parent to handle
    this.Interaction.emit({ 
      type: 'openEntity', 
      entity: entity,
      data: { entityId: entity.ID, entityName: entity.Name }
    });
  }

  private loadUserStateFromConfiguration(): void {
    if (this.Config?.userState) {
      try {
        const state = this.Config.userState as Partial<DashboardState>;
        if (this.erdComposite) {
          this.erdComposite.loadUserState(state);
        }
      } catch (error) {
        console.warn('Failed to load user state from configuration:', error);
      }
    }
  }

  private emitUserStateChange(state: DashboardState): void {
    // Emit user state for persistence
    this.UserStateChanged.emit(state);
  }
}

export function LoadEntityAdminDashboard() {
  // Prevents tree-shaking
}