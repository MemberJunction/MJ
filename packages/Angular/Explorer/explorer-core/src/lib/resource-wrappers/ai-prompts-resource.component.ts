import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIPromptsResource() {
  const test = new AIPromptsResource();
}

@RegisterClass(BaseResourceComponent, 'ai-prompts')
@Component({
  selector: 'mj-ai-prompts-resource',
  template: `
    <div class="ai-prompts-container">
      <app-prompt-management-v2
        *ngIf="currentUser">
      </app-prompt-management-v2>
    </div>
  `,
  styles: [`
    .ai-prompts-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class AIPromptsResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;
    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Prompts';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comment-dots';
  }
}
