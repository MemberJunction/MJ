import { Component, OnInit, OnDestroy } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadSchedulingHealthResource() {
  // Force inclusion in production builds
}

/**
 * Scheduling Health Resource - system health and performance metrics
 */
@RegisterClass(BaseResourceComponent, 'SchedulingHealthResource')
@Component({
  selector: 'mj-scheduling-health-resource',
  template: `
    <div class="resource-container">
      <app-scheduling-health></app-scheduling-health>
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
export class SchedulingHealthResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Notify that loading is complete
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Health';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-heartbeat';
  }
}
