import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';

/**
 * Model Registry section resource — hosts the {@link PSRegistryComponent} (`ps-registry`).
 *
 * Registered as `BaseResourceComponent::PredictiveStudioRegistryResource`, the "Model Registry" top-nav
 * Nav Item. Self-loads the provider-scoped engine (trained `MJ: ML Models`) and binds it into the
 * panel's `[engine]` input.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioRegistryResource')
@Component({
  standalone: false,
  selector: 'mj-ps-registry-resource',
  template: `
    <mj-page-header-interior
      Title="Model Registry"
      Subtitle="Versioned trained models — promote, score, and maintain across the lifecycle">
    </mj-page-header-interior>
    @if (!isLoading) {
      <ps-registry [engine]="engine"></ps-registry>
    } @else {
      <mj-loading text="Loading Model Registry..." size="medium"></mj-loading>
    }
  `,
  styles: [`:host { display: block; width: 100%; height: 100%; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSRegistryResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'registry';
  protected readonly SectionLabel = 'Model Registry';
  protected readonly SectionIcon = 'fa-solid fa-cubes';

  protected override extraAgentContext(): Record<string, unknown> {
    return { ModelCount: this.engine.Models.length };
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSRegistryResource(): void {
  // intentionally empty
}
