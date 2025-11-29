import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';

export function LoadChatCollectionsResource() {
  const test = new ChatCollectionsResource(); // Force inclusion in production builds (tree shaking workaround)
}

/**
 * Chat Collections Resource - displays the collections full view for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Shows all collections and their artifacts in a comprehensive view
 */
@RegisterClass(BaseResourceComponent, 'ChatCollectionsResource')
@Component({
  selector: 'mj-chat-collections-resource',
  template: `
    <div class="chat-collections-container">
      <mj-collections-full-view
        *ngIf="currentUser"
        [environmentId]="environmentId"
        [currentUser]="currentUser" style="height: 100%;">
      </mj-collections-full-view>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-collections-container {
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
export class ChatCollectionsResource extends BaseResourceComponent {
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
   * Get the display name for chat collections
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Collections';
  }

  /**
   * Get the icon class for chat collections
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-open';
  }
}
