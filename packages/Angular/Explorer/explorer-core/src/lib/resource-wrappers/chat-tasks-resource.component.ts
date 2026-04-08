import { Component, ViewEncapsulation, OnDestroy, ViewChild } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { TasksFullViewComponent } from '@memberjunction/ng-conversations';
import { Subject } from 'rxjs';
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

  constructor(
    private navigationService: NavigationService
  ) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Apply initial state from tab configuration (populated by shell from URL or nav params)
    this.applyNavigationParams();

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
   * Apply initial state from tab configuration.
   * The shell populates queryParams from the URL, and nav params come from cross-resource linking.
   */
  private applyNavigationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    const qp = config['queryParams'] as Record<string, string> | undefined;
    const taskId = qp?.['taskId'] || (config.taskId as string);
    if (taskId) {
      this.activeTaskId = taskId;
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
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
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
