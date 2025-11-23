import { Component, ViewEncapsulation } from '@angular/core';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIMonitorResource() {
  // Function for registration - actual instances created by Angular DI
}

/**
 * AI Monitor Resource - displays AI execution monitoring dashboard
 * Wraps the execution-monitoring component for tab-based display
 * Shows KPIs, live executions, and performance metrics for AI operations
 */
@RegisterClass(BaseResourceComponent, 'AIMonitorResource')
@Component({
  selector: 'mj-ai-monitor-resource',
  template: `
    <div class="ai-monitor-container">
      <app-execution-monitoring
        *ngIf="currentUser"
        (openEntityRecord)="onOpenEntityRecord($event)">
      </app-execution-monitoring>
    </div>
  `,
  styles: [`
    .ai-monitor-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class AIMonitorResource extends BaseResourceComponent {
  public currentUser: any = null;

  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  onOpenEntityRecord(data: {entityName: string; recordId: string}): void {
    if (data && data.entityName && data.recordId) {
      const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: data.recordId }]);
      this.navigationService.OpenEntityRecord(data.entityName, compositeKey);
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Monitor';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}
