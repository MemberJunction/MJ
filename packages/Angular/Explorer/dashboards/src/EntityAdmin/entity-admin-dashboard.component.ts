import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { EntityInfo, CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ERDCompositeComponent, ERDCompositeState } from '@memberjunction/ng-entity-relationship-diagram';
import { ResourceData, UserSettingEntity } from '@memberjunction/core-entities';

/** Settings key for ERD state persistence */
const ERD_SETTINGS_KEY = 'MJ.Admin.Entity.ERD';

@Component({
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

  // State management
  private userStateChangeSubject = new Subject<ERDCompositeState>();
  private hasLoadedUserState = false;
  private metadata = new Metadata();
  private userSettingEntity: UserSettingEntity | null = null;

  ngAfterViewInit(): void {
    // Setup debounced state persistence to MJ: User Settings
    this.userStateChangeSubject.pipe(
      debounceTime(1000)
    ).subscribe(state => {
      this.saveStateToUserSettings(state);
    });
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
      this.selectedEntity = this.erdComposite.entities.find(e => e.ID === state.selectedEntityId) || null;
    } else {
      this.selectedEntity = null;
    }

    // Load user state when data becomes available for the first time
    if (this.erdComposite?.isDataLoaded && !this.hasLoadedUserState) {
      this.hasLoadedUserState = true;
      this.loadStateFromUserSettings();
    }
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
   * Load ERD state from MJ: User Settings entity
   */
  private async loadStateFromUserSettings(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) {
        this.NotifyLoadComplete();
        return;
      }

      const rv = new RunView();
      const result = await rv.RunView<UserSettingEntity>({
        EntityName: 'MJ: User Settings',
        ExtraFilter: `UserID='${userId}' AND Setting='${ERD_SETTINGS_KEY}'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results.length > 0) {
        this.userSettingEntity = result.Results[0];
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
   * Save ERD state to MJ: User Settings entity
   */
  private async saveStateToUserSettings(state: ERDCompositeState): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      // Create setting entity if it doesn't exist
      if (!this.userSettingEntity) {
        const rv = new RunView();
        const result = await rv.RunView<UserSettingEntity>({
          EntityName: 'MJ: User Settings',
          ExtraFilter: `UserID='${userId}' AND Setting='${ERD_SETTINGS_KEY}'`,
          ResultType: 'entity_object'
        });

        if (result.Success && result.Results.length > 0) {
          this.userSettingEntity = result.Results[0];
        } else {
          this.userSettingEntity = await this.metadata.GetEntityObject<UserSettingEntity>('MJ: User Settings');
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
}

export function LoadEntityAdminDashboard() {
  // Prevents tree-shaking
}