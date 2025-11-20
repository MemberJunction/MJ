import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  ApplicationManager,
  WorkspaceStateManager,
  GoldenLayoutManager,
  BaseApplication,
  TabService
} from '@memberjunction/ng-base-application';
import { Metadata } from '@memberjunction/core';
import { AppSwitcherComponent } from './components/header/app-switcher.component';
import { AppNavComponent } from './components/header/app-nav.component';
import { TabContainerComponent } from './components/tabs/tab-container.component';

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
  standalone: true,
  imports: [
    CommonModule,
    AppSwitcherComponent,
    AppNavComponent,
    TabContainerComponent
  ],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss']
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
      // Initialize application manager (subscribes to LoggedIn event)
      this.appManager.Initialize();

      // Get current user and initialize workspace
      const md = new Metadata();
      const user = md.CurrentUser;
      if (user) {
        await this.workspaceManager.Initialize(user.ID);
      }

      // Subscribe to active app changes
      this.subscriptions.push(
        this.appManager.ActiveApp.subscribe(app => {
          this.activeApp = app;
        })
      );

      // Subscribe to applications loading - set first app as active when loaded
      this.subscriptions.push(
        this.appManager.Applications.subscribe(async apps => {
          if (apps.length > 0 && !this.appManager.GetActiveApp()) {
            await this.appManager.SetActiveApp(apps[0].ID);
          }
        })
      );

      // Subscribe to tab open requests from TabService
      this.subscriptions.push(
        this.tabService.TabRequests.subscribe(request => {
          const app = this.appManager.GetAppById(request.ApplicationId);
          const appColor = app?.GetColor() || '#757575';
          this.workspaceManager.OpenTab(request, appColor);
        })
      );

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize shell:', error);
    } finally {
      this.loading = false;
    }
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
        const defaultTab = app.CreateDefaultTab();
        if (defaultTab) {
          this.workspaceManager.OpenTab(defaultTab, app.GetColor());
        }
      }
    }
  }

  /**
   * Handle navigation item click
   */
  onNavItemClick(route: string): void {
    if (!this.activeApp) return;

    // Create tab request for nav item
    const tabRequest = {
      ApplicationId: this.activeApp.ID,
      Title: this.getNavItemLabel(route),
      Route: route
    };

    this.workspaceManager.OpenTab(tabRequest, this.activeApp.GetColor());
  }

  /**
   * Get label for a route from nav items
   */
  private getNavItemLabel(route: string): string {
    if (!this.activeApp) return 'Tab';
    const navItems = this.activeApp.GetNavItems();
    const item = navItems.find(n => n.Route === route);
    return item?.Label || 'Tab';
  }
}
