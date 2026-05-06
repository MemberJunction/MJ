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

  ngOnInit() {
    super.ngOnInit();
    const md = this.ProviderToUse;
    this.currentUser = md.CurrentUser;

    // Apply initial state from query params or tab config
    const params = this.GetQueryParams();
    const config = this.Data?.Configuration;
    const taskId = params['taskId'] || (config?.taskId as string);
    if (taskId) {
      this.activeTaskId = taskId;
    }

    // Push initial state to URL
    this.UpdateQueryParams({ taskId: this.activeTaskId ?? null });

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  ngOnDestroy() {
    super.ngOnDestroy();
  }

  protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    this.activeTaskId = params['taskId'] || undefined;
  }

  /**
   * Handle task selection from the tasks view.
   */
  onTaskSelected(taskId: string | null): void {
    this.activeTaskId = taskId || undefined;
    this.UpdateQueryParams({ taskId: this.activeTaskId ?? null });
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
