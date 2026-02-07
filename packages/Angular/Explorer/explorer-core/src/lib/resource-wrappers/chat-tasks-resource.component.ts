import { Component, ViewEncapsulation, OnDestroy, ViewChild } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { TasksFullViewComponent } from '@memberjunction/ng-conversations';
import { Subject, takeUntil, filter } from 'rxjs';
/**
 * Chat Tasks Resource - displays the tasks full view for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Shows all tasks associated with conversations and artifacts
 * Supports URL deep-linking via taskId query parameter
 */
@RegisterClass(BaseResourceComponent, 'ChatTasksResource')
@Component({
  standalone: false,
  selector: 'mj-chat-tasks-resource',
  template: `
    <div class="chat-tasks-container">
      @if (currentUser) {
        <mj-tasks-full-view
          #tasksView
          [environmentId]="environmentId"
          [currentUser]="currentUser"
          [baseFilter]="'1=1'"
          [activeTaskId]="activeTaskId"
          (taskSelected)="onTaskSelected($any($event))"
          style="height: 100%;">
        </mj-tasks-full-view>
      }
    </div>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-tasks-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      flex: 1;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ChatTasksResource extends BaseResourceComponent implements OnDestroy {
  @ViewChild('tasksView') tasksView?: TasksFullViewComponent;

  public currentUser: any = null;
  public activeTaskId?: string;
  private skipUrlUpdate = true;
  private destroy$ = new Subject<void>();
  private lastNavigatedUrl: string = ''; // Track URL to avoid reacting to our own navigation

  constructor(
    private router: Router,
    private navigationService: NavigationService
  ) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Parse URL first and apply state
    const urlState = this.parseUrlState();
    if (urlState?.taskId) {
      this.activeTaskId = urlState.taskId;
    } else {
      // Check for navigation params from config
      this.applyNavigationParams();
    }

    // Subscribe to router NavigationEnd events for back/forward button support
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        const currentUrl = event.urlAfterRedirects || event.url;
        if (currentUrl !== this.lastNavigatedUrl) {
          this.onExternalNavigation(currentUrl);
        }
      });

    // Enable URL updates after initialization
    this.skipUrlUpdate = false;

    // Update URL to reflect current state
    this.updateUrl();

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Parse URL query string for task state.
   * Query params: taskId
   */
  private parseUrlState(): { taskId?: string } | null {
    const url = this.router.url;
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const taskId = params.get('taskId');

    if (!taskId) return null;

    return { taskId };
  }

  /**
   * Apply navigation parameters from configuration.
   */
  private applyNavigationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    if (config.taskId) {
      this.activeTaskId = config.taskId as string;
    }
  }

  /**
   * Handle task selection from the tasks view.
   */
  onTaskSelected(taskId: string | null): void {
    this.activeTaskId = taskId || undefined;
    if (!this.skipUrlUpdate) {
      this.updateUrl();
    }
  }

  /**
   * Update URL query string to reflect current state.
   * Uses NavigationService for proper URL management that respects app-scoped routes.
   */
  private updateUrl(): void {
    const queryParams: Record<string, string | null> = {};

    if (this.activeTaskId) {
      queryParams['taskId'] = this.activeTaskId;
    } else {
      queryParams['taskId'] = null;
    }

    // Use NavigationService to update query params properly
    this.navigationService.UpdateActiveTabQueryParams(queryParams);
  }

  /**
   * Handle external navigation (back/forward buttons).
   * Parses the URL and applies the state without triggering a new navigation.
   */
  private onExternalNavigation(url: string): void {
    // Check if this URL is for our component (contains our base path)
    const currentPath = this.router.url.split('?')[0];
    const newPath = url.split('?')[0];

    // Only handle if we're still on the same base path (same component instance)
    if (currentPath !== newPath) {
      return; // Different route entirely, shell will handle it
    }

    // Parse the new URL state
    const urlState = this.parseUrlFromString(url);

    // Apply the state without triggering URL updates
    this.skipUrlUpdate = true;
    if (urlState?.taskId) {
      this.activeTaskId = urlState.taskId;
      // Notify the tasks view component if it exists
      if (this.tasksView) {
        this.tasksView.activeTaskId = urlState.taskId;
      }
    } else {
      // No params means clear state
      this.activeTaskId = undefined;
      if (this.tasksView) {
        this.tasksView.activeTaskId = undefined;
      }
    }
    this.skipUrlUpdate = false;

    // Update the tracked URL
    this.lastNavigatedUrl = url;
  }

  /**
   * Parse URL state from a URL string (used for external navigation).
   */
  private parseUrlFromString(url: string): { taskId?: string } | null {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const taskId = params.get('taskId');

    if (!taskId) return null;

    return { taskId };
  }

  /**
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || EnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /**
   * Get the display name for chat tasks
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Tasks';
  }

  /**
   * Get the icon class for chat tasks
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-tasks';
  }
}
