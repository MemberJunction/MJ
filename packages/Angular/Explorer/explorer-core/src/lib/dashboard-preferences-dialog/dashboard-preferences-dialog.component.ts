import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { DashboardEntityExtended, MJDashboardUserPreferenceEntity, MJApplicationEntity } from '@memberjunction/core-entities';

export interface DashboardPreferencesResult {
  saved: boolean;
  preferences?: MJDashboardUserPreferenceEntity[];
}

@Component({
  standalone: false,
  selector: 'mj-dashboard-preferences-dialog',
  templateUrl: './dashboard-preferences-dialog.component.html',
  styleUrls: ['./dashboard-preferences-dialog.component.css']
})
export class DashboardPreferencesDialogComponent implements OnInit {
  @Input() public applicationId: string | null = null;
  @Input() public scope: 'Global' | 'App' = 'Global';
  @Output() public result = new EventEmitter<DashboardPreferencesResult>();

  public availableDashboards: DashboardEntityExtended[] = [];
  public configuredDashboards: DashboardEntityExtended[] = [];
  public applicationName: string = '';
  public loading: boolean = true;
  public saving: boolean = false;
  public error: string | null = null;
  public hasChanges: boolean = false;
  public isSysAdmin: boolean = false;
  public preferenceMode: 'personal' | 'system' = 'personal';

  private originalConfiguredIds: string[] = [];
  private currentUserPreferences: MJDashboardUserPreferenceEntity[] = [];
  private allAvailableDashboards: DashboardEntityExtended[] = [];

  async ngOnInit(): Promise<void> {
    try {
      await this.loadData();
    } catch (error) {
      LogError('Error initializing dashboard preferences dialog', null, error);
      this.error = 'Failed to load dashboard preferences';
    } finally {
      this.loading = false;
    }
  }

  private async loadData(): Promise<void> {
    const md = new Metadata();
    
    // Check if current user is sysadmin
    this.isSysAdmin = md.CurrentUser.Type.trim().toLowerCase() === 'owner';
    console.log('User is sysadmin:', this.isSysAdmin);
    
    // Default to personal preferences for all users (including sysadmin)
    this.preferenceMode = 'personal';
    
    // Load application name if we're in app scope
    if (this.scope === 'App' && this.applicationId) {
      await this.loadApplicationName();
    }

    // Get cached dashboards from MJ_Metadata dataset
    const ds = await md.GetAndCacheDatasetByName("MJ_Metadata");
    if (!ds || !ds.Success) {
      throw new Error(ds?.Status || 'Failed to load metadata dataset');
    }

    const dashList = ds.Results.find(r => r.Code === 'Dashboards');
    if (!dashList) {
      throw new Error('Dashboards dataset not found');
    }

    // Filter dashboards by scope
    const appFilter = this.applicationId ? ` AND ApplicationID='${this.applicationId}'` : ' AND ApplicationID IS NULL';
    this.allAvailableDashboards = dashList.Results.filter((d: DashboardEntityExtended) => {
      if (this.scope === 'Global') {
        return d.Scope === 'Global' && !d.ApplicationID;
      } else {
        return d.ApplicationID === this.applicationId; // ignore scope for dashboards that match app id, sometimes they have a global scope as they can be shown globally as well as app specific
      }
    });

    // Load current user preferences
    await this.loadCurrentPreferences();
    
    // Split dashboards into available and configured
    this.splitDashboards();
    
    // Store original state to detect changes
    this.originalConfiguredIds = this.configuredDashboards.map(d => d.ID);
  }

  private async loadApplicationName(): Promise<void> {
    if (!this.applicationId) return;
    
    try {
      const md = new Metadata();
      const ds = await md.GetAndCacheDatasetByName("MJ_Metadata");
      const appList = ds.Results.find(r => r.Code === 'Applications');
      if (appList) {
        const app = appList.Results.find((a: MJApplicationEntity) => a.ID === this.applicationId);
        this.applicationName = app?.Name || 'Unknown Application';
      }
    } catch (error) {
      LogError('Error loading application name', null, error);
      this.applicationName = 'Unknown Application';
    }
  }

