import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Scheduling Dashboard Resource — thin shim. The inner component owns its own
 * `<mj-page-layout>` + `<mj-page-header>` chrome (see scheduling-overview.component.html).
 */
@RegisterClass(BaseResourceComponent, 'SchedulingDashboardResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-dashboard-resource',
  template: `<app-scheduling-overview></app-scheduling-overview>`
})
export class SchedulingOverviewResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Dashboard';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-gauge-high';
  }
}
