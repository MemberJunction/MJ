import { Component, ViewEncapsulation } from '@angular/core';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIAgentsResource() {
  // Function for registration - actual instances created by Angular DI
}

@RegisterClass(BaseResourceComponent, 'AIAgentsResource')
@Component({
  selector: 'mj-ai-agents-resource',
  template: `
    <div class="ai-agents-container">
      <app-agent-configuration
        *ngIf="currentUser"
        (openEntityRecord)="onOpenEntityRecord($event)">
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

  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;
    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  onOpenEntityRecord(data: {entityName: string; recordId: string}): void {
    console.log('AIAgentsResource.onOpenEntityRecord called:', data);
    if (data && data.entityName && data.recordId) {
      const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: data.recordId }]);
      console.log('AIAgentsResource calling NavigationService.OpenEntityRecord:', data.entityName, compositeKey);
      this.navigationService.OpenEntityRecord(data.entityName, compositeKey);
    } else {
      console.log('AIAgentsResource - invalid data:', data);
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Agents';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-robot';
  }
}