  private async loadCurrentPreferences(): Promise<void> {
    const rv = new RunView();
    const md = new Metadata();
    
    const appFilter = this.applicationId ? ` AND ApplicationID='${this.applicationId}'` : '';
    const baseCondition = `Scope='${this.scope}'${appFilter}`;
    
    let filter: string;
    
    if (this.isSysAdmin && this.scope === 'Global' && this.preferenceMode === 'system') {
      // Load system defaults only (UserID IS NULL)
      filter = `UserID IS NULL AND ${baseCondition}`;
    } else {
      // Load personal user preferences (including for sysadmin when in personal mode)
      // For personal mode, we ONLY load the user's specific preferences, no fallback to system defaults
      // This allows sysadmin to see their actual personal preferences vs system defaults
      filter = `UserID='${md.CurrentUser.ID}' AND ${baseCondition}`;
    }

    console.log('Loading preferences with filter:', filter);

    const prefsResult = await rv.RunView<MJDashboardUserPreferenceEntity>({
      EntityName: 'MJ: Dashboard User Preferences',
      ExtraFilter: filter,
      ResultType: 'entity_object',
      OrderBy: 'DisplayOrder',
    });

    this.currentUserPreferences = prefsResult?.Results || [];
    console.log('Loaded preferences:', this.currentUserPreferences.length);
  }

  private splitDashboards(): void {
    const configuredIds = new Set(this.currentUserPreferences.map(p => p.DashboardID));
    
    // Get configured dashboards in the right order
    this.configuredDashboards = this.currentUserPreferences
      .map(pref => this.allAvailableDashboards.find(d => d.ID === pref.DashboardID))
      .filter((d): d is DashboardEntityExtended => d !== undefined);
    
    // Get available dashboards (not configured)
    this.availableDashboards = this.allAvailableDashboards
      .filter(d => !configuredIds.has(d.ID))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public onDrop(event: CdkDragDrop<DashboardEntityExtended[]>): void {
    try {
      if (event.previousContainer === event.container) {
        // Reordering within the same list
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      } else {
        // Moving between lists
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );
        
        // If moving to configured dashboards, sort the available list
        if (event.container.data === this.configuredDashboards) {
          this.availableDashboards.sort((a, b) => a.Name.localeCompare(b.Name));
        }
      }
      
      this.checkForChanges();
    } catch (error) {
      LogError('Error in drag drop operation', null, error);
      this.error = 'Error reordering dashboards. Please try again.';
      
      // Clear error after 3 seconds
      setTimeout(() => {
        this.error = null;
      }, 3000);
    }
  }

  public addDashboard(dashboard: DashboardEntityExtended): void {
    try {
      const index = this.availableDashboards.findIndex(d => d.ID === dashboard.ID);
      if (index !== -1) {
        this.availableDashboards.splice(index, 1);
        this.configuredDashboards.push(dashboard);
        this.checkForChanges();
      }
    } catch (error) {
      LogError('Error adding dashboard', null, error);
      this.error = 'Error adding dashboard. Please try again.';
      
      // Clear error after 3 seconds
      setTimeout(() => {
        this.error = null;
      }, 3000);
    }
  }

  public removeDashboard(dashboard: DashboardEntityExtended): void {
    try {
      const index = this.configuredDashboards.findIndex(d => d.ID === dashboard.ID);
      if (index !== -1) {
        this.configuredDashboards.splice(index, 1);
        this.availableDashboards.push(dashboard);
        this.availableDashboards.sort((a, b) => a.Name.localeCompare(b.Name));
        this.checkForChanges();
      }
    } catch (error) {
      LogError('Error removing dashboard', null, error);
      this.error = 'Error removing dashboard. Please try again.';
      
      // Clear error after 3 seconds
      setTimeout(() => {
        this.error = null;
      }, 3000);
    }
  }

  public async onPreferenceModeChange(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;
      
      // Reload preferences with new mode
      await this.loadCurrentPreferences();
      this.splitDashboards();
      this.originalConfiguredIds = this.configuredDashboards.map(d => d.ID);
      this.hasChanges = false;
      
    } catch (error) {
      LogError('Error changing preference mode', null, error);
      this.error = 'Error loading preferences. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private checkForChanges(): void {
    try {
      const currentConfiguredIds = this.configuredDashboards.map(d => d.ID);
      
      // Check if the order or selection has changed
      this.hasChanges = currentConfiguredIds.length !== this.originalConfiguredIds.length ||
                       currentConfiguredIds.some((id, index) => id !== this.originalConfiguredIds[index]);
      
      // Debug logging
      console.log('Dashboard preferences change check:', {
        original: this.originalConfiguredIds,
        current: currentConfiguredIds,
        hasChanges: this.hasChanges
      });
    } catch (error) {
      LogError('Error checking for changes', null, error);
      this.hasChanges = false;
    }
  }

