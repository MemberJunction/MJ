import { Component, OnInit, OnDestroy } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadTestingOverviewResource() {
  // Force inclusion in production builds
}

/**
 * Testing Overview Resource - displays test management dashboard overview
 */
@RegisterClass(BaseResourceComponent, 'TestingOverviewResource')
@Component({
  standalone: false,
  selector: 'mj-testing-overview-resource',
  template: `
    <div class="resource-container">
      <app-testing-overview></app-testing-overview>
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
export class TestingOverviewResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Notify that loading is complete
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}
