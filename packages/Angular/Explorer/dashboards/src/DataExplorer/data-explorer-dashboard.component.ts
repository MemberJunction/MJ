import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, EntityInfo } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import {
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  EntityViewerConfig,
  EntityViewMode,
  NavigateToRelatedEvent
} from '@memberjunction/ng-entity-viewer';
import { ExplorerStateService } from './services/explorer-state.service';
import { DataExplorerState } from './models/explorer-state.interface';
import { OpenRecordEvent } from './components/navigation-panel/navigation-panel.component';

/**
 * Data Explorer Dashboard - Power user interface for exploring data across entities
 * Combines card-based browsing with grid views and relationship visualization
 *
 * Uses mj-entity-viewer composite component for the main content area,
 * which handles data loading, filtering, and view mode switching.
 */
@Component({
  selector: 'mj-data-explorer-dashboard',
  templateUrl: './data-explorer-dashboard.component.html',
  styleUrls: ['./data-explorer-dashboard.component.css']
})
@RegisterClass(BaseDashboard, 'DataExplorer')
export class DataExplorerDashboardComponent extends BaseDashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  // State
  public state: DataExplorerState;

  // Entity data
  public entities: EntityInfo[] = [];
  public selectedEntity: EntityInfo | null = null;

  // Record counts (updated by mj-entity-viewer)
  public totalRecordCount = 0;
  public filteredRecordCount = 0;

  // Selected record for detail panel
  public selectedRecord: BaseEntity | null = null;

  // Debounced filter text (synced with mj-entity-viewer)
  public debouncedFilterText: string = '';
  private filterInput$ = new Subject<string>();

  /**
   * Configuration for mj-entity-viewer composite component
   * Hides the built-in header since we have a custom header in the dashboard
   */
  public viewerConfig: Partial<EntityViewerConfig> = {
    showFilter: false,        // We have our own filter in the dashboard header
    showViewModeToggle: false, // We have our own toggle in the dashboard header
    showRecordCount: false,   // We show count in the dashboard header
    pageSize: 1000,           // Load more records for better browsing
    height: '100%'
  };

  constructor(
    public stateService: ExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    this.state = this.stateService.CurrentState;
  }

  async ngOnInit(): Promise<void> {
    // Initialize debounced filter from persisted state
    if (this.state.smartFilterPrompt) {
      this.debouncedFilterText = this.state.smartFilterPrompt;
    }

    // Load available entities
    this.loadEntities();

    // Subscribe to state changes
    this.stateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const entityChanged = state.selectedEntityName !== this.state.selectedEntityName;

        this.state = state;

        // When entity changes, immediately update the debounced filter text
        if (entityChanged && state.smartFilterPrompt !== this.debouncedFilterText) {
          this.debouncedFilterText = state.smartFilterPrompt;
        }

        this.onStateChanged();
        this.cdr.detectChanges();
      });

    // Setup debounced filter
    this.filterInput$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(filterText => {
        this.debouncedFilterText = filterText;
        this.cdr.detectChanges();
      });
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }

  protected initDashboard(): void {
    // Called by BaseDashboard
  }

  protected loadData(): void {
    // Data loading is handled by mj-entity-viewer
  }

  // ========================================
  // ENTITY MANAGEMENT
  // ========================================

  /**
   * Load all available entities the user can access
   */
  private loadEntities(): void {
    this.entities = this.metadata.Entities
      .filter(e => {
        const perms = e.GetUserPermisions(this.metadata.CurrentUser);
        return perms.CanRead && e.IncludeInAPI;
      })
      .sort((a, b) => a.Name.localeCompare(b.Name));

    // If there's a selected entity in state, restore it
    if (this.state.selectedEntityName) {
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
    }
  }

  /**
   * Handle entity selection from navigation panel
   */
  public onEntitySelected(entity: EntityInfo): void {
    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);
    // mj-entity-viewer will automatically load data when entity changes
  }

  /**
   * Handle state changes from external sources
   */
  private onStateChanged(): void {
    if (this.state.selectedEntityName !== this.selectedEntity?.Name) {
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
    }
  }

  // ========================================
  // VIEW MODE & FILTERING (Dashboard Header)
  // ========================================

  /**
   * Handle view mode toggle from dashboard header
   */
  public onViewModeChanged(mode: EntityViewMode): void {
    this.stateService.setViewMode(mode);
  }

  /**
   * Handle smart filter change from dashboard header
   */
  public onSmartFilterChanged(prompt: string): void {
    this.stateService.setSmartFilterPrompt(prompt);
    this.filterInput$.next(prompt);
  }

  /**
   * Handle filter text change from mj-entity-viewer (two-way binding)
   */
  public onFilterTextChanged(filterText: string): void {
    this.stateService.setSmartFilterPrompt(filterText);
  }

  // ========================================
  // ENTITY VIEWER EVENT HANDLERS
  // ========================================

  /**
   * Handle record selection from mj-entity-viewer
   */
  public onViewerRecordSelected(event: RecordSelectedEvent): void {
    this.selectedRecord = event.record;
    this.stateService.selectRecord(event.record.PrimaryKey.ToConcatenatedString());

    // Add to recent items
    if (this.selectedEntity) {
      this.stateService.addRecentItem({
        entityName: this.selectedEntity.Name,
        compositeKeyString: event.record.PrimaryKey.ToConcatenatedString(),
        displayName: this.getRecordDisplayName(event.record)
      });
    }
  }

  /**
   * Handle record opened from mj-entity-viewer (double-click or open button)
   */
  public onViewerRecordOpened(event: RecordOpenedEvent): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entity.Name,
      RecordPKey: event.compositeKey
    });
  }

  /**
   * Handle data loaded from mj-entity-viewer
   */
  public onDataLoaded(event: DataLoadedEvent): void {
    this.totalRecordCount = event.totalRowCount;
    this.filteredRecordCount = event.loadedRowCount;

    // Restore selected record if we have a persisted selectedRecordId
    if (this.state.selectedRecordId && this.state.detailPanelOpen && !this.selectedRecord) {
      const record = event.records.find(r =>
        r.PrimaryKey.ToConcatenatedString() === this.state.selectedRecordId
      );
      if (record) {
        this.selectedRecord = record;
      }
    }

    this.cdr.detectChanges();
  }

  /**
   * Handle filtered count change from mj-entity-viewer
   */
  public onFilteredCountChanged(event: FilteredCountChangedEvent): void {
    this.filteredRecordCount = event.filteredCount;
    this.totalRecordCount = event.totalCount;
    this.cdr.detectChanges();
  }

  // ========================================
  // DETAIL PANEL
  // ========================================

  /**
   * Handle detail panel close
   */
  public onDetailPanelClosed(): void {
    this.selectedRecord = null;
    this.stateService.closeDetailPanel();
  }

  /**
   * Handle opening a record in full view (from detail panel)
   */
  public onOpenRecord(record: BaseEntity): void {
    if (!this.selectedEntity) return;

    this.OpenEntityRecord.emit({
      EntityName: this.selectedEntity.Name,
      RecordPKey: record.PrimaryKey
    });
  }

  /**
   * Handle navigation to a related entity from detail panel
   */
  public onNavigateToRelated(event: NavigateToRelatedEvent): void {
    const entity = this.entities.find(e => e.Name === event.entityName);
    if (!entity) {
      console.warn(`Entity not found: ${event.entityName}`);
      return;
    }

    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);
    // mj-entity-viewer will automatically load data when entity changes
  }

  /**
   * Handle opening a related record in a new tab
   */
  public onOpenRelatedRecord(event: { entityName: string; record: BaseEntity }): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.record.PrimaryKey
    });
  }

  // ========================================
  // NAVIGATION PANEL
  // ========================================

  /**
   * Handle opening a record from navigation panel (recent/favorites)
   */
  public onOpenRecordFromNav(event: OpenRecordEvent): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.compositeKey
    });
  }

  /**
   * Toggle navigation panel
   */
  public toggleNavigationPanel(): void {
    this.stateService.toggleNavigationPanel();
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Get display name for a record
   */
  private getRecordDisplayName(record: BaseEntity): string {
    if (!this.selectedEntity) return 'Unknown';

    if (this.selectedEntity.NameField) {
      const nameValue = record.Get(this.selectedEntity.NameField.Name);
      if (nameValue) return String(nameValue);
    }

    return record.PrimaryKey.ToString();
  }

  /**
   * Get the icon class for an entity
   */
  public getEntityIcon(entity: EntityInfo): string {
    if (entity.Icon) {
      return this.formatEntityIcon(entity.Icon);
    }
    return 'fa-solid fa-table';
  }

  /**
   * Format entity icon to ensure proper Font Awesome class format
   */
  private formatEntityIcon(icon: string): string {
    if (!icon) {
      return 'fa-solid fa-table';
    }
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
          icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
          icon.startsWith('fa ')) {
        return icon;
      }
      return `fa-solid ${icon}`;
    }
    return `fa-solid fa-${icon}`;
  }
}

/**
 * Tree-shaking prevention
 */
export function LoadDataExplorerDashboard() {
  // Force inclusion in production builds
}
