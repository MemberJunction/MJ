import { Component, OnInit, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { SchedulingJobsComponent } from './scheduling-jobs.component';
/**
 * Scheduling Jobs Resource - manage and configure scheduled jobs with slideout panels
 */
@RegisterClass(BaseResourceComponent, 'SchedulingJobsResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-jobs-resource',
  template: `
    <mj-page-layout>
      <mj-page-header
        Title="Scheduled Jobs"
        Icon="fa-solid fa-calendar-check"
        Subtitle="Configure and manage scheduled jobs">
        <div meta class="resource-header-meta">
          <mj-result-count
            [Count]="jobsCmp?.FilteredJobs?.length ?? 0"
            [Total]="jobsCmp?.Jobs?.length ?? 0"
            Label="jobs">
          </mj-result-count>
        </div>
        <div actions class="resource-header-actions">
          <mj-filter-popover
            [ActiveCount]="ActiveFilterCount"
            [ShowClearAll]="ActiveFilterCount > 0"
            (ClearAllRequested)="resetFilters()">
            <mj-filter-panel
              [Fields]="JobsFilterFields"
              [Values]="JobsFilterValues"
              (ValuesChange)="onFilterValuesChange($event)"
              (Reset)="resetFilters()">
            </mj-filter-panel>
          </mj-filter-popover>
          <button mjButton variant="secondary" size="sm" (click)="jobsCmp?.Refresh()" title="Refresh">
            <i class="fa-solid fa-arrows-rotate"></i> Refresh
          </button>
          <button mjButton variant="primary" size="sm" (click)="jobsCmp?.OpenCreateSlideout()">
            <i class="fa-solid fa-plus"></i> New Job
          </button>
        </div>
        <div toolbar class="resource-toolbar">
          <mj-page-search
            Placeholder="Search jobs..."
            [Value]="jobsCmp?.SearchTerm ?? ''"
            (ValueChange)="jobsCmp?.OnSearchChange($event)">
          </mj-page-search>
        </div>
      </mj-page-header>
      <div class="resource-body">
        <app-scheduling-jobs #jobsCmp [HideToolbar]="true"></app-scheduling-jobs>
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
    /* Header projection wrappers — display:contents lets children become direct flex
       children of <mj-page-header>'s slot so its gap applies between them. */
    .resource-header-meta,
    .resource-header-actions {
      display: contents;
    }
    .resource-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
  `]
})
export class SchedulingJobsResourceComponent extends BaseResourceComponent implements OnInit {
  @ViewChild('jobsCmp') jobsCmp?: SchedulingJobsComponent;

  public get JobsFilterFields(): FilterFieldConfig[] {
    const statusOptions = (this.jobsCmp?.StatusOptions ?? ['']).map(s => ({
      text: s === '' ? 'All Statuses' : s,
      value: s
    }));
    const typeOptions = (this.jobsCmp?.TypeOptions ?? ['']).map(t => ({
      text: t === '' ? 'All Types' : t,
      value: t
    }));
    return [
      {
        key: 'statusFilter',
        type: 'dropdown',
        label: 'Status',
        icon: 'fa-solid fa-circle-info',
        placeholder: 'All Statuses',
        options: statusOptions
      },
      {
        key: 'typeFilter',
        type: 'dropdown',
        label: 'Type',
        icon: 'fa-solid fa-shapes',
        placeholder: 'All Types',
        options: typeOptions
      }
    ];
  }

  public get JobsFilterValues(): Record<string, unknown> {
    return {
      statusFilter: this.jobsCmp?.StatusFilter ?? '',
      typeFilter: this.jobsCmp?.TypeFilter ?? ''
    };
  }

  public get ActiveFilterCount(): number {
    let count = 0;
    if (this.jobsCmp?.StatusFilter) count++;
    if (this.jobsCmp?.TypeFilter) count++;
    return count;
  }

  public onFilterValuesChange(values: Record<string, unknown>): void {
    if (!this.jobsCmp) return;
    const next = (values ?? {}) as { statusFilter?: string; typeFilter?: string };
    if ((next.statusFilter ?? '') !== this.jobsCmp.StatusFilter) {
      this.jobsCmp.OnStatusFilterChange(next.statusFilter ?? '');
    }
    if ((next.typeFilter ?? '') !== this.jobsCmp.TypeFilter) {
      this.jobsCmp.OnTypeFilterChange(next.typeFilter ?? '');
    }
  }

  public resetFilters(): void {
    if (!this.jobsCmp) return;
    if (this.jobsCmp.StatusFilter) this.jobsCmp.OnStatusFilterChange('');
    if (this.jobsCmp.TypeFilter) this.jobsCmp.OnTypeFilterChange('');
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Jobs';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-calendar-check';
  }
}
