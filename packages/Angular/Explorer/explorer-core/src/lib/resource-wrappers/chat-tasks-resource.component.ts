import { Component, ViewEncapsulation, OnDestroy, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { TasksFullViewComponent } from '@memberjunction/ng-conversations';

export function LoadChatTasksResource() {
  const test = new ChatTasksResource(null!); // Force inclusion in production builds (tree shaking workaround)
}

/**
 * Chat Tasks Resource - displays the tasks full view for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Shows all tasks associated with conversations and artifacts
 * Supports URL deep-linking via taskId query parameter
 */
@RegisterClass(BaseResourceComponent, 'ChatTasksResource')
@Component({
  selector: 'mj-chat-tasks-resource',
  template: `
    <div class="chat-tasks-container">
      <mj-tasks-full-view
        #tasksView
        *ngIf="currentUser"
        [environmentId]="environmentId"
        [currentUser]="currentUser"
        [baseFilter]="'1=1'"
        [activeTaskId]="activeTaskId"
        (taskSelected)="onTaskSelected($any($event))"
        style="height: 100%;">
      </mj-tasks-full-view>
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

  constructor(private location: Location) {
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

    // Setup browser back/forward navigation
    this.setupPopStateListener();

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
    this.cleanupPopStateListener();
  }

  /**
   * Parse URL query string for task state.
   * Query params: taskId
   */
  private parseUrlState(): { taskId?: string } | null {
    const queryString = window.location.search;
    if (!queryString) return null;

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
   */
  private updateUrl(): void {
    const params = new URLSearchParams();

    if (this.activeTaskId) {
      params.set('taskId', this.activeTaskId);
    }

    // Get current path without query string
    const currentPath = this.location.path().split('?')[0];
    const queryString = params.toString();
    const newUrl = queryString ? `${currentPath}?${queryString}` : currentPath;

    this.location.replaceState(newUrl);
  }

  /** Bound handler for popstate events */
  private boundPopStateHandler = this.onPopState.bind(this);

  private setupPopStateListener(): void {
    window.addEventListener('popstate', this.boundPopStateHandler);
  }

  private cleanupPopStateListener(): void {
    window.removeEventListener('popstate', this.boundPopStateHandler);
  }

  /**
   * Handle browser back/forward navigation.
   */
  private onPopState(): void {
    const urlState = this.parseUrlState();
    this.skipUrlUpdate = true;
    this.activeTaskId = urlState?.taskId;
    this.skipUrlUpdate = false;
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
