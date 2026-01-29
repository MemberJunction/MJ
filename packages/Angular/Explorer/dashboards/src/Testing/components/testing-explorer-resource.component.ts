import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Testing Explorer Resource - displays interactive test and suite browser
 */
@RegisterClass(BaseResourceComponent, 'TestingExplorerResource')
@Component({
  selector: 'mj-testing-explorer-resource',
  template: `
    <div class="resource-container">
      <app-testing-explorer></app-testing-explorer>
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
export class TestingExplorerResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Explorer';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-compass';
  }
}
