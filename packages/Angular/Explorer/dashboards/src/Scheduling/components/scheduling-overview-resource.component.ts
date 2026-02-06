import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadSchedulingDashboardResource() {
  // Force inclusion in production builds
}

/**
 * Scheduling Dashboard Resource - displays the overview dashboard with KPIs, health, and alerts
 */
@RegisterClass(BaseResourceComponent, 'SchedulingDashboardResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-dashboard-resource',
  template: `
    <div class="resource-container">
      <app-scheduling-overview></app-scheduling-overview>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 7px;
      box-sizing: border-box;
    }
  `]
})
export class SchedulingOverviewResourceComponent extends BaseResourceComponent implements OnInit {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Dashboard';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-gauge-high';
  }
}
