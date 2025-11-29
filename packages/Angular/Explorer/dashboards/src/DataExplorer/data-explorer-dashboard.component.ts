import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, EntityInfo, RunView, CompositeKey } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { ExplorerStateService } from './services/explorer-state.service';
import { DataExplorerState } from './models/explorer-state.interface';
import { NavigateToRelatedEvent } from './components/detail-panel/detail-panel.component';
import { OpenRecordEvent } from './components/navigation-panel/navigation-panel.component';

/**
 * Data Explorer Dashboard - Power user interface for exploring data across entities
 * Combines card-based browsing with grid views and relationship visualization
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
  public isLoading = false;
  public loadingMessage = 'Loading...';

  // Entity data
  public entities: EntityInfo[] = [];
  public selectedEntity: EntityInfo | null = null;

  // Current records
  public records: BaseEntity[] = [];
  public totalRecordCount = 0;

  // Selected record for detail panel
  public selectedRecord: BaseEntity | null = null;

  // Debounced filter text for cards view (250ms delay)
  public debouncedFilterText: string = '';
  private filterInput$ = new Subject<string>();

  // Filtered record count (updated by cards view)
  public filteredRecordCount: number = 0;

  constructor(
    public stateService: ExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    this.state = this.stateService.CurrentState;
  }

  async ngOnInit(): Promise<void> {
    // Initialize debounced filter from persisted state BEFORE loading entities/records
    if (this.state.smartFilterPrompt) {
      this.debouncedFilterText = this.state.smartFilterPrompt;
    }

    // Load available entities (may trigger loadRecords if entity was selected)
    this.loadEntities();

    // Subscribe to state changes
    this.stateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const entityChanged = state.selectedEntityName !== this.state.selectedEntityName;

        this.state = state;

        // When entity changes, immediately update the debounced filter text
        // (don't wait for debounce - the restored filter should apply instantly)
        if (entityChanged && state.smartFilterPrompt !== this.debouncedFilterText) {
          this.debouncedFilterText = state.smartFilterPrompt;
        }

        this.onStateChanged();
        this.cdr.detectChanges();
      });

    // Setup debounced filter for cards view (250ms delay)
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
    // Data loading handled by loadEntities and loadRecords
  }

  /**
   * Load all available entities the user can access
   */
  private loadEntities(): void {
    // Filter entities that user can read and that are included in API
    this.entities = this.metadata.Entities
      .filter(e => {
        const perms = e.GetUserPermisions(this.metadata.CurrentUser);
        return perms.CanRead && e.IncludeInAPI;
      })
      .sort((a, b) => a.Name.localeCompare(b.Name));

    // If there's a selected entity in state, load it
    if (this.state.selectedEntityName) {
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
      if (this.selectedEntity) {
        this.loadRecords();
      }
    }
  }

  /**
   * Load records for the selected entity
   */
  public async loadRecords(): Promise<void> {
    if (!this.selectedEntity) {
      this.records = [];
      this.totalRecordCount = 0;
      return;
    }

    this.isLoading = true;
    this.loadingMessage = `Loading ${this.selectedEntity.Name}...`;

    try {
      const { RunView } = await import('@memberjunction/core');
      const rv = new RunView();

      const result = await rv.RunView({
        EntityName: this.selectedEntity.Name,
        ExtraFilter: this.state.smartFilterPrompt ? undefined : '', // Smart filter would generate this
        ResultType: 'entity_object',
        MaxRows: 100 // Initial page
      });

      if (result.Success) {
        this.records = result.Results;
        this.totalRecordCount = result.TotalRowCount;
      } else {
        console.error('Failed to load records:', result.ErrorMessage);
        this.records = [];
        this.totalRecordCount = 0;
      }
    } catch (error) {
      console.error('Error loading records:', error);
      this.records = [];
      this.totalRecordCount = 0;
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle entity selection from navigation panel
   */
  public onEntitySelected(entity: EntityInfo): void {
    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);
    this.loadRecords();
  }

  /**
   * Handle view mode toggle
   */
  public onViewModeChanged(mode: 'cards' | 'grid'): void {
    this.stateService.setViewMode(mode);
  }

  /**
   * Handle record selection (for detail panel)
   */
  public onRecordSelected(record: BaseEntity): void {
    this.selectedRecord = record;
    this.stateService.selectRecord(record.PrimaryKey.ToConcatenatedString());

    // Add to recent items using serialized CompositeKey
    this.stateService.addRecentItem({
      entityName: this.selectedEntity!.Name,
      compositeKeyString: record.PrimaryKey.ToConcatenatedString(),
      displayName: this.getRecordDisplayName(record)
    });
  }

  /**
   * Handle opening a record in full view
   */
  public onOpenRecord(record: BaseEntity): void {
    if (!this.selectedEntity) return;

    // Emit for parent handling - uses NavigationService internally
    this.OpenEntityRecord.emit({
      EntityName: this.selectedEntity.Name,
      RecordPKey: record.PrimaryKey
    });
  }

  /**
   * Handle detail panel close
   */
  public onDetailPanelClosed(): void {
    this.selectedRecord = null;
    this.stateService.closeDetailPanel();
  }

  /**
   * Handle navigation to a related entity from detail panel
   */
  public onNavigateToRelated(event: NavigateToRelatedEvent): void {
    // Look up the EntityInfo by name
    const entity = this.entities.find(e => e.Name === event.entityName);
    if (!entity) {
      console.warn(`Entity not found: ${event.entityName}`);
      return;
    }

    // Select the entity and apply the filter
    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);

    // TODO: Apply the filter from event.filter
    // For now, just load all records from the related entity
    this.loadRecords();
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

  /**
   * Handle opening a record from navigation panel (recent/favorites)
   */
  public onOpenRecordFromNav(event: OpenRecordEvent): void {
    // The event already contains a properly deserialized CompositeKey
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.compositeKey
    });
  }

  /**
   * Handle smart filter change
   */
  public onSmartFilterChanged(prompt: string): void {
    this.stateService.setSmartFilterPrompt(prompt);
    // Push to debounce subject for cards view
    this.filterInput$.next(prompt);
  }

  /**
   * Toggle navigation panel
   */
  public toggleNavigationPanel(): void {
    this.stateService.toggleNavigationPanel();
  }

  /**
   * Get display name for a record
   */
  private getRecordDisplayName(record: BaseEntity): string {
    if (!this.selectedEntity) return 'Unknown';

    // Try the entity's NameField first
    if (this.selectedEntity.NameField) {
      const nameValue = record.Get(this.selectedEntity.NameField.Name);
      if (nameValue) return String(nameValue);
    }

    // Fall back to primary key
    return record.PrimaryKey.ToString();
  }

  /**
   * Handle data loaded event from grid view
   */
  public onGridDataLoaded(event: { totalRowCount: number; loadTime: number }): void {
    this.totalRecordCount = event.totalRowCount;
    this.cdr.detectChanges();
  }

  /**
   * Handle state changes
   */
  private onStateChanged(): void {
    // Update selected entity if changed externally
    if (this.state.selectedEntityName !== this.selectedEntity?.Name) {
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
      if (this.selectedEntity) {
        this.loadRecords();
      }
    }
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
    // If icon already has fa- prefix, use it as-is
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      // Ensure it has a style prefix (fa-solid, fa-regular, etc.)
      if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
          icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
          icon.startsWith('fa ')) {
        return icon;
      }
      // It's just "fa-something", add fa-solid prefix
      return `fa-solid ${icon}`;
    }
    // Check if it's just an icon name like "table" or "users"
    return `fa-solid fa-${icon}`;
  }

  /**
   * Update the filtered record count (called when filter changes)
   */
  public updateFilteredCount(count: number): void {
    this.filteredRecordCount = count;
    this.cdr.detectChanges();
  }
}

/**
 * Tree-shaking prevention
 */
export function LoadDataExplorerDashboard() {
  // Force inclusion in production builds
}
