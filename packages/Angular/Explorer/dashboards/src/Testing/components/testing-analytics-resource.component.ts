import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Testing Analytics Resource - displays test analytics and metrics
 */
@RegisterClass(BaseResourceComponent, 'TestingAnalyticsResource')
@Component({
  standalone: false,
  selector: 'mj-testing-analytics-resource',
  template: `
    <div class="resource-container">
      <app-testing-analytics></app-testing-analytics>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
    }
  `]
})
export class TestingAnalyticsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Notify that loading is complete
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Analytics';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-bar';
  }
}
