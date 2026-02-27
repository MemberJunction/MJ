import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
/**
 * Scheduling Jobs Resource - manage and configure scheduled jobs with slideout panels
 */
@RegisterClass(BaseResourceComponent, 'SchedulingJobsResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-jobs-resource',
  template: `
    <div class="resource-container">
      <app-scheduling-jobs></app-scheduling-jobs>
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
export class SchedulingJobsResourceComponent extends BaseResourceComponent implements OnInit {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Jobs';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-calendar-check';
  }
}
