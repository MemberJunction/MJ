import { Component, OnInit, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { SchedulingOverviewComponent } from './scheduling-overview.component';
/**
 * Scheduling Dashboard Resource - displays the overview dashboard with KPIs, health, and alerts
 */
@RegisterClass(BaseResourceComponent, 'SchedulingDashboardResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-dashboard-resource',
  template: `
    <mj-page-layout>
      <mj-page-header
        Title="Scheduling Dashboard"
        Icon="fa-solid fa-gauge-high"
        Subtitle="System health, KPIs, and alerts">
        <div actions class="resource-header-actions">
          <button mjButton variant="secondary" size="sm" (click)="overviewCmp?.Refresh()" title="Refresh">
            <i class="fa-solid fa-arrows-rotate"></i> Refresh
          </button>
          <button mjButton
            [variant]="overviewCmp?.AutoRefreshEnabled ? 'primary' : 'secondary'"
            size="sm"
            (click)="overviewCmp?.ToggleAutoRefresh()"
            title="Toggle auto-refresh">
            <i class="fa-solid fa-rotate"></i>
            Auto: {{overviewCmp?.AutoRefreshEnabled ? 'ON' : 'OFF'}}
          </button>
        </div>
      </mj-page-header>
      <div class="resource-body">
        <app-scheduling-overview #overviewCmp [HideToolbar]="true"></app-scheduling-overview>
      </div>
    </mj-page-layout>
  `,
  styles: [`
    .resource-body {
      flex: 1;
      min-height: 0;
      padding: 0 24px 24px;
      overflow-y: auto;
    }
    /* Header projection wrapper — display:contents lets children become direct flex
       children of <mj-page-header>'s slot so its gap applies between them. */
    .resource-header-actions {
      display: contents;
    }
  `]
})
export class SchedulingOverviewResourceComponent extends BaseResourceComponent implements OnInit {
  @ViewChild('overviewCmp') overviewCmp?: SchedulingOverviewComponent;

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
