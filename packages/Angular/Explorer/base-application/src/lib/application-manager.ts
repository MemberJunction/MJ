import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { Metadata, RunView, ApplicationInfo, LogError, LogStatus } from '@memberjunction/core';
import { ApplicationEntity, UserApplicationEntity } from '@memberjunction/core-entities';
import { BaseApplication } from './base-application';

/**
 * Represents a user's application configuration including visibility and order
 */
export interface UserAppConfig {
  app: BaseApplication;
  userAppId: string;
  sequence: number;
  isActive: boolean;
}

/**
 * Manages application instances and active application state.
 *
 * Loads applications filtered by the user's UserApplication records.
 * If user has no UserApplication records, auto-creates them from DefaultForNewUser apps.
 * Orders applications by UserApplication.Sequence.
 */
@Injectable({
  providedIn: 'root'
})
export class ApplicationManager {
  private applications$ = new BehaviorSubject<BaseApplication[]>([]);
  private allApplications$ = new BehaviorSubject<BaseApplication[]>([]);
  private userAppConfigs$ = new BehaviorSubject<UserAppConfig[]>([]);
  private activeApp$ = new BehaviorSubject<BaseApplication | null>(null);
  private loading$ = new BehaviorSubject<boolean>(false);
  private initialized = false;

  /**
   * Observable of user's active applications (filtered and ordered by UserApplication)
   */
  get Applications(): Observable<BaseApplication[]> {
    return this.applications$.asObservable();
  }

  /**
   * Observable of ALL applications in the system (unfiltered)
   */
  get AllApplications(): Observable<BaseApplication[]> {
    return this.allApplications$.asObservable();
  }

  /**
   * Observable of user's application configurations (includes sequence, isActive)
   */
  get UserAppConfigs(): Observable<UserAppConfig[]> {
    return this.userAppConfigs$.asObservable();
  }

  /**
   * Observable of the currently active application
   */
  get ActiveApp(): Observable<BaseApplication | null> {
    return this.activeApp$.asObservable();
  }

