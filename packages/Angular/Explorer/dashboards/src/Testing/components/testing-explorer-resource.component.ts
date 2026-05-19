import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Testing Explorer Resource — thin shim that renders the inner component.
 * The inner owns its own <mj-page-layout> + <mj-page-header> when used standalone.
 */
@RegisterClass(BaseResourceComponent, 'TestingExplorerResource')
@Component({
  standalone: false,
  selector: 'mj-testing-explorer-resource',
  template: `<app-testing-explorer></app-testing-explorer>`,
  styles: [`:host { display: block; width: 100%; height: 100%; }`]
})
export class TestingExplorerResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Explorer';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-compass';
  }
}
