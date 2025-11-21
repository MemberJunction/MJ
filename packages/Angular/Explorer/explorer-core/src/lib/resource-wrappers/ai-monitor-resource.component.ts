import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadAIMonitorResource() {
  const test = new AIMonitorResource(); //Force inclusion in production builds (tree shaking workaround)
}

/**
 * AI Monitor Resource - displays AI execution monitoring dashboard
 * Wraps the execution-monitoring component for tab-based display
 * Shows KPIs, live executions, and performance metrics for AI operations
 */
@RegisterClass(BaseResourceComponent, 'ai-monitor')
@Component({
  selector: 'mj-ai-monitor-resource',
  templateUrl: './ai-monitor-resource.component.html',
  styleUrls: ['./ai-monitor-resource.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AIMonitorResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Monitor';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}
