import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * ComponentStudioResource — BaseResourceComponent wrapper that lets the
 * Component Studio dashboard sit alongside Form Studio as a nav item under
 * the Component Studio application. The inner `<mj-component-studio-dashboard>`
 * owns its own load lifecycle and calls NotifyLoadComplete; this wrapper
 * forwards the same signal so the shell loading screen clears whichever
 * way the user arrives.
 */
@RegisterClass(BaseResourceComponent, 'ComponentStudioResource')
@Component({
  standalone: false,
  selector: 'mj-component-studio-resource',
  template: `
    <div class="resource-container">
      <mj-component-studio-dashboard></mj-component-studio-dashboard>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      box-sizing: border-box;
    }
    .resource-container > * {
      flex: 1;
      min-width: 0;
    }
  `]
})
export class ComponentStudioResourceComponent extends BaseResourceComponent implements OnInit {

  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Components';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-puzzle-piece';
  }
}

/** Tree-shake protection — referenced from the dashboards module loader. */
export function LoadComponentStudioResourceComponent(): void {
  // Intentional no-op. Keeps the @RegisterClass side effect alive.
}
