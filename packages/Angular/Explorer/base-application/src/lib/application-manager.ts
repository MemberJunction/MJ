import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MJGlobal, MJEventType, UUIDsEqual } from '@memberjunction/global';
import { Metadata, ApplicationInfo, LogError, LogStatus, StartupManager } from '@memberjunction/core';
import { MJUserApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';
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

  constructor() {
    this.Initialize();
  }

  /**
   * Initialize the application manager by subscribing to the LoggedIn event.
   * Applications are loaded when the event fires, ensuring metadata is ready.
   * Also subscribes to UserInfoEngine data changes to auto-sync when user apps change.
   */
  Initialize(): void {
    if (this.initialized) {
      return;
    }

    // Subscribe with replay (true) to catch the event even if it already fired
    MJGlobal.Instance.GetEventListener(true).subscribe(async (event) => {
      if (event.event === MJEventType.LoggedIn) {
        await StartupManager.Instance.Startup() // make sure this is done
        this.loadApplications();
        this.subscribeToEngineChanges();
      }
    });
  }

  /**
   * Subscribe to UserInfoEngine data changes to automatically sync our observables
   * when UserApplication records are modified.
   */
  private subscribeToEngineChanges(): void {
    const engine = UserInfoEngine.Instance;
    engine.DataChange$.subscribe(event => {
      // When UserApplications data changes in the engine, sync our observables
      if (event.config.PropertyName === 'UserApplications') {
        this.syncFromEngine();
      }
    });
  }

  /**
   * Sync our BehaviorSubjects with the current data from UserInfoEngine.
   * Called when the engine emits a data change event for UserApplications.
   */
  private syncFromEngine(): void {
    const allApps = this.allApplications$.value;
    const engine = UserInfoEngine.Instance;
    const userApps = engine.UserApplications;

    // Build a map for quick lookup
    const appMap = new Map<string, BaseApplication>();
    for (const app of allApps) {
      appMap.set(app.ID, app);
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

        const args = {
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
          HideNavBarIconWhenActive: appInfo.HideNavBarIconWhenActive,
          Path: appInfo.Path || '',
          AutoUpdatePath: appInfo.AutoUpdatePath
        };

        let app: BaseApplication | null;
        if (appInfo.ClassName && appInfo.ClassName.trim().length > 0) {
          app = MJGlobal.Instance.ClassFactory.CreateInstance<BaseApplication>(
            BaseApplication,
            appInfo.ClassName,
            args          
          );
        }
        else {
          // no class provided in app definition.
          app = new BaseApplication(args)
        }

        if (app) {
          // should always get here unless failure to load registered sub-class but CreateInstance has
          // fallback to base class anyway so should always get here 
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
    const allApps = this.allApplications$.value;

    // Build a map for quick lookup
    const appMap = new Map<string, BaseApplication>();
    for (const app of allApps) {
      appMap.set(app.ID, app);
    }

    // Load user's UserApplication records using UserInfoEngine for caching
    const engine = UserInfoEngine.Instance;

    let userApps: MJUserApplicationEntity[] = engine.UserApplications;

    // Self-healing: If user has no UserApplication records, create from DefaultForNewUser apps
    if (userApps.length === 0) {
      LogStatus(`User ${md.CurrentUser.Name} has no UserApplication records, creating from DefaultForNewUser apps`);
      userApps = await this.createDefaultUserApplications();
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
   * Delegates to UserInfoEngine for the actual creation.
   */
  private async createDefaultUserApplications(): Promise<MJUserApplicationEntity[]> {
    const engine = UserInfoEngine.Instance;
    return await engine.CreateDefaultApplications();
  }

  /**
   * Set the active application by ID
   */
  async SetActiveApp(appId: string): Promise<void> {
    const currentApp = this.activeApp$.value;
    const newApp = this.applications$.value.find(a => UUIDsEqual(a.ID, appId))

    if (!newApp) {
      return;
    }

    if (UUIDsEqual(currentApp?.ID, appId)) {
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
    return this.applications$.value.find(a => UUIDsEqual(a.ID, appId))
  }

  /**
   * Get application by name
   */
  GetAppByName(name: string): BaseApplication | undefined {
    return this.applications$.value.find(a => a.Name === name);
  }

  /**
   * Get application by URL path slug.
   * Matches case-insensitively against the app's Path property.
   * Falls back to Name match if Path is not found (for backwards compatibility).
   */
  GetAppByPath(path: string): BaseApplication | undefined {
    const normalizedPath = path.trim().toLowerCase();

    // First try exact path match
    const pathMatch = this.applications$.value.find(a =>
      a.Path?.toLowerCase() === normalizedPath
    );

    if (pathMatch) {
      return pathMatch;
    }

    // Fallback: try matching by name (for backwards compatibility with old URLs)
    return this.applications$.value.find(a =>
      a.Name.trim().toLowerCase() === normalizedPath
    );
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

  /**
   * Check if an app exists in the system by path or name (case-insensitive).
   * Returns the app from allApplications$ if found, regardless of user access.
   */
  GetSystemAppByPath(path: string): BaseApplication | undefined {
    const normalizedPath = path.trim().toLowerCase();

    // First try exact path match
    const pathMatch = this.allApplications$.value.find(a =>
      a.Path?.toLowerCase() === normalizedPath
    );

    if (pathMatch) {
      return pathMatch;
    }

    // Fallback: try matching by name
    return this.allApplications$.value.find(a =>
      a.Name.trim().toLowerCase() === normalizedPath
    );
  }

  /**
   * Check if a system app is inactive (Status !== 'Active').
   * Delegates to UserInfoEngine for the metadata lookup.
   */
  IsAppInactive(path: string): boolean {
    const engine = UserInfoEngine.Instance;
    const appInfo = engine.FindApplicationByPathOrName(path);
    return appInfo != null && engine.IsApplicationInactive(appInfo.ID);
  }

  /**
   * Determine why a user cannot access an app by its URL path.
   * Uses UserInfoEngine for core access checking logic.
   * Returns detailed access information for error handling.
   */
  CheckAppAccess(path: string): AppAccessResult {
    const engine = UserInfoEngine.Instance;

    // Step 1: Check if app exists in metadata at all
    const appInfo = engine.FindApplicationByPathOrName(path);

    if (!appInfo) {
      return {
        status: 'not_found',
        message: `The application "${path}" does not exist.`,
        appName: path
      };
    }

    // Step 2: Check if app is inactive
    if (engine.IsApplicationInactive(appInfo.ID)) {
      return {
        status: 'inactive',
        message: `The application "${appInfo.Name}" is currently inactive.`,
        appName: appInfo.Name,
        appId: appInfo.ID
      };
    }

    // Step 3: Check user's access status via engine
    const accessStatus = engine.CheckUserApplicationAccess(appInfo.ID);

    switch (accessStatus) {
      case 'installed_active': {
        // User has access - find the BaseApplication instance
        const baseApp = this.applications$.value.find(a => UUIDsEqual(a.ID, appInfo.ID))
        return {
          status: 'accessible',
          message: 'User has access to this app',
          appName: appInfo.Name,
          appId: appInfo.ID,
          app: baseApp
        };
      }

      case 'installed_inactive':
        return {
          status: 'disabled',
          message: `You have disabled "${appInfo.Name}" in your app configuration.`,
          appName: appInfo.Name,
          appId: appInfo.ID,
          canInstall: true
        };

      case 'not_installed':
      default:
        return {
          status: 'not_installed',
          message: `You don't have "${appInfo.Name}" installed.`,
          appName: appInfo.Name,
          appId: appInfo.ID,
          canInstall: true
        };
    }
  }

  /**
   * Install an application for the current user by creating a UserApplication record.
   * Delegates to UserInfoEngine for the actual installation.
   * Returns the newly created UserApplication entity.
   */
  async InstallAppForUser(appId: string): Promise<MJUserApplicationEntity | null> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity save triggers a refresh,
    // which our subscribeToEngineChanges() handler will pick up and call syncFromEngine()
    return await engine.InstallApplication(appId);
  }

  /**
   * Enable an existing but disabled UserApplication record.
   * Delegates to UserInfoEngine for the actual enabling.
   * Sync happens automatically via DataChange$ subscription.
   */
  async EnableAppForUser(appId: string): Promise<boolean> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity save triggers a refresh
    return await engine.EnableApplication(appId);
  }

  /**
   * Disable an application for the current user.
   * Delegates to UserInfoEngine for the actual disabling.
   * Sync happens automatically via DataChange$ subscription.
   */
  async DisableAppForUser(appId: string): Promise<boolean> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity save triggers a refresh
    return await engine.DisableApplication(appId);
  }

  /**
   * Uninstall an application for the current user.
   * Delegates to UserInfoEngine for the actual uninstallation.
   * Sync happens automatically via DataChange$ subscription.
   */
  async UninstallAppForUser(appId: string): Promise<boolean> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity delete triggers a refresh
    return await engine.UninstallApplication(appId);
  }
}

/**
 * Result of checking a user's access to an application
 */
export interface AppAccessResult {
  /** Status of the access check */
  status: 'accessible' | 'not_found' | 'inactive' | 'not_installed' | 'disabled';
  /** Human-readable message describing the access status */
  message: string;
  /** Name of the application (if found) */
  appName: string;
  /** ID of the application (if found) */
  appId?: string;
  /** The BaseApplication instance (if accessible) */
  app?: BaseApplication;
  /** Whether the user can install/enable this app */
  canInstall?: boolean;
}
