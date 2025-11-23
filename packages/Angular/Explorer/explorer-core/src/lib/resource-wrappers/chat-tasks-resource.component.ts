import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';

export function LoadChatTasksResource() {
  const test = new ChatTasksResource(); // Force inclusion in production builds (tree shaking workaround)
}

/**
 * Chat Tasks Resource - displays the tasks full view for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Shows all tasks associated with conversations and artifacts
 */
@RegisterClass(BaseResourceComponent, 'ChatTasksResource')
@Component({
  selector: 'mj-chat-tasks-resource',
  template: `
    <div class="chat-tasks-container">
      <mj-tasks-full-view
        *ngIf="currentUser"
        [environmentId]="environmentId"
        [currentUser]="currentUser"
        [baseFilter]="'1=1'">
      </mj-tasks-full-view>
    </div>
  `,
  styles: [`
    .chat-tasks-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ChatTasksResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
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
