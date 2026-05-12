import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Scheduling Jobs Resource — thin shim. The inner component owns its own
 * `<mj-page-layout>` + `<mj-page-header>` chrome (see scheduling-jobs.component.html).
 */
@RegisterClass(BaseResourceComponent, 'SchedulingJobsResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-jobs-resource',
  template: `<app-scheduling-jobs></app-scheduling-jobs>`
})
export class SchedulingJobsResourceComponent extends BaseResourceComponent implements OnInit {
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
