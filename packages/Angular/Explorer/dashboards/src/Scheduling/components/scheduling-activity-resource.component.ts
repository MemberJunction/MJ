import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadSchedulingActivityResource() {
  // Force inclusion in production builds
}

/**
 * Scheduling Activity Resource - displays execution history, trends, and job type statistics
 */
@RegisterClass(BaseResourceComponent, 'SchedulingActivityResource')
@Component({
  selector: 'mj-scheduling-activity-resource',
  template: `
    <div class="resource-container">
      <app-scheduling-activity></app-scheduling-activity>
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
export class SchedulingActivityResourceComponent extends BaseResourceComponent implements OnInit {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Activity';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock-rotate-left';
  }
}
