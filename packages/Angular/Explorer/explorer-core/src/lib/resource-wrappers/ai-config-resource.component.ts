import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIConfigResource() {
  const test = new AIConfigResource();
}

@RegisterClass(BaseResourceComponent, 'ai-config')
@Component({
  selector: 'mj-ai-config-resource',
  templateUrl: './ai-config-resource.component.html',
  styleUrls: ['./ai-config-resource.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AIConfigResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;
    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Config';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-cogs';
  }
}
