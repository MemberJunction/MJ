import { Component, ViewEncapsulation } from '@angular/core';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIPromptsResource() {
  // Function for registration - actual instances created by Angular DI
}

@RegisterClass(BaseResourceComponent, 'ai-prompts')
@Component({
  selector: 'mj-ai-prompts-resource',
  template: `
    <div class="ai-prompts-container">
      <app-prompt-management-v2
        *ngIf="currentUser"
        (openEntityRecord)="onOpenEntityRecord($event)">
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

  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;
    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  onOpenEntityRecord(data: {entityName: string; recordId: string}): void {
    if (data && data.entityName && data.recordId) {
      const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: data.recordId }]);
      this.navigationService.OpenEntityRecord(data.entityName, compositeKey);
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Prompts';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comment-dots';
  }
}
