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
  templateUrl: './ai-prompts-resource.component.html',
  styleUrls: ['./ai-prompts-resource.component.scss'],
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
