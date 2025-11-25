import { Component, OnInit, OnDestroy } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadSchedulingTypesResource() {
  // Force inclusion in production builds
}

/**
 * Scheduling Types Resource - manage job types and configurations
 */
@RegisterClass(BaseResourceComponent, 'SchedulingTypesResource')
@Component({
  selector: 'mj-scheduling-types-resource',
  template: `
    <div class="resource-container">
      <app-scheduling-types></app-scheduling-types>
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
export class SchedulingTypesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Notify that loading is complete
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Types';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-cogs';
  }
}
