import { Component, OnInit, OnDestroy } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadSchedulingHistoryResource() {
  // Force inclusion in production builds
}

/**
 * Scheduling History Resource - view execution history and logs
 */
@RegisterClass(BaseResourceComponent, 'SchedulingHistoryResource')
@Component({
  standalone: false,
  selector: 'mj-scheduling-history-resource',
  template: `
    <div class="resource-container">
      <app-scheduling-history></app-scheduling-history>
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
export class SchedulingHistoryResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Notify that loading is complete
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'History';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-history';
  }
}
