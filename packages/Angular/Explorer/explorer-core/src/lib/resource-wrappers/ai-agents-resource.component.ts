import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIAgentsResource() {
  const test = new AIAgentsResource();
}

@RegisterClass(BaseResourceComponent, 'ai-agents')
@Component({
  selector: 'mj-ai-agents-resource',
  template: `
    <div class="ai-agents-container">
      <app-agent-configuration
        *ngIf="currentUser">
      </app-agent-configuration>
    </div>
  `,
  styles: [`
    .ai-agents-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class AIAgentsResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;
    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Agents';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-robot';
  }
}