  public async onSave(): Promise<void> {
    if (this.saving || !this.hasChanges) {
      console.log('Save cancelled:', { saving: this.saving, hasChanges: this.hasChanges });
      return;
    }

    try {
      this.saving = true;
      console.log('Starting save process with configured dashboards:', this.configuredDashboards.map(d => ({ id: d.ID, name: d.Name })));
      
      const md = new Metadata();
      const rv = new RunView();

      // Get existing preferences for this scope
      const baseCondition = this.scope === 'Global' 
        ? `Scope='Global' AND ApplicationID IS NULL`
        : `Scope='App' AND ApplicationID='${this.applicationId}'`;
      
      let userFilter: string;
      
      if (this.isSysAdmin && this.scope === 'Global' && this.preferenceMode === 'system') {
        // Managing system defaults
        userFilter = `UserID IS NULL AND ${baseCondition}`;
      } else {
        // Managing personal preferences
        userFilter = `UserID='${md.CurrentUser.ID}' AND ${baseCondition}`;
      }
      
      console.log('Loading existing preferences with filter:', userFilter);
      
      const existingPrefs = await rv.RunView<MJDashboardUserPreferenceEntity>({
        EntityName: 'MJ: Dashboard User Preferences',
        ExtraFilter: userFilter,
        ResultType: 'entity_object',
      });

      const existingPreferences = existingPrefs?.Results || [];
      console.log('Found existing preferences:', existingPreferences.length);

      // Create maps for efficient lookups
      const existingByDashboardId = new Map<string, MJDashboardUserPreferenceEntity>();
      existingPreferences.forEach(pref => {
        existingByDashboardId.set(pref.DashboardID, pref);
      });

      const configuredDashboardIds = new Set(this.configuredDashboards.map(d => d.ID));

      // Step 1: Delete preferences that are no longer configured
      const prefsToDelete = existingPreferences.filter(pref => !configuredDashboardIds.has(pref.DashboardID));
      console.log('Preferences to delete:', prefsToDelete.length);
      
      for (const pref of prefsToDelete) {
        console.log('Deleting preference for dashboard:', pref.DashboardID);
        if (!await pref.Delete()) {
          const errorMsg = pref.LatestResult?.Error || pref.LatestResult?.Message || 'Unknown error';
          throw new Error(`Failed to delete preference: ${errorMsg}`);
        }
      }

      // Step 2: Update existing preferences or create new ones
      const newPreferences: MJDashboardUserPreferenceEntity[] = [];
      
      for (let i = 0; i < this.configuredDashboards.length; i++) {
        const dashboard = this.configuredDashboards[i];
        const newDisplayOrder = i + 1;
        
        let prefEntity = existingByDashboardId.get(dashboard.ID);
        
        if (prefEntity) {
          // Update existing preference
          console.log(`Updating existing preference for dashboard ${dashboard.Name}, new order: ${newDisplayOrder}`);
          prefEntity.DisplayOrder = newDisplayOrder;
          
          if (!await prefEntity.Save()) {
            const errorMsg = prefEntity.LatestResult?.Error || prefEntity.LatestResult?.Message || 'Unknown error';
            throw new Error(`Failed to update preference for dashboard ${dashboard.Name}: ${errorMsg}`);
          }
        } else {
          // Create new preference
          console.log(`Creating new preference for dashboard ${dashboard.Name}, order: ${newDisplayOrder}`);
          prefEntity = await md.GetEntityObject<MJDashboardUserPreferenceEntity>('MJ: Dashboard User Preferences');
          
          // Set UserID based on preference mode
          if (this.isSysAdmin && this.scope === 'Global' && this.preferenceMode === 'system') {
            prefEntity.UserID = null; // System default
          } else {
            prefEntity.UserID = md.CurrentUser.ID; // Personal preference
          }
          
          prefEntity.DashboardID = dashboard.ID;
          prefEntity.DisplayOrder = newDisplayOrder;
          prefEntity.Scope = this.scope;
          prefEntity.ApplicationID = this.applicationId;

          console.log('Creating preference entity:', {
            UserID: prefEntity.UserID,
            DashboardID: prefEntity.DashboardID,
            DisplayOrder: prefEntity.DisplayOrder,
            Scope: prefEntity.Scope,
            ApplicationID: prefEntity.ApplicationID
          });

          if (!await prefEntity.Save()) {
            const errorMsg = prefEntity.LatestResult?.Error || prefEntity.LatestResult?.Message || 'Unknown error';
            throw new Error(`Failed to create preference for dashboard ${dashboard.Name}: ${errorMsg}`);
          }
        }
        
        newPreferences.push(prefEntity);
      }

      console.log('Successfully processed', newPreferences.length, 'preferences');

      // Emit success result
      this.result.emit({
        saved: true,
        preferences: newPreferences
      });

    } catch (error) {
      console.error('Save error:', error);
      LogError('Error saving dashboard preferences', null, error);
      this.error = `Failed to save preferences: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      // Clear error after 5 seconds
      setTimeout(() => {
        this.error = null;
      }, 5000);
    } finally {
      this.saving = false;
    }
  }

  public onCancel(): void {
    this.result.emit({ saved: false });
  }
}