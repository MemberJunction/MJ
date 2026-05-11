import { Component, OnInit, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { SchedulingActivityComponent } from './scheduling-activity.component';
/**
 * Scheduling Activity Resource - displays execution history, trends, and job type statistics
 */
@RegisterClass(BaseResourceComponent, 'SchedulingActivityResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-activity-resource',
  template: `
    <mj-page-layout>
      <mj-page-header
        Title="Scheduling Activity"
        Icon="fa-solid fa-clock-rotate-left"
        Subtitle="Execution history, trends, and job type statistics">
        <div actions class="resource-header-actions">
          <mj-filter-popover
            [ActiveCount]="ActiveFilterCount"
            [ShowClearAll]="ActiveFilterCount > 0"
            (ClearAllRequested)="resetFilters()">
            <mj-filter-panel
              [Fields]="ActivityFilterFields"
              [Values]="ActivityFilterValues"
              (ValuesChange)="onFilterValuesChange($event)"
              (Reset)="resetFilters()">
            </mj-filter-panel>
          </mj-filter-popover>
          <button mjButton variant="secondary" size="sm" (click)="activityCmp?.Refresh()" title="Refresh">
            <i class="fa-solid fa-arrows-rotate"></i> Refresh
          </button>
        </div>
        <div toolbar class="resource-toolbar">
          <mj-page-search
            Placeholder="Search executions..."
            [Value]="activityCmp?.SearchTerm ?? ''"
            (ValueChange)="activityCmp?.OnSearchChange($event)">
          </mj-page-search>
          @for (range of activityCmp?.TimeRanges; track range.value) {
            <mj-filter-chip
              [Label]="range.label"
              [Active]="activityCmp?.SelectedTimeRange === range.value"
              (Clicked)="activityCmp?.OnTimeRangeChange(range.value)">
            </mj-filter-chip>
          }
        </div>
      </mj-page-header>
      <div class="resource-body">
        <app-scheduling-activity #activityCmp [HideToolbar]="true"></app-scheduling-activity>
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
    .resource-header-actions {
      display: contents;
    }
    .resource-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
  `]
})
export class SchedulingActivityResourceComponent extends BaseResourceComponent implements OnInit {
  @ViewChild('activityCmp') activityCmp?: SchedulingActivityComponent;

  public get ActivityFilterFields(): FilterFieldConfig[] {
    const statusOptions = (this.activityCmp?.StatusOptions ?? ['']).map(s => ({
      text: s === '' ? 'All Statuses' : s,
      value: s
    }));
    const jobNames = this.activityCmp?.UniqueJobNames ?? [];
    const jobOptions = [{ text: 'All Jobs', value: '' }, ...jobNames.map(n => ({ text: n, value: n }))];
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
        key: 'jobNameFilter',
        type: 'dropdown',
        label: 'Job',
        icon: 'fa-solid fa-tag',
        placeholder: 'All Jobs',
        filterable: true,
        options: jobOptions
      }
    ];
  }

  public get ActivityFilterValues(): Record<string, unknown> {
    return {
      statusFilter: this.activityCmp?.StatusFilter ?? '',
      jobNameFilter: this.activityCmp?.JobNameFilter ?? ''
    };
  }

  public get ActiveFilterCount(): number {
    let count = 0;
    if (this.activityCmp?.StatusFilter) count++;
    if (this.activityCmp?.JobNameFilter) count++;
    return count;
  }

  public onFilterValuesChange(values: Record<string, unknown>): void {
    if (!this.activityCmp) return;
    const next = (values ?? {}) as { statusFilter?: string; jobNameFilter?: string };
    if ((next.statusFilter ?? '') !== this.activityCmp.StatusFilter) {
      this.activityCmp.OnStatusFilterChange(next.statusFilter ?? '');
    }
    if ((next.jobNameFilter ?? '') !== this.activityCmp.JobNameFilter) {
      this.activityCmp.OnJobNameFilterChange(next.jobNameFilter ?? '');
    }
  }

  public resetFilters(): void {
    if (!this.activityCmp) return;
    if (this.activityCmp.StatusFilter) this.activityCmp.OnStatusFilterChange('');
    if (this.activityCmp.JobNameFilter) this.activityCmp.OnJobNameFilterChange('');
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Activity';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock-rotate-left';
  }
}
