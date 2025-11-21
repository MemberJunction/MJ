import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ApplicationManager,
  WorkspaceStateManager,
  GoldenLayoutManager,
  BaseApplication,
  TabService
} from '@memberjunction/ng-base-application';
import { Metadata } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

/**
 * Main shell component for the new Explorer UX.
 *
 * Provides:
 * - App-centric header with app switcher and nav items
 * - Golden Layout-based tab container
 * - Unified workspace state management
 */
@Component({
  selector: 'mj-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.css']
})
export class ShellComponent implements OnInit, OnDestroy, AfterViewInit {
  private subscriptions: Subscription[] = [];

  activeApp: BaseApplication | null = null;
  loading = true;
  initialized = false;

  constructor(
    private appManager: ApplicationManager,
    private workspaceManager: WorkspaceStateManager,
    private layoutManager: GoldenLayoutManager,
    private tabService: TabService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      MJGlobal.Instance.GetEventListener(true).subscribe(event => {
        if (event.event === MJEventType.LoggedIn) {
          // Initialize shell on login
          this.initializeShell().catch(err => {
            console.error('Error during shell initialization:', err);
            this.loading = false;
          });
        }
      });
    } catch (error) {
      console.error('Failed to initialize shell:', error);
      this.loading = false;
    }
  }

  async initializeShell(): Promise<void> {
    console.log('[Shell] ============ INITIALIZATION START ============');

    // Initialize application manager (subscribes to LoggedIn event)
    this.appManager.Initialize();

    // Get current user and initialize workspace
    const md = new Metadata();
    const user = md.CurrentUser;
    if (user) {
      // CRITICAL: Wait for workspace initialization to complete
      // before allowing any tab operations
      await this.workspaceManager.Initialize(user.ID);
      const config = this.workspaceManager.GetConfiguration();
      console.log('[Shell] Workspace initialized with', config?.tabs.length || 0, 'saved tabs');
      if (config?.tabs) {
        config.tabs.forEach(tab => {
          console.log(`[Shell]   - Tab: "${tab.title}" (app: ${tab.applicationId})`);
        });
      }
    } else {
      throw new Error('No current user found');
    }

    // Subscribe to active app changes
    this.subscriptions.push(
      this.appManager.ActiveApp.subscribe(async app => {
        console.log('[Shell] ========== ACTIVE APP CHANGED ==========');
        console.log('[Shell] New active app:', app?.Name, app?.ID);
        this.activeApp = app;

        // Create default tab when app is activated ONLY if app has no tabs yet
        if (app) {
          const existingTabs = this.workspaceManager.GetAppTabs(app.ID);
          console.log('[Shell] App tabs count:', existingTabs.length);
          existingTabs.forEach((tab, idx) => {
            console.log(`[Shell]   Tab ${idx + 1}: "${tab.title}" (id: ${tab.id.substring(0, 8)}...)`);
          });

          if (existingTabs.length === 0) {
            console.log('[Shell] No tabs for app, creating default tab');
            const tabRequest = await app.CreateDefaultTab();
            if (tabRequest) {
              console.log('[Shell] Opening default tab:', tabRequest.Title);
              this.tabService.OpenTab(tabRequest);
            }
          } else {
            console.log('[Shell] App has existing tabs, skipping default tab creation');
          }
        }
      })
    );

    // Subscribe to applications loading - set first app as active when loaded
    this.subscriptions.push(
      this.appManager.Applications.subscribe(async apps => {
        console.log('[Shell] Applications loaded:', apps.length);
        if (apps.length > 0 && !this.appManager.GetActiveApp()) {
          console.log('[Shell] Setting first app as active:', apps[0].Name);
          await this.appManager.SetActiveApp(apps[0].ID);
        }
      })
    );

    // Subscribe to tab open requests from TabService
    this.subscriptions.push(
      this.tabService.TabRequests.subscribe(request => {
        console.log('[Shell] Tab open request from TabService:', request.Title);
        const app = this.appManager.GetAppById(request.ApplicationId);
        const appColor = app?.GetColor() || '#757575';
        this.workspaceManager.OpenTab(request, appColor);
      })
    );

    this.initialized = true;
    this.loading = false;
    console.log('[Shell] ============ INITIALIZATION COMPLETE ============');
  }

  ngAfterViewInit(): void {
    // Layout initialization happens in TabContainerComponent
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.layoutManager.Destroy();
  }

  /**
   * Handle app switch from app switcher
   */
  async onAppSwitch(appId: string): Promise<void> {
    await this.appManager.SetActiveApp(appId);

    // Check if app has any tabs, if not open default
    const appTabs = this.workspaceManager.GetAppTabs(appId);
    if (appTabs.length === 0) {
      const app = this.appManager.GetAppById(appId);
      if (app) {
        const defaultTab = await app.CreateDefaultTab();
        if (defaultTab) {
          this.workspaceManager.OpenTab(defaultTab, app.GetColor());
        }
      }
    }
  }

  /**
   * Handle navigation item click
   */
  onNavItemClick(navItem: any): void {
    console.log('[ShellComponent] Nav item clicked:', navItem);
    if (!this.activeApp) {
      console.log('[ShellComponent] No active app, ignoring nav click');
      return;
    }

    // Create tab request for nav item
    const tabRequest: any = {
      ApplicationId: this.activeApp.ID,
      Title: navItem.Label
    };

    // Handle resource-based nav items
    if (navItem.ResourceType) {
      tabRequest.ResourceType = navItem.ResourceType;
      tabRequest.ResourceRecordId = navItem.RecordId || null;
      // Put resourceType in Configuration so it gets stored properly
      tabRequest.Configuration = {
        resourceType: navItem.ResourceType,
        recordId: navItem.RecordId,
        ...(navItem.Configuration || {})
      };
    }
    // Handle route-based nav items (legacy)
    else if (navItem.Route) {
      tabRequest.Route = navItem.Route;
    }

    console.log('[ShellComponent] Opening tab for nav item:', tabRequest);
    this.workspaceManager.OpenTab(tabRequest, this.activeApp.GetColor());
  }
}
