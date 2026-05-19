import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Scheduling Activity Resource — thin shim. The inner component owns its own
 * `<mj-page-layout>` + `<mj-page-header>` chrome (see scheduling-activity.component.html).
 */
@RegisterClass(BaseResourceComponent, 'SchedulingActivityResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-activity-resource',
  template: `<app-scheduling-activity></app-scheduling-activity>`
})
export class SchedulingActivityResourceComponent extends BaseResourceComponent implements OnInit {
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
