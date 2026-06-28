import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';

/**
 * Algorithm Catalog section resource — hosts the {@link PSCatalogComponent} (`ps-catalog`).
 *
 * Registered as `BaseResourceComponent::PredictiveStudioCatalogResource`, the "Algorithm Catalog"
 * top-nav Nav Item. Self-loads the provider-scoped engine (which carries the ML algorithm + use-case
 * reference data the catalog ranks against) and binds it into the panel's `[engine]` input.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioCatalogResource')
@Component({
  standalone: false,
  selector: 'mj-ps-catalog-resource',
  template: `
    <mj-page-header-interior
      Title="Algorithm Catalog"
      Subtitle="A curated catalog of ML algorithms ranked for your use case">
    </mj-page-header-interior>
    @if (!isLoading) {
      <ps-catalog [engine]="engine"></ps-catalog>
    } @else {
      <mj-loading text="Loading Algorithm Catalog..." size="medium"></mj-loading>
    }
  `,
  styles: [`:host { display: block; width: 100%; height: 100%; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSCatalogResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'catalog';
  protected readonly SectionLabel = 'Algorithm Catalog';
  protected readonly SectionIcon = 'fa-solid fa-shapes';

  protected override extraAgentContext(): Record<string, unknown> {
    return { AlgorithmCount: this.engine.Algorithms.length, UseCaseCount: this.engine.UseCases.length };
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSCatalogResource(): void {
  // intentionally empty
}
