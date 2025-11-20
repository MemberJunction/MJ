import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MJGlobal } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
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
   * Initialize the application manager by loading all applications
   */
  async Initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.loading$.next(true);

    try {
      const rv = new RunView();
      const result = await rv.RunView<ApplicationEntity>({
        EntityName: 'Applications',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      if (!result.Success) {
        throw new Error(`Failed to load applications: ${result.ErrorMessage}`);
      }

      const apps: BaseApplication[] = [];
      for (const appEntity of result.Results) {
        // Get new columns using Get() method since they may not be in typed properties yet
        const className = appEntity.Get('ClassName') as string || 'BaseApplication';
        const color = appEntity.Get('Color') as string || '#1976d2';
        const defaultNavItems = appEntity.Get('DefaultNavItems') as string || '';

        // Create instance using ClassFactory (gets subclass if registered)
        const app = MJGlobal.Instance.ClassFactory.CreateInstance<BaseApplication>(
          BaseApplication,
          className,
          {
            ID: appEntity.ID,
            Name: appEntity.Name,
            Description: appEntity.Description || '',
            Icon: appEntity.Icon || '',
            Color: color,
            DefaultNavItems: defaultNavItems,
            ClassName: className
          }
        );

        if (app) {
          apps.push(app);
        }
      }

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
    const currentApp = this.activeApp$.value;
    const newApp = this.applications$.value.find(a => a.ID === appId);

    if (!newApp) {
      console.error(`Application not found: ${appId}`);
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
}
