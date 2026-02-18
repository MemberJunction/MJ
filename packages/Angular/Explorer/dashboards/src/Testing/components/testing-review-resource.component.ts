import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Testing Review Resource - displays human-in-the-loop review workflow
 */
@RegisterClass(BaseResourceComponent, 'TestingReviewResource')
@Component({
  standalone: false,
  selector: 'mj-testing-review-resource',
  template: `
    <div class="resource-container">
      <app-testing-review></app-testing-review>
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
export class TestingReviewResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Review';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clipboard-check';
  }
}
