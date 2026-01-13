import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingDashboardResource() {
  // Force inclusion in production builds
}

/**
 * Biking Dashboard Resource - Main dashboard overview with KPIs, charts, and activity
 */
@RegisterClass(BaseResourceComponent, 'BikingDashboardResource')
@Component({
  selector: 'mj-biking-dashboard-resource',
  template: `
    <div class="resource-container">
      <app-biking-dashboard></app-biking-dashboard>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
    }
  `]
})
export class BikingDashboardResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Dashboard';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-gauge-high';
  }
}
