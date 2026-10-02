import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { MJDashboardEntityExtended, MJDashboardUserPreferenceEntity, MJApplicationEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
export class DashboardPreferencesDialogComponent extends BaseAngularComponent implements OnInit {
  @Input() public ApplicationId: string | null = null;

  /** @deprecated Use {@link ApplicationId}. */
  @Input() public set applicationId(value: string | null) {
    this.ApplicationId = value;
  }
  /** @deprecated Use {@link ApplicationId}. */
  public get applicationId(): string | null {
    return this.ApplicationId;
  }
  @Input() public Scope: 'Global' | 'App' = 'Global';

  /** @deprecated Use {@link Scope}. */
  @Input() public set scope(value: 'Global' | 'App') {
    this.Scope = value;
  }
  /** @deprecated Use {@link Scope}. */
  public get scope(): 'Global' | 'App' {
    return this.Scope;
  }
  @Output() public Result = new EventEmitter<DashboardPreferencesResult>();

  /**
   * @deprecated Use {@link Result}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (result) keeps working. Must stay AFTER Result: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public result = this.Result;

  public AvailableDashboards: MJDashboardEntityExtended[] = [];

  /** @deprecated Use {@link AvailableDashboards}. */
  public get availableDashboards(): MJDashboardEntityExtended[] {
    return this.AvailableDashboards;
  }
  /** @deprecated Use {@link AvailableDashboards}. */
  public set availableDashboards(value: MJDashboardEntityExtended[]) {
    this.AvailableDashboards = value;
  }
  public ConfiguredDashboards: MJDashboardEntityExtended[] = [];

  /** @deprecated Use {@link ConfiguredDashboards}. */
  public get configuredDashboards(): MJDashboardEntityExtended[] {
    return this.ConfiguredDashboards;
  }
  /** @deprecated Use {@link ConfiguredDashboards}. */
  public set configuredDashboards(value: MJDashboardEntityExtended[]) {
    this.ConfiguredDashboards = value;
  }
  public ApplicationName: string = '';

  /** @deprecated Use {@link ApplicationName}. */
  public get applicationName(): string {
    return this.ApplicationName;
  }
  /** @deprecated Use {@link ApplicationName}. */
  public set applicationName(value: string) {
    this.ApplicationName = value;
  }
  public Loading: boolean = true;

  /** @deprecated Use {@link Loading}. */
  public get loading(): boolean {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value: boolean) {
    this.Loading = value;
  }
  public saving: boolean = false;
  public error: string | null = null;
  public HasChanges: boolean = false;

  /** @deprecated Use {@link HasChanges}. */
  public get hasChanges(): boolean {
    return this.HasChanges;
  }
  /** @deprecated Use {@link HasChanges}. */
  public set hasChanges(value: boolean) {
    this.HasChanges = value;
  }
  public IsSysAdmin: boolean = false;

  /** @deprecated Use {@link IsSysAdmin}. */
  public get isSysAdmin(): boolean {
    return this.IsSysAdmin;
  }
  /** @deprecated Use {@link IsSysAdmin}. */
  public set isSysAdmin(value: boolean) {
    this.IsSysAdmin = value;
  }
  public PreferenceMode: 'personal' | 'system' = 'personal';

  /** @deprecated Use {@link PreferenceMode}. */
  public get preferenceMode(): 'personal' | 'system' {
    return this.PreferenceMode;
  }
  /** @deprecated Use {@link PreferenceMode}. */
  public set preferenceMode(value: 'personal' | 'system') {
    this.PreferenceMode = value;
  }

  private originalConfiguredIds: string[] = [];
  private currentUserPreferences: MJDashboardUserPreferenceEntity[] = [];
  private allAvailableDashboards: MJDashboardEntityExtended[] = [];

  async ngOnInit(): Promise<void> {
    try {
      await this.loadData();
    } catch (error) {
      LogError('Error initializing dashboard preferences dialog', null, error);
      this.error = 'Failed to load dashboard preferences';
    } finally {
      this.Loading = false;
    }
  }

  private async loadData(): Promise<void> {
    const md = this.ProviderToUse;
    
    // Check if current user is sysadmin
    this.IsSysAdmin = md.CurrentUser.Type.trim().toLowerCase() === 'owner';
    console.log('User is sysadmin:', this.IsSysAdmin);
    
    // Default to personal preferences for all users (including sysadmin)
    this.PreferenceMode = 'personal';
    
    // Load application name if we're in app scope
    if (this.Scope === 'App' && this.ApplicationId) {
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
    const appFilter = this.ApplicationId ? ` AND ApplicationID='${this.ApplicationId}'` : ' AND ApplicationID IS NULL';
    this.allAvailableDashboards = dashList.Results.filter((d: MJDashboardEntityExtended) => {
      if (this.Scope === 'Global') {
        return d.Scope === 'Global' && !d.ApplicationID;
      } else {
        return UUIDsEqual(d.ApplicationID, this.ApplicationId) // ignore scope for dashboards that match app id, sometimes they have a global scope as they can be shown globally as well as app specific
      }
    });

    // Load current user preferences
    await this.loadCurrentPreferences();
    
    // Split dashboards into available and configured
    this.splitDashboards();
    
    // Store original state to detect changes
    this.originalConfiguredIds = this.ConfiguredDashboards.map(d => d.ID);
  }

  private async loadApplicationName(): Promise<void> {
    if (!this.ApplicationId) return;
    
    try {
      const md = this.ProviderToUse;
      const ds = await md.GetAndCacheDatasetByName("MJ_Metadata");
      const appList = ds.Results.find(r => r.Code === 'Applications');
      if (appList) {
        const app = appList.Results.find((a: MJApplicationEntity) => UUIDsEqual(a.ID, this.ApplicationId));
        this.ApplicationName = app?.Name || 'Unknown Application';
      }
    } catch (error) {
      LogError('Error loading application name', null, error);
      this.ApplicationName = 'Unknown Application';
    }
  }

  private async loadCurrentPreferences(): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;
    
    const appFilter = this.ApplicationId ? ` AND ApplicationID='${this.ApplicationId}'` : '';
    const baseCondition = `Scope='${this.Scope}'${appFilter}`;
    
    let filter: string;
    
    if (this.IsSysAdmin && this.Scope === 'Global' && this.PreferenceMode === 'system') {
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
    this.ConfiguredDashboards = this.currentUserPreferences
      .map(pref => this.allAvailableDashboards.find(d => UUIDsEqual(d.ID, pref.DashboardID)))
      .filter((d): d is MJDashboardEntityExtended => d !== undefined);
    
    // Get available dashboards (not configured)
    this.AvailableDashboards = this.allAvailableDashboards
      .filter(d => !configuredIds.has(d.ID))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public OnDrop(event: CdkDragDrop<MJDashboardEntityExtended[]>): void {
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
        if (event.container.data === this.ConfiguredDashboards) {
          this.AvailableDashboards.sort((a, b) => a.Name.localeCompare(b.Name));
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

  /** @deprecated Use {@link OnDrop}. */
  public onDrop(event: CdkDragDrop<MJDashboardEntityExtended[]>): void {
    return this.OnDrop(event);
  }

  public AddDashboard(dashboard: MJDashboardEntityExtended): void {
    try {
      const index = this.AvailableDashboards.findIndex(d => UUIDsEqual(d.ID, dashboard.ID));
      if (index !== -1) {
        this.AvailableDashboards.splice(index, 1);
        this.ConfiguredDashboards.push(dashboard);
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

  /** @deprecated Use {@link AddDashboard}. */
  public addDashboard(dashboard: MJDashboardEntityExtended): void {
    return this.AddDashboard(dashboard);
  }

  public RemoveDashboard(dashboard: MJDashboardEntityExtended): void {
    try {
      const index = this.ConfiguredDashboards.findIndex(d => UUIDsEqual(d.ID, dashboard.ID));
      if (index !== -1) {
        this.ConfiguredDashboards.splice(index, 1);
        this.AvailableDashboards.push(dashboard);
        this.AvailableDashboards.sort((a, b) => a.Name.localeCompare(b.Name));
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

  /** @deprecated Use {@link RemoveDashboard}. */
  public removeDashboard(dashboard: MJDashboardEntityExtended): void {
    return this.RemoveDashboard(dashboard);
  }

  public async OnPreferenceModeChange(): Promise<void> {
    try {
      this.Loading = true;
      this.error = null;
      
      // Reload preferences with new mode
      await this.loadCurrentPreferences();
      this.splitDashboards();
      this.originalConfiguredIds = this.ConfiguredDashboards.map(d => d.ID);
      this.HasChanges = false;
      
    } catch (error) {
      LogError('Error changing preference mode', null, error);
      this.error = 'Error loading preferences. Please try again.';
    } finally {
      this.Loading = false;
    }
  }

  /** @deprecated Use {@link OnPreferenceModeChange}. */
  public async onPreferenceModeChange(): Promise<void> {
    return this.OnPreferenceModeChange();
  }

  private checkForChanges(): void {
    try {
      const currentConfiguredIds = this.ConfiguredDashboards.map(d => d.ID);
      
      // Check if the order or selection has changed
      this.HasChanges = currentConfiguredIds.length !== this.originalConfiguredIds.length ||
                       currentConfiguredIds.some((id, index) => id !== this.originalConfiguredIds[index]);
      
      // Debug logging
      console.log('Dashboard preferences change check:', {
        original: this.originalConfiguredIds,
        current: currentConfiguredIds,
        hasChanges: this.HasChanges
      });
    } catch (error) {
      LogError('Error checking for changes', null, error);
      this.HasChanges = false;
    }
  }

  public async OnSave(): Promise<void> {
    if (this.saving || !this.HasChanges) {
      console.log('Save cancelled:', { saving: this.saving, hasChanges: this.HasChanges });
      return;
    }

    try {
      this.saving = true;
      console.log('Starting save process with configured dashboards:', this.ConfiguredDashboards.map(d => ({ id: d.ID, name: d.Name })));
      
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Get existing preferences for this scope
      const baseCondition = this.Scope === 'Global' 
        ? `Scope='Global' AND ApplicationID IS NULL`
        : `Scope='App' AND ApplicationID='${this.ApplicationId}'`;
      
      let userFilter: string;
      
      if (this.IsSysAdmin && this.Scope === 'Global' && this.PreferenceMode === 'system') {
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

      const configuredDashboardIds = new Set(this.ConfiguredDashboards.map(d => d.ID));

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
      
      for (let i = 0; i < this.ConfiguredDashboards.length; i++) {
        const dashboard = this.ConfiguredDashboards[i];
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
          if (this.IsSysAdmin && this.Scope === 'Global' && this.PreferenceMode === 'system') {
            prefEntity.UserID = null; // System default
          } else {
            prefEntity.UserID = md.CurrentUser.ID; // Personal preference
          }
          
          prefEntity.DashboardID = dashboard.ID;
          prefEntity.DisplayOrder = newDisplayOrder;
          prefEntity.Scope = this.Scope;
          prefEntity.ApplicationID = this.ApplicationId;

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
      this.Result.emit({
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

  /** @deprecated Use {@link OnSave}. */
  public async onSave(): Promise<void> {
    return this.OnSave();
  }

  public onCancel(): void {
    this.Result.emit({ saved: false });
  }
}