  /**
   * Observable of loading state
   */
  get Loading(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  /**
   * Get user's active applications synchronously (filtered and ordered)
   */
  GetAllApps(): BaseApplication[] {
    return this.applications$.value;
  }

  /**
   * Get ALL applications synchronously (unfiltered)
   */
  GetAllSystemApps(): BaseApplication[] {
    return this.allApplications$.value;
  }

  /**
   * Get user's application configurations synchronously
   */
  GetUserAppConfigs(): UserAppConfig[] {
    return this.userAppConfigs$.value;
  }

  /**
   * Get active application synchronously
   */
  GetActiveApp(): BaseApplication | null {
    return this.activeApp$.value;
  }

  /**
   * Initialize the application manager by subscribing to the LoggedIn event.
   * Applications are loaded when the event fires, ensuring metadata is ready.
   */
  Initialize(): void {
    if (this.initialized) {
      return;
    }

    // Subscribe with replay (true) to catch the event even if it already fired
    MJGlobal.Instance.GetEventListener(true).subscribe(event => {
      if (event.event === MJEventType.LoggedIn) {
        this.loadApplications();
      }
    });
  }

  /**
   * Reload the user's application configuration.
   * Call this after changes to UserApplication records to refresh the app list.
   */
  async ReloadUserApplications(): Promise<void> {
    this.loading$.next(true);

    try {
      await this.loadUserApplicationConfig();
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Load applications from metadata, filtered and ordered by user's UserApplication records.
   * If user has no UserApplication records, auto-creates them from DefaultForNewUser apps.
   */
  private async loadApplications(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.loading$.next(true);

    try {
      const md = new Metadata();
      const appInfoList: ApplicationInfo[] = md.Applications;

      // First, create BaseApplication instances for ALL apps
      const allApps: BaseApplication[] = [];

      for (const appInfo of appInfoList) {
        // Only create instances for Active applications
        if (appInfo.Status !== 'Active') {
          continue;
        }

        const app = MJGlobal.Instance.ClassFactory.CreateInstance<BaseApplication>(
          BaseApplication,
          appInfo.ClassName,
          {
            ID: appInfo.ID,
            Name: appInfo.Name,
            Description: appInfo.Description || '',
            Icon: appInfo.Icon || '',
            Color: appInfo.Color,
            DefaultNavItems: appInfo.DefaultNavItems,
            ClassName: appInfo.ClassName,
            DefaultSequence: appInfo.DefaultSequence,
            Status: appInfo.Status,
            NavigationStyle: appInfo.NavigationStyle,
            TopNavLocation: appInfo.TopNavLocation,
            HideNavBarIconWhenActive: appInfo.HideNavBarIconWhenActive
          }
        );

        if (app) {
          allApps.push(app);
        }
      }

      this.allApplications$.next(allApps);

      // Load and apply user's app configuration
      await this.loadUserApplicationConfig();

      this.initialized = true;

    } catch (error) {
      LogError('Failed to load applications:', undefined, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Load user's UserApplication records and update the filtered/ordered app list.
   * This can be called to refresh after configuration changes.
   */
  private async loadUserApplicationConfig(): Promise<void> {
    const md = new Metadata();
    const appInfoList: ApplicationInfo[] = md.Applications;
    const allApps = this.allApplications$.value;

    // Build a map for quick lookup
    const appMap = new Map<string, BaseApplication>();
    for (const app of allApps) {
      appMap.set(app.ID, app);
    }

    // Load user's UserApplication records
    const rv = new RunView();
    const userAppsResult = await rv.RunView<UserApplicationEntity>({
      EntityName: 'User Applications',
      ExtraFilter: `UserID = '${md.CurrentUser.ID}'`,
      OrderBy: 'Sequence, Application',
      ResultType: 'entity_object'
    });

    let userApps: UserApplicationEntity[] = [];
    if (userAppsResult.Success) {
      userApps = userAppsResult.Results;
    } else {
      LogError('Failed to load UserApplication records:', undefined, userAppsResult.ErrorMessage);
    }

    // Self-healing: If user has no UserApplication records, create from DefaultForNewUser apps
    if (userApps.length === 0) {
      LogStatus(`User ${md.CurrentUser.Name} has no UserApplication records, creating from DefaultForNewUser apps`);
      userApps = await this.createDefaultUserApplications(md, appInfoList);
    }

    // Build user's filtered and ordered app list
    const userAppConfigs: UserAppConfig[] = [];
    const activeApps: BaseApplication[] = [];

    for (const userApp of userApps) {
      const app = appMap.get(userApp.ApplicationID);
      if (app && userApp.IsActive) {
        userAppConfigs.push({
          app,
          userAppId: userApp.ID,
          sequence: userApp.Sequence,
          isActive: userApp.IsActive
        });
        activeApps.push(app);
      }
    }

    this.userAppConfigs$.next(userAppConfigs);
    this.applications$.next(activeApps);
  }

  /**
   * Creates UserApplication records for apps with DefaultForNewUser=true and Status='Active'.
   * Called when a user has no existing UserApplication records (self-healing).
   * Orders apps by their DefaultSequence field.
   */
  private async createDefaultUserApplications(md: Metadata, appInfoList: ApplicationInfo[]): Promise<UserApplicationEntity[]> {
    // Filter to Active apps with DefaultForNewUser=true, sorted by DefaultSequence
    const defaultApps = appInfoList
      .filter(a => a.DefaultForNewUser && a.Status === 'Active')
      .sort((a, b) => (a.DefaultSequence ?? 100) - (b.DefaultSequence ?? 100));

    const createdUserApps: UserApplicationEntity[] = [];

    LogStatus(`Found ${defaultApps.length} Active applications with DefaultForNewUser=true`);

    for (const [index, appInfo] of defaultApps.entries()) {
      try {
        const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications');
        userApp.NewRecord();
        userApp.UserID = md.CurrentUser.ID;
        userApp.ApplicationID = appInfo.ID;
        // Use the index based on sorted DefaultSequence order
        userApp.Sequence = index;
        userApp.IsActive = true;

        const saved = await userApp.Save();
        if (saved) {
          LogStatus(`Created UserApplication for ${appInfo.Name} with sequence ${index} (DefaultSequence: ${appInfo.DefaultSequence})`);
          createdUserApps.push(userApp);
        } else {
          LogError(`Failed to create UserApplication for ${appInfo.Name}:`, undefined, userApp.LatestResult);
        }
      } catch (error) {
        LogError(`Error creating UserApplication for ${appInfo.Name}:`, undefined, error instanceof Error ? error.message : String(error));
      }
    }

    return createdUserApps;
  }

  /**
   * Set the active application by ID
   */
  async SetActiveApp(appId: string): Promise<void> {
    const currentApp = this.activeApp$.value;
    const newApp = this.applications$.value.find(a => a.ID === appId);

    if (!newApp) {
      return;
    }

    if (currentApp?.ID === appId) {
      return; // Already active
    }

    // Deactivate current app
    if (currentApp) {
      await currentApp.OnDeactivate();
    }

    // Activate new app
    await newApp.OnActivate();
    this.activeApp$.next(newApp);
  }

  /**
   * Get application by ID
   */
  GetAppById(appId: string): BaseApplication | undefined {
    return this.applications$.value.find(a => a.ID === appId);
  }

  /**
   * Get application by name
   */
  GetAppByName(name: string): BaseApplication | undefined {
    return this.applications$.value.find(a => a.Name === name);
  }

  /**
   * Get applications that should appear in the Nav Bar (NavigationStyle = 'Nav Bar' or 'Both')
   * filtered by TopNavLocation.
   */
  GetNavBarApps(location: 'Left of App Switcher' | 'Left of User Menu'): BaseApplication[] {
    return this.applications$.value.filter(app =>
      (app.NavigationStyle === 'Nav Bar' || app.NavigationStyle === 'Both') &&
      app.TopNavLocation === location
    );
  }

  /**
   * Get applications that should appear in the App Switcher (NavigationStyle = 'App Switcher' or 'Both')
   */
  GetAppSwitcherApps(): BaseApplication[] {
    return this.applications$.value.filter(app =>
      app.NavigationStyle === 'App Switcher' || app.NavigationStyle === 'Both'
    );
  }
}
