import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';

/**
 * Compare Runs section resource — hosts the {@link PSCompareComponent} (`ps-compare`).
 *
 * Registered as `BaseResourceComponent::PredictiveStudioCompareResource`, the "Compare Runs" top-nav
 * Nav Item. Unlike the other sections, `ps-compare` takes no `@Input() engine` (it renders a
 * representative side-by-side comparison until the per-run metrics surface is wired into
 * {@link PredictiveStudioEngine}), so this wrapper hosts the panel without an `[engine]` binding. The
 * base class still loads the engine — that warms the shared cache and supplies agent context.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioCompareResource')
@Component({
  standalone: false,
  selector: 'mj-ps-compare-resource',
  template: `
    <mj-page-header-interior
      Title="Compare Runs"
      Subtitle="Side-by-side run metrics, overfit gaps, and feature-importance diffs">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (!isLoading) {
        <ps-compare></ps-compare>
      } @else {
        <mj-loading text="Loading Compare Runs..." size="medium"></mj-loading>
      }
    </mj-page-body-interior>
  `,
  styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSCompareResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'compare';
  protected readonly SectionLabel = 'Compare Runs';
  protected readonly SectionIcon = 'fa-solid fa-chart-column';

  protected override extraAgentContext(): Record<string, unknown> {
    return { TrainingRunCount: this.engine.TrainingRuns.length };
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSCompareResource(): void {
  // intentionally empty
}
