import { Component, OnInit, OnDestroy } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadTestingFeedbackResource() {
  // Force inclusion in production builds
}

/**
 * Testing Feedback Resource - displays test feedback and evaluation
 */
@RegisterClass(BaseResourceComponent, 'TestingFeedbackResource')
@Component({
  selector: 'mj-testing-feedback-resource',
  template: `
    <div class="resource-container">
      <app-testing-feedback></app-testing-feedback>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
    }
  `]
})
export class TestingFeedbackResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Notify that loading is complete
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Feedback';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clipboard-check';
  }
}
