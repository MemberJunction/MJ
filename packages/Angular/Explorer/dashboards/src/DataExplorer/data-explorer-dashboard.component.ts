import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, EntityInfo, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { ExplorerStateService } from './services/explorer-state.service';
import { DataExplorerState } from './models/explorer-state.interface';

/**
 * Data Explorer Dashboard - Power user interface for exploring data across entities
 * Combines card-based browsing with grid views and relationship visualization
 */
@Component({
  selector: 'mj-data-explorer-dashboard',
  templateUrl: './data-explorer-dashboard.component.html',
  styleUrls: ['./data-explorer-dashboard.component.scss']
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

  constructor(
    public stateService: ExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    this.state = this.stateService.CurrentState;
  }

  async ngOnInit(): Promise<void> {
    // Load available entities
    this.loadEntities();

    // Subscribe to state changes
    this.stateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.state = state;
        this.onStateChanged();
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
    this.stateService.selectRecord(record.PrimaryKey.ToString());

    // Add to recent items
    this.stateService.addRecentItem({
      entityName: this.selectedEntity!.Name,
      recordId: record.PrimaryKey.ToString(),
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
   * Handle smart filter change
   */
  public onSmartFilterChanged(prompt: string): void {
    this.stateService.setSmartFilterPrompt(prompt);
    // Trigger reload with filter
    this.loadRecords();
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
}

/**
 * Tree-shaking prevention
 */
export function LoadDataExplorerDashboard() {
  // Force inclusion in production builds
}
