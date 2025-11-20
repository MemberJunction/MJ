import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { Metadata, RunView, ApplicationInfo } from '@memberjunction/core';
import { ApplicationEntity } from '@memberjunction/core-entities';
import { BaseApplication } from './base-application';

/**
 * Manages application instances and active application state.
 *
 * Loads all applications on startup and creates BaseApplication instances
 * via ClassFactory (getting subclasses if registered).
 */
@Injectable({
  providedIn: 'root'
})
export class ApplicationManager {
  private applications$ = new BehaviorSubject<BaseApplication[]>([]);
  private activeApp$ = new BehaviorSubject<BaseApplication | null>(null);
  private loading$ = new BehaviorSubject<boolean>(false);
  private initialized = false;

  /**
   * Observable of all loaded applications
   */
  get Applications(): Observable<BaseApplication[]> {
    return this.applications$.asObservable();
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
   * Get all applications synchronously
   */
  GetAllApps(): BaseApplication[] {
    return this.applications$.value;
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
   * Load applications from metadata and extended data
   */
  private async loadApplications(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.loading$.next(true);

    try {
      const md = new Metadata();
      const appInfoList: ApplicationInfo[] = md.Applications;
      console.log('[ApplicationManager] Loading applications from metadata:', appInfoList.length);

      const apps: BaseApplication[] = [];
      for (const appInfo of appInfoList) {
        console.log('[ApplicationManager] Creating app:', {
          Name: appInfo.Name,
          ClassName: appInfo.ClassName,
          Color: appInfo.Color,
          Icon: appInfo.Icon,
          HasDefaultNavItems: !!appInfo.DefaultNavItems
        });

        // Create instance using ClassFactory (gets subclass if registered)
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
            ClassName: appInfo.ClassName
          }
        );

        if (app) {
          console.log('[ApplicationManager] Created app instance:', {
            Name: app.Name,
            Color: app.Color,
            GetColor: app.GetColor(),
            NavItemsCount: app.GetNavItems().length
          });
          apps.push(app);
        }
      }

      console.log('[ApplicationManager] Total apps created:', apps.length);
      this.applications$.next(apps);
      this.initialized = true;

    } catch (error) {
      console.error('Failed to initialize ApplicationManager:', error);
      throw error;
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Set the active application by ID
   */
  async SetActiveApp(appId: string): Promise<void> {
    console.log('[ApplicationManager] SetActiveApp called:', appId);
    const currentApp = this.activeApp$.value;
    const newApp = this.applications$.value.find(a => a.ID === appId);

    if (!newApp) {
      console.error('[ApplicationManager] Application not found:', appId);
      return;
    }

    console.log('[ApplicationManager] Switching to app:', {
      Name: newApp.Name,
      Color: newApp.GetColor(),
      NavItems: newApp.GetNavItems()
    });

    if (currentApp?.ID === appId) {
      console.log('[ApplicationManager] App already active, skipping');
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
}
