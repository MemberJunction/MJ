import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Testing Review Resource — thin shim that renders the inner component.
 * The inner component owns its own <mj-page-layout> + <mj-page-header>
 * when used standalone, and hides its chrome via [HideToolbar]="true"
 * when embedded inside the parent dashboard.
 */
@RegisterClass(BaseResourceComponent, 'TestingReviewResource')
@Component({
  standalone: false,
  selector: 'mj-testing-review-resource',
  template: `<app-testing-review></app-testing-review>`,
  styles: [`:host { display: block; width: 100%; height: 100%; }`]
})
export class TestingReviewResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Review';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clipboard-check';
  }
}
