import { Component } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { LibraryResource } from './library-resource.component';

/**
 * Backward-compatible Explorer resource wrapper for saved `MJ: Workspaces` tabs referencing
 * `ChatCollectionsResource` (previously nested under the Chat application).
 *
 * Delegates directly to the unified `LibraryResource` in Power Navigator mode so existing
 * deep links and workspace tabs seamlessly upgrade to the full Library experience.
 */
@RegisterClass(BaseResourceComponent, 'ChatCollectionsResource')
@Component({
  standalone: false,
  selector: 'mj-chat-collections-resource',
  template: `
    @if (CurrentUser) {
      <mj-library-workspace
        #workspace
        [CurrentUser]="CurrentUser"
        [EnvironmentId]="EnvironmentId"
        [InitialMode]="'navigator'"
        (StateChange)="OnWorkspaceStateChange($event)"
        (HostNavigate)="OnHostNavigate($event)"
        (LoadComplete)="OnWorkspaceLoadComplete()"
      ></mj-library-workspace>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;
      }
    `,
  ],
})
export class ChatCollectionsResource extends LibraryResource {
  public constructor() {
    super();
    this.DefaultSurfaceMode = 'navigator';
  }

  public override async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return data?.Name || 'Collections';
  }

  public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-open';
  }
}
