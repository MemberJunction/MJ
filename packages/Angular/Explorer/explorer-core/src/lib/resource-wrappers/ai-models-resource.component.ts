import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIModelsResource() {
  const test = new AIModelsResource();
}

@RegisterClass(BaseResourceComponent, 'ai-models')
@Component({
  selector: 'mj-ai-models-resource',
  templateUrl: './ai-models-resource.component.html',
  styleUrls: ['./ai-models-resource.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AIModelsResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;
    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Models';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-microchip';
  }
}
